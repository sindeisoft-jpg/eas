-- 创建智能体表 (Agents)
-- 如果 Prisma migrate 失败，可以直接运行这个 SQL 脚本

USE enterprise_ai_bi;

-- Agents
CREATE TABLE IF NOT EXISTS agents (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  description TEXT,
  system_message TEXT NOT NULL,
  llm_connection_id VARCHAR(191) NOT NULL,
  database_connection_id VARCHAR(191),
  tools JSON NOT NULL DEFAULT ('[]'),
  memory JSON NOT NULL DEFAULT ('{}'),
  workflow JSON NOT NULL DEFAULT ('{}'),
  execution JSON NOT NULL DEFAULT ('{}'),
  organization_id VARCHAR(191) NOT NULL,
  created_by VARCHAR(191) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  status VARCHAR(191) NOT NULL DEFAULT 'inactive',
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (llm_connection_id) REFERENCES llm_connections(id) ON DELETE CASCADE,
  FOREIGN KEY (database_connection_id) REFERENCES database_connections(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
