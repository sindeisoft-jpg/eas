-- 直接使用 SQL 创建所有表
-- 如果 Prisma migrate 失败，可以使用这个脚本

USE enterprise_ai_bi;

-- Organizations
CREATE TABLE IF NOT EXISTS organizations (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  slug VARCHAR(191) NOT NULL UNIQUE,
  plan VARCHAR(191) NOT NULL DEFAULT 'free',
  settings JSON NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Users
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  email VARCHAR(191) NOT NULL UNIQUE,
  name VARCHAR(191) NOT NULL,
  password_hash VARCHAR(191) NOT NULL,
  avatar VARCHAR(191),
  role VARCHAR(191) NOT NULL DEFAULT 'viewer',
  organization_id VARCHAR(191) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_login_at DATETIME(3),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Database Connections
CREATE TABLE IF NOT EXISTS database_connections (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  type VARCHAR(191) NOT NULL,
  host VARCHAR(191) NOT NULL,
  port INT NOT NULL DEFAULT 3306,
  `database` VARCHAR(191) NOT NULL,
  username VARCHAR(191) NOT NULL,
  password VARCHAR(191) NOT NULL,
  ssl TINYINT NOT NULL DEFAULT 0,
  organization_id VARCHAR(191) NOT NULL,
  created_by VARCHAR(191) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_tested_at DATETIME(3),
  status VARCHAR(191) NOT NULL DEFAULT 'disconnected',
  metadata JSON,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Chat Sessions
CREATE TABLE IF NOT EXISTS chat_sessions (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  title VARCHAR(191) NOT NULL,
  database_connection_id VARCHAR(191) NOT NULL,
  llm_connection_id VARCHAR(191),
  is_pinned TINYINT(1) NOT NULL DEFAULT 0,
  organization_id VARCHAR(191) NOT NULL,
  created_by VARCHAR(191) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  status VARCHAR(191) NOT NULL DEFAULT 'idle',
  current_task_id VARCHAR(191),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (database_connection_id) REFERENCES database_connections(id) ON DELETE CASCADE,
  FOREIGN KEY (llm_connection_id) REFERENCES llm_connections(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Chat Messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  session_id VARCHAR(191) NOT NULL,
  role VARCHAR(191) NOT NULL,
  content TEXT NOT NULL,
  metadata JSON,
  timestamp DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Saved Reports
CREATE TABLE IF NOT EXISTS saved_reports (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  title VARCHAR(191) NOT NULL,
  description TEXT,
  `sql` TEXT NOT NULL,
  database_connection_id VARCHAR(191) NOT NULL,
  chart_config JSON,
  organization_id VARCHAR(191) NOT NULL,
  created_by VARCHAR(191) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_public TINYINT(1) NOT NULL DEFAULT 0,
  tags JSON NOT NULL DEFAULT ('[]'),
  schedule JSON,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (database_connection_id) REFERENCES database_connections(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- LLM Connections
CREATE TABLE IF NOT EXISTS llm_connections (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  provider VARCHAR(191) NOT NULL,
  api_key VARCHAR(191) NOT NULL,
  base_url VARCHAR(191),
  model VARCHAR(191) NOT NULL,
  temperature DOUBLE NOT NULL DEFAULT 0.7,
  max_tokens INT NOT NULL DEFAULT 2000,
  organization_id VARCHAR(191) NOT NULL,
  created_by VARCHAR(191) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  status VARCHAR(191) NOT NULL DEFAULT 'inactive',
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Data Dictionaries
CREATE TABLE IF NOT EXISTS data_dictionaries (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  database_connection_id VARCHAR(191) NOT NULL,
  table_name VARCHAR(191) NOT NULL,
  table_description TEXT NOT NULL,
  business_context TEXT NOT NULL,
  table_alias JSON,
  columns JSON NOT NULL,
  relationships JSON NOT NULL DEFAULT ('[]'),
  sample_queries JSON NOT NULL DEFAULT ('[]'),
  organization_id VARCHAR(191) NOT NULL,
  created_by VARCHAR(191) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY unique_table (database_connection_id, table_name),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (database_connection_id) REFERENCES database_connections(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- SQL Policies
CREATE TABLE IF NOT EXISTS sql_policies (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  organization_id VARCHAR(191) NOT NULL,
  allowed_operations JSON NOT NULL,
  blocked_keywords JSON NOT NULL DEFAULT ('[]'),
  max_execution_time INT NOT NULL DEFAULT 30,
  max_rows_returned INT NOT NULL DEFAULT 10000,
  requires_approval TINYINT(1) NOT NULL DEFAULT 0,
  created_by VARCHAR(191) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Data Permissions
CREATE TABLE IF NOT EXISTS data_permissions (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  description TEXT,
  role VARCHAR(191) NOT NULL,
  database_connection_id VARCHAR(191) NOT NULL,
  table_permissions JSON NOT NULL,
  organization_id VARCHAR(191) NOT NULL,
  created_by VARCHAR(191) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (database_connection_id) REFERENCES database_connections(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  timestamp DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  user_id VARCHAR(191) NOT NULL,
  user_name VARCHAR(191) NOT NULL,
  action VARCHAR(191) NOT NULL,
  resource_type VARCHAR(191),
  resource_id VARCHAR(191),
  details TEXT NOT NULL,
  `sql` TEXT,
  ip_address VARCHAR(191),
  user_agent TEXT,
  status VARCHAR(191) NOT NULL,
  error_message TEXT,
  organization_id VARCHAR(191) NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_org_time (organization_id, timestamp),
  INDEX idx_user_time (user_id, timestamp)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- System Settings
CREATE TABLE IF NOT EXISTS system_settings (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  organization_id VARCHAR(191) NOT NULL UNIQUE,
  query_cache JSON NOT NULL,
  performance JSON NOT NULL,
  security JSON NOT NULL,
  alerts JSON NOT NULL,
  updated_by VARCHAR(191) NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Query Templates
CREATE TABLE IF NOT EXISTS query_templates (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  description TEXT,
  category VARCHAR(191) NOT NULL,
  database_connection_id VARCHAR(191),
  template TEXT NOT NULL,
  parameters JSON NOT NULL DEFAULT ('[]'),
  organization_id VARCHAR(191) NOT NULL,
  is_public TINYINT(1) NOT NULL DEFAULT 0,
  usage_count INT NOT NULL DEFAULT 0,
  created_by VARCHAR(191) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (database_connection_id) REFERENCES database_connections(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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

-- Prompt Configs
CREATE TABLE IF NOT EXISTS prompt_configs (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  category VARCHAR(191) NOT NULL,
  name VARCHAR(191) NOT NULL,
  description TEXT,
  content TEXT NOT NULL,
  variables JSON NOT NULL DEFAULT ('[]'),
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by VARCHAR(191),
  UNIQUE KEY unique_category_name (category, name)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Prompt Configs
CREATE TABLE IF NOT EXISTS prompt_configs (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  category VARCHAR(191) NOT NULL,
  name VARCHAR(191) NOT NULL,
  description TEXT,
  content TEXT NOT NULL,
  variables JSON NOT NULL DEFAULT ('[]'),
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by VARCHAR(191),
  UNIQUE KEY unique_category_name (category, name)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;



USE enterprise_ai_bi;

-- Organizations
CREATE TABLE IF NOT EXISTS organizations (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  slug VARCHAR(191) NOT NULL UNIQUE,
  plan VARCHAR(191) NOT NULL DEFAULT 'free',
  settings JSON NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Users
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  email VARCHAR(191) NOT NULL UNIQUE,
  name VARCHAR(191) NOT NULL,
  password_hash VARCHAR(191) NOT NULL,
  avatar VARCHAR(191),
  role VARCHAR(191) NOT NULL DEFAULT 'viewer',
  organization_id VARCHAR(191) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_login_at DATETIME(3),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Database Connections
CREATE TABLE IF NOT EXISTS database_connections (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  type VARCHAR(191) NOT NULL,
  host VARCHAR(191) NOT NULL,
  port INT NOT NULL DEFAULT 3306,
  `database` VARCHAR(191) NOT NULL,
  username VARCHAR(191) NOT NULL,
  password VARCHAR(191) NOT NULL,
  ssl TINYINT NOT NULL DEFAULT 0,
  organization_id VARCHAR(191) NOT NULL,
  created_by VARCHAR(191) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_tested_at DATETIME(3),
  status VARCHAR(191) NOT NULL DEFAULT 'disconnected',
  metadata JSON,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Chat Sessions
CREATE TABLE IF NOT EXISTS chat_sessions (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  title VARCHAR(191) NOT NULL,
  database_connection_id VARCHAR(191) NOT NULL,
  llm_connection_id VARCHAR(191),
  is_pinned TINYINT(1) NOT NULL DEFAULT 0,
  organization_id VARCHAR(191) NOT NULL,
  created_by VARCHAR(191) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  status VARCHAR(191) NOT NULL DEFAULT 'idle',
  current_task_id VARCHAR(191),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (database_connection_id) REFERENCES database_connections(id) ON DELETE CASCADE,
  FOREIGN KEY (llm_connection_id) REFERENCES llm_connections(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Chat Messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  session_id VARCHAR(191) NOT NULL,
  role VARCHAR(191) NOT NULL,
  content TEXT NOT NULL,
  metadata JSON,
  timestamp DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Saved Reports
CREATE TABLE IF NOT EXISTS saved_reports (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  title VARCHAR(191) NOT NULL,
  description TEXT,
  `sql` TEXT NOT NULL,
  database_connection_id VARCHAR(191) NOT NULL,
  chart_config JSON,
  organization_id VARCHAR(191) NOT NULL,
  created_by VARCHAR(191) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_public TINYINT(1) NOT NULL DEFAULT 0,
  tags JSON NOT NULL DEFAULT ('[]'),
  schedule JSON,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (database_connection_id) REFERENCES database_connections(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- LLM Connections
CREATE TABLE IF NOT EXISTS llm_connections (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  provider VARCHAR(191) NOT NULL,
  api_key VARCHAR(191) NOT NULL,
  base_url VARCHAR(191),
  model VARCHAR(191) NOT NULL,
  temperature DOUBLE NOT NULL DEFAULT 0.7,
  max_tokens INT NOT NULL DEFAULT 2000,
  organization_id VARCHAR(191) NOT NULL,
  created_by VARCHAR(191) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  status VARCHAR(191) NOT NULL DEFAULT 'inactive',
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Data Dictionaries
CREATE TABLE IF NOT EXISTS data_dictionaries (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  database_connection_id VARCHAR(191) NOT NULL,
  table_name VARCHAR(191) NOT NULL,
  table_description TEXT NOT NULL,
  business_context TEXT NOT NULL,
  table_alias JSON,
  columns JSON NOT NULL,
  relationships JSON NOT NULL DEFAULT ('[]'),
  sample_queries JSON NOT NULL DEFAULT ('[]'),
  organization_id VARCHAR(191) NOT NULL,
  created_by VARCHAR(191) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY unique_table (database_connection_id, table_name),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (database_connection_id) REFERENCES database_connections(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- SQL Policies
CREATE TABLE IF NOT EXISTS sql_policies (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  organization_id VARCHAR(191) NOT NULL,
  allowed_operations JSON NOT NULL,
  blocked_keywords JSON NOT NULL DEFAULT ('[]'),
  max_execution_time INT NOT NULL DEFAULT 30,
  max_rows_returned INT NOT NULL DEFAULT 10000,
  requires_approval TINYINT(1) NOT NULL DEFAULT 0,
  created_by VARCHAR(191) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Data Permissions
CREATE TABLE IF NOT EXISTS data_permissions (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  description TEXT,
  role VARCHAR(191) NOT NULL,
  database_connection_id VARCHAR(191) NOT NULL,
  table_permissions JSON NOT NULL,
  organization_id VARCHAR(191) NOT NULL,
  created_by VARCHAR(191) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (database_connection_id) REFERENCES database_connections(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  timestamp DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  user_id VARCHAR(191) NOT NULL,
  user_name VARCHAR(191) NOT NULL,
  action VARCHAR(191) NOT NULL,
  resource_type VARCHAR(191),
  resource_id VARCHAR(191),
  details TEXT NOT NULL,
  `sql` TEXT,
  ip_address VARCHAR(191),
  user_agent TEXT,
  status VARCHAR(191) NOT NULL,
  error_message TEXT,
  organization_id VARCHAR(191) NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_org_time (organization_id, timestamp),
  INDEX idx_user_time (user_id, timestamp)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- System Settings
CREATE TABLE IF NOT EXISTS system_settings (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  organization_id VARCHAR(191) NOT NULL UNIQUE,
  query_cache JSON NOT NULL,
  performance JSON NOT NULL,
  security JSON NOT NULL,
  alerts JSON NOT NULL,
  updated_by VARCHAR(191) NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Query Templates
CREATE TABLE IF NOT EXISTS query_templates (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  description TEXT,
  category VARCHAR(191) NOT NULL,
  database_connection_id VARCHAR(191),
  template TEXT NOT NULL,
  parameters JSON NOT NULL DEFAULT ('[]'),
  organization_id VARCHAR(191) NOT NULL,
  is_public TINYINT(1) NOT NULL DEFAULT 0,
  usage_count INT NOT NULL DEFAULT 0,
  created_by VARCHAR(191) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (database_connection_id) REFERENCES database_connections(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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

-- Prompt Configs
CREATE TABLE IF NOT EXISTS prompt_configs (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  category VARCHAR(191) NOT NULL,
  name VARCHAR(191) NOT NULL,
  description TEXT,
  content TEXT NOT NULL,
  variables JSON NOT NULL DEFAULT ('[]'),
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by VARCHAR(191),
  UNIQUE KEY unique_category_name (category, name)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
