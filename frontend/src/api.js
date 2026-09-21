const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000/api';

export async function apiRequest(path, { token, method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error('Không kết nối được backend. Hãy kiểm tra server và thử lại.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || 'Không thể xử lý yêu cầu.');
    error.status = response.status;
    throw error;
  }
  return data;
}
