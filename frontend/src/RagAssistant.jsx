import React, { useEffect, useRef, useState } from 'react';
import { apiRequest } from './api';

const MAX_QUESTION = 1000; // Đồng bộ giới hạn Unicode code point của API GĐ5.4.
const failureText = failure => {
  if (['GEMINI_INVALID_EVIDENCE', 'GEMINI_INVALID_OUTPUT', 'GEMINI_INCOMPLETE', 'GEMINI_EMPTY'].includes(failure.code))
    return 'Chưa xác minh được câu trả lời từ nguồn kiến thức. Bạn có thể diễn đạt lại câu hỏi hoặc thử lại sau.';
  if (failure.code === 'GEMINI_RATE_LIMIT') return 'Dịch vụ trả lời đang hết hạn mức hoặc giới hạn lượt hỏi. Vui lòng thử lại sau.';
  if (failure.status === 400) return 'Câu hỏi không hợp lệ hoặc quá dài. Vui lòng rút gọn và không nhập thông tin bí mật.';
  if (failure.status === 403) return 'Bạn không có quyền sử dụng trợ lý lúc này.';
  if (failure.status === 404) return 'Không tìm thấy chức năng hỏi đáp. Vui lòng thử lại sau.';
  if (failure.status === 429) return 'Trợ lý đang bận. Vui lòng đợi một lúc rồi gửi lại.';
  if (failure.status === 504 || failure.name === 'AbortError') return 'Yêu cầu mất quá nhiều thời gian. Vui lòng thử lại sau.';
  if (failure.status >= 500) return 'Dịch vụ trả lời tạm thời không khả dụng. Vui lòng thử lại sau.';
  return 'Không kết nối được dịch vụ hỏi đáp. Hãy kiểm tra kết nối và thử lại.';
};

function validResult(data) {
  return data && typeof data.answered === 'boolean' && typeof data.answer === 'string' && data.answer.trim()
    && Array.isArray(data.sources) && (data.answered ? data.sources.length > 0 : data.sources.length === 0)
    && data.sources.every(source => source && typeof source.code === 'string' && typeof source.title === 'string');
}

export default function RagAssistant({ token, user, onUnauthorized, onCreateTicket }) {
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(null);
  const active = useRef(false);
  const trimmed = question.trim();
  const length = Array.from(trimmed).length;

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; pending.current?.abort(); };
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (pending.current || !trimmed || length > MAX_QUESTION) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true); setError(''); setResult(null);
    const timeout = window.setTimeout(() => controller.abort(), 65000);
    try {
      const data = await apiRequest('/rag/ask', { token, method: 'POST', body: { question: trimmed }, signal: controller.signal });
      if (!active.current) return;
      if (!validResult(data)) { setError('Dịch vụ trả về dữ liệu chưa hợp lệ. Vui lòng thử lại sau.'); return; }
      setResult({ question: trimmed, ...data });
    } catch (failure) {
      if (!active.current) return;
      if (failure.status === 401) onUnauthorized('Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.');
      else setError(failureText(failure));
    } finally {
      window.clearTimeout(timeout);
      pending.current = null;
      if (active.current) setBusy(false);
    }
  }

  return (
    <section className="rag-assistant" aria-labelledby="rag-title">
      <h2 id="rag-title">Trợ lý hỗ trợ CNTT</h2>
      <p>Nhập câu hỏi về sự cố CNTT nội bộ để tra cứu hướng dẫn từ Kho kiến thức.</p>
      <form className="rag-form" onSubmit={submit} aria-busy={busy}>
        <label htmlFor="rag-question">Câu hỏi của bạn</label>
        <textarea id="rag-question" rows={4} value={question} disabled={busy}
          aria-describedby="rag-hint rag-length" aria-invalid={length > MAX_QUESTION}
          onChange={event => setQuestion(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) submit(event);
          }} />
        <p id="rag-hint" className="rag-hint">Enter để gửi, Shift + Enter để xuống dòng. Không nhập mật khẩu hoặc thông tin bí mật.</p>
        <p id="rag-length" className={length > MAX_QUESTION ? 'error' : 'rag-hint'}>{length}/{MAX_QUESTION} ký tự{length > MAX_QUESTION ? ' — Hãy rút gọn câu hỏi.' : ''}</p>
        <button type="submit" disabled={busy || !trimmed || length > MAX_QUESTION}>{busy ? 'Đang xử lý...' : 'Gửi câu hỏi'}</button>
      </form>
      {busy && <p role="status">Đang tìm kiếm thông tin và tạo câu trả lời...</p>}
      {error && <p role="alert" className="error">{error}</p>}
      {result && <article className="rag-result" aria-label="Kết quả hỏi đáp" aria-live="polite">
        <h3>Câu hỏi</h3><p className="multiline">{result.question}</p>
        <h3>{result.answered ? 'Trả lời' : 'Chưa đủ thông tin trong Kho kiến thức'}</h3>
        <p className="multiline rag-answer">{result.answer}</p>
        {result.answered && <section aria-label="Nguồn tham khảo">
          <h3>Nguồn tham khảo</h3>
          <ul className="rag-sources">{result.sources.map((source, index) => <li key={source.code + ':' + index}><strong>{source.code}</strong> — {source.title}</li>)}</ul>
        </section>}
        {!result.answered && user.role === 'EMPLOYEE' && <div>
          <p>Bạn có thể chuyển sang mục Ticket và chọn tạo yêu cầu để bộ phận IT hỗ trợ.</p>
          <button type="button" onClick={onCreateTicket}>Tạo yêu cầu hỗ trợ</button>
        </div>}
      </article>}
    </section>
  );
}
