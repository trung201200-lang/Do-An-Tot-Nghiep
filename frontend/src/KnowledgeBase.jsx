import React, { useEffect, useState } from 'react';
import { apiRequest } from './api';

const statusNames = { DRAFT: 'Bản nháp', PUBLISHED: 'Đã xuất bản', ARCHIVED: 'Đã lưu trữ' };
const transitions = {
  DRAFT: { status: 'PUBLISHED', label: 'Xuất bản' },
  PUBLISHED: { status: 'ARCHIVED', label: 'Lưu trữ' },
  ARCHIVED: { status: 'DRAFT', label: 'Chuyển về bản nháp' },
};
const date = value => new Date(value).toLocaleString('vi-VN');

export default function KnowledgeBase({ token, user, onUnauthorized }) {
  const [articles, setArticles] = useState(null);
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState('list');
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);
  const canManage = ['IT', 'ADMIN'].includes(user.role);
  const keyword = query.trim().toLocaleLowerCase('vi-VN');
  const visible = (articles || []).filter(article =>
    `${article.code} ${article.title}`.toLocaleLowerCase('vi-VN').includes(keyword));

  function handleError(failure) {
    if (failure.status === 401) { onUnauthorized(failure.message); return; }
    if (failure.status === 403 || failure.status === 404) {
      setSelected(null); setMode('list');
    }
    setError(failure.status >= 500
      ? 'Không thể tải hoặc lưu bài viết lúc này. Vui lòng thử lại sau.'
      : failure.message);
  }

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    apiRequest('/knowledge', { token }).then(data => {
      if (active) setArticles(data.articles);
    }).catch(failure => {
      if (active) handleError(failure);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, reload]);

  function back() {
    setMode('list'); setSelected(null); setError(''); setMessage('');
  }
  async function openArticle(id) {
    setBusy(true); setError(''); setMessage('');
    try {
      const data = await apiRequest(`/knowledge/${id}`, { token });
      setSelected(data.article); setMode('detail');
    } catch (failure) { handleError(failure); }
    finally { setBusy(false); }
  }
  function startForm(edit = false) {
    setTitle(edit ? selected.title : ''); setContent(edit ? selected.content : '');
    setMode(edit ? 'edit' : 'create'); setError(''); setMessage('');
  }
  async function refreshAfterWrite(article) {
    // Chỉ hiển thị dữ liệu backend đã xác nhận; thoát form để tránh gửi tạo trùng.
    setSelected(article); setMode('detail'); setQuery('');
    setArticles(previous => [article, ...(previous || []).filter(item => item.id !== article.id)]);
    const [detail, list] = await Promise.all([
      apiRequest(`/knowledge/${article.id}`, { token }), apiRequest('/knowledge', { token }),
    ]);
    setSelected(detail.article); setArticles(list.articles);
  }
  async function save(event) {
    event.preventDefault();
    if (!canManage || busy) return;
    const body = { title: title.trim(), content: content.trim() };
    if (!body.title || !body.content) { setError('Tiêu đề và nội dung không được chỉ chứa khoảng trắng.'); return; }
    if (new TextEncoder().encode(JSON.stringify(body)).length > 16 * 1024) {
      setError('Nội dung quá dài. Hãy rút gọn bài viết trước khi lưu.'); return;
    }
    setBusy(true); setError(''); setMessage('');
    try {
      const editing = mode === 'edit';
      const data = await apiRequest(editing ? `/knowledge/${selected.id}` : '/knowledge', {
        token, method: editing ? 'PUT' : 'POST', body,
      });
      setMessage(editing ? 'Đã cập nhật bài viết.' : 'Đã tạo bài viết ở trạng thái Bản nháp.');
      await refreshAfterWrite(data.article);
    } catch (failure) { handleError(failure); }
    finally { setBusy(false); }
  }
  async function changeStatus() {
    if (!canManage || busy || !transitions[selected?.status]) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const data = await apiRequest(`/knowledge/${selected.id}/status`, {
        token, method: 'PATCH', body: { status: transitions[selected.status].status },
      });
      setMessage('Đã cập nhật trạng thái bài viết.');
      await refreshAfterWrite(data.article);
    } catch (failure) { handleError(failure); }
    finally { setBusy(false); }
  }

  return (
    <section className="knowledge" aria-label="Kho kiến thức">
      <h2>Kho kiến thức</h2>
      <p>Các hướng dẫn xử lý sự cố CNTT nội bộ thường gặp.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="kb-success" role="status">{message}</p>}
      {(loading || busy) && <p role="status">Đang tải...</p>}
      {mode === 'list' && <>
        <div className="actions">
          <button disabled={loading || busy} onClick={() => { setMessage(''); setReload(value => value + 1); }}>Làm mới kho kiến thức</button>
          {canManage && <button disabled={loading || busy} onClick={() => startForm()}>+ Tạo bài</button>}
        </div>
        <label htmlFor="kb-search">Tìm kiếm hướng dẫn</label>
        <input id="kb-search" type="search" placeholder="Tìm kiếm hướng dẫn..." value={query} onChange={event => setQuery(event.target.value)} disabled={loading || busy} />
        {!loading && articles !== null && (
          visible.length ? <ul className="kb-list" aria-label="Danh sách bài viết">
            {visible.map(article => <li key={article.id}>
              <button className="kb-title" disabled={busy} onClick={() => openArticle(article.id)}>{article.code} — {article.title}</button>
              <div className="kb-meta">
                <span className={`kb-badge kb-${article.status.toLowerCase()}`}>{statusNames[article.status]}</span>
                <span>Cập nhật: {date(article.updated_at)}</span>
                {canManage && <><span>Người tạo: {article.creator_name}</span><span>Người cập nhật: {article.updater_name || 'Chưa có'}</span></>}
              </div>
            </li>)}
          </ul> : <p>{keyword ? 'Không tìm thấy hướng dẫn phù hợp.' : 'Chưa có bài viết phù hợp.'}</p>
        )}
      </>}
      {mode === 'detail' && selected && <article className="kb-detail" aria-label="Chi tiết bài viết">
        <p>{selected.code}</p>
        <h3>{selected.title}</h3>
        <p className={`kb-badge kb-${selected.status.toLowerCase()}`}>{statusNames[selected.status]}</p>
        <dl className="kb-meta-details">
          <dt>Người tạo</dt><dd>{selected.creator_name}</dd>
          <dt>Người cập nhật</dt><dd>{selected.updater_name || 'Chưa có'}</dd>
          <dt>Ngày tạo</dt><dd>{date(selected.created_at)}</dd>
          <dt>Ngày cập nhật</dt><dd>{date(selected.updated_at)}</dd>
        </dl>
        <div className="kb-content">{selected.content}</div>
        <div className="actions">
          <button disabled={busy} onClick={back}>Quay lại</button>
          {canManage && <>
            <button disabled={busy} onClick={() => startForm(true)}>Sửa bài</button>
            {transitions[selected.status] && <button disabled={busy} onClick={changeStatus}>{transitions[selected.status].label}</button>}
          </>}
        </div>
      </article>}
      {canManage && ['create', 'edit'].includes(mode) && <form className="kb-form" onSubmit={save}>
        <h3>{mode === 'create' ? 'Tạo bài viết' : 'Sửa bài viết'}</h3>
        <label htmlFor="kb-title">Tiêu đề</label>
        <input id="kb-title" required maxLength={255} value={title} onChange={event => setTitle(event.target.value)} disabled={busy} />
        <label htmlFor="kb-content">Nội dung</label>
        <textarea id="kb-content" required rows={12} value={content} onChange={event => setContent(event.target.value)} disabled={busy} />
        <div className="actions">
          <button type="submit" disabled={busy}>Lưu bài viết</button>
          <button type="button" disabled={busy} onClick={() => { setMode(selected && mode === 'edit' ? 'detail' : 'list'); setError(''); }}>Hủy</button>
        </div>
      </form>}
    </section>
  );
}
