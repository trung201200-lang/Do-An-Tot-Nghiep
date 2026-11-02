export const roles = { EMPLOYEE: 'Nhân viên', IT: 'Nhân viên IT', ADMIN: 'Quản trị viên' };
export const statuses = { ACTIVE: 'Đang hoạt động', INACTIVE: 'Đã vô hiệu hóa' };
export function cleanUser(value) {
  if (!value || !Number.isSafeInteger(value.id) || value.id <= 0 || typeof value.name !== 'string' || typeof value.email !== 'string' || !Object.hasOwn(roles, value.role) || !Object.hasOwn(statuses, value.status)) throw new Error('Invalid user response');
  // Whitelist response fields; never retain credentials or unexpected fields.
  const { id, name, email, role, status, created_at, updated_at } = value;
  return { id, name, email, role, status, created_at, updated_at };
}
export function cleanList(data) {
  if (data?.success === false || !Array.isArray(data?.users)) throw new Error('Invalid list response');
  const rows = data.users.map(cleanUser);
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Duplicate users');
  return rows;
}
export function validateAccount({ name, email, password, role, status }) {
  const errors = {};
  if (!name.trim() || name.trim().length > 100) errors.name = 'Nhập họ tên, tối đa 100 ký tự.';
  if (email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Nhập địa chỉ email hợp lệ, tối đa 254 ký tự.';
  if (password.length < 8 || new TextEncoder().encode(password).length > 72) errors.password = 'Mật khẩu cần ít nhất 8 ký tự và tối đa 72 byte UTF-8.';
  if (!Object.hasOwn(roles, role)) errors.role = 'Vui lòng chọn vai trò hợp lệ.';
  if (!Object.hasOwn(statuses, status)) errors.status = 'Vui lòng chọn trạng thái hợp lệ.';
  return errors;
}
export function failureMessage(failure, creating = false) {
  // Use safe UI messages, never echo server bodies that might contain form input.
  if (failure.status === 403) return 'Bạn không có quyền quản lý người dùng. Vui lòng kiểm tra lại quyền tài khoản hoặc đăng nhập lại.';
  if (failure.status === 409) return creating ? 'Email đã tồn tại. Hãy kiểm tra lại email tài khoản.' : 'Không thể hạ quyền hoặc vô hiệu hóa ADMIN đang hoạt động cuối cùng. Hãy làm mới danh sách để kiểm tra.';
  if (failure.status === 400 || failure.status === 413) return 'Dữ liệu chưa hợp lệ. Hãy kiểm tra các trường và thử lại.';
  if (failure.status === 404) return 'Tài khoản không còn tồn tại. Hãy làm mới danh sách.';
  if (failure.name === 'AbortError') return 'Yêu cầu phản hồi quá lâu. Hãy tải lại danh sách để kiểm tra kết quả trước khi thử lại.';
  if (failure.status >= 500) return 'Dịch vụ quản lý tài khoản tạm thời không khả dụng. Vui lòng thử lại sau.';
  return 'Không thể tải hoặc lưu dữ liệu. Hãy kiểm tra kết nối và tải lại danh sách.';
}
export function displayDate(value) {
  return typeof value === 'string' && value.trim() && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('vi-VN') : 'Chưa có thông tin';
}
