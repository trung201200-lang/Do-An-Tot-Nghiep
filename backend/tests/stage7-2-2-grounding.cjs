// Unit only: no real .env, sockets, database, downloads or report writes.
const assert = require('node:assert/strict');
const fs = require('node:fs'), Module = require('node:module');
const read = fs.readFileSync, load = Module._load;
const forbidden = () => { throw new Error('SIDE_EFFECT_FORBIDDEN'); };
fs.readFileSync = function(file, ...args) {
  if (/[\\/]\.env$/.test(String(file))) return forbidden();
  return read.call(this, file, ...args);
};
Module._load = function(id, ...args) {
  if (/^mysql2(?:\/|$)|^@huggingface\/transformers$/.test(id)) return forbidden();
  return load.call(this, id, ...args);
};
global.fetch = forbidden;
require('node:net').Socket.prototype.connect = forbidden;
require('node:http').request = require('node:https').request = forbidden;
for (const key of Object.keys(process.env)) if (/KEY|SECRET|PASSWORD|TOKEN|^RAG_|^OLLAMA_/.test(key)) delete process.env[key];
const { createRagService } = require('../src/rag/generationService');
const { createOllamaClient } = require('../src/rag/ollamaClient');
const { createGenerationProvider } = require('../src/rag/generationProvider');
const { buildPrompt, INSTRUCTIONS, RESPONSE_SCHEMA } = require('../src/rag/generationPrompt');
const { buildOllamaPrompt, OLLAMA_INSTRUCTIONS, OLLAMA_RESPONSE_SCHEMA } = require('../src/rag/ollamaPrompt');
const { fallback } = require('../src/rag/generationOutput');
const question = 'Máy tính không kết nối được Wi-Fi văn phòng, hãy hướng dẫn cách xử lý.';
const quote = 'Kiểm tra Wi-Fi đã bật và chế độ máy bay đã tắt.';
const article = { id: 8, code: 'KB-000008', title: 'Không kết nối được Wi-Fi', content: quote, status: 'PUBLISHED' };
const context = [{ articleId: 8, code: article.code, title: article.title, text: quote, score: 1 }];
function fixture(output, name = 'ollama') {
  const state = { calls: 0, rejectQuery: false, prompt: null };
  const pool = { execute: async sql => { assert.ok(sql.startsWith('SELECT ')); return [[article]]; } };
  const provider = { name, model: 'fixture', async generate(prompt) {
    state.calls++; state.prompt = prompt; return { text: JSON.stringify(output), usage: {} };
  } };
  const loadEmbedding = async () => ({ countTokens: () => 10, dispose() {},
    embed: async text => Array.from({ length: 384 }, (_, i) => +(i === (state.rejectQuery && text.startsWith('query:') ? 1 : 0))) });
  return { state, service: createRagService(pool, { provider, loadEmbedding }) };
}
async function main() {
  let passed = 0;
  async function check(name, run) { await run(); passed++; console.log('PASS ' + name); }
  await check('Separate Ollama instructions; identical question/context envelope and unchanged Gemini prompt', () => {
    const before = buildPrompt(question, context), snapshot = JSON.stringify(before);
    const local = buildOllamaPrompt(question, context);
    assert.equal(before.systemInstruction, INSTRUCTIONS); assert.equal(local.systemInstruction, OLLAMA_INSTRUCTIONS);
    assert.notEqual(local.systemInstruction, INSTRUCTIONS); assert.deepEqual(local.contents, before.contents);
    assert.equal(JSON.stringify(before), snapshot);
    assert.equal(JSON.parse(local.contents[0].parts[0].text).CONTEXT[0].content, quote);
  });
  await check('Wi-Fi supported answer passes only with verified evidence; API shape unchanged', async () => {
    const f = fixture({ answered: true, answer: quote, evidence: [quote] });
    const r = await f.service.ask(question);
    assert.equal(r.response.answered, true); assert.equal(r.trace.reason, 'GENERATED');
    assert.equal(r.response.sources[0].code, article.code); assert.equal(r.trace.evidence[0].quote, quote);
    assert.equal(f.state.prompt.systemInstruction, OLLAMA_INSTRUCTIONS); assert.equal(f.state.calls, 1);
    assert.deepEqual(Object.keys(r.response).sort(), ['answer', 'answered', 'sources']);
  });
  await check('Gemini service still sends the original instructions and data', async () => {
    const f = fixture({ answered: true, answer: quote, evidence: [quote] }, 'gemini');
    const r = await f.service.ask(question);
    assert.equal(r.trace.geminiCalled, true);
    assert.deepEqual(f.state.prompt, buildPrompt(question, context));
  });
  await check('Unsupported requested detail stays fallback even with high retrieval similarity', async () => {
    const f = fixture({ answered: false, answer: 'Nguồn không có địa chỉ DNS.', evidence: [] });
    const r = await f.service.ask('Địa chỉ IP chính xác của máy chủ DNS công ty là gì?');
    assert.equal(r.trace.retrieval[0].similarity, 1); assert.equal(r.trace.providerCalled, true);
    assert.deepEqual(r.response, fallback()); assert.equal(r.trace.reason, 'INSUFFICIENT_CONTEXT');
  });
  await check('False with nonempty answer and valid evidence is NEVER promoted to true', async () => {
    const f = fixture({ answered: false, answer: quote, evidence: [quote] });
    const r = await f.service.ask(question);
    assert.deepEqual(r.response, fallback()); assert.deepEqual(r.trace.evidence, []);
  });
  for (const [label, evidence] of [
    ['missing evidence', []],
    ['invented evidence', ['Hãy đổi máy chủ DNS sang một địa chỉ không được KB cung cấp.']],
    ['valid prefix plus fabricated suffix', [quote + ' Sau đó xóa toàn bộ cấu hình mạng.']],
    ['paraphrased evidence', ['Hãy bật Wi-Fi và tắt chế độ máy bay trên thiết bị.']],
    ['short evidence', ['Wi-Fi']],
  ]) await check('Reject answered=true with ' + label, async () => {
    const f = fixture({ answered: true, answer: quote, evidence });
    await assert.rejects(f.service.ask(question), e => e.code === 'OLLAMA_INVALID_EVIDENCE' && e.status === 502);
  });
  await check('Low retrieval score still skips generation', async () => {
    const f = fixture({ answered: true, answer: quote, evidence: [quote] }); f.state.rejectQuery = true;
    const r = await f.service.ask('Câu hỏi ngoài KB');
    assert.equal(f.state.calls, 0); assert.equal(r.trace.providerCalled, false); assert.deepEqual(r.response, fallback());
  });
  await check('Ollama factory/HTTP forwards local prompt/schema and stable sampling; no Gemini', async () => {
    process.env.OLLAMA_MODEL = 'fixture:local';
    let calls = 0;
    const provider = createGenerationProvider({ name: 'ollama', geminiFactory: forbidden,
      ollamaFactory: options => createOllamaClient({ ...options, fetchImpl: async (url, options) => {
        calls++; const body = JSON.parse(options.body);
        assert.equal(body.messages[0].content, OLLAMA_INSTRUCTIONS); assert.deepEqual(body.format, OLLAMA_RESPONSE_SCHEMA);
        assert.deepEqual(body.options, { num_predict: 1536, temperature: 0, seed: 42 });
        return { ok: true, status: 200, json: async () => ({ done: true, done_reason: 'stop',
          message: { content: JSON.stringify({ answered: true, answer: quote, evidence: [quote] }) } }) };
      } }) });
    await provider.generate(buildOllamaPrompt(question, context)); assert.equal(calls, 1);
  });
  await check('Local schema bounds do not mutate Gemini schema or force answered=true', () => {
    assert.deepEqual(RESPONSE_SCHEMA.properties.answer, { type: 'string' });
    assert.deepEqual(RESPONSE_SCHEMA.properties.evidence, { type: 'array', items: { type: 'string' } });
    assert.deepEqual(OLLAMA_RESPONSE_SCHEMA.properties.answered, { type: 'boolean' });
    assert.equal(OLLAMA_RESPONSE_SCHEMA.properties.evidence.maxItems, 3);
    assert.equal(OLLAMA_RESPONSE_SCHEMA.properties.evidence.minItems, undefined);
  });
  console.log(`Stage 7.2.2: ${passed}/${passed} PASS; mock only, no network/database/model/report writes.`);
}
main().catch(() => { console.error('STAGE722_UNIT_FAILED'); process.exitCode = 1; });
