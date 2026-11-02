import React, { useEffect, useState } from 'react';
import { Badge, Button, EmptyState, Alert } from '../ui';

const priorities = { LOW: 'Thấp', MEDIUM: 'Trung bình', HIGH: 'Cao' };
const statuses = { NEW: 'Mới', RECEIVED: 'Đã tiếp nhận', IN_PROGRESS: 'Đang xử lý', RESOLVED: 'Đã giải quyết', CLOSED: 'Đã đóng' };
const date = value => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleString('vi-VN') : 'Chưa có thông tin';
const Status = ({ value }) => <Badge tone={`status-${value}`}>{statuses[value] || value}</Badge>;
const Priority = ({ value }) => <Badge tone={`priority-${value}`}>{priorities[value] || value}</Badge>;

export function TicketList({ tickets, employee, busy, filters, onFilter, onOpen }) {
  const query = filters.search.trim().toLocaleLowerCase('vi');
  const filtered = tickets.filter(ticket => (!query || `${ticket.code} ${ticket.title}`.toLocaleLowerCase('vi').includes(query)) && (!filters.status || ticket.status === filters.status) && (!filters.priority || ticket.priority === filters.priority));
  const activeFilters = Boolean(filters.search || filters.status || filters.priority);
  const clear = () => onFilter({ search: '', status: '', priority: '' });
  const open = ticket => <Button variant="secondary" className="link-button" data-open-ticket={ticket.id} disabled={busy} onClick={() => onOpen(ticket.id)} aria-label={`Xem yêu cầu ${ticket.code}`}>{ticket.code}</Button>;
  return <>
    <div className="ticket-filters" role="search" aria-label="Tìm và lọc yêu cầu">
      <div className="ticket-search"><label htmlFor="ticket-search">Tìm kiếm yêu cầu</label><input id="ticket-search" type="search" placeholder="Nhập mã hoặc tiêu đề…" value={filters.search} onChange={e => onFilter({ ...filters, search: e.target.value })} /></div>
      <div><label htmlFor="ticket-status-filter">Trạng thái</label><select id="ticket-status-filter" value={filters.status} onChange={e => onFilter({ ...filters, status: e.target.value })}><option value="">Tất cả trạng thái</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div><label htmlFor="ticket-priority-filter">Mức ưu tiên</label><select id="ticket-priority-filter" value={filters.priority} onChange={e => onFilter({ ...filters, priority: e.target.value })}><option value="">Tất cả mức ưu tiên</option>{Object.entries(priorities).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      {activeFilters && <Button variant="secondary" onClick={clear}>Xóa bộ lọc</Button>}
    </div>
    <p className="ticket-result-count" role="status" aria-live="polite">Hiển thị <strong>{filtered.length}</strong> / {tickets.length} yêu cầu</p>
    {!tickets.length ? <EmptyState icon="ticket" title="Chưa có yêu cầu hỗ trợ" description={employee ? 'Khi cần bộ phận IT hỗ trợ, hãy chọn “Tạo yêu cầu” ở phía trên.' : 'Các yêu cầu hỗ trợ sẽ xuất hiện tại đây khi nhân viên gửi sự cố.'} /> : !filtered.length ?
      <EmptyState icon="ticket" title="Không tìm thấy yêu cầu phù hợp" description="Thử một mã, tiêu đề khác hoặc xóa bộ lọc."><Button variant="secondary" onClick={clear}>Xóa bộ lọc</Button></EmptyState> : <>
        <div className="table-scroll ticket-table" role="region" aria-label="Bảng yêu cầu hỗ trợ, có thể cuộn ngang" tabIndex={0}><table>
          <caption>Danh sách yêu cầu hỗ trợ</caption>
          <thead><tr><th scope="col">Mã yêu cầu</th><th scope="col">Tiêu đề</th>{!employee && <th scope="col">Người tạo</th>}<th scope="col">Mức ưu tiên</th><th scope="col">Trạng thái</th>{!employee && <th scope="col">Người phụ trách</th>}<th scope="col">Ngày tạo</th></tr></thead>
          <tbody>{filtered.map(ticket => <tr key={ticket.id}>
            <td>{open(ticket)}</td><td className="ticket-table__title">{ticket.title}</td>{!employee && <td>{ticket.creator_name}</td>}
            <td><Priority value={ticket.priority} /></td><td><Status value={ticket.status} /></td>{!employee && <td>{ticket.assignee_name || 'Chưa tiếp nhận'}</td>}<td className="ticket-date">{date(ticket.created_at)}</td>
          </tr>)}</tbody>
        </table></div>
        <ul className="ticket-mobile-list" aria-label="Danh sách yêu cầu hỗ trợ">{filtered.map(ticket => <li key={ticket.id}>
          <div className="ticket-card__top">{open(ticket)}<Status value={ticket.status} /></div>
          <h3>{ticket.title}</h3><div className="ticket-card__priority">Mức ưu tiên <Priority value={ticket.priority} /></div>
          {!employee && <dl><dt>Người tạo</dt><dd>{ticket.creator_name}</dd><dt>Người phụ trách</dt><dd>{ticket.assignee_name || 'Chưa tiếp nhận'}</dd></dl>}
          <p className="ticket-date">Tạo lúc {date(ticket.created_at)}</p>
        </li>)}</ul>
      </>}
  </>;
}

function FieldError({ id, children }) { return children ? <p id={id} className="ticket-field-error" role="alert">{children}</p> : null; }
function validateText(value, max, label) { return !value.trim() ? `Vui lòng nhập ${label}.` : value.trim().length > max ? `${label} không được vượt quá ${max} ký tự.` : ''; }
function focusInvalid(errors) { requestAnimationFrame(() => document.getElementById(Object.keys(errors).find(key => errors[key]))?.focus()); }

export function TicketForm({ busy, onSubmit, onCancel, initialValues }) {
  const [title, setTitle] = useState(initialValues?.title || '');
  const [description, setDescription] = useState(initialValues?.description || '');
  const [errors, setErrors] = useState({});
  function submit(event) {
    event.preventDefault();
    if (busy) return;
    const next = { 'ticket-title': validateText(title, 255, 'tiêu đề'), 'ticket-description': validateText(description, 4000, 'mô tả sự cố') };
    setErrors(next);
    if (Object.values(next).some(Boolean)) { focusInvalid(next); return; }
    onSubmit({ title: title.trim(), description: description.trim() });
  }
  return <div className="ticket-create-layout">
    <form noValidate onSubmit={submit} className="ticket-form">
      <div className="ticket-panel-heading"><h3>Thông tin sự cố</h3><p>Các trường có dấu * là bắt buộc.</p></div>
      {initialValues && <Alert tone="info">Câu hỏi từ Trợ lý AI đã được điền sẵn. Hãy kiểm tra tiêu đề và mô tả trước khi gửi yêu cầu.</Alert>}
      <label htmlFor="ticket-title">Tiêu đề <span aria-hidden="true">*</span></label>
      <input id="ticket-title" placeholder="Ví dụ: Máy tính không kết nối được Wi-Fi" value={title} required maxLength={255} disabled={busy} aria-invalid={Boolean(errors['ticket-title'])} aria-describedby="ticket-title-hint ticket-title-error" onChange={e => { setTitle(e.target.value); setErrors(previous => ({ ...previous, 'ticket-title': '' })); }} />
      <p id="ticket-title-hint" className="ticket-field-hint">Tóm tắt ngắn gọn vấn đề. {title.length}/255 ký tự</p>
      <FieldError id="ticket-title-error">{errors['ticket-title']}</FieldError>
      <label htmlFor="ticket-description">Mô tả sự cố <span aria-hidden="true">*</span></label>
      <textarea id="ticket-description" placeholder="Bạn gặp lỗi gì, từ khi nào và đã thử xử lý như thế nào?" rows={8} value={description} required maxLength={4000} disabled={busy} aria-invalid={Boolean(errors['ticket-description'])} aria-describedby="ticket-description-hint ticket-description-error" onChange={e => { setDescription(e.target.value); setErrors(previous => ({ ...previous, 'ticket-description': '' })); }} />
      <p id="ticket-description-hint" className="ticket-field-hint">{description.length}/4000 ký tự</p>
      <FieldError id="ticket-description-error">{errors['ticket-description']}</FieldError>
      <div className="actions ticket-form__footer"><Button type="submit" disabled={busy}>Gửi yêu cầu</Button><Button variant="secondary" disabled={busy} onClick={onCancel}>Hủy</Button></div>
    </form>
    <aside className="ticket-create-help"><h3>Để được hỗ trợ hiệu quả</h3><ul><li>Mô tả thiết bị hoặc ứng dụng đang gặp sự cố.</li><li>Ghi lại thông báo lỗi và thời điểm xảy ra.</li><li>Cho biết các bước bạn đã thử.</li></ul><p>Không gửi mật khẩu, mã xác thực hoặc thông tin bí mật trong yêu cầu.</p><p>Bộ phận IT sẽ tiếp nhận và xác định mức ưu tiên của yêu cầu.</p></aside>
  </div>;
}

export function TicketDetail({ ticket, busy, canManage, canProcess, canPrioritize, onChange, refreshRequired }) {
  const [priority, setPriority] = useState(ticket.priority);
  const [solution, setSolution] = useState('');
  const [solutionError, setSolutionError] = useState('');
  useEffect(() => { setPriority(ticket.priority); setSolution(''); setSolutionError(''); }, [ticket]);
  const hasActions = canPrioritize || (canManage && ticket.status === 'NEW') || (canProcess && ['RECEIVED', 'IN_PROGRESS', 'RESOLVED'].includes(ticket.status));
  function resolve(event) {
    event.preventDefault();
    if (busy) return;
    const error = validateText(solution, 4000, 'giải pháp xử lý');
    setSolutionError(error);
    if (error) { focusInvalid({ 'ticket-solution': error }); return; }
    onChange('status', { status: 'RESOLVED', solution: solution.trim() });
  }
  return <article className="ticket-detail" aria-label="Chi tiết Ticket">
    <div className="ticket-detail__summary"><div className="ticket-badges"><Status value={ticket.status} /><Priority value={ticket.priority} /></div><h3>{ticket.title}</h3><p className="ticket-date">Tạo lúc {date(ticket.created_at)} · Cập nhật {date(ticket.updated_at)}</p></div>
    <div className="ticket-detail__layout"><div className="ticket-detail__main">
      <section className="ticket-panel"><h4>Mô tả sự cố</h4><p className="multiline">{ticket.description}</p></section>
      <section className="ticket-panel"><h4>Giải pháp xử lý</h4><p className={`multiline ${ticket.solution ? '' : 'ticket-muted'}`}>{ticket.solution || 'Chưa có giải pháp được ghi nhận.'}</p></section>
      <section className="ticket-panel ticket-history" aria-label="Lịch sử xử lý"><h4>Lịch sử xử lý</h4>
        {ticket.history?.length ? <ol className="ticket-timeline">{ticket.history.map(entry => <li key={entry.id}>
          <strong>{entry.old_status ? `${statuses[entry.old_status] || entry.old_status} → ` : ''}{statuses[entry.new_status] || entry.new_status}</strong>
          <div className="ticket-timeline__meta">{entry.actor_name || 'Chưa có thông tin người xử lý'}<span>{date(entry.created_at)}</span></div>
          {entry.note && <p className="multiline">{entry.note}</p>}
        </li>)}</ol> : <p className="ticket-muted">Chưa có lịch sử xử lý được cung cấp.</p>}
      </section>
    </div><aside className="ticket-detail__aside">
      <section className="ticket-panel"><h4>Thông tin yêu cầu</h4><dl className="ticket-metadata"><dt>Mã yêu cầu</dt><dd>{ticket.code}</dd><dt>Người tạo</dt><dd>{ticket.creator_name || 'Chưa có thông tin'}</dd><dt>Người phụ trách</dt><dd>{ticket.assignee_name || 'Chưa tiếp nhận'}</dd><dt>Trạng thái</dt><dd><Status value={ticket.status} /></dd><dt>Mức ưu tiên</dt><dd><Priority value={ticket.priority} /></dd></dl></section>
      {hasActions && <section className="ticket-panel ticket-processing"><h4>Xử lý yêu cầu</h4>
        {refreshRequired && <Alert tone="info">Thay đổi đã được lưu. Vui lòng làm mới chi tiết trước khi thao tác tiếp.</Alert>}
        {canPrioritize && <form onSubmit={e => { e.preventDefault(); if (!busy && priority !== ticket.priority) onChange('priority', { priority }); }}>
          <label htmlFor="ticket-priority">Mức ưu tiên</label><select id="ticket-priority" value={priority} disabled={busy} onChange={e => setPriority(e.target.value)}>{Object.entries(priorities).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><Button type="submit" variant="secondary" disabled={busy || priority === ticket.priority}>Lưu độ ưu tiên</Button>
        </form>}
        {canManage && ticket.status === 'NEW' && <div className="ticket-action-group"><p>Tiếp nhận yêu cầu để trở thành người phụ trách.</p><Button disabled={busy} onClick={() => onChange('accept', {})}>Tiếp nhận</Button></div>}
        {canProcess && ticket.status === 'RECEIVED' && <div className="ticket-action-group"><Button disabled={busy} onClick={() => onChange('status', { status: 'IN_PROGRESS' })}>Bắt đầu xử lý</Button></div>}
        {canProcess && ticket.status === 'IN_PROGRESS' && <form noValidate onSubmit={resolve}>
          <label htmlFor="ticket-solution">Giải pháp xử lý <span aria-hidden="true">*</span></label><textarea id="ticket-solution" rows={6} required maxLength={4000} value={solution} disabled={busy} aria-invalid={Boolean(solutionError)} aria-describedby="ticket-solution-hint ticket-solution-error" onChange={e => { setSolution(e.target.value); setSolutionError(''); }} /><p id="ticket-solution-hint" className="ticket-field-hint">{solution.length}/4000 ký tự. Cần có giải pháp để đánh dấu đã giải quyết.</p><FieldError id="ticket-solution-error">{solutionError}</FieldError><Button disabled={busy} type="submit">Đánh dấu đã giải quyết</Button>
        </form>}
        {canProcess && ticket.status === 'RESOLVED' && <div className="actions"><Button disabled={busy} onClick={() => onChange('status', { status: 'CLOSED' })}>Đóng Ticket</Button><Button variant="secondary" disabled={busy} onClick={() => onChange('status', { status: 'IN_PROGRESS' })}>Xử lý lại</Button></div>}
      </section>}
    </aside></div>
  </article>;
}
