require('../config/env');
const pool = require('../config/db');
const users = require('../models/userModel');
const articles = require('../models/knowledgeArticleModel');
const data = require('./knowledgeSeedData');

function seedError(message) { return Object.assign(new Error(message), { isSeedError: true }); }

async function seedKnowledge() {
  if (process.env.NODE_ENV === 'production') throw seedError('Từ chối seed Knowledge Base trong production. Chỉ dùng local/demo.');
  if (!['127.0.0.1', 'localhost', '::1'].includes(process.env.DB_HOST)) throw seedError('Chỉ seed vào MySQL local. Kiểm tra DB_HOST.');
  const user = await users.findByEmail('it@test.local');
  if (!user || user.role !== 'IT' || user.status !== 'ACTIVE') {
    throw seedError('Cần tài khoản it@test.local tồn tại, có role IT và status ACTIVE. Seed chưa ghi dữ liệu.');
  }
  const connection = await pool.getConnection();
  const lockName = 'it_support_rag:seed:knowledge';
  let locked = false;
  const result = { created: 0, skipped: 0, articles: [] };
  try {
    const [[lock]] = await connection.execute('SELECT GET_LOCK(?, ?) AS acquired', [lockName, 10]);
    if (lock.acquired !== 1) throw seedError('Một tiến trình seed khác đang chạy. Hãy thử lại sau.');
    locked = true;
    // Kiểm tra toàn bộ trước khi tạo. Tiêu đề hoặc marker nhận diện được bài đã sửa.
    const existing = [];
    for (const item of data) {
      const [rows] = await connection.execute(
        'SELECT id, code, title, content, status, created_by FROM knowledge_articles WHERE title = ? OR LOCATE(?, content) > 0',
        [item.title, item.marker],
      );
      if (rows.length > 1) throw seedError(`Có nhiều bài trùng nhận diện chủ đề ${item.key}. Hãy kiểm tra thủ công; seed không ghi đè.`);
      if (rows[0] && rows[0].created_by !== user.id) throw seedError(`Chủ đề ${item.key} trùng bài của người dùng khác. Seed dừng để giữ nguyên dữ liệu.`);
      existing.push(rows[0]);
    }
    // Nếu mất cả title gốc và marker, không thể phân biệt bài đã sửa với bài khác.
    // Dừng an toàn thay vì tạo trùng, không cần thêm cột nhận diện vào schema.
    if (existing.some(article => !article)) {
      const knownIds = new Set(existing.filter(Boolean).map(article => article.id));
      const [owned] = await connection.execute('SELECT id FROM knowledge_articles WHERE created_by = ?', [user.id]);
      if (owned.some(article => !knownIds.has(article.id))) {
        throw seedError('Có bài của IT demo chưa nhận diện được trong khi còn thiếu chủ đề seed. Hãy kiểm tra tiêu đề/marker trước khi chạy lại; không tạo thêm để tránh trùng.');
      }
    }
    for (let index = 0; index < data.length; index++) {
      const item = data[index];
      let article = existing[index];
      if (article) {
        result.skipped++;
        console.log(`Bỏ qua ${article.code}: giữ nguyên nội dung và trạng thái ${article.status}.`);
      } else {
        article = await articles.create(user, item.title, item.content);
        article = await articles.changeStatus(user, article.id, 'PUBLISHED');
        result.created++;
        console.log(`Đã tạo ${article.code}: ${item.title} (PUBLISHED).`);
      }
      result.articles.push({ id: article.id, code: article.code, title: article.title, status: article.status });
    }
    console.log(`Hoàn tất: tạo ${result.created}, bỏ qua ${result.skipped}.`);
    if (result.articles.some(article => article.status !== 'PUBLISHED')) {
      console.log('Có bài đã tồn tại chưa PUBLISHED; seed giữ nguyên chỉnh sửa. IT/Admin cần kiểm tra và xuất bản bằng workflow nếu phù hợp.');
    }
    return result;
  } finally {
    try { if (locked) await connection.execute('SELECT RELEASE_LOCK(?)', [lockName]); }
    finally { connection.release(); }
  }
}

if (require.main === module) {
  seedKnowledge().catch(error => {
    console.error(error.isSeedError ? error.message : 'Seed thất bại. Kiểm tra MySQL, bảng knowledge_articles và tài khoản IT; dữ liệu có sẵn được giữ nguyên.');
    process.exitCode = 1;
  }).finally(() => pool.end());
}
module.exports = { seedKnowledge };
