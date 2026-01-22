-- 添加 is_default 字段到 database_connections 表
-- 用于设置默认数据库连接

-- 检查字段是否已存在，如果不存在则添加
SET @dbname = DATABASE();
SET @tablename = "database_connections";
SET @columnname = "is_default";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (TABLE_SCHEMA = @dbname)
      AND (TABLE_NAME = @tablename)
      AND (COLUMN_NAME = @columnname)
  ) > 0,
  "SELECT 'Column is_default already exists in database_connections.' AS result;",
  CONCAT("ALTER TABLE ", @tablename, " ADD COLUMN ", @columnname, " TINYINT(1) NOT NULL DEFAULT 0;")
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- 添加注释
ALTER TABLE database_connections MODIFY COLUMN is_default TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否为默认数据库连接';

SELECT 'Successfully added is_default column to database_connections table.' AS result;
