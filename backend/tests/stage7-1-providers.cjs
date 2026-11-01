// In-memory tests only: block .env, database drivers, model loader and network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const originalRead = fs.readFileSync;
fs.readFileSync = function(file, ...args) {
  if (/[\\/]\.env$/.test(String(file))) throw new Error('ENV_READ_FORBIDDEN');
  return originalRead.call(this, file, ...args);
};
const originalLoad = Module._load;
Module._load = function(id, ...args) {
  if (/^mysql2(?:\/|$)|^@huggingface\/transformers$/.test(id)) throw new Error('EXTERNAL_DEPENDENCY_FORBIDDEN');
  return originalLoad.call(this, id, ...args);
};
global.fetch = async () => { throw new Error('NETWORK_FORBIDDEN'); };
require('node:http').request = require('node:https').request = () => { throw new Error('NETWORK_FORBIDDEN'); };
require('node:net').Socket.prototype.connect = () => { throw new Error('NETWORK_FORBIDDEN'); };
// Isolated process; never read or use the developer's real credentials.
for (const key of Object.keys(process.env)) if (/KEY|SECRET|PASSWORD|TOKEN/.test(key)) delete process.env[key];
delete process.env.RAG_PROVIDER;
process.env.GEMINI_API_KEY = 'unit-test-placeholder-only';
process.env.GEMINI_MODEL = 'gemini-3.5-flash-lite';

const { createGenerationProvider } = require('../src/rag/generationProvider');
const { createGeminiClient } = require('../src/rag/geminiClient');
const { createRagService, answerQuestion } = require('../src/rag/generationService');
const { fallback } = require('../src/rag/generationOutput');
const { RagError } = require('../src/rag/generationSafety');
const config = require('../src/rag/generationConfig');
const quote = 'Kiểm tra Wi-Fi đã bật và chế độ máy bay đã tắt.';
const article = { id: 8, code: 'KB-000008', title: 'Wi-Fi', content: quote, status: 'PUBLISHED' };
const axis = i => Array.from({ length: 384 }, (_, j) => +(i === j));
const valid = JSON.stringify({ answered: true, answer: quote, evidence: [quote] });
function fixture({ rejectQuery = false, rows = [article] } = {}) {
  const state = { calls: 0, disposed: 0, prompts: [] };
  const pool = { async execute(sql) { assert.ok(sql.startsWith('SELECT ')); return [rows]; } };
  const provider = { name: 'test-local', model: 'fixture-v1', async generate(prompt) {
    state.calls++; state.prompts.push(prompt); return { text: valid, usage: {} };
  } };
  const loadEmbedding = async () => ({ countTokens: () => 10,
    embed: async text => axis(rejectQuery && text.startsWith('query:') ? 1 : 0),
    dispose() { state.disposed++; } });
  return { state, pool, provider, loadEmbedding };
}
async function main() {
  let passed = 0;
  async function check(name, run) { await run(); passed++; console.log('PASS ' + name); }
  await check('Default Gemini, lazy adapter initialization and cached client', async () => {
    let initialized = 0, calls = 0;
    const p = createGenerationProvider({ geminiFactory: () => { initialized++; return { generate: async () => { calls++; return { text: valid }; } }; } });
    assert.equal(p.name, 'gemini'); assert.equal(p.model, config.MODEL); assert.equal(initialized, 0);
    await p.generate({}); await p.generate({}); assert.equal(initialized, 1); assert.equal(calls, 2);
  });
  await check('Backend env selection, unknown/empty provider rejected without SDK', () => {
    process.env.RAG_PROVIDER = 'gemini'; assert.equal(createGenerationProvider().name, 'gemini');
    for (const name of ['', 'unknown', 'Gemini', 'http://untrusted', null]) {
      assert.throws(() => createGenerationProvider({ name, geminiFactory: () => { throw new Error('SDK_UNEXPECTED'); } }), e => e.code === 'GENERATION_PROVIDER_CONFIGURATION');
    }
    delete process.env.RAG_PROVIDER;
  });
  await check('Ollama explicitly unavailable, never falls back to Gemini', () => {
    process.env.RAG_PROVIDER = 'ollama';
    assert.throws(() => createGenerationProvider({ geminiFactory: () => { throw new Error('SDK_UNEXPECTED'); } }), e => e.code === 'OLLAMA_NOT_IMPLEMENTED' && e.status === 503);
    assert.throws(() => createRagService({}), e => e.code === 'OLLAMA_NOT_IMPLEMENTED');
    delete process.env.RAG_PROVIDER;
  });
  await check('Service injection, actual provider trace, unchanged public response', async () => {
    const f = fixture(); const s = createRagService(f.pool, f);
    const r = await s.ask('Kiểm tra Wi-Fi?');
    assert.equal(f.state.calls, 1); assert.equal(r.trace.provider, 'test-local'); assert.equal(r.trace.model, 'fixture-v1');
    assert.equal(r.trace.providerCalled, true); assert.equal(r.trace.geminiCalled, false);
    assert.deepEqual(Object.keys(r.response).sort(), ['answer', 'answered', 'sources']);
    assert.equal(r.response.answer, quote); assert.equal(r.response.sources[0].code, article.code);
    assert.equal(JSON.parse(f.state.prompts[0].contents[0].parts[0].text).CONTEXT[0].content, quote);
    await s.dispose(); assert.equal(f.state.disposed, 1);
  });
  await check('Service threshold fallback never invokes provider', async () => {
    const f = fixture({ rejectQuery: true }); const s = createRagService(f.pool, f);
    const r = await s.ask('Ngoài KB'); assert.deepEqual(r.response, fallback());
    assert.equal(f.state.calls, 0); assert.equal(r.trace.providerCalled, false); assert.equal(r.trace.geminiCalled, false); await s.dispose();
  });
  await check('Empty KB never invokes provider', async () => {
    const f = fixture({ rows: [] }); const s = createRagService(f.pool, f);
    assert.deepEqual((await s.ask('Hỏi')).response, fallback()); assert.equal(f.state.calls, 0); await s.dispose();
  });
  await check('No-context fallback never invokes provider', async () => {
    const f = fixture(); const s = createRagService(f.pool, f); const prepared = await s.prepare();
    const corpus = { ...prepared.corpus, articles: [{ ...article, content: 'x'.repeat(config.MAX_CONTEXT_CHARACTERS + 1) }] };
    const r = await answerQuestion({ question: 'Hỏi', corpus, embedder: prepared.embedder, generate: () => { throw new Error('LLM_UNEXPECTED'); } });
    assert.equal(r.trace.reason, 'NO_CONTEXT'); assert.equal(r.trace.providerCalled, false); await s.dispose();
  });
  await check('Injected provider failure propagates; busy resets; no alternate provider', async () => {
    const f = fixture(); const failure = new RagError('LOCAL_UNAVAILABLE', 503, 'Mock unavailable');
    f.provider.generate = async () => { f.state.calls++; throw failure; };
    const s = createRagService(f.pool, f);
    for (let i = 0; i < 2; i++) await assert.rejects(s.ask('Hỏi'), e => e === failure);
    assert.equal(f.state.calls, 2); await s.dispose();
  });
  await check('Invalid injected adapter rejected instead of default provider', () => {
    for (const provider of [null, {}, { name: 'mock', generate() {} }])
      assert.throws(() => createRagService({}, { provider }), e => e.code === 'GENERATION_PROVIDER_CONFIGURATION');
  });
  await check('Gemini SDK compatibility through factory and service (mock SDK)', async () => {
    const f = fixture(); let calls = 0;
    const provider = createGenerationProvider({ geminiFactory: () => createGeminiClient({ clientFactory: options => {
      assert.equal(options.httpOptions.retryOptions.attempts, 1);
      return { models: { async generateContent(request) {
        calls++; assert.equal(request.model, config.MODEL); assert.equal(request.config.responseMimeType, 'application/json');
        assert.equal(request.config.maxOutputTokens, config.MAX_OUTPUT_TOKENS);
        return { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: valid }] } }] };
      } } };
    } }) });
    const s = createRagService(f.pool, { ...f, provider }); const r = await s.ask('Hỏi');
    assert.equal(calls, 1); assert.equal(r.trace.geminiCalled, true); assert.equal(r.trace.provider, 'gemini'); assert.equal(r.response.answered, true); await s.dispose();
  });
  await check('Default service fallback works without Gemini key', async () => {
    delete process.env.GEMINI_API_KEY; const f = fixture({ rejectQuery: true });
    const s = createRagService(f.pool, { loadEmbedding: f.loadEmbedding });
    assert.deepEqual((await s.ask('Hỏi')).response, fallback()); await s.dispose();
    process.env.GEMINI_API_KEY = 'unit-test-placeholder-only';
  });
  for (const file of ['stage5-2-logic.cjs', 'stage5-3-logic.cjs', 'stage5-4-logic.cjs', 'stage6-3-fixes.cjs']) {
    const rows = await require('./' + file).runLogic();
    assert.ok(rows.every(t => t.status === 'PASS')); console.log('REGRESSION ' + file + ': ' + rows.length + '/' + rows.length + ' PASS');
  }
  console.log('Stage 7.1: ' + passed + '/' + passed + ' PASS; no network, database, model downloads or report writes.');
}
main().catch(e => { console.error('STAGE71_FAILED ' + e.name + ': ' + e.message); process.exitCode = 1; });
