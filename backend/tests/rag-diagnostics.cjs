// Isolated unit tests: no .env, filesystem writes, sockets, DB or model downloads.
const assert = require('node:assert/strict');
const fs = require('node:fs'), Module = require('node:module');
const originalRead = fs.readFileSync, originalLoad = Module._load;
fs.readFileSync = function(file, ...args) {
  if (/[\\/]\.env$/.test(String(file))) throw new Error('ENV_FORBIDDEN');
  return originalRead.call(this, file, ...args);
};
const forbidden = () => { throw new Error('SIDE_EFFECT_FORBIDDEN'); };
for (const name of ['writeFileSync', 'appendFileSync', 'mkdirSync', 'unlinkSync', 'renameSync', 'createWriteStream']) fs[name] = forbidden;
Module._load = function(id, ...args) {
  if (id === '../config/db') return { execute: forbidden };
  if (/^mysql2(?:\/|$)|^@huggingface\/transformers$/.test(id)) return forbidden();
  return originalLoad.call(this, id, ...args);
};
global.fetch = forbidden;
require('node:net').Socket.prototype.connect = forbidden;
require('node:http').request = require('node:https').request = forbidden;
for (const key of Object.keys(process.env)) if (/KEY|SECRET|PASSWORD|TOKEN|^RAG_|^OLLAMA_/.test(key)) delete process.env[key];

const { createRagRouter } = require('../src/routes/ragRoutes');
const { createRagService } = require('../src/rag/generationService');
const { RagError } = require('../src/rag/generationSafety');
const { withRagDiagnostics, setDiagnosticStage, setDiagnosticProvider, logRagError } = require('../src/rag/ragDiagnostics');
const quote = 'Kiểm tra Wi-Fi đã bật và chế độ máy bay đã tắt.';
const article = { id: 8, code: 'KB-000008', title: 'Wi-Fi', content: quote, status: 'PUBLISHED' };
const vector = i => Array.from({ length: 384 }, (_, j) => +(i === j));
const valid = JSON.stringify({ answered: true, answer: quote, evidence: [quote] });
const generic = { success: false, code: 'RAG_ERROR', message: 'Không thể xử lý câu hỏi lúc này.' };
const logs = [];
const originalConsoleError = console.error;
console.error = (...args) => {
  assert.equal(args.length, 1);
  assert.equal(typeof args[0], 'string');
  assert.ok(args[0].startsWith('[rag-diagnostic] '));
  logs.push(JSON.parse(args[0].slice('[rag-diagnostic] '.length)));
};
function fixture(name = 'ollama') {
  const state = { reads: 0, calls: 0, rejectQuery: false };
  const pool = { async execute(sql) { assert.ok(sql.startsWith('SELECT ')); state.reads++; return [[article]]; } };
  const embedder = { countTokens: () => 10, dispose() {}, async embed(text) {
    return vector(state.rejectQuery && text.startsWith('query:') ? 1 : 0);
  } };
  const provider = { name, model: 'fixture', async generate() { state.calls++; return { text: valid, usage: {} }; } };
  return { state, pool, embedder, provider, loadEmbedding: async () => embedder };
}
// Exercise the real POST handler without starting HTTP/auth/database services.
async function request(getService, body = { question: 'Wi-Fi?' }) {
  const router = createRagRouter(getService);
  const handler = router.stack.find(layer => layer.route?.path === '/ask').route.stack[0].handle;
  const result = { status: 200 };
  const res = { status(value) { result.status = value; return this; }, json(value) { result.body = value; return this; } };
  await handler({ body }, res);
  return result;
}
const failing = error => () => ({ ask: async () => { throw error; } });
const error = code => Object.assign(new TypeError('private message'), { code, cause: { code: 'ECONNREFUSED' } });
async function main() {
  let passed = 0;
  async function check(name, run) {
    logs.length = 0; process.env.NODE_ENV = 'development'; process.env.RAG_DIAGNOSTICS = 'true';
    await run(); passed++; console.log('PASS ' + name);
  }
  await check('Disabled by default, outside development and for non-exact flag values', async () => {
    for (const [mode, flag] of [['development', undefined], ['development', 'false'], ['development', '1'],
      ['production', 'true'], ['test', 'true'], [undefined, 'true']]) {
      if (mode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = mode;
      if (flag === undefined) delete process.env.RAG_DIAGNOSTICS; else process.env.RAG_DIAGNOSTICS = flag;
      assert.deepEqual(await request(failing(error('ECONNRESET'))), { status: 500, body: generic });
    }
    assert.equal(logs.length, 0);
  });
  await check('Generic 500 and typed errors retain exactly the public contract', async () => {
    for (const failure of [error('ECONNRESET'), new RagError('OLLAMA_TIMEOUT', 504, 'Timeout an toàn'),
      new RagError('STALE_SOURCE', 503, 'Nguồn đã đổi'), new RagError('SENSITIVE_DATA', 400, 'Nội dung nhạy cảm')]) {
      const r = await request(failing(failure));
      assert.deepEqual(r, failure instanceof RagError
        ? { status: failure.status, body: { success: false, code: failure.code, message: failure.message } }
        : { status: 500, body: generic });
    }
    assert.equal(logs.length, 4);
    assert.deepEqual(logs[0], { stage: 'service_init', error: { name: 'TypeError', code: 'ECONNRESET' },
      cause: { code: 'ECONNREFUSED' }, provider: null, providerCalled: false });
  });
  await check('Untrusted fields, secrets, SQL, bodies and raw stack never reach the sink', async () => {
    const privateData = 'PRIVATE_SENTINEL\nSELECT password FROM users; eyJ-private-jwt';
    process.env.UNIT_TEST_SECRET = privateData;
    const failure = { name: privateData, code: privateData, cause: { code: privateData } };
    for (const field of ['message', 'stack', 'sql', 'question', 'prompt', 'response', 'request', 'toJSON', 'experimentDiagnostic']) {
      Object.defineProperty(failure, field, { get() { throw new Error('MUST_NOT_READ_PRIVATE_DATA'); } });
    }
    assert.deepEqual(await request(failing(failure)), { status: 500, body: generic });
    assert.deepEqual(logs[0].error, { name: 'UNKNOWN', code: 'UNKNOWN' });
    assert.deepEqual(logs[0].cause, { code: 'UNKNOWN' });
    assert.equal(JSON.stringify(logs).includes('PRIVATE_SENTINEL'), false);
    delete process.env.UNIT_TEST_SECRET;
    logs.length = 0;
    const f = fixture();
    f.provider.generate = async () => { throw Object.assign(error('ECONNRESET'), {
      question: 'private question', content: quote, prompt: 'private prompt', response: 'private model response',
      stack: 'private stack', password: 'private password', experimentDiagnostic: { rawGeneration: 'private generation' },
    }); };
    await request(() => createRagService(f.pool, f));
    assert.equal(JSON.stringify(logs).includes('private'), false);
    assert.equal(JSON.stringify(logs).includes(quote), false);
    assert.deepEqual(Object.keys(logs[0]).sort(), ['cause', 'error', 'provider', 'providerCalled', 'stage']);
  });
  await check('Hostile getters, non-Error throws and a failing logger cannot replace errors', async () => {
    const hostile = {};
    for (const key of ['name', 'code', 'cause']) Object.defineProperty(hostile, key, { get: forbidden });
    for (const failure of [hostile, null, 'private raw string', 17]) {
      assert.deepEqual(await request(failing(failure)), { status: 500, body: generic });
    }
    const sink = console.error; console.error = forbidden;
    try { assert.deepEqual(await request(failing(error('ENOENT'))), { status: 500, body: generic }); }
    finally { console.error = sink; }
  });
  await check('Validation and provider configuration errors preserve their stage/status', async () => {
    const r = await request(forbidden, { question: 'Hi', provider: 'ollama' });
    assert.equal(r.status, 400); assert.equal(r.body.code, 'INVALID_BODY');
    assert.equal(logs[0].stage, 'request_validation');
    process.env.RAG_PROVIDER = 'invalid';
    const bad = await request(() => createRagService({ execute: forbidden }));
    delete process.env.RAG_PROVIDER;
    assert.equal(bad.status, 503); assert.equal(bad.body.code, 'GENERATION_PROVIDER_CONFIGURATION');
    assert.equal(logs[1].stage, 'provider_selection'); assert.equal(logs[1].provider, null);
  });
  for (const [stage, setup] of [
    ['embedding_load', f => { f.loadEmbedding = async () => { throw error('ERR_DLOPEN_FAILED'); }; }],
    ['kb_read', f => { f.pool.execute = async () => { throw error('ER_NO_SUCH_TABLE'); }; }],
    ['corpus_preprocessing', f => { f.pool.execute = async () => [[{ ...article, content: null }]]; }],
    ['corpus_chunking', f => { f.embedder.countTokens = () => { throw error('ERR_INVALID_ARG_TYPE'); }; }],
    ['corpus_embedding', f => { f.embedder.embed = async () => { throw error('ENOMEM'); }; }],
    ['retrieval', f => { f.embedder.embed = async text => { if (text.startsWith('query:')) throw error('ENOMEM'); return vector(0); }; }],
    ['source_verify_before', f => { const execute = f.pool.execute; f.pool.execute = async sql => {
      if (f.state.reads === 2) throw error('PROTOCOL_CONNECTION_LOST'); return execute(sql);
    }; }],
    ['provider_generate', f => { f.provider.generate = async () => { throw error('ECONNRESET'); }; }],
    ['source_verify_after', f => { const execute = f.pool.execute; f.pool.execute = async sql => {
      if (f.state.reads === 3) throw error('PROTOCOL_CONNECTION_LOST'); return execute(sql);
    }; }],
  ]) await check('Real service failure stage: ' + stage, async () => {
    const f = fixture(); setup(f);
    assert.deepEqual(await request(() => createRagService(f.pool, f)), { status: 500, body: generic });
    assert.equal(logs.length, 1); assert.equal(logs[0].stage, stage); assert.equal(logs[0].provider, 'ollama');
    assert.equal(logs[0].providerCalled, ['provider_generate', 'source_verify_after'].includes(stage));
  });
  await check('Invalid Ollama output keeps its mapped code and records providerCalled', async () => {
    const f = fixture(); f.provider.generate = async () => ({ text: 'invalid JSON' });
    const r = await request(() => createRagService(f.pool, f));
    assert.equal(r.status, 502); assert.equal(r.body.code, 'OLLAMA_INVALID_OUTPUT');
    assert.equal(logs[0].stage, 'output_validation'); assert.equal(logs[0].providerCalled, true);
  });
  await check('Success and retrieval fallback produce no diagnostic output or debug response', async () => {
    const f = fixture(), service = createRagService(f.pool, f);
    const r = await request(() => service);
    assert.equal(r.status, 200); assert.equal(r.body.answered, true);
    assert.deepEqual(Object.keys(r.body).sort(), ['answer', 'answered', 'sources']);
    f.state.rejectQuery = true;
    const fallback = await request(() => service);
    assert.equal(fallback.status, 200); assert.equal(fallback.body.answered, false);
    assert.deepEqual(fallback.body.sources, []); assert.equal(f.state.calls, 1); assert.equal(logs.length, 0);
  });
  await check('Concurrent busy request does not inherit providerCalled/stage; errors stay identical', async () => {
    const f = fixture(); let entered, release;
    const ready = new Promise(resolve => { entered = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    f.provider.generate = async () => { entered(); await gate; throw error('ECONNRESET'); };
    const service = createRagService(f.pool, f), first = request(() => service);
    await ready;
    const busy = await request(() => service);
    assert.equal(busy.status, 429); assert.equal(busy.body.code, 'RAG_BUSY');
    release(); assert.deepEqual(await first, { status: 500, body: generic });
    assert.equal(logs[0].stage, 'question_validation'); assert.equal(logs[0].providerCalled, false);
    assert.equal(logs[1].stage, 'provider_generate'); assert.equal(logs[1].providerCalled, true);
    f.pool.execute = async () => { throw error('ER_NO_SUCH_TABLE'); };
    await request(() => service);
    assert.equal(logs[2].stage, 'kb_read'); assert.equal(logs[2].providerCalled, false);
  });
  await check('Concurrent providers stay isolated; arbitrary metadata is not serialized', async () => {
    const one = fixture('gemini'), two = fixture('ollama'); let release, entered;
    const ready = new Promise(resolve => { entered = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    one.provider.generate = async () => { entered(); await gate; throw error('ECONNRESET'); };
    const first = request(() => createRagService(one.pool, one)); await ready;
    two.loadEmbedding = async () => { throw error('ENOENT'); };
    await request(() => createRagService(two.pool, two)); release(); await first;
    assert.equal(logs[0].provider, 'ollama'); assert.equal(logs[0].providerCalled, false);
    assert.equal(logs[1].provider, 'gemini'); assert.equal(logs[1].providerCalled, true);
    withRagDiagnostics(() => { setDiagnosticStage('PRIVATE_STAGE'); setDiagnosticProvider('PRIVATE_PROVIDER'); logRagError(error('UNKNOWN_PRIVATE_CODE')); });
    assert.equal(logs[2].stage, 'unknown'); assert.equal(logs[2].provider, 'unknown');
    assert.equal(logs[2].error.code, 'UNKNOWN');
    const before = logs.length; logRagError(error('ENOENT')); assert.equal(logs.length, before);
  });
  console.log(`RAG diagnostics: ${passed}/${passed} PASS; no network, database, model load or file writes.`);
}
main().catch(() => { originalConsoleError('RAG_DIAGNOSTICS_TEST_FAILED'); process.exitCode = 1; })
  .finally(() => { console.error = originalConsoleError; });
