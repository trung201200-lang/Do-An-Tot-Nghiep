-- Giai đoạn 3: chạy file này trong MySQL Workbench.
-- Giữ nguyên bảng users và dữ liệu hiện có.
USE it_support_rag;

CREATE TABLE IF NOT EXISTS tickets (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  priority ENUM('LOW', 'MEDIUM', 'HIGH') NOT NULL DEFAULT 'LOW',
  status ENUM('NEW', 'RECEIVED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED') NOT NULL DEFAULT 'NEW',
  created_by INT NOT NULL,
  assigned_to INT NULL DEFAULT NULL,
  solution TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_tickets_code (code),
  KEY idx_tickets_created_by (created_by),
  KEY idx_tickets_assigned_to (assigned_to),
  CONSTRAINT fk_tickets_creator FOREIGN KEY (created_by)
    REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_tickets_assignee FOREIGN KEY (assigned_to)
    REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ticket_history (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT NOT NULL,
  actor_id INT NOT NULL,
  old_status ENUM('NEW', 'RECEIVED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED') NULL DEFAULT NULL,
  new_status ENUM('NEW', 'RECEIVED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED') NOT NULL,
  note TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  KEY idx_ticket_history_ticket_id (ticket_id),
  KEY idx_ticket_history_actor_id (actor_id),
  CONSTRAINT fk_ticket_history_ticket FOREIGN KEY (ticket_id)
    REFERENCES tickets (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_ticket_history_actor FOREIGN KEY (actor_id)
    REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backend sẽ kiểm tra workflow, quyền truy cập và solution trước khi RESOLVED.
-- Thao tác ghi Ticket và lịch sử sẽ được thực hiện trong cùng transaction.
