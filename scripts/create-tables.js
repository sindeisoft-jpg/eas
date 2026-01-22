#!/usr/bin/env node

/**
 * 直接使用 SQL 创建所有表
 * 用于绕过 Prisma migrate 的兼容性问题
 */

const mysql = require('mysql2/promise')
const fs = require('fs')
const path = require('path')

async function main() {
  console.log('🚀 开始创建数据库表...\n')

  // 读取 .env 文件
  const envPath = path.join(process.cwd(), '.env')
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

    // 读取 SQL 文件（优先使用 Prisma 生成的 SQL）
    let sqlPath = path.join(process.cwd(), 'scripts', 'prisma-generated-fixed.sql')
    if (!fs.existsSync(sqlPath)) {
      sqlPath = path.join(process.cwd(), 'scripts', 'create-tables.sql')
    }
    const sqlContent = fs.readFileSync(sqlPath, 'utf-8')
    
    // 移除注释和 USE 语句，然后按分号分割
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

    console.log(`📝 执行 ${statements.length} 个 SQL 语句...\n`)

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
            console.log(`   ✅ ${tableMatch[1]}`)
          }
        } catch (error) {
          // 如果表已存在，忽略错误
          if (error.message.includes('already exists') || error.code === 'ER_TABLE_EXISTS_ERROR') {
            const tableMatch = statement.match(/CREATE TABLE.*?IF NOT EXISTS.*?`?(\w+)`?/i) || 
                             statement.match(/CREATE TABLE.*?`?(\w+)`?/i)
            if (tableMatch) {
              console.log(`   ⚠️  ${tableMatch[1]} (已存在)`)
            }
          } else {
            console.error(`   ❌ 错误: ${error.message}`)
            // 打印前100个字符的 SQL 以便调试
            const preview = statement.substring(0, 100).replace(/\n/g, ' ')
            console.error(`   SQL 预览: ${preview}...`)
          }
        }
      }
    }

    await connection.end()
    console.log('\n✅ 所有表创建完成！\n')
  } catch (error) {
    console.error('❌ 创建表失败:', error.message)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('❌ 执行失败:', error)
  process.exit(1)
})


/**
 * 直接使用 SQL 创建所有表
 * 用于绕过 Prisma migrate 的兼容性问题
 */

const mysql = require('mysql2/promise')
const fs = require('fs')
const path = require('path')

async function main() {
  console.log('🚀 开始创建数据库表...\n')

  // 读取 .env 文件
  const envPath = path.join(process.cwd(), '.env')
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

    // 读取 SQL 文件（优先使用 Prisma 生成的 SQL）
    let sqlPath = path.join(process.cwd(), 'scripts', 'prisma-generated-fixed.sql')
    if (!fs.existsSync(sqlPath)) {
      sqlPath = path.join(process.cwd(), 'scripts', 'create-tables.sql')
    }
    const sqlContent = fs.readFileSync(sqlPath, 'utf-8')
    
    // 移除注释和 USE 语句，然后按分号分割
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

    console.log(`📝 执行 ${statements.length} 个 SQL 语句...\n`)

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
            console.log(`   ✅ ${tableMatch[1]}`)
          }
        } catch (error) {
          // 如果表已存在，忽略错误
          if (error.message.includes('already exists') || error.code === 'ER_TABLE_EXISTS_ERROR') {
            const tableMatch = statement.match(/CREATE TABLE.*?IF NOT EXISTS.*?`?(\w+)`?/i) || 
                             statement.match(/CREATE TABLE.*?`?(\w+)`?/i)
            if (tableMatch) {
              console.log(`   ⚠️  ${tableMatch[1]} (已存在)`)
            }
          } else {
            console.error(`   ❌ 错误: ${error.message}`)
            // 打印前100个字符的 SQL 以便调试
            const preview = statement.substring(0, 100).replace(/\n/g, ' ')
            console.error(`   SQL 预览: ${preview}...`)
          }
        }
      }
    }

    await connection.end()
    console.log('\n✅ 所有表创建完成！\n')
  } catch (error) {
    console.error('❌ 创建表失败:', error.message)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('❌ 执行失败:', error)
  process.exit(1)
})

