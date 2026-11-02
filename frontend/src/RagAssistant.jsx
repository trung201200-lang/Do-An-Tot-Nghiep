import React, { useEffect, useRef, useState } from 'react';
import { apiRequest } from './api';
import { Alert, Badge, Button, LoadingState } from './components/ui';
import Icon from './components/ui/Icon';
import { RagAnswer, RagSourceReader } from './components/rag/RagViews';
import './styles/rag.css';

const MAX_QUESTION = 1000; // Đồng bộ giới hạn Unicode code point của API GĐ5.4.
const failureText = failure => {
  if (['OLLAMA_INVALID_RESPONSE', 'OLLAMA_INVALID_OUTPUT', 'OLLAMA_INVALID_EVIDENCE', 'OLLAMA_INCOMPLETE', 'OLLAMA_EMPTY'].includes(failure.code))
    return 'Chưa xác minh được câu trả lời từ Ollama. Bạn có thể diễn đạt lại câu hỏi hoặc thử lại sau.';
  if (failure.code === 'OLLAMA_UNAVAILABLE') return 'Không kết nối được Ollama. Vui lòng kiểm tra dịch vụ local đã chạy.';
  if (failure.code === 'OLLAMA_MODEL_UNAVAILABLE') return 'Không tìm thấy model Ollama. Vui lòng kiểm tra model đã được tải trên backend.';
  if (failure.code === 'OLLAMA_CONFIGURATION') return 'Cấu hình Ollama trên backend chưa hợp lệ.';
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
  const [turns, setTurns] = useState([]);
  const [announcement, setAnnouncement] = useState('');
  const [articles, setArticles] = useState([]);
  const [source, setSource] = useState(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(null);
  const active = useRef(false);
  const sequence = useRef(0);
  const input = useRef(null);
  const end = useRef(null);
  const trimmed = question.trim();
  const length = Array.from(trimmed).length;

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; pending.current?.abort(); };
  }, []);

  const hasSources = turns.some(turn => turn.status === 'answered');
  useEffect(() => {
    if (!hasSources) return;
    const controller = new AbortController();
    apiRequest('/knowledge', { token, signal: controller.signal }).then(data => {
      if (!controller.signal.aborted && Array.isArray(data.articles)) setArticles(data.articles.filter(article =>
        Number.isSafeInteger(article.id) && article.id > 0 && typeof article.code === 'string' && (user.role !== 'EMPLOYEE' || article.status === 'PUBLISHED')));
    }).catch(failure => {
      if (!controller.signal.aborted && failure.status === 401) onUnauthorized('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      // Optional source lookup failure must not hide the answer or invent a URL.
    });
    return () => controller.abort();
  }, [hasSources, token, user.role]);
  useEffect(() => { if (turns.length) end.current?.scrollIntoView({ block: 'nearest' }); }, [turns.length]);

  function fillQuestion(value) { setQuestion(value); input.current?.focus(); }

  async function submit(event) {
    event.preventDefault();
    if (pending.current || !trimmed || length > MAX_QUESTION) return;
    const controller = new AbortController();
    pending.current = controller;
    const id = ++sequence.current;
    setBusy(true); setAnnouncement('');
    setTurns(previous => [...previous, { id, question: trimmed, status: 'pending' }]);
    const update = value => setTurns(previous => previous.map(turn => turn.id === id ? { ...turn, ...value } : turn));
    const timeout = window.setTimeout(() => controller.abort(), 65000);
    try {
      const data = await apiRequest('/rag/ask', { token, method: 'POST', body: { question: trimmed }, signal: controller.signal });
      if (!active.current) return;
      if (!validResult(data)) { update({ status: 'error', error: 'Dịch vụ trả về dữ liệu chưa hợp lệ. Vui lòng thử lại sau.' }); return; }
      update({ status: data.answered ? 'answered' : 'fallback', result: data });
      setAnnouncement(`Lượt ${id}: ${data.answered ? 'Đã nhận câu trả lời và nguồn tham khảo.' : 'Chưa đủ thông tin trong Kho kiến thức.'}`);
    } catch (failure) {
      if (!active.current) return;
      if (failure.status === 401) onUnauthorized('Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.');
      else update({ status: 'error', error: failureText(failure) });
    } finally {
      window.clearTimeout(timeout);
      pending.current = null;
      if (active.current) {
        setBusy(false);
        requestAnimationFrame(() => {
          if (document.activeElement === document.body || input.current?.closest('form')?.contains(document.activeElement)) input.current?.focus({ preventScroll: true });
        });
      }
    }
  }

  return (
    <section className="rag-assistant rag-chat" aria-labelledby="rag-title">
      <header className="rag-chat-heading"><span className="rag-avatar"><Icon name="sparkles" size={26} /></span><div><h2 id="rag-title">Trợ lý hỗ trợ CNTT</h2><p>Tra cứu hướng dẫn từ Kho kiến thức nội bộ.</p></div><Badge tone="blue">Trợ lý AI</Badge></header>
      <p className="rag-session-note">Mỗi câu hỏi được gửi độc lập. Hãy nêu đầy đủ sự cố; trợ lý không ghi nhớ nội dung các lượt trước.</p>
      {!turns.length && <div className="rag-welcome"><h3>Bạn đang cần hỗ trợ vấn đề gì?</h3><p>Mô tả sự cố hoặc chọn một gợi ý bên dưới để bắt đầu.</p></div>}
      <section className="rag-suggestions" aria-label="Câu hỏi gợi ý">{[
        ['Wi-Fi', 'Máy tính không kết nối được Wi-Fi văn phòng, hãy hướng dẫn cách xử lý.'],
        ['Máy in', 'Tôi không in được tài liệu trên máy in văn phòng. Tôi nên kiểm tra những gì?'],
        ['Email', 'Tôi không gửi hoặc nhận được email công việc. Hãy hướng dẫn cách kiểm tra.'],
        ['Máy tính chậm', 'Máy tính làm việc chạy chậm. Tôi nên kiểm tra và xử lý như thế nào?'],
      ].map(([label, value]) => <Button key={label} variant="secondary" disabled={busy} onClick={() => fillQuestion(value)}>{label}<Icon name="arrow" size={16} /></Button>)}</section>
      <div className="rag-announcement" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>
      <ol className="rag-conversation" aria-label="Các lượt hỏi đáp trong phiên màn hình">{turns.map(turn => <li key={turn.id} className="rag-turn" data-turn-status={turn.status}>
        <div className="rag-question-bubble"><span className="rag-speaker">Bạn · Lượt {turn.id}</span><p className="multiline">{turn.question}</p></div>
        <article className="rag-result" aria-label={`Trợ lý trả lời lượt ${turn.id}`}><div className="rag-speaker rag-speaker--ai"><Icon name="sparkles" size={18} />Trợ lý AI</div>
          {turn.status === 'pending' ? <LoadingState message="Đang tìm thông tin và tạo câu trả lời…" /> : turn.status === 'error' ? <><Alert>{turn.error}</Alert><Button variant="secondary" disabled={busy} onClick={() => fillQuestion(turn.question)}>Dùng lại câu hỏi</Button></> :
            <RagAnswer result={turn.result} articles={articles} onOpenSource={setSource} onCreateTicket={user.role === 'EMPLOYEE' ? () => onCreateTicket(turn.question) : null} busy={busy} />}
        </article>
      </li>)}</ol>
      <div ref={end} />
      <form className="rag-form" onSubmit={submit} aria-busy={busy}>
        <label htmlFor="rag-question">Câu hỏi của bạn</label>
        <textarea ref={input} id="rag-question" rows={3} value={question} disabled={busy} placeholder="Mô tả sự cố bạn đang gặp…"
          aria-describedby="rag-hint rag-length" aria-invalid={length > MAX_QUESTION}
          onChange={event => setQuestion(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) submit(event);
          }} />
        <p id="rag-hint" className="rag-hint">Enter để gửi, Shift + Enter để xuống dòng. Không nhập mật khẩu hoặc thông tin bí mật.</p>
        <div className="rag-composer-footer"><p id="rag-length" className={length > MAX_QUESTION ? 'rag-field-error' : 'rag-hint'}>{length}/{MAX_QUESTION} ký tự{length > MAX_QUESTION ? ' — Hãy rút gọn câu hỏi.' : ''}</p>
        <Button type="submit" disabled={busy || !trimmed || length > MAX_QUESTION}>{busy ? 'Đang xử lý...' : 'Gửi câu hỏi'}<Icon name="arrow" size={18} /></Button></div>
      </form>
      <p className="rag-retention-note">Các lượt hỏi đáp chỉ hiển thị trong phiên màn hình này và được xóa khi bạn rời màn hình hoặc tải lại trang.</p>
      {source && <RagSourceReader source={source} token={token} user={user} onUnauthorized={onUnauthorized} onClose={() => setSource(null)} onUnavailable={id => setArticles(previous => previous.filter(article => article.id !== id))} />}
    </section>
  );
}
