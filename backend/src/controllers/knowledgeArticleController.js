const articles = require('../models/knowledgeArticleModel');
const { parseId } = require('../utils/validation');
const statuses = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];

function invalid(res, message) { return res.status(400).json({ success: false, message }); }
function validBody(body, allowed) {
  return body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).every(key => allowed.includes(key));
}
function articleInput(body) {
  if (!validBody(body, ['title', 'content'])) return null;
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!title || [...title].length > 255 || !content || Buffer.byteLength(content, 'utf8') > 65535) return null;
  return { title, content };
}

async function create(req, res) {
  const input = articleInput(req.body);
  if (!input) return invalid(res, 'Chỉ gửi title và content không rỗng; title tối đa 255 ký tự, content tối đa 65535 byte UTF-8.');
  const article = await articles.create(req.user, input.title, input.content);
  res.status(201).json({ success: true, message: 'Đã tạo bài viết nháp.', article });
}
async function list(req, res) {
  res.json({ success: true, articles: await articles.list(req.user) });
}
async function detail(req, res) {
  const id = parseId(req.params.id);
  if (!id) return invalid(res, 'ID bài viết không hợp lệ.');
  res.json({ success: true, article: await articles.findById(req.user, id) });
}
async function update(req, res) {
  const id = parseId(req.params.id);
  if (!id) return invalid(res, 'ID bài viết không hợp lệ.');
  const input = articleInput(req.body);
  if (!input) return invalid(res, 'Chỉ gửi title và content không rỗng; title tối đa 255 ký tự, content tối đa 65535 byte UTF-8.');
  res.json({ success: true, message: 'Đã cập nhật bài viết.', article: await articles.update(req.user, id, input.title, input.content) });
}
async function status(req, res) {
  const id = parseId(req.params.id);
  if (!id) return invalid(res, 'ID bài viết không hợp lệ.');
  if (!validBody(req.body, ['status']) || !statuses.includes(req.body.status)) return invalid(res, 'Chỉ gửi status là DRAFT, PUBLISHED hoặc ARCHIVED.');
  res.json({ success: true, article: await articles.changeStatus(req.user, id, req.body.status) });
}
module.exports = { create, list, detail, update, status };
