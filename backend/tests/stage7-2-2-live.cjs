// Explicit opt-in only. SELECT KB + local Ollama; never use this in unit scripts.
if (!process.argv.includes('--run-local')) {
  console.error('Use --run-local to authorize local Ollama requests and read-only KB access.');
  process.exit(1);
}
const fs = require('node:fs');
const blocked = () => { throw new Error('WRITE_BLOCKED'); };
for (const name of ['writeFile', 'writeFileSync', 'appendFile', 'appendFileSync', 'mkdir', 'mkdirSync', 'rename', 'renameSync', 'unlink', 'unlinkSync', 'createWriteStream']) fs[name] = blocked;
for (const name of ['writeFile', 'appendFile', 'mkdir', 'rename', 'unlink']) fs.promises[name] = blocked;
require('../src/config/env');
const { loadEmbedder } = require('../src/rag/embedding');
const { runPipeline } = require('../src/rag/pipeline');
const { retrieve } = require('../src/rag/retrieval');
const { selectContext, verifySources } = require('../src/rag/generationContext');
const { buildPrompt, RESPONSE_SCHEMA } = require('../src/rag/generationPrompt');
const { buildOllamaPrompt } = require('../src/rag/ollamaPrompt');
const { createOllamaClient, readOllamaConfig, toOllamaMessages } = require('../src/rag/ollamaClient');
const { createRagService } = require('../src/rag/generationService');
const { createGenerationProvider } = require('../src/rag/generationProvider');
const { normalizeOutput } = require('../src/rag/generationOutput');
const { normalizeText } = require('../src/rag/text');
const { ensureNoSecrets } = require('../src/rag/generationSafety');
const config = require('../src/rag/generationConfig');
const pool = require('../src/config/db');
const db = { execute(sql, args) { if (!sql.startsWith('SELECT ')) return blocked(); return pool.execute(sql, args); } };
const emit = row => { ensureNoSecrets(row); console.log(JSON.stringify(row)); };
const originalFetch = global.fetch;
global.fetch = async (url, options = {}) => {
  const target = new URL(String(url));
  if (!['GET', 'HEAD'].includes(options.method || 'GET') || (target.hostname !== 'huggingface.co' && !target.hostname.endsWith('.huggingface.co'))) return blocked();
  return originalFetch(url, options);
};
let embedder, calls = 0;
async function main() {
  const mode = process.argv.includes('--candidate') ? 'candidate' : 'baseline';
  const defaults = process.argv.includes('--defaults');
  const settings = readOllamaConfig();
  if (process.env.RAG_PROVIDER !== 'ollama' || settings.endpoint !== 'http://127.0.0.1:11434/api/chat' || settings.model !== 'qwen2.5:1.5b') throw new Error('LOCAL_CONFIG_MISMATCH');
  embedder = await loadEmbedder();
  const corpus = await runPipeline(db, embedder);
  const question = 'Máy tính không kết nối được Wi-Fi văn phòng, hãy hướng dẫn cách xử lý.';
  const ranking = await retrieve({ question, vectors: corpus.vectors, embedder, k: config.TOP_K, threshold: config.THRESHOLD });
  if (!ranking.accepted) throw new Error('RETRIEVAL_NOT_ACCEPTED');
  const context = selectContext(ranking.topArticles, corpus.articles);
  await verifySources(db, context);
  if (process.argv.includes('--service')) {
    let status;
    const provider = createGenerationProvider({ geminiFactory: blocked,
      ollamaFactory: options => createOllamaClient({ ...options, fetchImpl: async (url, request) => {
        if (url !== settings.endpoint || request.method !== 'POST' || calls >= 2) return blocked();
        calls++;
        const body = JSON.parse(request.body);
        emit({ check: 'service-request', messagesMatchDirectPrompt: JSON.stringify(body.messages) === JSON.stringify(toOllamaMessages(buildOllamaPrompt(question, context))),
          temperature: body.options.temperature, seed: body.options.seed });
        const started = performance.now();
        const response = await originalFetch(url, request); status = response.status;
        return { status, ok: response.ok, async json() {
          const data = await response.json();
          let output; try { output = JSON.parse(data.message?.content); } catch {}
          const quotes = Array.isArray(output?.evidence) ? output.evidence : [];
          emit({ check: 'service-model', status, latencyMs: Math.round(performance.now() - started), modelAnswered: typeof output?.answered === 'boolean' ? output.answered : null,
            evidenceCount: quotes.length, matchingEvidenceCount: quotes.filter(q => typeof q === 'string' && normalizeText(q).length >= 20 && context.some(c => c.text.includes(normalizeText(q)))).length });
          return data;
        } };
      } }) });
    const service = createRagService(db, { provider, loadEmbedding: async () => embedder });
    for (let attempt = 1; attempt <= 2; attempt++) {
      const started = performance.now();
      const result = await service.ask(question);
      emit({ check: 'service', attempt, status, latencyMs: Math.round(performance.now() - started),
        generationMs: Math.round(result.trace.timing.generationMs), reason: result.trace.reason,
        answered: result.response.answered, provider: result.trace.provider, providerCalled: result.trace.providerCalled,
        geminiCalled: result.trace.geminiCalled, evidenceCount: result.trace.evidence?.length ?? 0,
        sources: result.response.sources.map(s => s.code) });
    }
    emit({ check: 'complete', mode: 'service', ollamaCalls: calls, geminiCalls: 0 });
    return;
  }
  const synthetic = [{ articleId: 1, code: 'KB-000001', title: 'Wi-Fi', score: 1,
    text: 'Nếu máy tính không kết nối Wi-Fi, hãy kiểm tra Wi-Fi đã bật và chế độ máy bay đã tắt. Nếu vẫn chưa kết nối được, hãy liên hệ bộ phận IT để được hỗ trợ.' }];
  const cases = [
    { id: 'synthetic_supported', question, context: synthetic, expected: true },
    { id: 'synthetic_unsupported_detail', question: 'Địa chỉ IP chính xác của máy chủ DNS công ty là gì?', context: synthetic, expected: false },
    { id: 'real_wifi_context', question, context, expected: null },
    // An empty context is unambiguously unsupported; this isolates generation, not retrieval.
    { id: 'empty_context', question, context: [], expected: false },
  ];
  emit({ check: 'setup', mode, model: settings.model, controlledSampling: !defaults,
    seed: 42, temperature: 0,
    articles: corpus.articles.length, chunks: corpus.vectors.length, threshold: config.THRESHOLD,
    contextIds: context.map(c => c.articleId), topScore: ranking.topArticles[0].similarity });
  for (const test of cases) {
    let status = null;
    const client = createOllamaClient({ settings, fetchImpl: async (url, request) => {
      if (url !== settings.endpoint || request.method !== 'POST' || calls >= cases.length) return blocked();
      calls++;
      const body = JSON.parse(request.body);
      if (mode === 'baseline') body.format = RESPONSE_SCHEMA;
      if (!defaults) body.options = { ...body.options, seed: 42, temperature: 0 };
      const response = await originalFetch(url, { ...request, body: JSON.stringify(body) });
      status = response.status; return response;
    } });
    const started = performance.now();
    try {
      const prompt = (mode === 'candidate' ? buildOllamaPrompt : buildPrompt)(test.question, test.context);
      const generated = await client.generate(prompt);
      const output = JSON.parse(generated.text);
      // Inspect evidence independently even when answered=false; never promote the answer.
      const evidenceMatches = output.evidence.map(q => {
        const quote = normalizeText(q);
        return quote.length >= 20 && test.context.some(c => c.text.includes(quote));
      });
      let normalized, validationCode = null;
      try { normalized = normalizeOutput(generated.text, test.context); }
      catch (error) { validationCode = ['GEMINI_INVALID_EVIDENCE', 'GEMINI_INVALID_OUTPUT', 'SENSITIVE_DATA'].includes(error.code) ? error.code : 'UNKNOWN'; }
      // Conservative lexical check, NOT a semantic-grounding score.
      const answerIsSourceSubstring = test.context.some(c => c.text.includes(normalizeText(output.answer)));
      emit({ check: 'case', mode, id: test.id, expected: test.expected, status, latencyMs: Math.round(performance.now() - started),
        modelAnswered: output.answered, evidenceCount: output.evidence.length,
        allEvidenceMatches: evidenceMatches.length > 0 && evidenceMatches.every(Boolean),
        answerIsSourceSubstring, validatedAnswered: normalized?.response.answered ?? null,
        reason: normalized?.reason ?? null, validationCode,
        falseWithEvidence: !output.answered && output.evidence.length > 0 });
    } catch (error) {
      const allowed = ['OLLAMA_TIMEOUT', 'OLLAMA_UNAVAILABLE', 'OLLAMA_INVALID_OUTPUT', 'OLLAMA_INCOMPLETE', 'OLLAMA_EMPTY', 'OLLAMA_HTTP_ERROR', 'OLLAMA_INVALID_RESPONSE', 'SENSITIVE_DATA'];
      emit({ check: 'case', mode, id: test.id, status, latencyMs: Math.round(performance.now() - started), errorCode: allowed.includes(error.code) ? error.code : 'UNKNOWN' });
    }
  }
  await verifySources(db, context);
  emit({ check: 'complete', mode, ollamaCalls: calls, geminiCalls: 0 });
}
main().catch(error => {
  const allowed = ['OLLAMA_TIMEOUT', 'OLLAMA_UNAVAILABLE', 'OLLAMA_INVALID_OUTPUT', 'OLLAMA_INVALID_EVIDENCE',
    'OLLAMA_INCOMPLETE', 'OLLAMA_EMPTY', 'OLLAMA_HTTP_ERROR', 'OLLAMA_INVALID_RESPONSE', 'SENSITIVE_DATA', 'STALE_SOURCE'];
  emit({ check: 'experiment-failed', code: allowed.includes(error.code) ? error.code : 'UNKNOWN', ollamaCalls: calls, geminiCalls: 0 });
  process.exitCode = 1;
})
  .finally(async () => {
    try { if (embedder) await embedder.dispose(); } catch { console.error('MODEL_CLEANUP_FAILED'); process.exitCode = 1; }
    try { await pool.end(); } catch { console.error('DB_CLEANUP_FAILED'); process.exitCode = 1; }
  });
