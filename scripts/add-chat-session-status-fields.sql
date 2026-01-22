-- 添加对话会话状态字段
-- 用于支持后台任务处理和持久化

ALTER TABLE chat_sessions 
ADD COLUMN IF NOT EXISTS status VARCHAR(191) NOT NULL DEFAULT 'idle' COMMENT '会话状态: idle, processing, completed, error',
ADD COLUMN IF NOT EXISTS current_task_id VARCHAR(191) NULL COMMENT '当前正在处理的任务ID';

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_chat_sessions_status ON chat_sessions(status);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_current_task_id ON chat_sessions(current_task_id);
