export const ticketStatuses = { NEW: 'Mới', RECEIVED: 'Đã tiếp nhận', IN_PROGRESS: 'Đang xử lý', RESOLVED: 'Đã giải quyết', CLOSED: 'Đã đóng' };
export const knowledgeStatuses = { DRAFT: 'Bản nháp', PUBLISHED: 'Đã xuất bản', ARCHIVED: 'Đã lưu trữ' };
export const accountRoles = { EMPLOYEE: 'Nhân viên', IT: 'Nhân viên IT', ADMIN: 'Quản trị viên' };
export const accountStatuses = { ACTIVE: 'Đang hoạt động', INACTIVE: 'Đã vô hiệu hóa' };
const id = value => Number.isSafeInteger(value) && value > 0;
const belongs = (values, value) => Object.hasOwn(values, value);

function list(data, key, valid) {
  const rows = data?.[key];
  if (data?.success === false || !Array.isArray(rows) || !rows.every(row => row && id(row.id) && valid(row)) || new Set(rows.map(row => row.id)).size !== rows.length) {
    throw new Error('Dữ liệu trả về chưa đúng cấu trúc. Chưa thể tính thống kê.');
  }
  return rows;
}
// Only retain the fields used by the dashboard, not descriptions, KB bodies or account emails.
export function readTickets(data, user) {
  return list(data, 'tickets', row => typeof row.code === 'string' && typeof row.title === 'string' && belongs(ticketStatuses, row.status) && id(row.created_by) && (row.assigned_to === null || id(row.assigned_to)))
    .filter(row => user.role !== 'EMPLOYEE' || row.created_by === user.id)
    .map(({ id, code, title, status, assigned_to, assignee_name, created_at }) => ({ id, code, title, status, assigned_to, assignee_name: typeof assignee_name === 'string' ? assignee_name : null, created_at }));
}
export function readKnowledge(data, user) {
  return list(data, 'articles', row => belongs(knowledgeStatuses, row.status))
    .filter(row => user.role !== 'EMPLOYEE' || row.status === 'PUBLISHED')
    .map(({ id, status }) => ({ id, status }));
}
export function readAccounts(data) {
  return list(data, 'users', row => belongs(accountRoles, row.role) && belongs(accountStatuses, row.status))
    .map(({ id, role, status }) => ({ id, role, status }));
}
export function counts(rows, labels, field = 'status') {
  return Object.fromEntries(Object.keys(labels).map(value => [value, rows.filter(row => row[field] === value).length]));
}
export function timestamp(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}
export function recentTickets(rows) {
  return rows.filter(row => timestamp(row.created_at) !== null).sort((a, b) => timestamp(b.created_at) - timestamp(a.created_at) || b.id - a.id).slice(0, 5);
}
export function workQueue(rows, userId) {
  return rows.filter(row => row.status === 'NEW' || (row.assigned_to === userId && ['RECEIVED', 'IN_PROGRESS', 'RESOLVED'].includes(row.status)))
    .sort((a, b) => (timestamp(b.created_at) ?? -Infinity) - (timestamp(a.created_at) ?? -Infinity) || b.id - a.id);
}
