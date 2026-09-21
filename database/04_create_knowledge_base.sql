-- Giai đoạn 4.1: chạy file này trong MySQL Workbench.
USE it_support_rag;

CREATE TABLE IF NOT EXISTS knowledge_articles (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  status ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  created_by INT NOT NULL,
  updated_by INT NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_knowledge_articles_code (code),
  KEY idx_knowledge_articles_created_by (created_by),
  KEY idx_knowledge_articles_updated_by (updated_by),
  CONSTRAINT fk_knowledge_articles_creator FOREIGN KEY (created_by)
    REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_knowledge_articles_updater FOREIGN KEY (updated_by)
    REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
