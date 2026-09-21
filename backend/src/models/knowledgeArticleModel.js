const { randomBytes } = require('node:crypto');
const pool = require('../config/db');

// Chỉ lấy thông tin người dùng cần hiển thị, không lấy password.
const selectArticle = `SELECT a.*, creator.name AS creator_name, updater.name AS updater_name
  FROM knowledge_articles a JOIN users creator ON creator.id = a.created_by
  LEFT JOIN users updater ON updater.id = a.updated_by`;

function articleError(status, message) {
  return Object.assign(new Error(message), { status, isKnowledgeError: true });
}

async function transaction(work) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function create(user, title, content) {
  return transaction(async connection => {
    // Mã tạm chỉ tồn tại trong transaction; ID tự tăng tránh tranh chấp MAX(id).
    const temporaryCode = `TMP-${randomBytes(12).toString('hex')}`;
    const [result] = await connection.execute(
      'INSERT INTO knowledge_articles (code, title, content, status, created_by) VALUES (?, ?, ?, ?, ?)',
      [temporaryCode, title, content, 'DRAFT', user.id],
    );
    const code = `KB-${String(result.insertId).padStart(6, '0')}`;
    await connection.execute('UPDATE knowledge_articles SET code = ? WHERE id = ?', [code, result.insertId]);
    const [[article]] = await connection.execute(selectArticle + ' WHERE a.id = ?', [result.insertId]);
    return article;
  });
}

async function list(user) {
  const filter = user.role === 'EMPLOYEE' ? ' WHERE a.status = ?' : '';
  const [articles] = await pool.execute(selectArticle + filter + ' ORDER BY a.created_at DESC, a.id DESC', user.role === 'EMPLOYEE' ? ['PUBLISHED'] : []);
  return articles;
}

async function findById(user, id) {
  const [[article]] = await pool.execute(selectArticle + ' WHERE a.id = ?', [id]);
  if (!article) throw articleError(404, 'Không tìm thấy bài viết.');
  if (user.role === 'EMPLOYEE' && article.status !== 'PUBLISHED') {
    throw articleError(403, 'Bạn chỉ được xem bài viết đã xuất bản.');
  }
  return article;
}

async function update(user, id, title, content) {
  return transaction(async connection => {
    const [[existing]] = await connection.execute('SELECT id FROM knowledge_articles WHERE id = ? FOR UPDATE', [id]);
    if (!existing) throw articleError(404, 'Không tìm thấy bài viết.');
    await connection.execute('UPDATE knowledge_articles SET title = ?, content = ?, updated_by = ? WHERE id = ?', [title, content, user.id, id]);
    const [[article]] = await connection.execute(selectArticle + ' WHERE a.id = ?', [id]);
    return article;
  });
}

async function changeStatus(user, id, status) {
  return transaction(async connection => {
    const [[existing]] = await connection.execute('SELECT status FROM knowledge_articles WHERE id = ? FOR UPDATE', [id]);
    if (!existing) throw articleError(404, 'Không tìm thấy bài viết.');
    const transitions = { DRAFT: 'PUBLISHED', PUBLISHED: 'ARCHIVED', ARCHIVED: 'DRAFT' };
    if (transitions[existing.status] !== status) {
      throw articleError(400, 'Chỉ cho phép DRAFT → PUBLISHED, PUBLISHED → ARCHIVED hoặc ARCHIVED → DRAFT.');
    }
    await connection.execute('UPDATE knowledge_articles SET status = ?, updated_by = ? WHERE id = ?', [status, user.id, id]);
    const [[article]] = await connection.execute(selectArticle + ' WHERE a.id = ?', [id]);
    return article;
  });
}

module.exports = { create, list, findById, update, changeStatus };
