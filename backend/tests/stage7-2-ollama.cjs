const assert = require('node:assert/strict');
const fs = require('node:fs'), Module = require('node:module');
const read = fs.readFileSync;
fs.readFileSync = function(file, ...args) {
  if (/[\\/]\.env$/.test(String(file))) throw new Error('ENV_FORBIDDEN');
  return read.call(this, file, ...args);
};
const load = Module._load;
Module._load = function(id, ...args) {
  if (/^mysql2(?:\/|$)|^@huggingface\/transformers$/.test(id)) throw new Error('DB_MODEL_FORBIDDEN');
  return load.call(this, id, ...args);
};
global.fetch = async () => { throw new Error('NETWORK_FORBIDDEN'); };
require('node:net').Socket.prototype.connect = () => { throw new Error('NETWORK_FORBIDDEN'); };
for (const k of Object.keys(process.env)) if (/KEY|SECRET|PASSWORD|TOKEN|^OLLAMA_|^RAG_PROVIDER$/.test(k)) delete process.env[k];
process.env.OLLAMA_MODEL = 'fixture:local';
const { createOllamaClient, readOllamaConfig } = require('../src/rag/ollamaClient');
const { createGenerationProvider } = require('../src/rag/generationProvider');
const { createRagService } = require('../src/rag/generationService');
const { buildPrompt, RESPONSE_SCHEMA } = require('../src/rag/generationPrompt');
const quote = 'Kiểm tra Wi-Fi đã bật và chế độ máy bay đã tắt.';
const valid = JSON.stringify({ answered: true, answer: quote, evidence: [quote] });
const prompt = buildPrompt('Wi-Fi?', [{ code: 'KB-000008', title: 'Wi-Fi', text: quote }]);
const envelope = (text = valid) => ({ done: true, done_reason: 'stop', message: { content: text }, prompt_eval_count: 10, eval_count: 5 });
const response = (data = envelope(), status = 200) => ({ ok: status === 200, status, json: async () => data });
const client = fetchImpl => createOllamaClient({ fetchImpl });
async function main() {
  let passed = 0;
  async function check(name, fn) { await fn(); passed++; console.log('PASS ' + name); }
  await check('HTTP mapping, schema, non-streaming, usage and local defaults', async () => {
    const r = await client(async (url, options) => {
      assert.equal(url, 'http://127.0.0.1:11434/api/chat'); assert.equal(options.method, 'POST'); assert.equal(options.redirect, 'error');
      const body = JSON.parse(options.body); assert.equal(body.stream, false); assert.deepEqual(body.format, RESPONSE_SCHEMA);
      assert.equal(body.model, 'fixture:local'); assert.equal(body.messages[0].content, prompt.systemInstruction);
      assert.equal(body.messages[1].content, prompt.contents[0].parts[0].text); return response();
    }).generate(prompt);
    assert.deepEqual(r, { text: valid, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } });
  });
  for (const [name, fetchImpl, code, status] of [
    ['connection refused', async () => { throw new Error('secret raw connection'); }, 'UNAVAILABLE', 503],
    ['model missing', async () => response({}, 404), 'MODEL_UNAVAILABLE', 503],
    ['HTTP error', async () => response({}, 500), 'HTTP_ERROR', 502],
    ['HTTP rate limit', async () => response({}, 429), 'HTTP_ERROR', 502],
    ['malformed envelope JSON', async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('secret raw JSON'); } }), 'INVALID_RESPONSE', 502],
    ['error envelope', async () => response({ error: 'secret raw' }), 'INVALID_RESPONSE', 502],
    ['empty content', async () => response(envelope(' ')), 'EMPTY', 502],
    ['truncated generation', async () => response({ ...envelope(), done_reason: 'length' }), 'INCOMPLETE', 502],
    ['unfinished generation', async () => response({ ...envelope(), done: false }), 'INCOMPLETE', 502],
    ['invalid content JSON', async () => response(envelope('not JSON')), 'INVALID_OUTPUT', 502],
    ['invalid schema', async () => response(envelope('{"answer":"wrong"}')), 'INVALID_OUTPUT', 502],
    ['additional field', async () => response(envelope(JSON.stringify({ ...JSON.parse(valid), sources: [] }))), 'INVALID_OUTPUT', 502],
  ]) await check(name, async () => {
    await assert.rejects(client(fetchImpl).generate(prompt), e => e.code === 'OLLAMA_' + code && e.status === status && !e.message.includes('secret raw'));
  });
  await check('Timeout aborts request and response body read', async () => {
    process.env.OLLAMA_TIMEOUT_MS = '10';
    for (const bodyDelay of [false, true]) {
      let aborted = false;
      const fetchImpl = async (url, { signal }) => {
        const pending = () => new Promise((resolve, reject) => signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); }, { once: true }));
        return bodyDelay ? { ok: true, status: 200, json: pending } : pending();
      };
      await assert.rejects(client(fetchImpl).generate(prompt), e => e.code === 'OLLAMA_TIMEOUT' && e.status === 504); assert.equal(aborted, true);
    }
    delete process.env.OLLAMA_TIMEOUT_MS;
  });
  await check('Reject unsafe URL, cloud tag, missing model and invalid timeout', () => {
    for (const url of ['https://example.com', 'http://192.168.1.2:11434', 'http://user:pass@localhost:11434', 'http://localhost:11434/api', 'http://localhost:11434/?key=x']) {
      process.env.OLLAMA_BASE_URL = url; assert.throws(readOllamaConfig, e => e.code === 'OLLAMA_CONFIGURATION');
    }
    delete process.env.OLLAMA_BASE_URL;
    for (const model of ['', 'test:cloud', 'bad model']) { process.env.OLLAMA_MODEL = model; assert.throws(readOllamaConfig); }
    process.env.OLLAMA_MODEL = 'fixture:local';
    for (const ms of ['', '0', '-1', 'abc', '300001']) { process.env.OLLAMA_TIMEOUT_MS = ms; assert.throws(readOllamaConfig); }
    delete process.env.OLLAMA_TIMEOUT_MS;
  });
  await check('Missing usage becomes null', async () => {
    const r = await client(async () => response({ ...envelope(), prompt_eval_count: undefined, eval_count: -1 })).generate(prompt);
    assert.deepEqual(r.usage, { inputTokens: null, outputTokens: null, totalTokens: null });
  });
  await check('Service Ollama answer, evidence rejection, fallback and no Gemini on failure', async () => {
    const article = { id: 8, code: 'KB-000008', title: 'Wi-Fi', content: quote, status: 'PUBLISHED' };
    let calls = 0, rejectQuery = false, mode = 'valid';
    const provider = createGenerationProvider({ name: 'ollama', geminiFactory: () => { throw new Error('GEMINI_FORBIDDEN'); },
      ollamaFactory: options => createOllamaClient({ ...options, fetchImpl: async () => {
        calls++; if (mode === 'error') throw new Error('private error');
        return response(envelope(mode === 'badEvidence' ? JSON.stringify({ answered: true, answer: quote, evidence: ['Đoạn bịa không xuất hiện trong nguồn kiến thức.'] }) : valid));
      } }) });
    const service = createRagService({ execute: async sql => { assert.ok(sql.startsWith('SELECT')); return [[article]]; } }, {
      provider, loadEmbedding: async () => ({ countTokens: () => 10, dispose() {},
        embed: async text => Array.from({ length: 384 }, (_, i) => +(i === (rejectQuery && text.startsWith('query:') ? 1 : 0))) }),
    });
    const r = await service.ask('Wi-Fi?'); assert.equal(r.trace.provider, 'ollama'); assert.equal(r.trace.geminiCalled, false);
    assert.equal(r.response.answer, quote); assert.deepEqual(Object.keys(r.response).sort(), ['answer', 'answered', 'sources']);
    mode = 'badEvidence'; await assert.rejects(service.ask('Wi-Fi?'), e => e.code === 'OLLAMA_INVALID_EVIDENCE');
    mode = 'error'; await assert.rejects(service.ask('Wi-Fi?'), e => e.code === 'OLLAMA_UNAVAILABLE');
    const before = calls; rejectQuery = true; assert.equal((await service.ask('Ngoài KB')).response.answered, false); assert.equal(calls, before);
    await service.dispose();
  });
  await check('Sensitive output rejected without leaking content', async () => {
    process.env.UNIT_TEST_SECRET = 'private-sentinel-ollama';
    await assert.rejects(client(async () => response(envelope('private-sentinel-ollama'))).generate(prompt), e => e.code === 'SENSITIVE_DATA' && !e.message.includes('private-sentinel'));
    delete process.env.UNIT_TEST_SECRET;
  });
  console.log('Stage 7.2: ' + passed + '/' + passed + ' PASS (mock HTTP; no real network/database/model).');
}
main().catch(e => { console.error('STAGE72_FAILED ' + e.name + ': ' + e.message); process.exitCode = 1; });
