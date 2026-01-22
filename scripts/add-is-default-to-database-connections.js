#!/usr/bin/env node

/**
 * 添加 is_default 字段到 database_connections 表
 * 这个脚本直接执行 SQL，绕过 Prisma 迁移以避免 MariaDB 系统表问题
 */

const mysql = require('mysql2/promise')
const fs = require('fs')
const path = require('path')

async function main() {
  console.log('🚀 开始添加 is_default 字段到 database_connections 表...\n')

  // 读取 .env 文件
  const envPath = path.join(process.cwd(), '.env')
  if (!fs.existsSync(envPath)) {
    console.error('❌ 未找到 .env 文件')
    process.exit(1)
  }

  const envContent = fs.readFileSync(envPath, 'utf-8')
  const dbUrlMatch = envContent.match(/DATABASE_URL\s*=\s*"mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^"?\s]+)/)
  
  if (!dbUrlMatch) {
    console.error('❌ 无法解析 DATABASE_URL，请检查 .env 文件')
    process.exit(1)
  }

  const [, dbUser, dbPass, dbHost, dbPort, dbNameRaw] = dbUrlMatch
  const dbName = dbNameRaw.trim().replace(/["\n\r]/g, '')

  console.log('📊 数据库配置:')
  console.log(`   主机: ${dbHost}`)
  console.log(`   端口: ${dbPort}`)
  console.log(`   用户: ${dbUser}`)
  console.log(`   数据库: ${dbName}\n`)

  let connection
  try {
    // 连接到数据库
    connection = await mysql.createConnection({
      host: dbHost,
      port: parseInt(dbPort),
      user: dbUser,
      password: dbPass,
      database: dbName,
    })

    console.log('✅ 数据库连接成功\n')

    // 检查字段是否已存在
    const [columns] = await connection.execute(
      `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'database_connections' AND COLUMN_NAME = 'is_default'`,
      [dbName]
    )

    if (columns[0].count > 0) {
      console.log('ℹ️  字段 is_default 已存在，跳过添加')
    } else {
      // 添加字段
      console.log('📝 正在添加 is_default 字段...')
      await connection.execute(
        `ALTER TABLE database_connections 
         ADD COLUMN is_default TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否为默认数据库连接'`
      )
      console.log('✅ 字段 is_default 添加成功')
    }

    await connection.end()
    console.log('\n✅ 完成！')
  } catch (error) {
    console.error('❌ 错误:', error.message)
    if (connection) {
      await connection.end()
    }
    process.exit(1)
  }
}

main()
