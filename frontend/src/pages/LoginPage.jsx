import React, { useState } from 'react';
import { Brand } from '../components/layout/AppShell';
import Icon from '../components/ui/Icon';
import { Alert, Button } from '../components/ui';

export default function LoginPage({ email, password, onEmailChange, onPasswordChange, onSubmit, submitting, error }) {
  const [visible, setVisible] = useState(false);
  return <main className="login-page">
    <section className="login-story" aria-label="Giới thiệu hệ thống">
      <Brand />
      <div className="login-story__body"><span className="login-story__tag">Đồng hành cùng công việc của bạn</span><h2>Hỗ trợ rõ ràng.<br /><span>Công việc thuận lợi.</span></h2><p>Một không gian để gửi yêu cầu, tìm lời giải và kết nối với bộ phận CNTT.</p>
        <div className="login-features">{[['ticket', 'Theo dõi yêu cầu', 'Nắm bắt tiến trình xử lý trong cùng một nơi.'], ['book', 'Tra cứu kiến thức', 'Tìm hướng dẫn cho những sự cố thường gặp.'], ['sparkles', 'Hỏi trợ lý AI', 'Tra cứu thông tin từ Kho kiến thức nội bộ.']].map(([icon, title, text]) => <div key={icon}><span><Icon name={icon} /></span><div><h3>{title}</h3><p>{text}</p></div></div>)}</div>
      </div>
      <p className="login-story__footer">Dành cho nhân viên và bộ phận CNTT</p>
    </section>
    <section className="login-panel">
      <div className="login-card"><span className="login-lock"><Icon name="shield" size={29} /></span><p className="eyebrow">Chào mừng trở lại</p><h1>Đăng nhập</h1><p className="login-intro">Sử dụng tài khoản nội bộ để truy cập hệ thống hỗ trợ CNTT.</p>
        <form onSubmit={onSubmit} aria-busy={submitting}>
          {error && <Alert>{error}</Alert>}
          <label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="username" required maxLength={254} placeholder="Nhập email của bạn" value={email} onChange={event => onEmailChange(event.target.value)} disabled={submitting} />
          <label htmlFor="password">Mật khẩu</label><div className="password-field"><input id="password" name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" required placeholder="Nhập mật khẩu" value={password} onChange={event => onPasswordChange(event.target.value)} disabled={submitting} /><Button variant="icon" aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={visible} onClick={() => setVisible(value => !value)} disabled={submitting}><Icon name={visible ? 'eyeOff' : 'eye'} size={20} /></Button></div>
          <Button className="login-submit" type="submit" disabled={submitting}>{submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}{submitting ? <span className="spinner spinner--small" aria-hidden="true" /> : <Icon name="arrow" size={19} />}</Button>
        </form>
        <p className="login-note"><Icon name="info" size={18} /><span>Liên hệ quản trị viên nếu bạn cần hỗ trợ tài khoản.</span></p>
      </div>
      <p className="login-copyright">IT Helpdesk AI · Hệ thống hỗ trợ CNTT nội bộ</p>
    </section>
  </main>;
}
