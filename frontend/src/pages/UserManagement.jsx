import React, { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../api';
import { Alert, Button, EmptyState, LoadingState } from '../components/ui';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { UserAccess, UserCreateForm, UserList } from '../components/users/UserViews';
import { cleanList, cleanUser, failureMessage, roles, statuses } from '../components/users/userData';
import '../styles/users.css';

export default function UserManagement(props) {
  return props.user.role === 'ADMIN' ? <AdminUsers {...props} /> : <Alert>Bạn không có quyền quản lý người dùng.</Alert>;
}
function AdminUsers({ token, user, onUnauthorized, onAccessDenied, onSelfChanged }) {
  const [rows, setRows] = useState([]);
  const [listState, setListState] = useState('loading');
  const [mode, setMode] = useState('list');
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [emailError, setEmailError] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [filters, setFilters] = useState({ query: '', role: '', status: '' });
  const heading = useRef(null), pending = useRef(false), mounted = useRef(false), lastId = useRef(null);
  const epoch = useRef(0);
  const controllers = useRef(new Set());
  function handleError(failure, creating = false) {
    if (failure.status === 401) { onUnauthorized('Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.'); return; }
    setError(failureMessage(failure, creating));
    if (failure.status === 404 && !creating) setNeedsRefresh(true);
    if (failure.status === 403) { setDenied(true); setRows([]); setSelected(null); setMode('list'); setConfirmation(null); onAccessDenied(); requestAnimationFrame(() => heading.current?.focus()); }
  }
  async function request(path, options = {}) {
    const controller = new AbortController(); controllers.current.add(controller);
    const timer = window.setTimeout(() => controller.abort(), 15000);
    try { return await apiRequest(path, { token, ...options, signal: controller.signal }); }
    finally { window.clearTimeout(timer); controllers.current.delete(controller); }
  }
  async function load() {
    const generation = epoch.current;
    setListState('loading');
    try {
      const next = cleanList(await request('/users'));
      if (!mounted.current || epoch.current !== generation) return;
      setRows(next); setListState('success'); setDenied(false); setNeedsRefresh(false);
      if (selected && !next.some(row => row.id === selected.id)) setMode('list');
      setSelected(previous => previous ? next.find(row => row.id === previous.id) || null : null);
    } catch (failure) {
      if (mounted.current && epoch.current === generation) { setListState('error'); setNeedsRefresh(true); handleError(failure); }
    }
  }
  useEffect(() => {
    epoch.current += 1; mounted.current = true; load();
    return () => { epoch.current += 1; mounted.current = false; controllers.current.forEach(controller => controller.abort()); };
  }, [token]);
  useEffect(() => { if (mode !== 'list') heading.current?.focus(); }, [mode, selected?.id]);
  async function perform(work) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(''); setNotice('');
    try { await work(); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  function refresh() { return perform(load); }
  function back() {
    setMode('list'); setSelected(null); setError(''); setNotice('');
    requestAnimationFrame(() => {
      const previous = [...document.querySelectorAll('[data-open-user]')].find(button => button.dataset.openUser === String(lastId.current));
      (previous || heading.current)?.focus();
    });
  }
  function open(account) { lastId.current = account.id; setSelected(account); setMode('access'); setError(''); setNotice(''); }
  function create(body) {
    setEmailError('');
    return perform(async () => {
      try {
        await request('/users', { method: 'POST', body });
        if (!mounted.current) return;
        // Leave the form immediately after a confirmed write, including refresh failure.
        setMode('list'); setNotice('Đã tạo tài khoản.'); setFilters({ query: '', role: '', status: '' });
        await load(); requestAnimationFrame(() => heading.current?.focus());
      } catch (failure) { if (mounted.current) { handleError(failure, true); if (failure.status === 409) setEmailError('Email đã tồn tại. Vui lòng dùng email khác.'); } }
    });
  }
  function askChange(field, value) {
    if (busy || denied || needsRefresh) return;
    const self = selected.id === user.id;
    const label = field === 'role' ? 'vai trò' : 'trạng thái';
    const names = field === 'role' ? roles : statuses;
    setConfirmation({ title: `Xác nhận đổi ${label}?`, description: `Tài khoản ${selected.name} (${selected.email}) sẽ chuyển ${label} từ “${names[selected[field]]}” sang “${names[value]}”.${self ? value === 'INACTIVE' ? ' Đây là tài khoản của bạn; phiên đăng nhập sẽ kết thúc.' : field === 'role' && value !== 'ADMIN' ? ' Bạn sẽ không còn quyền vào màn hình quản trị.' : '' : ''}`, field, value });
  }
  function change(field, value) {
    return perform(async () => {
      try {
        const data = await request(`/users/${selected.id}/${field}`, { method: 'PATCH', body: { [field]: value } });
        if (!mounted.current) return;
        setNeedsRefresh(true); setNotice('Đã lưu thay đổi tài khoản.');
        const updated = cleanUser(data.user);
        if (updated.id !== selected.id) throw new Error('Invalid update response');
        setSelected(updated);
        if (updated.id === user.id && (updated.role !== 'ADMIN' || updated.status === 'INACTIVE')) { onSelfChanged(updated); return; }
        await load();
      } catch (failure) { if (mounted.current) { handleError(failure); if (selected.id === user.id) onAccessDenied(); } }
    });
  }
  const disabled = busy || listState === 'loading';
  return <section className="user-management surface-card" aria-label="Quản lý người dùng">
    <div className="user-heading"><div>{mode !== 'list' && <Button className="user-back" variant="secondary" disabled={busy} onClick={back}>← Quay lại danh sách</Button>}<h2 ref={heading} tabIndex={-1}>{mode === 'create' ? 'Tạo tài khoản' : mode === 'access' ? 'Quản lý quyền truy cập' : 'Quản lý người dùng'}</h2><p>Quản lý tài khoản, vai trò và trạng thái truy cập hệ thống.</p></div>
      {mode !== 'create' && <div className="actions"><Button variant="secondary" disabled={disabled} onClick={refresh}>Làm mới danh sách</Button>{mode === 'list' && !denied && <Button disabled={disabled || needsRefresh} onClick={() => { setMode('create'); setEmailError(''); setError(''); setNotice(''); }}>Tạo tài khoản</Button>}</div>}
    </div>
    {error && <Alert>{error}</Alert>}{notice && <Alert tone="info">{notice}</Alert>}
    {busy && <LoadingState message="Đang xử lý tài khoản…" />}
    {denied ? <EmptyState icon="shield" title="Không có quyền quản trị" description="Chức năng chỉ dành cho tài khoản ADMIN đang hoạt động." /> : mode === 'create' ? <UserCreateForm busy={busy} onSubmit={create} onCancel={back} emailError={emailError} onClearEmailError={() => setEmailError('')} /> : mode === 'access' && selected ? <>
      {needsRefresh && <Alert tone="info">Vui lòng làm mới danh sách trước khi tiếp tục thay đổi quyền.</Alert>}
      <UserAccess account={selected} currentId={user.id} activeAdmins={rows.filter(row => row.role === 'ADMIN' && row.status === 'ACTIVE').length} busy={disabled || needsRefresh} onChange={askChange} />
    </> : listState === 'loading' ? <LoadingState message="Đang tải danh sách tài khoản…" /> : listState === 'error' ? <EmptyState icon="info" title="Chưa thể tải danh sách" description="Chưa có dữ liệu để hiển thị tài khoản."><Button disabled={busy} onClick={refresh}>Thử lại</Button></EmptyState> : <UserList rows={rows} currentId={user.id} filters={filters} setFilters={setFilters} busy={busy} onOpen={open} />}
    {confirmation && <ConfirmDialog title={confirmation.title} description={confirmation.description} confirmLabel="Xác nhận thay đổi" onCancel={() => setConfirmation(null)} onConfirm={() => { const { field, value } = confirmation; setConfirmation(null); change(field, value); }} />}
  </section>;
}
