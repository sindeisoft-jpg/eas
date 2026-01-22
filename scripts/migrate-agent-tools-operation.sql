-- 迁移脚本：为agents表中的tools JSON字段添加operation字段
-- 如果tools中的config没有operation字段，则添加默认值"SELECT"
-- 
-- 使用方法：
-- mysql -u username -p database_name < migrate-agent-tools-operation.sql

USE enterprise_ai_bi;

-- 方法1：使用临时表更新（推荐，更安全）
-- 创建临时表存储更新后的tools
CREATE TEMPORARY TABLE IF NOT EXISTS temp_agent_tools AS
SELECT 
  a.id,
  JSON_ARRAYAGG(
    CASE 
      -- 如果config.operation不存在或为null，添加默认值"SELECT"
      WHEN JSON_EXTRACT(tool.value, '$.config.operation') IS NULL 
        OR JSON_EXTRACT(tool.value, '$.config.operation') = 'null'
        OR JSON_EXTRACT(tool.value, '$.config.operation') = ''
      THEN JSON_SET(
        tool.value,
        '$.config.operation',
        '"SELECT"'
      )
      -- 如果已存在，保持不变
      ELSE tool.value
    END
  ) as new_tools
FROM agents a
CROSS JOIN JSON_TABLE(
  a.tools,
  '$[*]' COLUMNS (
    tool JSON PATH '$'
  )
) as tool
WHERE JSON_LENGTH(a.tools) > 0
GROUP BY a.id;

-- 更新agents表
UPDATE agents a
INNER JOIN temp_agent_tools t ON a.id = t.id
SET a.tools = t.new_tools;

-- 删除临时表
DROP TEMPORARY TABLE IF EXISTS temp_agent_tools;

-- 验证更新结果
SELECT 
  id,
  name,
  JSON_LENGTH(tools) as tool_count,
  JSON_EXTRACT(tools, '$[*].config.operation') as operations
FROM agents
WHERE JSON_LENGTH(tools) > 0
LIMIT 10;
