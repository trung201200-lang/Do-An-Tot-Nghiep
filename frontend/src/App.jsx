import React, { useEffect, useRef, useState } from 'react';
import { apiRequest } from './api';
import Tickets from './Tickets';
import KnowledgeBase from './KnowledgeBase';
import RagAssistant from './RagAssistant';
import AppShell from './components/layout/AppShell';
import { Alert, Button, EmptyState, LoadingState } from './components/ui';
import LoginPage from './pages/LoginPage';
import OverviewPage from './pages/OverviewPage';
import UserManagement from './pages/UserManagement';

const TOKEN_KEY = 'it_support_token';

export default function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || '');
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(Boolean(token));
  const [submitting, setSubmitting] = useState(false);
  const [retry, setRetry] = useState(0);
  const [section, setSection] = useState('overview');
  const [ticketQuestion, setTicketQuestion] = useState('');
  const activeToken = useRef(token);
  const accessRevision = useRef(0);
  activeToken.current = token;
  function navigate(next) { setTicketQuestion(''); setSection(next === 'users' && user?.role !== 'ADMIN' ? 'overview' : next); }

  async function refreshAccess() {
    const revision = ++accessRevision.current;
    try {
      const data = await apiRequest('/auth/me', { token });
      if (activeToken.current !== token || accessRevision.current !== revision) return;
      setUser(data.user);
      if (data.user.role !== 'ADMIN') requestAnimationFrame(() => document.getElementById('main-content')?.focus());
    } catch (failure) { if (activeToken.current === token && accessRevision.current === revision && failure.status === 401) logout('Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.'); }
  }
  function applySelfChange(account) {
    if (account.id !== user.id) return;
    accessRevision.current += 1;
    if (account.status === 'INACTIVE') { logout('Tài khoản của bạn đã được vô hiệu hóa.'); return; }
    setUser(previous => ({ ...previous, role: account.role, status: account.status }));
    if (account.role !== 'ADMIN') { setSection('overview'); requestAnimationFrame(() => document.getElementById('main-content')?.focus()); }
  }

  function logout(message = '') {
    accessRevision.current += 1;
    sessionStorage.removeItem(TOKEN_KEY);
    setSection('overview');
    setTicketQuestion('');
    setToken('');
    setUser(null);
    setPassword('');
    setError(message);
    setChecking(false);
  }

  useEffect(() => {
    if (!token) return;
    let active = true;
    setChecking(true);
    setError('');
    apiRequest('/auth/me', { token }).then((data) => {
      if (active) setUser(data.user);
    }).catch((failure) => {
      if (!active) return;
      if (failure.status === 401) logout(failure.message);
      else setError(failure.message);
    }).finally(() => {
      if (active) setChecking(false);
    });
    return () => { active = false; };
  }, [token, retry]);

  // Kiểm tra lại phiên khi người dùng quay lại tab và định kỳ mỗi phút.
  useEffect(() => {
    if (!token || !user) return;
    let active = true;
    async function verifySession() {
      const revision = accessRevision.current;
      try {
        const data = await apiRequest('/auth/me', { token });
        if (active && accessRevision.current === revision) { setUser(data.user); setError(''); }
      } catch (failure) {
        if (!active || accessRevision.current !== revision) return;
        if (failure.status === 401) logout(failure.message);
        else setError(failure.message);
      }
    }
    const interval = window.setInterval(verifySession, 60000);
    window.addEventListener('focus', verifySession);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', verifySession);
    };
  }, [token, user?.id]);

  async function login(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const data = await apiRequest('/auth/login', { method: 'POST', body: { email, password } });
      sessionStorage.setItem(TOKEN_KEY, data.token);
      setPassword('');
      setChecking(true);
      setToken(data.token);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) return <main className="session-page"><div className="session-card"><LoadingState message="Đang kiểm tra phiên đăng nhập..." />{error && <Alert>{error}</Alert>}</div></main>;

  if (!token) return <LoginPage email={email} password={password} onEmailChange={setEmail} onPasswordChange={setPassword} onSubmit={login} submitting={submitting} error={error} />;

  if (!user) return <main className="session-page"><div className="session-card">{error && <Alert>{error}</Alert>}<EmptyState icon="shield" title="Chưa xác minh được phiên đăng nhập" description="Vui lòng thử lại để tiếp tục vào không gian làm việc."><Button onClick={() => setRetry(value => value + 1)}>Thử lại</Button><Button variant="secondary" onClick={() => logout()}>Quay lại đăng nhập</Button></EmptyState></div></main>;

  // Do not retain the admin-only screen after a role change from /auth/me.
  const visibleSection = section === 'users' && user.role !== 'ADMIN' ? 'overview' : section;
  return <AppShell user={user} section={visibleSection} onNavigate={navigate} onLogout={() => logout()}>
    {error && <Alert>{error}</Alert>}
    {visibleSection === 'overview' ? <OverviewPage key={`${user.id}:${user.role}`} token={token} user={user} onUnauthorized={logout} onNavigate={navigate} />
      : visibleSection === 'tickets' ? <Tickets key={`${user.id}:${user.role}`} token={token} user={user} onUnauthorized={logout} initialQuestion={user.role === 'EMPLOYEE' ? ticketQuestion : ''} />
        : visibleSection === 'knowledge' ? <KnowledgeBase key={`${user.id}:${user.role}`} token={token} user={user} onUnauthorized={logout} />
          : visibleSection === 'rag' ? <RagAssistant key={`${user.id}:${user.role}`} token={token} user={user} onUnauthorized={logout} onCreateTicket={question => { if (user.role === 'EMPLOYEE') { setTicketQuestion(question); setSection('tickets'); } }} />
            : visibleSection === 'users' && user.role === 'ADMIN' ? <UserManagement key={`${user.id}:${user.role}`} token={token} user={user} onUnauthorized={logout} onAccessDenied={refreshAccess} onSelfChanged={applySelfChange} /> : null}
  </AppShell>;
}
