import { useEffect, useState } from 'react';
import { apiRequest } from '../../api';

export default function useDashboardSource({ path, read, token, user, onUnauthorized, enabled = true }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ status: 'loading', rows: null, error: '' });
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 15000);
    setState({ status: 'loading', rows: null, error: '' });
    apiRequest(path, { token, signal: controller.signal }).then(data => {
      if (active) setState({ status: 'success', rows: read(data, user), error: '' });
    }).catch(failure => {
      if (!active) return;
      if (failure.status === 401) { onUnauthorized('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'); return; }
      const error = failure.name === 'AbortError' ? 'Nguồn dữ liệu phản hồi quá lâu. Vui lòng thử lại.'
        : failure.status === 403 ? 'Bạn không có quyền tải nguồn dữ liệu này.'
          : failure.status ? 'Không tải được dữ liệu từ máy chủ. Vui lòng thử lại.' : failure.message;
      setState({ status: 'error', rows: null, error });
    }).finally(() => window.clearTimeout(timer));
    return () => { active = false; controller.abort(); window.clearTimeout(timer); };
  }, [path, read, token, user.id, user.role, enabled, attempt]);
  return { ...state, retry: () => setAttempt(value => value + 1) };
}
