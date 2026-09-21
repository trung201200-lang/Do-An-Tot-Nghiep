const tickets = require('../models/ticketModel');
const { parseId } = require('../utils/validation');
const priorities = ['LOW', 'MEDIUM', 'HIGH'];
const statuses = ['NEW', 'RECEIVED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

function invalid(res, message) { return res.status(400).json({ success: false, message }); }
function validBody(body, allowed) {
  return body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).every(key => allowed.includes(key));
}
function text(value) { return typeof value === 'string' ? value.trim() : ''; }

async function create(req, res) {
  if (!validBody(req.body, ['title', 'description'])) return invalid(res, 'Chỉ được gửi tiêu đề và mô tả sự cố.');
  const title = text(req.body.title), description = text(req.body.description);
  if (!title || title.length > 255 || !description || description.length > 4000) {
    return invalid(res, 'Tiêu đề bắt buộc, tối đa 255 ký tự; mô tả bắt buộc, tối đa 4000 ký tự.');
  }
  const ticket = await tickets.create(req.user, title, description);
  res.status(201).json({ success: true, message: 'Đã tạo yêu cầu hỗ trợ.', ticket });
}
async function list(req, res) {
  res.json({ success: true, tickets: await tickets.list(req.user) });
}
async function detail(req, res) {
  const id = parseId(req.params.id);
  if (!id) return invalid(res, 'ID Ticket không hợp lệ.');
  res.json({ success: true, ticket: await tickets.detail(req.user, id) });
}
async function accept(req, res) {
  const id = parseId(req.params.id);
  if (!id) return invalid(res, 'ID Ticket không hợp lệ.');
  if (!validBody(req.body ?? {}, [])) return invalid(res, 'Tiếp nhận không cho phép truyền người xử lý hoặc trường khác.');
  res.json({ success: true, ticket: await tickets.change(req.user, id, 'accept') });
}
async function priority(req, res) {
  const id = parseId(req.params.id);
  if (!id) return invalid(res, 'ID Ticket không hợp lệ.');
  if (!validBody(req.body, ['priority']) || !priorities.includes(req.body.priority)) return invalid(res, 'Priority phải là LOW, MEDIUM hoặc HIGH.');
  res.json({ success: true, ticket: await tickets.change(req.user, id, 'priority', req.body) });
}
async function status(req, res) {
  const id = parseId(req.params.id);
  if (!id) return invalid(res, 'ID Ticket không hợp lệ.');
  if (!validBody(req.body, ['status', 'solution']) || !statuses.includes(req.body.status)) return invalid(res, 'Trạng thái hoặc dữ liệu gửi lên không hợp lệ.');
  const solution = text(req.body.solution);
  if (req.body.status === 'RESOLVED' && (!solution || solution.length > 4000)) return invalid(res, 'Phải nhập giải pháp, tối đa 4000 ký tự, trước khi đánh dấu đã giải quyết.');
  if (req.body.status !== 'RESOLVED' && Object.hasOwn(req.body, 'solution')) return invalid(res, 'Chỉ ghi giải pháp khi chuyển sang Đã giải quyết.');
  res.json({ success: true, ticket: await tickets.change(req.user, id, 'status', { status: req.body.status, solution }) });
}
module.exports = { create, list, detail, accept, priority, status };
