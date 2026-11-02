import React from 'react';
import Icon from '../components/ui/Icon';
import { Alert, Badge, Button, EmptyState, LoadingState } from '../components/ui';
import useDashboardSource from '../components/dashboard/useDashboardSource';
import { accountRoles, accountStatuses, counts, knowledgeStatuses, readAccounts, readKnowledge, readTickets, recentTickets, ticketStatuses, timestamp, workQueue } from '../components/dashboard/dashboardData';
import '../styles/dashboard.css';

function Source({ name, title, resource, children }) {
  return <section className="dashboard-panel" data-source={name} data-source-status={resource.status} aria-label={title}>
    <div className="dashboard-panel-heading"><h2>{title}</h2><Button variant="secondary" disabled={resource.status === 'loading'} onClick={resource.retry} aria-label={`Làm mới ${title.toLocaleLowerCase('vi')}`}>Làm mới</Button></div>
    {resource.status === 'loading' ? <LoadingState message={`Đang tải ${title.toLocaleLowerCase('vi')}…`} /> : resource.status === 'error' ?
      <div className="dashboard-source-error"><Alert>{resource.error}</Alert><p>Chưa có dữ liệu để hiển thị thống kê.</p><Button variant="secondary" onClick={resource.retry}>Thử lại</Button></div> : children(resource.rows)}
  </section>;
}

function Distribution({ rows, labels, field = 'status', label }) {
  const values = counts(rows, labels, field);
  return <ul className="dashboard-distribution" aria-label={label}>{Object.entries(labels).map(([key, text]) => <li key={key} data-distribution={key}>
    <div><span>{text}</span><strong>{values[key]}</strong></div>
    <div className="dashboard-bar" aria-hidden="true"><span className={`dashboard-bar--${key}`} style={{ width: `${rows.length ? values[key] / rows.length * 100 : 0}%` }} /></div>
  </li>)}</ul>;
}

function TicketOverview({ rows, user, onNavigate }) {
  const values = counts(rows, ticketStatuses);
  const mine = rows.filter(row => row.assigned_to === user.id);
  const employee = user.role === 'EMPLOYEE', it = user.role === 'IT';
  const metrics = employee ? [
    ['total', 'Ticket của tôi', rows.length, 'Tất cả 5 trạng thái', 'ticket'],
    ['in-progress', 'Đang xử lý', values.IN_PROGRESS, 'Trạng thái Đang xử lý', 'clock'],
    ['resolved', 'Đã giải quyết', values.RESOLVED, 'Trạng thái Đã giải quyết; đã đóng được đếm riêng bên dưới', 'shield'],
  ] : it ? [
    ['new', 'Chưa tiếp nhận', values.NEW, 'Ticket ở trạng thái Mới', 'ticket'],
    ['assigned', 'Ticket tôi phụ trách', mine.length, 'Tất cả trạng thái, kể cả đã đóng', 'users'],
    ['in-progress', 'Tôi đang xử lý', mine.filter(row => row.status === 'IN_PROGRESS').length, 'Do tôi phụ trách, trạng thái Đang xử lý', 'clock'],
  ] : [
    ['total', 'Tổng Ticket', rows.length, 'Trong danh sách được phép xem', 'ticket'],
    ['new', 'Chưa tiếp nhận', values.NEW, 'Ticket ở trạng thái Mới', 'clock'],
    ['in-progress', 'Đang xử lý', values.IN_PROGRESS, 'Trạng thái Đang xử lý', 'users'],
  ];
  const queue = it ? workQueue(rows, user.id) : recentTickets(rows);
  const shown = it ? queue.slice(0, 6) : queue;
  const missingDates = !it ? rows.filter(row => timestamp(row.created_at) === null).length : 0;
  return <>
    <div className="dashboard-metrics">{metrics.map(([key, label, value, detail, icon]) => <div className="dashboard-metric" data-metric={key} key={key}><span className="dashboard-metric-icon"><Icon name={icon} /></span><span className="dashboard-metric-label">{label}</span><strong className="dashboard-metric-value">{value}</strong><p>{detail}</p></div>)}</div>
    {!rows.length ? <EmptyState icon="ticket" title="Chưa có Ticket" description={employee ? 'Các yêu cầu của bạn sẽ xuất hiện tại đây sau khi được tạo.' : 'Chưa có Ticket trong danh sách được phép xem.'} /> : <div className="dashboard-ticket-grid">
      <section className="dashboard-statuses"><h3>Phân bố trạng thái</h3><p>{employee ? 'Ticket của bạn' : 'Toàn bộ Ticket được phép xem'}</p><Distribution rows={rows} labels={ticketStatuses} label="Số Ticket theo từng trạng thái" /></section>
      <section className="dashboard-recent"><div className="dashboard-subheading"><h3>{it ? 'Việc cần xử lý' : 'Ticket gần đây'}</h3><Badge>{shown.length}{it ? ` / ${queue.length}` : ' yêu cầu'}</Badge></div>
        <p className="dashboard-explanation">{it ? 'Ticket mới và Ticket tôi phụ trách đã tiếp nhận, đang xử lý hoặc đã giải quyết nhưng chưa đóng. Hiển thị tối đa 6 yêu cầu.' : 'Tối đa 5 yêu cầu mới nhất theo ngày tạo.'}</p>
        {missingDates > 0 && <p className="dashboard-explanation">{missingDates} Ticket thiếu ngày tạo hợp lệ không nằm trong danh sách gần đây; vẫn được tính trong thống kê.</p>}
        {shown.length ? <ul className="dashboard-ticket-list">{shown.map(ticket => <li key={ticket.id} data-ticket-id={ticket.id}>
          <div className="dashboard-ticket-top"><strong>{ticket.code}</strong><Badge tone={`dash-${ticket.status}`}>{ticketStatuses[ticket.status]}</Badge></div>
          <h4>{ticket.title}</h4>
          <p>{ticket.assigned_to === null ? 'Chưa tiếp nhận' : `Phụ trách: ${ticket.assignee_name || 'Chưa có tên trong dữ liệu'}`}</p>
          {timestamp(ticket.created_at) !== null && <time dateTime={new Date(timestamp(ticket.created_at)).toISOString()}>Tạo lúc {new Date(timestamp(ticket.created_at)).toLocaleString('vi-VN')}</time>}
        </li>)}</ul> : <p className="dashboard-list-empty">{it ? 'Không có yêu cầu cần xử lý trong phạm vi này.' : 'Chưa có ngày tạo hợp lệ để hiển thị danh sách gần đây.'}</p>}
      </section>
    </div>}
    <div className="dashboard-panel-footer"><Button variant="secondary" onClick={() => onNavigate('tickets')}>Mở danh sách Ticket<Icon name="arrow" size={17} /></Button></div>
  </>;
}

export default function OverviewPage({ token, user, onUnauthorized, onNavigate }) {
  const tickets = useDashboardSource({ path: '/tickets', read: readTickets, token, user, onUnauthorized });
  const knowledge = useDashboardSource({ path: '/knowledge', read: readKnowledge, token, user, onUnauthorized });
  const accounts = useDashboardSource({ path: '/users', read: readAccounts, token, user, onUnauthorized, enabled: user.role === 'ADMIN' });
  const employee = user.role === 'EMPLOYEE';
  const loading = [tickets, knowledge, ...(user.role === 'ADMIN' ? [accounts] : [])].some(source => source.status === 'loading');
  return <div className="dashboard" data-role={user.role}>
    <section className="welcome-card dashboard-welcome"><div><Badge tone="blue">{accountRoles[user.role]}</Badge><h2>Xin chào, {user.name}!</h2><p>{employee ? 'Theo dõi yêu cầu của bạn và tìm hướng dẫn hỗ trợ.' : user.role === 'IT' ? 'Theo dõi yêu cầu mới và công việc bạn đang phụ trách.' : 'Tổng hợp Ticket, Kho kiến thức và tài khoản trong phạm vi quản trị.'}</p></div><Button variant="secondary" disabled={loading} onClick={() => { tickets.retry(); knowledge.retry(); if (user.role === 'ADMIN') accounts.retry(); }}>Làm mới tổng quan</Button></section>
    <p className="dashboard-scope">Số liệu trong phạm vi bạn được phép xem, tải khi mở trang hoặc làm mới. Mỗi trạng thái được đếm riêng.</p>
    <Source name="tickets" title="Thống kê Ticket" resource={tickets}>{rows => <TicketOverview rows={rows} user={user} onNavigate={onNavigate} />}</Source>
    <div className={`dashboard-secondary ${user.role === 'ADMIN' ? 'dashboard-secondary--admin' : ''}`}>
      <Source name="knowledge" title="Kho kiến thức" resource={knowledge}>{rows => <>
        <div className="dashboard-total"><strong data-metric="knowledge-total">{rows.length}</strong><span>{employee ? 'bài đã xuất bản được phép xem' : 'bài viết được phép xem'}</span></div>
        {!rows.length ? <p className="dashboard-list-empty">Chưa có bài viết trong phạm vi quyền của bạn.</p> : <Distribution rows={rows} labels={employee ? { PUBLISHED: knowledgeStatuses.PUBLISHED } : knowledgeStatuses} label="Số bài viết theo trạng thái" />}
        <div className="dashboard-panel-footer"><Button variant="secondary" onClick={() => onNavigate('knowledge')}>Mở Kho kiến thức<Icon name="arrow" size={17} /></Button></div>
      </>}</Source>
      {user.role === 'ADMIN' && <Source name="users" title="Tài khoản" resource={accounts}>{rows => <>
        <div className="dashboard-total"><strong data-metric="users-total">{rows.length}</strong><span>tài khoản trong phạm vi quản trị</span></div>
        {!rows.length ? <p className="dashboard-list-empty">Chưa có tài khoản trong danh sách được phép xem.</p> : <><Distribution rows={rows} labels={accountRoles} field="role" label="Số tài khoản theo vai trò" /><dl className="dashboard-account-status">{Object.entries(accountStatuses).map(([status, label]) => <div key={status} data-account-status={status}><dt>{label}</dt><dd>{rows.filter(row => row.status === status).length}</dd></div>)}</dl></>}
      </>}</Source>}
    </div>
    <section className="dashboard-shortcuts" aria-label="Truy cập nhanh"><div className="section-heading"><h2>Truy cập nhanh</h2></div><div className="shortcut-grid">
      <button type="button" className="shortcut-card shortcut-card--blue" data-shortcut="tickets" onClick={() => onNavigate('tickets')}><span className="shortcut-card__icon"><Icon name="ticket" /></span><h3>{employee ? 'Tạo yêu cầu hỗ trợ' : 'Quản lý Ticket'}</h3><p>{employee ? 'Mở danh sách yêu cầu, sau đó chọn “Tạo yêu cầu” để gửi sự cố.' : 'Vào danh sách để tiếp nhận và xử lý các yêu cầu theo quyền.'}</p><span className="shortcut-card__action">Mở Yêu cầu hỗ trợ<Icon name="arrow" size={18} /></span></button>
      <button type="button" className="shortcut-card shortcut-card--teal" data-shortcut="knowledge" onClick={() => onNavigate('knowledge')}><span className="shortcut-card__icon"><Icon name="book" /></span><h3>Kho kiến thức</h3><p>Tra cứu hướng dẫn hoặc quản lý bài viết theo quyền của bạn.</p><span className="shortcut-card__action">Mở Kho kiến thức<Icon name="arrow" size={18} /></span></button>
      <button type="button" className="shortcut-card shortcut-card--violet" data-shortcut="rag" onClick={() => onNavigate('rag')}><span className="shortcut-card__icon"><Icon name="sparkles" /></span><h3>Hỏi Trợ lý AI</h3><p>Đặt câu hỏi đầy đủ về sự cố CNTT cần hỗ trợ.</p><span className="shortcut-card__action">Bắt đầu tra cứu<Icon name="arrow" size={18} /></span></button>
    </div></section>
  </div>;
}
