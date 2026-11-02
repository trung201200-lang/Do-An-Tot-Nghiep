import React, { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../../api';
import { Alert, Button, LoadingState } from '../ui';
import { KnowledgeDetail } from '../knowledge/KnowledgeViews';
import '../../styles/knowledge.css';

export function RagAnswer({ result, articles, onOpenSource, onCreateTicket, busy }) {
  const [copyStatus, setCopyStatus] = useState('');
  const [copying, setCopying] = useState(false);
  async function copy() {
    setCopyStatus(''); setCopying(true);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(result.answer);
      setCopyStatus('Đã sao chép câu trả lời.');
    } catch { setCopyStatus('Không thể sao chép tự động. Bạn có thể chọn nội dung câu trả lời để sao chép thủ công.'); }
    finally { setCopying(false); }
  }
  return <>
    <h3>{result.answered ? 'Hướng dẫn từ Kho kiến thức' : 'Chưa đủ thông tin trong Kho kiến thức'}</h3>
    <p className="multiline rag-answer">{result.answer}</p>
    {result.answered && <section className="rag-reference-block" aria-label="Nguồn tham khảo"><h4>Nguồn tham khảo</h4><ul className="rag-sources">{result.sources.map((source, index) => {
      const article = articles.find(item => item.code === source.code);
      return <li key={`${source.code}:${index}`}>{article ? <Button variant="secondary" className="rag-source-link" data-source-code={source.code} onClick={() => onOpenSource({ id: article.id, code: source.code })} aria-label={`Đọc nguồn ${source.code}: ${source.title}`}><strong>{source.code}</strong><span>{source.title}</span></Button> : <div className="rag-source-text"><strong>{source.code}</strong><span>{source.title}</span></div>}</li>;
    })}</ul></section>}
    {!result.answered && onCreateTicket && <div className="rag-escalation"><p>Bộ phận IT có thể hỗ trợ thêm. Câu hỏi sẽ được điền sẵn vào form để bạn kiểm tra trước khi gửi.</p><Button className="rag-ticket-cta" disabled={busy} onClick={onCreateTicket}>Tạo yêu cầu hỗ trợ</Button></div>}
    <div className="rag-answer-tools"><Button variant="secondary" className="rag-copy" disabled={copying} onClick={copy}>{copying ? 'Đang sao chép…' : 'Sao chép câu trả lời'}</Button><span className="rag-copy-status" role="status" aria-live="polite">{copyStatus}</span></div>
  </>;
}

export function RagSourceReader({ source, token, user, onUnauthorized, onClose, onUnavailable }) {
  const dialog = useRef(null);
  const close = useRef(null);
  const [article, setArticle] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current;
    element.showModal(); close.current.focus();
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 15000);
    let active = true;
    apiRequest(`/knowledge/${source.id}`, { token, signal: controller.signal }).then(data => {
      if (!active) return;
      if (!data.article || data.article.code !== source.code || typeof data.article.content !== 'string' || (user.role === 'EMPLOYEE' && data.article.status !== 'PUBLISHED')) throw new Error('Source unavailable');
      setArticle(data.article);
    }).catch(failure => {
      if (!active) return;
      if (failure.status === 401) { onUnauthorized('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'); return; }
      setError('Chưa thể mở bài tham khảo. Bài viết có thể đã thay đổi hoặc bạn không còn quyền xem. Hãy tra cứu lại trong Kho kiến thức.');
      onUnavailable(source.id);
    }).finally(() => window.clearTimeout(timer));
    return () => { active = false; controller.abort(); window.clearTimeout(timer); element.close(); if (previous?.isConnected) previous.focus(); else document.getElementById('rag-question')?.focus(); };
  }, [source.id, token, user.role]);
  return <dialog ref={dialog} className="rag-source-dialog knowledge-page" aria-labelledby="rag-source-title" onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => {
    // The read-only preview has a single interactive control.
    if (event.key === 'Tab') { event.preventDefault(); close.current.focus(); }
  }}><div className="rag-source-dialog-heading"><h2 id="rag-source-title">Bài tham khảo · {source.code}</h2><Button ref={close} variant="secondary" onClick={onClose}>Đóng bài tham khảo</Button></div>
    {error ? <Alert>{error}</Alert> : article ? <KnowledgeDetail article={article} canManage={false} /> : <LoadingState message="Đang tải bài tham khảo…" />}
  </dialog>;
}
