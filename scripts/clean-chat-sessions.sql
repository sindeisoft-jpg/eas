-- 清理所有聊天记录
-- 注意：先删除子表（chat_messages），再删除父表（chat_sessions）

-- 1. 删除所有聊天消息
DELETE FROM chat_messages;

-- 2. 删除所有聊天会话
DELETE FROM chat_sessions;

-- 验证删除结果
SELECT COUNT(*) as remaining_sessions FROM chat_sessions;
SELECT COUNT(*) as remaining_messages FROM chat_messages;
