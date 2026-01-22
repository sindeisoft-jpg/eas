-- 添加聊天会话的缺失字段
-- 如果字段已存在，会报错但不会影响其他操作

-- 添加 llm_connection_id 字段
ALTER TABLE chat_sessions 
ADD COLUMN IF NOT EXISTS llm_connection_id VARCHAR(191) NULL;

-- 添加 is_pinned 字段
ALTER TABLE chat_sessions 
ADD COLUMN IF NOT EXISTS is_pinned TINYINT(1) DEFAULT 0;

-- 添加外键约束（如果还没有）
-- 注意：MySQL/MariaDB 不支持 IF NOT EXISTS，需要手动检查
-- ALTER TABLE chat_sessions 
-- ADD CONSTRAINT chat_sessions_llm_connection_id_fkey 
-- FOREIGN KEY (llm_connection_id) REFERENCES llm_connections(id) ON DELETE SET NULL;

-- 验证字段是否添加成功
DESCRIBE chat_sessions;
