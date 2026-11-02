import React, { useEffect, useRef, useState } from 'react';
import { apiRequest } from './api';
import { readKnowledgeList } from './responseData';
import { Alert, Button, EmptyState, LoadingState } from './components/ui';
import ConfirmDialog from './components/ui/ConfirmDialog';
import { KnowledgeList, KnowledgeDetail, KnowledgeForm, transitions, validateArticle } from './components/knowledge/KnowledgeViews';
import './styles/knowledge.css';

export default function KnowledgeBase({ token, user, onUnauthorized }) {
  const [articles, setArticles] = useState([]);
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState('list');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [listFailed, setListFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [reload, setReload] = useState(0);
  const heading = useRef(null);
  const lastOpened = useRef(null);
  const requestBusy = useRef(false);
  const formInitial = useRef({ title: '', content: '' });
  const canManage = ['IT', 'ADMIN'].includes(user.role);
  const inForm = mode === 'create' || mode === 'edit';

  function handleError(failure, preserveForm = false) {
    if (failure.status === 401) { onUnauthorized(failure.message); return; }
    if (!preserveForm && [403, 404].includes(failure.status)) {
      setSelected(null); setMode('list');
      requestAnimationFrame(() => heading.current?.focus());
    }
    setError(failure.status >= 500 ? 'Không thể tải hoặc lưu bài viết lúc này. Vui lòng thử lại sau.' : failure.message);
  }
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setListFailed(false);
    apiRequest('/knowledge', { token }).then(data => {
      if (active) setArticles(readKnowledgeList(data));
    }).catch(failure => {
      if (active) { setListFailed(true); handleError(failure); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, user.role, reload]);
  useEffect(() => { if (mode !== 'list') heading.current?.focus(); }, [mode, selected?.id]);

  function back() {
    setMode('list'); setSelected(null); setError(''); setMessage('');
    requestAnimationFrame(() => {
      const previous = [...document.querySelectorAll('[data-open-article]')].find(button => button.dataset.openArticle === String(lastOpened.current));
      (previous || heading.current)?.focus();
    });
  }
  async function perform(work, preserveForm = false) {
    if (requestBusy.current) return;
    requestBusy.current = true; setBusy(true); setError(''); setMessage('');
    try { await work(); }
    catch (failure) { handleError(failure, preserveForm); }
    finally { requestBusy.current = false; setBusy(false); }
  }
  function openArticle(id) {
    lastOpened.current = id;
    return perform(async () => {
      const data = await apiRequest(`/knowledge/${id}`, { token });
      if (!canManage && data.article.status !== 'PUBLISHED') throw Object.assign(new Error('Bạn chỉ được xem bài viết đã xuất bản.'), { status: 403 });
      setSelected(data.article); setMode('detail');
    });
  }
  function startForm(edit = false) {
    if (!canManage) return;
    const values = { title: edit ? selected.title : '', content: edit ? selected.content : '' };
    formInitial.current = values; setTitle(values.title); setContent(values.content); setErrors({});
    setMode(edit ? 'edit' : 'create'); setError(''); setMessage('');
  }
  function cancelForm() {
    const leave = () => { if (mode === 'edit' && selected) { setMode('detail'); setError(''); } else back(); };
    if (title !== formInitial.current.title || content !== formInitial.current.content) {
      setConfirmation({ title: 'Bỏ thay đổi chưa lưu?', description: 'Nội dung bạn vừa nhập sẽ không được lưu. Chọn “Tiếp tục soạn” để quay lại bài viết.', confirmLabel: 'Bỏ thay đổi', cancelLabel: 'Tiếp tục soạn', action: leave });
    } else leave();
  }
  async function refreshAfterWrite(article) {
    // Display only server-confirmed data and leave the form to prevent duplicate POSTs.
    setSelected(article); setMode('detail'); lastOpened.current = article.id;
    setArticles(previous => [article, ...previous.filter(item => item.id !== article.id)]);
    // Handle refresh errors separately: the write already succeeded.
    const [detail, list] = await Promise.allSettled([
      apiRequest(`/knowledge/${article.id}`, { token }), apiRequest('/knowledge', { token }).then(readKnowledgeList),
    ]);
    if (detail.status === 'fulfilled') setSelected(detail.value.article);
    if (list.status === 'fulfilled') { setArticles(list.value); setListFailed(false); }
    const failures = [detail, list].filter(result => result.status === 'rejected').map(result => result.reason);
    const authFailure = failures.find(failure => failure.status === 401);
    if (authFailure) { handleError(authFailure); return; }
    if (detail.status === 'rejected' && [403, 404].includes(detail.reason.status)) { handleError(detail.reason); return; }
    if (failures.length) setError('Đã lưu bài viết nhưng chưa tải lại được đầy đủ dữ liệu. Vui lòng làm mới chi tiết hoặc danh sách.');
  }
  function save(event) {
    event.preventDefault();
    if (!canManage || busy) return;
    const body = { title: title.trim(), content: content.trim() };
    const next = validateArticle(body); setErrors(next);
    if (Object.keys(next).length) {
      requestAnimationFrame(() => document.getElementById(next.title ? 'kb-title' : 'kb-content')?.focus()); return;
    }
    const editing = mode === 'edit';
    const write = () => perform(async () => {
      const data = await apiRequest(editing ? `/knowledge/${selected.id}` : '/knowledge', { token, method: editing ? 'PUT' : 'POST', body });
      setMessage(editing ? 'Đã cập nhật bài viết.' : 'Đã tạo bài viết ở trạng thái Bản nháp.');
      await refreshAfterWrite(data.article);
    }, true);
    if (editing && selected.status === 'PUBLISHED') {
      setConfirmation({ title: 'Cập nhật bài đang xuất bản?', description: 'Nội dung mới sẽ thay thế nội dung hiện tại và được hiển thị cho nhân viên ngay sau khi lưu.', confirmLabel: 'Xác nhận cập nhật', action: write });
    } else write();
  }
  function askStatusChange() {
    const transition = transitions[selected?.status];
    if (!canManage || busy || !transition) return;
    setConfirmation({ title: `${transition.label} bài viết?`, description: transition.description, confirmLabel: `Xác nhận ${transition.label.toLocaleLowerCase('vi')}`, action: () => perform(async () => {
      const data = await apiRequest(`/knowledge/${selected.id}/status`, { token, method: 'PATCH', body: { status: transition.status } });
      setMessage('Đã cập nhật trạng thái bài viết.'); await refreshAfterWrite(data.article);
    }) });
  }

  return <section className="knowledge knowledge-page" aria-label="Kho kiến thức">
    <div className="knowledge-heading"><div>
      {mode === 'detail' && <Button variant="secondary" className="knowledge-back" disabled={busy} onClick={back}>← Quay lại danh sách</Button>}
      <h2 ref={heading} tabIndex={-1}>{mode === 'create' ? 'Tạo bài viết' : mode === 'edit' ? 'Sửa bài viết' : mode === 'detail' ? 'Hướng dẫn hỗ trợ' : 'Kho kiến thức nội bộ'}</h2>
      <p>{inForm ? 'Chia sẻ hướng dẫn rõ ràng để mọi người dễ dàng tra cứu.' : 'Tra cứu các hướng dẫn xử lý sự cố CNTT nội bộ.'}</p>
    </div>{mode === 'list' && <div className="actions">
      <Button variant="secondary" disabled={loading || busy} onClick={() => { setMessage(''); setReload(value => value + 1); }}>Làm mới kho kiến thức</Button>
      {canManage && <Button disabled={loading || busy} onClick={() => startForm()}>Tạo bài viết</Button>}
    </div>}{mode === 'detail' && <Button variant="secondary" disabled={busy} onClick={() => openArticle(selected.id)}>Làm mới chi tiết</Button>}</div>
    {error && <Alert>{error}</Alert>}
    {message && <Alert tone="info">{message}</Alert>}
    {busy && <LoadingState message="Đang xử lý bài viết…" />}
    {mode === 'list' && (loading ? <LoadingState message="Đang tải kho kiến thức…" /> : listFailed ?
      <EmptyState icon="info" title="Chưa thể tải kho kiến thức" description="Vui lòng thử lại để xem danh sách bài viết."><Button onClick={() => setReload(value => value + 1)} disabled={busy}>Thử lại</Button></EmptyState> :
      <KnowledgeList articles={articles} canManage={canManage} query={query} onQuery={setQuery} status={statusFilter} onStatus={setStatusFilter} busy={busy} onOpen={openArticle} />)}
    {mode === 'detail' && selected && <KnowledgeDetail article={selected} canManage={canManage} busy={busy} onEdit={() => startForm(true)} onStatus={askStatusChange} />}
    {canManage && inForm && <KnowledgeForm editing={mode === 'edit'} status={selected?.status} title={title} content={content} errors={errors} busy={busy} onTitle={value => { setTitle(value); setErrors(previous => ({ ...previous, title: '' })); }} onContent={value => { setContent(value); setErrors(previous => ({ ...previous, content: '' })); }} onSubmit={save} onCancel={cancelForm} />}
    {confirmation && <ConfirmDialog title={confirmation.title} description={confirmation.description} confirmLabel={confirmation.confirmLabel} cancelLabel={confirmation.cancelLabel} onCancel={() => setConfirmation(null)} onConfirm={() => { const action = confirmation.action; setConfirmation(null); action(); }} />}
  </section>;
}
