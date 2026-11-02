const { AsyncLocalStorage } = require('node:async_hooks');

// Request-local metadata only: never attach diagnostics to errors or responses.
const requests = new AsyncLocalStorage();
const stages = new Set([
  'request_validation', 'service_init', 'provider_selection', 'question_validation',
  'embedding_load', 'embedding_import', 'embedding_tokenizer', 'embedding_model',
  'kb_read', 'index_snapshot', 'corpus_preprocessing', 'corpus_chunking',
  'corpus_embedding', 'corpus_validation', 'corpus_summary', 'question_tokenization',
  'retrieval', 'context_selection', 'source_verify_before', 'prompt_build',
  'provider_generate', 'output_validation', 'source_verify_after', 'response_prepare',
  'response_validation', 'response_send',
]);
const names = new Set(['Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError',
  'URIError', 'EvalError', 'AggregateError', 'AbortError', 'TimeoutError', 'RagError']);
// Exact allowlist, not a regex: arbitrary SDK codes/names can contain user data.
const codes = new Set([
  'INVALID_BODY', 'INVALID_QUESTION', 'QUESTION_TOO_LONG', 'RAG_BUSY', 'SENSITIVE_DATA',
  'STALE_SOURCE', 'GENERATION_PROVIDER_CONFIGURATION',
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH',
  'EHOSTUNREACH', 'EACCES', 'EPERM', 'ENOENT', 'ENOMEM', 'ABORT_ERR',
  'ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND', 'ERR_DLOPEN_FAILED', 'ERR_INVALID_ARG_TYPE',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET',
  'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR', 'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR',
  'ER_PARSE_ERROR', 'ER_LOCK_WAIT_TIMEOUT', 'ER_LOCK_DEADLOCK', 'PROTOCOL_CONNECTION_LOST',
  ...['KEY_MISSING', 'MODEL_CONFIGURATION', 'CONFIGURATION', 'RATE_LIMIT', 'MODEL_UNAVAILABLE',
    'TIMEOUT', 'UNAVAILABLE', 'INCOMPLETE', 'EMPTY', 'INVALID_OUTPUT', 'INVALID_EVIDENCE']
    .map(code => 'GEMINI_' + code),
  ...['CONFIGURATION', 'MODEL_UNAVAILABLE', 'HTTP_ERROR', 'INVALID_RESPONSE', 'INCOMPLETE',
    'EMPTY', 'INVALID_OUTPUT', 'INVALID_EVIDENCE', 'TIMEOUT', 'UNAVAILABLE']
    .map(code => 'OLLAMA_' + code),
]);
const enabled = () => process.env.NODE_ENV === 'development' && process.env.RAG_DIAGNOSTICS === 'true';
function withRagDiagnostics(run) {
  return enabled() ? requests.run({ stage: 'request_validation', provider: null, providerCalled: false }, run) : run();
}
function setDiagnosticStage(stage) {
  const state = requests.getStore();
  if (state) state.stage = stages.has(stage) ? stage : 'unknown';
}
function setDiagnosticProvider(provider) {
  const state = requests.getStore();
  if (state) state.provider = ['gemini', 'ollama'].includes(provider) ? provider : 'unknown';
}
function markProviderCalled() {
  const state = requests.getStore();
  if (state) state.providerCalled = true;
}
function safeField(value, allowlist) {
  return value == null ? null : allowlist.has(value) ? value : 'UNKNOWN';
}
function read(value, key) {
  try { return value?.[key]; } catch { return undefined; }
}
function logRagError(error) {
  try {
    const state = requests.getStore();
    if (!enabled() || !state) return;
    console.error('[rag-diagnostic] ' + JSON.stringify({
      stage: state.stage,
      error: { name: safeField(read(error, 'name'), names), code: safeField(read(error, 'code'), codes) },
      cause: { code: safeField(read(read(error, 'cause'), 'code'), codes) },
      provider: state.provider, providerCalled: state.providerCalled,
    }));
  } catch {
    // Diagnostics (including a failing sink) must never change HTTP error handling.
  }
}
module.exports = { withRagDiagnostics, setDiagnosticStage, setDiagnosticProvider, markProviderCalled, logRagError };
