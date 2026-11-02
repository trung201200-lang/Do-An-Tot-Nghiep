import React, { useEffect, useRef, useState } from 'react';
import { apiRequest } from './api';
import { readTicketList } from './responseData';
import { Alert, Button, EmptyState, LoadingState } from './components/ui';
import { TicketList, TicketForm, TicketDetail } from './components/tickets/TicketViews';
import './styles/tickets.css';

export default function Tickets({ token, user, onUnauthorized, initialQuestion = '' }) {
  const [tickets, setTickets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(Boolean(initialQuestion) && user.role === 'EMPLOYEE');
  const [formInitial, setFormInitial] = useState(() => initialQuestion && user.role === 'EMPLOYEE' ? { title: 'Yêu cầu hỗ trợ từ Trợ lý AI', description: initialQuestion } : undefined);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [listFailed, setListFailed] = useState(false);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  const [filters, setFilters] = useState({ search: '', status: '', priority: '' });
  const heading = useRef(null);
  const lastOpened = useRef(null);
  const requestBusy = useRef(false);
  const employee = user.role === 'EMPLOYEE';
  const canManage = ['IT', 'ADMIN'].includes(user.role);
  const canProcess = selected && canManage && (user.role === 'ADMIN' || selected.assigned_to === user.id);
  const canPrioritize = selected && canManage && selected.status !== 'CLOSED' && (user.role === 'ADMIN' || selected.assigned_to === null || selected.assigned_to === user.id);

  function handleError(failure) {
    if (failure.status === 401) onUnauthorized(failure.message);
    else {
      setError(failure.message);
      if ([403, 404].includes(failure.status)) {
        setSelected(null); setRefreshRequired(false);
        requestAnimationFrame(() => heading.current?.focus());
      }
    }
  }
  function showTicket(ticket) {
    setSelected(ticket); setCreating(false); setRefreshRequired(false);
    setTickets(previous => previous.map(item => item.id === ticket.id ? ticket : item));
  }
  useEffect(() => {
    let active = true;
    setLoading(true); setSelected(null); setCreating(Boolean(initialQuestion) && user.role === 'EMPLOYEE' && reload === 0); setError(''); setListFailed(false); setNotice('');
    apiRequest('/tickets', { token }).then(data => {
      if (active) setTickets(readTicketList(data));
    }).catch(failure => {
      if (active) { setListFailed(true); handleError(failure); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, user.role, reload]);

  // Move keyboard focus when switching screens, without stealing it on refresh.
  useEffect(() => { if (creating || selected) heading.current?.focus(); }, [creating, selected?.id]);
  function back() {
    setFormInitial(undefined);
    setSelected(null); setCreating(false); setError(''); setNotice('');
    requestAnimationFrame(() => {
      const buttons = document.querySelectorAll('[data-open-ticket]');
      const previous = [...buttons].find(button => button.dataset.openTicket === String(lastOpened.current) && button.getClientRects().length);
      (previous || heading.current)?.focus();
    });
  }
  async function perform(work) {
    if (requestBusy.current) return;
    requestBusy.current = true; setBusy(true); setError(''); setNotice('');
    try { await work(); }
    catch (failure) { handleError(failure); }
    finally { requestBusy.current = false; setBusy(false); }
  }
  function openTicket(id) {
    lastOpened.current = id;
    return perform(async () => showTicket((await apiRequest(`/tickets/${id}`, { token })).ticket));
  }
  function createTicket(body) {
    return perform(async () => {
      const data = await apiRequest('/tickets', { token, method: 'POST', body });
      setTickets(previous => [data.ticket, ...previous]);
      // A successful POST must not leave a form that can submit a duplicate.
      setCreating(false); lastOpened.current = data.ticket.id;
      setNotice(`Đã tạo yêu cầu ${data.ticket.code}.`);
      showTicket((await apiRequest(`/tickets/${data.ticket.id}`, { token })).ticket);
    });
  }
  function change(action, body) {
    return perform(async () => {
      await apiRequest(`/tickets/${selected.id}/${action}`, { token, method: 'PATCH', body });
      // If the detail refresh fails, require a refresh before another mutation.
      setRefreshRequired(true);
      setNotice('Đã lưu thay đổi.');
      showTicket((await apiRequest(`/tickets/${selected.id}`, { token })).ticket);
    });
  }

  return <section className="tickets ticket-page" aria-label="Yêu cầu hỗ trợ">
    <div className="ticket-page__heading">
      <div>
        {(creating || selected) && <Button variant="secondary" className="ticket-back" disabled={busy} onClick={back}>← Quay lại danh sách</Button>}
        <h2 ref={heading} tabIndex={-1}>{creating ? 'Tạo yêu cầu hỗ trợ' : selected ? `Chi tiết ${selected.code}` : employee ? 'Yêu cầu hỗ trợ của tôi' : 'Quản lý yêu cầu'}</h2>
        <p>{creating ? 'Mô tả sự cố để bộ phận IT có thể hỗ trợ bạn.' : selected ? 'Theo dõi thông tin và tiến trình xử lý yêu cầu.' : employee ? 'Gửi sự cố và theo dõi tiến trình hỗ trợ từ bộ phận IT.' : 'Theo dõi, tiếp nhận và xử lý các yêu cầu hỗ trợ.'}</p>
      </div>
      {!selected && !creating && <div className="actions">
        <Button variant="secondary" disabled={busy || loading} onClick={() => setReload(value => value + 1)}>Làm mới danh sách</Button>
        {employee && <Button disabled={busy || loading} onClick={() => { setFormInitial(undefined); setCreating(true); setError(''); setNotice(''); }}>Tạo yêu cầu</Button>}
      </div>}
      {selected && <Button variant="secondary" disabled={busy} onClick={() => openTicket(selected.id)}>Làm mới chi tiết</Button>}
    </div>
    {error && <Alert>{error}</Alert>}
    {notice && <Alert tone="info">{notice}</Alert>}
    {busy && <LoadingState message="Đang xử lý yêu cầu…" />}
    {creating && employee ? <TicketForm initialValues={formInitial} busy={busy} onSubmit={createTicket} onCancel={back} /> : selected ?
      <TicketDetail key={selected.id} ticket={selected} busy={busy || refreshRequired} canManage={canManage} canProcess={canProcess} canPrioritize={canPrioritize} onChange={change} refreshRequired={refreshRequired} /> :
      loading ? <LoadingState message="Đang tải danh sách yêu cầu…" /> : listFailed ?
        <EmptyState icon="info" title="Chưa thể tải danh sách" description="Hãy thử tải lại để xem các yêu cầu hỗ trợ."><Button disabled={busy} onClick={() => setReload(value => value + 1)}>Thử lại</Button></EmptyState> :
        <TicketList tickets={tickets} employee={employee} busy={busy} filters={filters} onFilter={setFilters} onOpen={openTicket} />}
  </section>;
}
