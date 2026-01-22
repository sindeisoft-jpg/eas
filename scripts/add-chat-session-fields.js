#!/usr/bin/env node

/**
 * 添加聊天会话的缺失字段
 * 使用方法: node scripts/add-chat-session-fields.js
 */

const mysql = require('mysql2/promise')

async function addFields() {
  let connection
  try {
    // 解析 DATABASE_URL 或使用默认值
    let databaseUrl = process.env.DATABASE_URL
    
    // 如果没有环境变量，使用默认值
    if (!databaseUrl) {
      databaseUrl = 'mysql://root:root@127.0.0.1:3306/enterprise_ai_bi'
      console.log('使用默认数据库连接信息')
    }

    // 解析连接信息
    const urlMatch = databaseUrl.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/)
    if (!urlMatch) {
      console.error('错误: 无法解析 DATABASE_URL')
      process.exit(1)
    }

    const [, username, password, host, port, database] = urlMatch

    connection = await mysql.createConnection({
      host,
      port: parseInt(port),
      user: username,
      password,
      database,
    })

    console.log('开始添加字段...')

    // 检查并添加 llm_connection_id 字段
    try {
      const [rows] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = ? 
        AND TABLE_NAME = 'chat_sessions' 
        AND COLUMN_NAME = 'llm_connection_id'
      `, [database])

      if (rows.length === 0) {
        console.log('添加 llm_connection_id 字段...')
        await connection.execute(`
          ALTER TABLE chat_sessions 
          ADD COLUMN llm_connection_id VARCHAR(191) NULL
        `)
        console.log('✅ llm_connection_id 字段已添加')
      } else {
        console.log('ℹ️  llm_connection_id 字段已存在')
      }
    } catch (error) {
      console.error('添加 llm_connection_id 字段失败:', error.message)
    }

    // 检查并添加 is_pinned 字段
    try {
      const [rows] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = ? 
        AND TABLE_NAME = 'chat_sessions' 
        AND COLUMN_NAME = 'is_pinned'
      `, [database])

      if (rows.length === 0) {
        console.log('添加 is_pinned 字段...')
        await connection.execute(`
          ALTER TABLE chat_sessions 
          ADD COLUMN is_pinned TINYINT(1) DEFAULT 0
        `)
        console.log('✅ is_pinned 字段已添加')
      } else {
        console.log('ℹ️  is_pinned 字段已存在')
      }
    } catch (error) {
      console.error('添加 is_pinned 字段失败:', error.message)
    }

    // 检查并添加外键约束
    try {
      const [rows] = await connection.execute(`
        SELECT CONSTRAINT_NAME 
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
        WHERE TABLE_SCHEMA = ? 
        AND TABLE_NAME = 'chat_sessions' 
        AND COLUMN_NAME = 'llm_connection_id'
        AND REFERENCED_TABLE_NAME IS NOT NULL
      `, [database])

      if (rows.length === 0) {
        console.log('添加外键约束...')
        await connection.execute(`
          ALTER TABLE chat_sessions 
          ADD CONSTRAINT chat_sessions_llm_connection_id_fkey 
          FOREIGN KEY (llm_connection_id) REFERENCES llm_connections(id) ON DELETE SET NULL
        `)
        console.log('✅ 外键约束已添加')
      } else {
        console.log('ℹ️  外键约束已存在')
      }
    } catch (error) {
      console.warn('添加外键约束失败（可能已存在）:', error.message)
    }

    console.log('\n✅ 所有字段添加完成！')
  } catch (error) {
    console.error('执行失败:', error)
    process.exit(1)
  } finally {
    if (connection) {
      await connection.end()
    }
  }
}

addFields()
