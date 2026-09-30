require('../config/env');
module.exports = Object.freeze({
  MODEL: 'gemini-3.5-flash-lite',
  THRESHOLD: 0.8504602347669256,
  TOP_K: 3,
  MAX_QUESTION_CHARACTERS: 1000,
  MAX_CONTEXT_CHARACTERS: 12000,
  MAX_OUTPUT_TOKENS: 1536,
  TIMEOUT_MS: 30000,
  FALLBACK: 'Kho kiến thức hiện chưa có đủ thông tin để trả lời vấn đề này. Bạn có thể gửi yêu cầu hỗ trợ cho bộ phận IT.',
});
