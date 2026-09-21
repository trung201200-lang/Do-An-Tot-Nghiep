import React, { useEffect, useState } from 'react';
import { apiRequest } from './api';

const priorityNames = { LOW: 'Thấp', MEDIUM: 'Trung bình', HIGH: 'Cao' };
const statusNames = { NEW: 'Mới', RECEIVED: 'Đã tiếp nhận', IN_PROGRESS: 'Đang xử lý', RESOLVED: 'Đã giải quyết', CLOSED: 'Đã đóng' };
const date = (value) => new Date(value).toLocaleString('vi-VN');

export default function Tickets({ token, user, onUnauthorized }) {
  const [tickets, setTickets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [solution, setSolution] = useState('');
  const [priority, setPriority] = useState('LOW');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const employee = user.role === 'EMPLOYEE';
  const canManage = ['IT', 'ADMIN'].includes(user.role);
  const canProcess = selected && canManage && (user.role === 'ADMIN' || selected.assigned_to === user.id);
  const canPrioritize = selected && canManage && selected.status !== 'CLOSED' && (user.role === 'ADMIN' || selected.assigned_to === null || selected.assigned_to === user.id);

  function handleError(failure) {
    if (failure.status === 401) onUnauthorized(failure.message);
    else setError(failure.message);
  }
  function showTicket(ticket) {
    setSelected(ticket);
    setPriority(ticket.priority);
    setSolution('');
    setCreating(false);
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    setSelected(null);
    setCreating(false);
    setError('');
    apiRequest('/tickets', { token }).then(data => {
      if (active) setTickets(data.tickets);
    }).catch(failure => {
      if (active) handleError(failure);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, user.role, reload]);

  async function openTicket(id) {
    setBusy(true); setError('');
    try { showTicket((await apiRequest(`/tickets/${id}`, { token })).ticket); }
    catch (failure) { handleError(failure); }
    finally { setBusy(false); }
  }
  async function createTicket(event) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const data = await apiRequest('/tickets', { token, method: 'POST', body: { title, description } });
      setTitle(''); setDescription(''); setCreating(false);
      // Hiển thị ngay Ticket vừa tạo, dù lần tải lại danh sách gặp lỗi mạng.
      setTickets(previous => [data.ticket, ...previous]);
      showTicket((await apiRequest(`/tickets/${data.ticket.id}`, { token })).ticket);
    } catch (failure) { handleError(failure); }
    finally { setBusy(false); }
  }
  async function change(action, body) {
    setBusy(true); setError('');
    try {
      await apiRequest(`/tickets/${selected.id}/${action}`, { token, method: 'PATCH', body });
      const detail = await apiRequest(`/tickets/${selected.id}`, { token });
      showTicket(detail.ticket);
      setTickets(previous => previous.map(ticket => ticket.id === detail.ticket.id ? detail.ticket : ticket));
    } catch (failure) { handleError(failure); }
    finally { setBusy(false); }
  }

  return (
    <section className="tickets">
      <h2>{employee ? 'Yêu cầu hỗ trợ của tôi' : 'Quản lý yêu cầu'}</h2>
      <div className="actions">
        <button type="button" disabled={busy || loading} onClick={() => setReload(value => value + 1)}>Làm mới danh sách</button>
        {employee && <button type="button" disabled={busy || loading} onClick={() => { setCreating(true); setSelected(null); setError(''); }}>Tạo yêu cầu</button>}
      </div>
      {error && <p role="alert" className="error">{error}</p>}
      {loading ? <p role="status">Đang tải yêu cầu...</p> : (
        tickets.length ? <div className="table-scroll"><table>
          <caption>Danh sách yêu cầu hỗ trợ</caption>
          <thead><tr><th>Mã Ticket</th><th>Tiêu đề</th>{!employee && <th>Người tạo</th>}<th>Độ ưu tiên</th><th>Trạng thái</th>{!employee && <th>Người xử lý</th>}<th>Ngày tạo</th></tr></thead>
          <tbody>{tickets.map(ticket => <tr key={ticket.id}>
            <td><button className="link-button" disabled={busy} onClick={() => openTicket(ticket.id)}>{ticket.code}</button></td>
            <td>{ticket.title}</td>{!employee && <td>{ticket.creator_name}</td>}<td>{priorityNames[ticket.priority]}</td>
            <td>{statusNames[ticket.status]}</td>{!employee && <td>{ticket.assignee_name || 'Chưa tiếp nhận'}</td>}<td>{date(ticket.created_at)}</td>
          </tr>)}</tbody>
        </table></div> : <p>Chưa có yêu cầu hỗ trợ.</p>
      )}
      {creating && employee && <form onSubmit={createTicket} className="ticket-form">
        <h3>Tạo yêu cầu hỗ trợ</h3>
        <label htmlFor="ticket-title">Tiêu đề</label>
        <input id="ticket-title" value={title} onChange={event => setTitle(event.target.value)} required maxLength={255} disabled={busy} />
        <label htmlFor="ticket-description">Mô tả sự cố</label>
        <textarea id="ticket-description" value={description} onChange={event => setDescription(event.target.value)} required maxLength={4000} rows={5} disabled={busy} />
        <div className="actions"><button disabled={busy} type="submit">Gửi yêu cầu</button><button disabled={busy} type="button" onClick={() => setCreating(false)}>Hủy</button></div>
      </form>}
      {selected && <article className="ticket-detail" aria-label="Chi tiết Ticket">
        <h3>Chi tiết {selected.code}</h3>
        <h4>{selected.title}</h4>
        <p className="multiline">{selected.description}</p>
        <dl>
          <dt>Người tạo</dt><dd>{selected.creator_name}</dd>
          <dt>Độ ưu tiên</dt><dd>{priorityNames[selected.priority]}</dd>
          <dt>Trạng thái</dt><dd>{statusNames[selected.status]}</dd>
          <dt>Nhân viên IT tiếp nhận</dt><dd>{selected.assignee_name || 'Chưa tiếp nhận'}</dd>
          <dt>Ngày tạo</dt><dd>{date(selected.created_at)}</dd>
          <dt>Cập nhật lần cuối</dt><dd>{date(selected.updated_at)}</dd>
          <dt>Giải pháp</dt><dd className="multiline">{selected.solution || 'Chưa có giải pháp'}</dd>
        </dl>
        <button type="button" disabled={busy} onClick={() => openTicket(selected.id)}>Làm mới chi tiết</button>
        {canPrioritize && <form onSubmit={event => { event.preventDefault(); change('priority', { priority }); }}>
          <label htmlFor="ticket-priority">Độ ưu tiên mới</label>
          <select id="ticket-priority" value={priority} onChange={event => setPriority(event.target.value)} disabled={busy}>
            {Object.entries(priorityNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select><button disabled={busy || priority === selected.priority} type="submit">Lưu độ ưu tiên</button>
        </form>}
        {canManage && selected.status === 'NEW' && <button disabled={busy} onClick={() => change('accept', {})}>Tiếp nhận</button>}
        {canProcess && selected.status === 'RECEIVED' && <button disabled={busy} onClick={() => change('status', { status: 'IN_PROGRESS' })}>Bắt đầu xử lý</button>}
        {canProcess && selected.status === 'IN_PROGRESS' && <form onSubmit={event => { event.preventDefault(); change('status', { status: 'RESOLVED', solution }); }}>
          <label htmlFor="ticket-solution">Giải pháp xử lý</label>
          <textarea id="ticket-solution" rows={4} required maxLength={4000} value={solution} disabled={busy} onChange={event => setSolution(event.target.value)} />
          <button disabled={busy} type="submit">Đánh dấu đã giải quyết</button>
        </form>}
        {canProcess && selected.status === 'RESOLVED' && <div className="actions">
          <button disabled={busy} onClick={() => change('status', { status: 'CLOSED' })}>Đóng Ticket</button>
          <button disabled={busy} onClick={() => change('status', { status: 'IN_PROGRESS' })}>Xử lý lại</button>
        </div>}
        <h4>Lịch sử xử lý</h4>
        <ol>{selected.history.map(entry => <li key={entry.id}>
          <strong>{entry.old_status ? `${statusNames[entry.old_status]} → ` : ''}{statusNames[entry.new_status]}</strong>
          <span> — {entry.actor_name} — {date(entry.created_at)}</span>
          {entry.note && <p>{entry.note}</p>}
        </li>)}</ol>
      </article>}
    </section>
  );
}
