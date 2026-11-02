import React, { useEffect, useState } from 'react';
import { Alert, Badge, Button, EmptyState } from '../ui';
import { displayDate, roles, statuses, validateAccount } from './userData';

export const RoleBadge = ({ value }) => <Badge tone={`user-${value}`}>{roles[value]}</Badge>;
export const StatusBadge = ({ value }) => <Badge tone={`user-${value}`}>{statuses[value]}</Badge>;

export function UserList({ rows, currentId, filters, setFilters, busy, onOpen }) {
  const query = filters.query.trim().toLocaleLowerCase('vi-VN');
  const visible = rows.filter(row => `${row.name} ${row.email} ${row.id}`.toLocaleLowerCase('vi-VN').includes(query) && (!filters.role || row.role === filters.role) && (!filters.status || row.status === filters.status));
  const clear = () => setFilters({ query: '', role: '', status: '' });
  return <>
    <div className="user-filters" role="search" aria-label="Tìm và lọc tài khoản"><div className="user-search"><label htmlFor="user-search">Tìm kiếm tài khoản</label><input id="user-search" type="search" placeholder="Họ tên, email hoặc ID…" value={filters.query} onChange={event => setFilters({ ...filters, query: event.target.value })} /></div>
      <div><label htmlFor="user-role-filter">Vai trò</label><select id="user-role-filter" value={filters.role} onChange={event => setFilters({ ...filters, role: event.target.value })}><option value="">Tất cả vai trò</option>{Object.entries(roles).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
      <div><label htmlFor="user-status-filter">Trạng thái</label><select id="user-status-filter" value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })}><option value="">Tất cả trạng thái</option>{Object.entries(statuses).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
      {(filters.query || filters.role || filters.status) && <Button variant="secondary" onClick={clear}>Xóa bộ lọc</Button>}
    </div>
    <p className="user-count" role="status">Hiển thị <strong>{visible.length}</strong> / {rows.length} tài khoản</p>
    {!rows.length ? <EmptyState icon="users" title="Chưa có tài khoản trong danh sách" description="Danh sách tải thành công nhưng chưa có bản ghi để hiển thị." /> : !visible.length ? <EmptyState icon="users" title="Không tìm thấy tài khoản phù hợp" description="Thử tên, email hoặc bộ lọc khác."><Button variant="secondary" onClick={clear}>Xóa bộ lọc</Button></EmptyState> :
      <ul className="user-list" aria-label="Danh sách tài khoản">{visible.map(row => <li key={row.id} data-user-id={row.id}>
        <div className="user-identity"><span className="user-avatar" aria-hidden="true">{Array.from(row.name.trim())[0]?.toLocaleUpperCase('vi-VN') || '?'}</span><div><h3>{row.name}{row.id === currentId && <Badge tone="blue">Bạn</Badge>}</h3><p>{row.email}</p><small>ID: {row.id} · Tạo: {displayDate(row.created_at)}</small></div></div>
        <div className="user-badges"><RoleBadge value={row.role} /><StatusBadge value={row.status} /></div><Button variant="secondary" disabled={busy} data-open-user={row.id} aria-label={`Quản lý tài khoản ${row.name}`} onClick={() => onOpen(row)}>Quản lý</Button>
      </li>)}</ul>}
  </>;
}

export function UserCreateForm({ busy, onSubmit, onCancel, emailError, onClearEmailError }) {
  const [fields, setFields] = useState({ name: '', email: '', password: '', role: 'EMPLOYEE', status: 'ACTIVE' });
  const [errors, setErrors] = useState({});
  const [sent, setSent] = useState(false);
  const change = (field, value) => { setFields(previous => ({ ...previous, [field]: value })); setErrors(previous => ({ ...previous, [field]: '' })); if (field === 'email') onClearEmailError(); };
  function submit(event) {
    event.preventDefault(); if (busy) return;
    const next = validateAccount(fields); setErrors(next);
    if (Object.keys(next).length) { requestAnimationFrame(() => document.getElementById(`user-${Object.keys(next)[0]}`)?.focus()); return; }
    const body = { name: fields.name.trim(), email: fields.email.trim().toLowerCase(), password: fields.password, role: fields.role, status: fields.status };
    // Clear the sensitive field as soon as a valid submission is initiated, also on failure.
    setFields(previous => ({ ...previous, password: '' })); setSent(true); onSubmit(body);
  }
  return <div className="user-create-layout"><form className="user-form" onSubmit={submit} noValidate>
    <h3>Thông tin tài khoản mới</h3><p className="user-muted">Tất cả trường bên dưới đều bắt buộc.</p>
    {[
      ['name', 'Họ tên', 'text', 'name'], ['email', 'Email đăng nhập', 'email', 'username'], ['password', 'Mật khẩu ban đầu', 'password', 'new-password'],
    ].map(([field, label, type, autoComplete]) => <div key={field}><label htmlFor={`user-${field}`}>{label}</label><input id={`user-${field}`} type={type} autoComplete={autoComplete} value={fields[field]} required disabled={busy} aria-invalid={Boolean(errors[field] || (field === 'email' && emailError))} aria-describedby={`user-${field}-hint user-${field}-error`} onChange={event => change(field, event.target.value)} />
      <p id={`user-${field}-hint`} className="user-field-hint">{field === 'name' ? 'Tối đa 100 ký tự.' : field === 'email' ? 'Tối đa 254 ký tự; khoảng trắng đầu/cuối được bỏ khi gửi.' : 'Ít nhất 8 ký tự, tối đa 72 byte UTF-8. Mật khẩu không được hiển thị lại sau khi gửi.'}</p>
      {(errors[field] || (field === 'email' && emailError)) && <p id={`user-${field}-error`} className="user-field-error" role="alert">{errors[field] || emailError}</p>}</div>)}
    {sent && <p className="user-field-hint" role="status">Trường mật khẩu đã được xóa. Nếu cần gửi lại, vui lòng nhập lại mật khẩu.</p>}
    <div className="user-form-grid">{[['role', 'Vai trò', roles], ['status', 'Trạng thái', statuses]].map(([field, label, values]) => <div key={field}><label htmlFor={`user-${field}`}>{label}</label><select id={`user-${field}`} value={fields[field]} disabled={busy} aria-invalid={Boolean(errors[field])} aria-describedby={`user-${field}-error`} onChange={event => change(field, event.target.value)}>{Object.entries(values).map(([value, text]) => <option value={value} key={value}>{text}</option>)}</select>{errors[field] && <p id={`user-${field}-error`} className="user-field-error" role="alert">{errors[field]}</p>}</div>)}</div>
    <div className="actions user-form-footer"><Button type="submit" disabled={busy}>Tạo tài khoản</Button><Button variant="secondary" disabled={busy} onClick={onCancel}>Hủy</Button></div>
  </form><aside className="user-help"><h3>Quyền truy cập</h3><dl><dt>Nhân viên</dt><dd>Gửi và theo dõi yêu cầu hỗ trợ, tra cứu hướng dẫn.</dd><dt>Nhân viên IT</dt><dd>Tiếp nhận, xử lý Ticket và quản lý Kho kiến thức.</dd><dt>Quản trị viên</dt><dd>Quản lý tài khoản cùng các chức năng quản trị hiện có.</dd></dl><p>Tài khoản bị vô hiệu hóa không thể sử dụng phiên đăng nhập. Hãy kiểm tra vai trò và trạng thái trước khi tạo.</p></aside></div>;
}

export function UserAccess({ account, currentId, activeAdmins, busy, onChange }) {
  const [role, setRole] = useState(account.role);
  const [status, setStatus] = useState(account.status);
  useEffect(() => { setRole(account.role); setStatus(account.status); }, [account]);
  const self = account.id === currentId;
  return <article className="user-access" aria-label="Quản lý quyền tài khoản"><div className="user-profile"><h3>{account.name}</h3><p>{account.email}</p><div className="user-badges"><RoleBadge value={account.role} /><StatusBadge value={account.status} />{self && <Badge tone="blue">Tài khoản của bạn</Badge>}</div><dl><dt>ID</dt><dd>{account.id}</dd><dt>Ngày tạo</dt><dd>{displayDate(account.created_at)}</dd><dt>Cập nhật</dt><dd>{displayDate(account.updated_at)}</dd></dl></div>
    <div className="user-access-controls">
      {self && <Alert tone="info">Bạn đang quản lý chính tài khoản đăng nhập. Đổi sang vai trò khác sẽ rời màn hình quản trị; vô hiệu hóa sẽ kết thúc phiên đăng nhập.</Alert>}
      {account.role === 'ADMIN' && account.status === 'ACTIVE' && activeAdmins === 1 && <Alert tone="info">Theo danh sách đã tải, đây là ADMIN đang hoạt động cuối cùng. Hệ thống sẽ kiểm tra và chặn thao tác làm mất ADMIN hoạt động cuối cùng.</Alert>}
      <form className="user-access-form" onSubmit={event => { event.preventDefault(); if (!busy && role !== account.role) onChange('role', role); }}><h3>Vai trò</h3><label htmlFor="user-edit-role">Vai trò mới</label><select id="user-edit-role" value={role} disabled={busy} onChange={event => setRole(event.target.value)}>{Object.entries(roles).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><Button type="submit" disabled={busy || role === account.role}>Lưu vai trò</Button></form>
      <form className="user-access-form" onSubmit={event => { event.preventDefault(); if (!busy && status !== account.status) onChange('status', status); }}><h3>Trạng thái tài khoản</h3><label htmlFor="user-edit-status">Trạng thái mới</label><select id="user-edit-status" value={status} disabled={busy} onChange={event => setStatus(event.target.value)}>{Object.entries(statuses).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><Button type="submit" disabled={busy || status === account.status}>Lưu trạng thái</Button></form>
    </div>
  </article>;
}
