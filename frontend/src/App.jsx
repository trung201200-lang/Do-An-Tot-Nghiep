import React, { useEffect, useState } from 'react';
import { apiRequest } from './api';
import Tickets from './Tickets';
import KnowledgeBase from './KnowledgeBase';

const TOKEN_KEY = 'it_support_token';
const roleNames = { EMPLOYEE: 'Nhân viên', IT: 'Nhân viên IT', ADMIN: 'Quản trị viên' };

export default function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || '');
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(Boolean(token));
  const [submitting, setSubmitting] = useState(false);
  const [retry, setRetry] = useState(0);
  const [section, setSection] = useState('tickets');

  function logout(message = '') {
    sessionStorage.removeItem(TOKEN_KEY);
    setSection('tickets');
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
      try {
        const data = await apiRequest('/auth/me', { token });
        if (active) { setUser(data.user); setError(''); }
      } catch (failure) {
        if (!active) return;
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

  return (
    <main>
      <h1>HỆ THỐNG HỖ TRỢ CNTT NỘI BỘ</h1>
      <p>Quản lý yêu cầu hỗ trợ và tra cứu hướng dẫn xử lý sự cố CNTT nội bộ.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {checking ? <p role="status">Đang kiểm tra phiên đăng nhập...</p> : token ? (
        user ? (
          <section>
            <h2>Xin chào, {user.name}</h2>
            <p>Vai trò: <strong>{roleNames[user.role] || user.role}</strong></p>
            <p>Email: {user.email}</p>
            <p>Bạn đã đăng nhập thành công.</p>
            <button type="button" onClick={() => logout()}>Đăng xuất</button>
            <nav className="section-nav" aria-label="Chức năng">
              <button type="button" aria-pressed={section === 'tickets'} onClick={() => setSection('tickets')}>{user.role === 'EMPLOYEE' ? 'Ticket của tôi' : 'Ticket'}</button>
              <button type="button" aria-pressed={section === 'knowledge'} onClick={() => setSection('knowledge')}>Kho kiến thức</button>
            </nav>
            {section === 'tickets'
              ? <Tickets key={user.id} token={token} user={user} onUnauthorized={logout} />
              : <KnowledgeBase key={`${user.id}:${user.role}`} token={token} user={user} onUnauthorized={logout} />}
          </section>
        ) : (
          <section>
            <p>Chưa xác minh được phiên đăng nhập.</p>
            <div className="actions">
              <button type="button" onClick={() => setRetry((value) => value + 1)}>Thử lại</button>
              <button type="button" onClick={() => logout()}>Quay lại đăng nhập</button>
            </div>
          </section>
        )
      ) : (
        <form onSubmit={login}>
          <h2>Đăng nhập</h2>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="username" required maxLength={254}
            value={email} onChange={(event) => setEmail(event.target.value)} disabled={submitting} />
          <label htmlFor="password">Mật khẩu</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required
            value={password} onChange={(event) => setPassword(event.target.value)} disabled={submitting} />
          <button type="submit" disabled={submitting}>{submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}</button>
        </form>
      )}
    </main>
  );
}
