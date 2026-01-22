#!/usr/bin/env node

/**
 * 创建 agents 表
 */

const mysql = require('mysql2/promise')
const fs = require('fs')
const path = require('path')

async function main() {
  console.log('🚀 开始创建 agents 表...\n')

  // 读取 .env 文件
  const envPath = path.join(process.cwd(), '.env')
  if (!fs.existsSync(envPath)) {
    console.error('❌ .env 文件不存在')
    process.exit(1)
  }

  const envContent = fs.readFileSync(envPath, 'utf-8')
  const dbUrlMatch = envContent.match(/DATABASE_URL\s*=\s*"mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^"?\s]+)/)
  
  if (!dbUrlMatch) {
    console.error('❌ 无法解析 DATABASE_URL')
    process.exit(1)
  }

  const [, dbUser, dbPass, dbHost, dbPort, dbNameRaw] = dbUrlMatch
  const dbName = dbNameRaw.trim().replace(/["\n\r]/g, '')

  console.log(`📊 连接到数据库: ${dbName}\n`)

  try {
    const connection = await mysql.createConnection({
      host: dbHost,
      port: parseInt(dbPort),
      user: dbUser,
      password: dbPass,
      database: dbName,
    })

    console.log('✅ 数据库连接成功\n')

    // 读取 SQL 文件
    const sqlPath = path.join(process.cwd(), 'scripts', 'create-agents-table.sql')
    if (!fs.existsSync(sqlPath)) {
      console.error(`❌ SQL 文件不存在: ${sqlPath}`)
      process.exit(1)
    }

    const sqlContent = fs.readFileSync(sqlPath, 'utf-8')
    
    // 移除注释和 USE 语句
    let cleanSql = sqlContent
      .replace(/--.*$/gm, '') // 移除单行注释
      .replace(/\/\*[\s\S]*?\*\//g, '') // 移除多行注释
      .replace(/^USE\s+[^;]+;?\s*$/gmi, '') // 移除 USE 语句
    
    // 按分号分割 SQL 语句
    const statements = cleanSql
      .split(';')
      .map(s => s.trim())
      .filter(s => {
        const upper = s.toUpperCase().trim()
        return s.length > 0 && upper.startsWith('CREATE')
      })

    console.log(`📝 执行 SQL 语句...\n`)

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i]
      if (statement.trim()) {
        try {
          // 添加分号并执行
          const sql = statement.endsWith(';') ? statement : statement + ';'
          await connection.execute(sql)
          const tableMatch = statement.match(/CREATE TABLE.*?IF NOT EXISTS.*?`?(\w+)`?/i) || 
                           statement.match(/CREATE TABLE.*?`?(\w+)`?/i)
          if (tableMatch) {
            console.log(`   ✅ 表 ${tableMatch[1]} 创建成功`)
          }
        } catch (error) {
          // 如果表已存在，忽略错误
          if (error.message.includes('already exists') || error.code === 'ER_TABLE_EXISTS_ERROR') {
            const tableMatch = statement.match(/CREATE TABLE.*?IF NOT EXISTS.*?`?(\w+)`?/i) || 
                             statement.match(/CREATE TABLE.*?`?(\w+)`?/i)
            if (tableMatch) {
              console.log(`   ⚠️  表 ${tableMatch[1]} 已存在，跳过`)
            }
          } else {
            console.error(`   ❌ 错误: ${error.message}`)
            throw error
          }
        }
      }
    }

    await connection.end()
    console.log('\n✅ agents 表创建完成！\n')
  } catch (error) {
    console.error('❌ 创建表失败:', error.message)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('❌ 执行失败:', error)
  process.exit(1)
})
