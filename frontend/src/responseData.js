// Reject broken list responses before they enter React state. Never treat an
// invalid response as a successful empty list or include its content in errors.
function readList(data, key, validRow) {
  const rows = data?.[key];
  if (data?.success === false || !Array.isArray(rows) || !rows.every(row => row && Number.isSafeInteger(row.id) && row.id > 0 && typeof row.code === 'string' && typeof row.title === 'string' && validRow(row)) || new Set(rows.map(row => row.id)).size !== rows.length) {
    throw new Error('Dữ liệu danh sách chưa hợp lệ. Vui lòng thử tải lại.');
  }
  return rows;
}
export function readTicketList(data) {
  return readList(data, 'tickets', row => ['NEW', 'RECEIVED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(row.status) && ['LOW', 'MEDIUM', 'HIGH'].includes(row.priority));
}
export function readKnowledgeList(data) {
  return readList(data, 'articles', row => ['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(row.status) && (row.creator_name == null || typeof row.creator_name === 'string') && (row.updater_name == null || typeof row.updater_name === 'string'));
}
