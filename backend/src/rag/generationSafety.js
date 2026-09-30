class RagError extends Error {
  constructor(code, status, message) { super(message); this.name='RagError'; this.code=code; this.status=status; }
}
function ensureNoSecrets(value) {
  const text=typeof value==='string'?value:JSON.stringify(value);
  const secrets=Object.entries(process.env).filter(([key,v])=> /KEY|SECRET|PASSWORD|TOKEN/.test(key)&&typeof v==='string'&&v.length>=8).map(([,v])=>v);
  if(secrets.some(secret=>text.includes(secret)) || /AIza[A-Za-z0-9_-]{30,}/.test(text) || /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(text)) throw new RagError('SENSITIVE_DATA',400,'Nội dung có thông tin nhạy cảm; không thể xử lý.');
}
function providerError(error) {
  const status=Number(error?.status);
  if(status===429)return new RagError('GEMINI_RATE_LIMIT',503,'Gemini hết hạn mức hoặc đang giới hạn lượt gọi.');
  if(status===401||status===403||status===400)return new RagError('GEMINI_CONFIGURATION',503,'Gemini từ chối cấu hình hoặc quyền truy cập.');
  if(status===404)return new RagError('GEMINI_MODEL_UNAVAILABLE',503,'Model Gemini hiện không khả dụng.');
  if(status===408||['AbortError','TimeoutError'].includes(error?.name))return new RagError('GEMINI_TIMEOUT',504,'Gemini không phản hồi trong thời gian cho phép.');
  return new RagError('GEMINI_UNAVAILABLE',502,'Không thể nhận phản hồi từ Gemini.');
}
module.exports={RagError,ensureNoSecrets,providerError};
