const { randomBytes } = require('node:crypto');
const pool = require('../config/db');

const selectTicket = `SELECT t.*, creator.name AS creator_name, assignee.name AS assignee_name
  FROM tickets t JOIN users creator ON creator.id = t.created_by
  LEFT JOIN users assignee ON assignee.id = t.assigned_to`;

function businessError(status, message) {
  return Object.assign(new Error(message), { status, isTicketError: true });
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

async function recordHistory(connection, id, actorId, oldStatus, newStatus, note) {
  await connection.execute(
    'INSERT INTO ticket_history (ticket_id, actor_id, old_status, new_status, note) VALUES (?, ?, ?, ?, ?)',
    [id, actorId, oldStatus, newStatus, note],
  );
}

async function create(user, title, description) {
  return transaction(async (connection) => {
    // Mã tạm chỉ tồn tại trong transaction; mã chính dùng ID tự tăng, không dùng MAX(id).
    const temporaryCode = `TMP-${randomBytes(12).toString('hex')}`;
    const [result] = await connection.execute(
      'INSERT INTO tickets (code, title, description, created_by) VALUES (?, ?, ?, ?)',
      [temporaryCode, title, description, user.id],
    );
    const code = `TKT-${String(result.insertId).padStart(6, '0')}`;
    await connection.execute('UPDATE tickets SET code = ? WHERE id = ?', [code, result.insertId]);
    await recordHistory(connection, result.insertId, user.id, null, 'NEW', 'Ticket được tạo');
    const [[ticket]] = await connection.execute(selectTicket + ' WHERE t.id = ?', [result.insertId]);
    return ticket;
  });
}

async function list(user) {
  const query = user.role === 'EMPLOYEE' ? ' WHERE t.created_by = ?' : '';
  const [rows] = await pool.execute(selectTicket + query + ' ORDER BY t.created_at DESC, t.id DESC', user.role === 'EMPLOYEE' ? [user.id] : []);
  return rows;
}

async function detail(user, id) {
  // Cùng một snapshot để trạng thái và lịch sử nhất quán khi đang có cập nhật.
  return transaction(async (connection) => {
    const [[ticket]] = await connection.execute(selectTicket + ' WHERE t.id = ?', [id]);
    if (!ticket) throw businessError(404, 'Không tìm thấy Ticket.');
    if (user.role === 'EMPLOYEE' && ticket.created_by !== user.id) {
      throw businessError(403, 'Bạn không có quyền xem Ticket này.');
    }
    const [history] = await connection.execute(
      `SELECT h.id, h.ticket_id, h.actor_id, u.name AS actor_name, h.old_status, h.new_status, h.note, h.created_at
       FROM ticket_history h JOIN users u ON u.id = h.actor_id
       WHERE h.ticket_id = ? ORDER BY h.created_at ASC, h.id ASC`, [id],
    );
    return { ...ticket, history };
  });
}

async function change(user, id, action, value) {
  return transaction(async (connection) => {
    // Khóa dòng ngăn hai IT cùng tiếp nhận hoặc ghi trùng lịch sử.
    const [[ticket]] = await connection.execute('SELECT * FROM tickets WHERE id = ? FOR UPDATE', [id]);
    if (!ticket) throw businessError(404, 'Không tìm thấy Ticket.');
    if (action === 'accept') {
      if (ticket.status !== 'NEW') throw businessError(409, 'Chỉ được tiếp nhận Ticket đang ở trạng thái Mới.');
      await connection.execute('UPDATE tickets SET assigned_to = ?, status = ? WHERE id = ?', [user.id, 'RECEIVED', id]);
      await recordHistory(connection, id, user.id, ticket.status, 'RECEIVED', 'Đã tiếp nhận Ticket');
    } else {
      if (user.role === 'IT' && ticket.assigned_to !== null && ticket.assigned_to !== user.id) {
        throw businessError(403, 'Ticket đã được giao cho nhân viên IT khác.');
      }
      if (ticket.status === 'CLOSED') throw businessError(409, 'Ticket đã đóng, chỉ được xem.');
      if (action === 'priority') {
        await connection.execute('UPDATE tickets SET priority = ? WHERE id = ?', [value.priority, id]);
      } else {
        const transitions = { RECEIVED: ['IN_PROGRESS'], IN_PROGRESS: ['RESOLVED'], RESOLVED: ['CLOSED', 'IN_PROGRESS'] };
        if (!transitions[ticket.status]?.includes(value.status)) {
          throw businessError(409, 'Chuyển trạng thái không hợp lệ. Ticket mới phải được tiếp nhận trước.');
        }
        if (user.role === 'IT' && ticket.assigned_to !== user.id) {
          throw businessError(403, 'Bạn phải là nhân viên đã tiếp nhận Ticket này.');
        }
        // Khi giải quyết lại phải gửi giải pháp mới; giữ giải pháp cũ để tham khảo lúc mở lại.
        const solution = value.status === 'RESOLVED' ? value.solution : ticket.solution;
        await connection.execute('UPDATE tickets SET status = ?, solution = ? WHERE id = ?', [value.status, solution, id]);
        await recordHistory(connection, id, user.id, ticket.status, value.status, 'Cập nhật trạng thái Ticket');
      }
    }
    const [[updated]] = await connection.execute(selectTicket + ' WHERE t.id = ?', [id]);
    return updated;
  });
}

module.exports = { create, list, detail, change };
