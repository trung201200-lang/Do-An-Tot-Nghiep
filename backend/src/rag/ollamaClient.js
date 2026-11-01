const config = require('./generationConfig');
const { RESPONSE_SCHEMA } = require('./generationPrompt');
const { RagError, ensureNoSecrets } = require('./generationSafety');

function readOllamaConfig() {
  let url;
  try { url = new URL(process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434'); }
  catch { throw failure('CONFIGURATION', 503, 'URL Ollama không hợp lệ.'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || url.username || url.password || url.search || url.hash || url.pathname !== '/')
    throw failure('CONFIGURATION', 503, 'Ollama phải dùng HTTP loopback local, không kèm thông tin đăng nhập hoặc đường dẫn.');
  const model = process.env.OLLAMA_MODEL?.trim();
  const timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS ?? 30000);
  if (!model || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(model) || /cloud/i.test(model)
      || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000)
    throw failure('CONFIGURATION', 503, 'Cần model local và timeout Ollama hợp lệ (1–300000 ms).');
  return Object.freeze({ endpoint: new URL('/api/chat', url).href, model, timeoutMs });
}
function failure(code, status, message) { return new RagError('OLLAMA_' + code, status, message); }
function toOllamaMessages(prompt) {
  return [{ role: 'system', content: prompt.systemInstruction }, ...prompt.contents.map(item => ({
    role: item.role === 'model' ? 'assistant' : item.role,
    content: item.parts.map(part => part.text).join(''),
  }))];
}
function createOllamaClient({ settings = readOllamaConfig(), fetchImpl = globalThis.fetch } = {}) {
  return { async generate(prompt) {
    ensureNoSecrets(prompt);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
    try {
      const response = await fetchImpl(settings.endpoint, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: settings.model, messages: toOllamaMessages(prompt),
          stream: false, format: RESPONSE_SCHEMA, options: { num_predict: config.MAX_OUTPUT_TOKENS } }),
      });
      // Never expose response bodies, remote messages, request data or raw errors.
      if (response.status === 404) throw failure('MODEL_UNAVAILABLE', 503, 'Không tìm thấy model Ollama; kiểm tra model đã tải và endpoint local.');
      if (!response.ok) throw failure('HTTP_ERROR', 502, 'Ollama trả lỗi HTTP; kiểm tra dịch vụ local.');
      let data;
      try { data = await response.json(); }
      catch (error) { if (controller.signal.aborted) throw error; throw failure('INVALID_RESPONSE', 502, 'Ollama trả response không phải JSON hợp lệ.'); }
      if (!data || typeof data !== 'object' || Array.isArray(data) || data.error)
        throw failure('INVALID_RESPONSE', 502, 'Response Ollama không hợp lệ.');
      if (data.done !== true || (data.done_reason && data.done_reason !== 'stop'))
        throw failure('INCOMPLETE', 502, 'Ollama chưa hoàn tất câu trả lời.');
      const text = data.message?.content;
      if (typeof text !== 'string' || !text.trim()) throw failure('EMPTY', 502, 'Ollama trả câu trả lời rỗng.');
      ensureNoSecrets(text);
      let output;
      try { output = JSON.parse(text); } catch { throw failure('INVALID_OUTPUT', 502, 'Ollama trả nội dung không phải JSON hợp lệ.'); }
      if (!output || typeof output !== 'object' || Array.isArray(output)
          || Object.keys(output).some(k => !['answered', 'answer', 'evidence'].includes(k))
          || typeof output.answered !== 'boolean' || typeof output.answer !== 'string'
          || !Array.isArray(output.evidence) || !output.evidence.every(q => typeof q === 'string'))
        throw failure('INVALID_OUTPUT', 502, 'Ollama trả nội dung không đúng schema.');
      const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
      const inputTokens = count(data.prompt_eval_count), outputTokens = count(data.eval_count);
      return { text, usage: { inputTokens, outputTokens,
        totalTokens: inputTokens === null || outputTokens === null ? null : inputTokens + outputTokens } };
    } catch (error) {
      if (controller.signal.aborted || ['AbortError', 'TimeoutError'].includes(error?.name))
        throw failure('TIMEOUT', 504, 'Ollama không phản hồi trong thời gian cho phép.');
      if (error instanceof RagError) throw error;
      throw failure('UNAVAILABLE', 503, 'Không kết nối được Ollama; kiểm tra dịch vụ local đã chạy.');
    } finally { clearTimeout(timer); }
  } };
}
module.exports = { createOllamaClient, readOllamaConfig, toOllamaMessages };
