import React, { useEffect, useRef, useState } from 'react';
import Icon from '../ui/Icon';
import { Button } from '../ui';

export const roleNames = { EMPLOYEE: 'Nhân viên', IT: 'Nhân viên IT', ADMIN: 'Quản trị viên' };
const navigation = [
  { id: 'overview', label: 'Tổng quan', icon: 'grid', description: 'Không gian hỗ trợ CNTT dành cho bạn.' },
  { id: 'tickets', label: 'Yêu cầu hỗ trợ', icon: 'ticket', description: 'Theo dõi yêu cầu và phối hợp xử lý sự cố.' },
  { id: 'knowledge', label: 'Kho kiến thức', icon: 'book', description: 'Tìm hướng dẫn và kiến thức CNTT nội bộ.' },
  { id: 'rag', label: 'Trợ lý AI', icon: 'sparkles', description: 'Tra cứu hướng dẫn từ Kho kiến thức của tổ chức.' },
  { id: 'users', label: 'Quản lý người dùng', icon: 'users', description: 'Không gian quản trị tài khoản và phân quyền.', admin: true },
];

export function Brand() {
  return <div className="brand"><span className="brand__mark"><Icon name="shield" size={25} /></span><span><strong>IT Helpdesk <span>AI</span></strong><small>Hệ thống hỗ trợ nội bộ</small></span></div>;
}

export default function AppShell({ user, section, onNavigate, onLogout, children }) {
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 900px)').matches);
  const [open, setOpen] = useState(false);
  const sidebar = useRef(null), menuButton = useRef(null), main = useRef(null);
  const items = navigation.filter(item => !item.admin || user.role === 'ADMIN');
  const current = items.find(item => item.id === section) || items[0];
  const initials = user.name?.trim().split(/\s+/).slice(-2).map(part => Array.from(part)[0]).join('').toLocaleUpperCase('vi-VN') || 'ND';

  useEffect(() => {
    const query = window.matchMedia('(max-width: 900px)');
    const change = () => { setMobile(query.matches); if (!query.matches) setOpen(false); };
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);

  function closeMenu() {
    setOpen(false);
    // Restore focus after React removes inert from the workspace.
    requestAnimationFrame(() => menuButton.current?.focus());
  }
  function navigate(id) {
    onNavigate(id); setOpen(false);
    requestAnimationFrame(() => main.current?.focus());
  }

  useEffect(() => {
    if (!mobile || !open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFrame = requestAnimationFrame(() => sidebar.current?.querySelector('button')?.focus());
    function onKey(event) {
      if (event.key === 'Escape') { event.preventDefault(); closeMenu(); }
      if (event.key !== 'Tab') return;
      const buttons = [...sidebar.current.querySelectorAll('button:not(:disabled)')];
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => { cancelAnimationFrame(focusFrame); document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKey); };
  }, [mobile, open]);

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Bỏ qua menu, đến nội dung</a>
    {mobile && open && <div className="sidebar-backdrop" onClick={closeMenu} aria-hidden="true" />}
    <aside id="app-sidebar" ref={sidebar} className={`sidebar ${open ? 'sidebar--open' : ''}`} inert={mobile && !open}
      role={mobile && open ? 'dialog' : undefined} aria-modal={mobile && open ? true : undefined} aria-label="Menu chính">
      <div className="sidebar__brand"><Brand />{mobile && <Button variant="icon" aria-label="Đóng menu" onClick={closeMenu}><Icon name="close" /></Button>}</div>
      <p className="sidebar__label">Không gian làm việc</p>
      <nav aria-label="Điều hướng chính" className="sidebar__nav">{items.map(item =>
        <button type="button" key={item.id} className={`nav-item ${section === item.id ? 'nav-item--active' : ''}`}
          aria-current={section === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}>
          <Icon name={item.icon} /><span>{item.label}</span>{section === item.id && <span className="nav-item__dot" aria-hidden="true" />}
        </button>)}</nav>
      <div className="sidebar__help"><span className="sidebar__help-icon"><Icon name="book" /></span><strong>Cần một hướng dẫn?</strong><p>Khám phá cách xử lý các sự cố thường gặp trong Kho kiến thức.</p><button type="button" onClick={() => navigate('knowledge')}>Tra cứu ngay <Icon name="arrow" size={17} /></button></div>
      <div className="sidebar__account"><span className="avatar">{initials}</span><div><strong>{user.name}</strong><small>{roleNames[user.role] || user.role}</small></div><Button variant="icon" aria-label="Đăng xuất" title="Đăng xuất" onClick={onLogout}><Icon name="logout" size={20} /></Button></div>
    </aside>
    <div className="app-workspace" inert={mobile && open}>
      <header className="app-header">
        <div className="app-header__path"><Button variant="icon" className="mobile-menu" ref={menuButton} aria-label="Mở menu" aria-controls="app-sidebar" aria-expanded={open} onClick={() => setOpen(true)}><Icon name="menu" /></Button><span className="breadcrumb-parent">Không gian làm việc<span className="breadcrumb-divider">/</span></span><span>{current.label}</span></div>
        <div className="header-account"><span className="account-role">{roleNames[user.role] || user.role}</span><span className="avatar avatar--light" title={user.name}>{initials}</span></div>
      </header>
      <main id="main-content" ref={main} tabIndex={-1} className="app-content">
        <div className="page-heading"><div><p className="eyebrow">Cổng hỗ trợ CNTT</p><h1>{current.label}</h1><p>{current.description}</p></div><span className="workspace-label"><Icon name="shield" size={17} /> Không gian nội bộ</span></div>
        {children}
        <footer className="app-footer"><span>IT Helpdesk AI</span><span>Kết nối hỗ trợ · Chia sẻ kiến thức</span></footer>
      </main>
    </div>
  </div>;
}
