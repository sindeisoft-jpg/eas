-- 为agents表中的tools JSON字段添加operation字段
-- 如果tools中的config没有operation字段，则添加默认值"SELECT"

USE enterprise_ai_bi;

-- 更新所有agents的tools，为每个tool的config添加operation字段（如果不存在）
UPDATE agents
SET tools = JSON_ARRAY(
  JSON_OBJECT(
    'id', JSON_EXTRACT(tool.value, '$.id'),
    'type', JSON_EXTRACT(tool.value, '$.type'),
    'name', JSON_EXTRACT(tool.value, '$.name'),
    'description', JSON_EXTRACT(tool.value, '$.description'),
    'enabled', JSON_EXTRACT(tool.value, '$.enabled'),
    'config', JSON_OBJECT(
      'sql', JSON_EXTRACT(tool.value, '$.config.sql'),
      'operation', IF(
        JSON_EXTRACT(tool.value, '$.config.operation') IS NOT NULL 
        AND JSON_EXTRACT(tool.value, '$.config.operation') != 'null',
        JSON_EXTRACT(tool.value, '$.config.operation'),
        '"SELECT"'
      )
    )
  )
)
FROM (
  SELECT 
    id,
    JSON_ARRAYAGG(tool) as tools_array
  FROM agents,
  JSON_TABLE(
    tools,
    '$[*]' COLUMNS (
      tool JSON PATH '$'
    )
  ) as tool
  GROUP BY id
) as agent_tools
WHERE agents.id = agent_tools.id;

-- 更简单的方法：使用JSON_SET直接更新
-- 对于每个agent，遍历其tools数组，为每个tool的config添加operation字段
UPDATE agents
SET tools = (
  SELECT JSON_ARRAYAGG(
    CASE 
      WHEN JSON_EXTRACT(tool.value, '$.config.operation') IS NULL 
        OR JSON_EXTRACT(tool.value, '$.config.operation') = 'null'
      THEN JSON_SET(
        tool.value,
        '$.config.operation',
        'SELECT'
      )
      ELSE tool.value
    END
  )
  FROM JSON_TABLE(
    agents.tools,
    '$[*]' COLUMNS (
      tool JSON PATH '$'
    )
  ) as tool
)
WHERE JSON_LENGTH(tools) > 0;

-- 更安全的方法：使用存储过程或应用层处理
-- 这里提供一个SQL脚本，但建议在应用层处理更安全

-- 检查是否有tools缺少operation字段
SELECT 
  id,
  name,
  JSON_LENGTH(tools) as tool_count,
  JSON_EXTRACT(tools, '$[*].config.operation') as operations
FROM agents
WHERE JSON_LENGTH(tools) > 0
  AND (
    -- 检查是否有tool的config中没有operation字段
    JSON_SEARCH(tools, 'one', NULL, NULL, '$[*].config.operation') IS NULL
    OR JSON_CONTAINS_PATH(tools, 'one', '$[*].config.operation') = 0
  );
