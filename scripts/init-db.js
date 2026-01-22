#!/usr/bin/env node

/**
 * 数据库初始化脚本
 * 自动创建数据库并运行迁移
 */

const mysql = require('mysql2/promise')
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

async function main() {
  console.log('🚀 开始初始化数据库...\n')

  // 检查并创建 .env 文件
  const envPath = path.join(process.cwd(), '.env')
  if (!fs.existsSync(envPath)) {
    console.log('❌ 未找到 .env 文件，正在创建...')
    const envContent = `DATABASE_URL="mysql://root:root@127.0.0.1:3306/enterprise_ai_bi"
JWT_SECRET="your-secret-key-change-this-in-production-${Date.now()}"
NODE_ENV="development"
`
    fs.writeFileSync(envPath, envContent)
    console.log('✅ .env 文件已创建\n')
  }

  // 读取 .env 文件并解析
  const envContent = fs.readFileSync(envPath, 'utf-8')
  
  // 使用更精确的正则表达式，确保正确提取数据库名（匹配到引号或行尾）
  const dbUrlMatch = envContent.match(/DATABASE_URL\s*=\s*"mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^"?\s]+)/)
  
  if (!dbUrlMatch) {
    console.error('❌ 无法解析 DATABASE_URL，请检查 .env 文件')
    const dbUrlLine = envContent.split('\n').find(line => line.includes('DATABASE_URL'))
    console.error('   当前 DATABASE_URL 行:', dbUrlLine)
    process.exit(1)
  }

  const [, dbUser, dbPass, dbHost, dbPort, dbNameRaw] = dbUrlMatch
  
  // 清理数据库名（移除可能的引号、换行符等）
  const cleanDbName = dbNameRaw.trim().replace(/["\n\r]/g, '')

  const dbName = cleanDbName

  console.log('📊 数据库配置:')
  console.log(`   主机: ${dbHost}`)
  console.log(`   端口: ${dbPort}`)
  console.log(`   用户: ${dbUser}`)
  console.log(`   数据库: ${dbName}\n`)

  // 创建数据库
  console.log('📦 创建数据库（如果不存在）...')
  try {
    // 连接到 MySQL 服务器（不指定数据库）
    const connection = await mysql.createConnection({
      host: dbHost,
      port: parseInt(dbPort),
      user: dbUser,
      password: dbPass,
    })

    // 创建数据库
    await connection.execute(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
    await connection.end()
    console.log('✅ 数据库创建成功\n')
  } catch (error) {
    console.error('❌ 创建数据库失败:', error.message)
    console.log('\n请确保:')
    console.log('1. MySQL 服务正在运行')
    console.log('2. 用户名和密码正确')
    console.log('3. 用户有创建数据库的权限\n')
    console.log('或者手动在 MySQL 中运行:')
    console.log(`   CREATE DATABASE IF NOT EXISTS ${dbName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\n`)
    process.exit(1)
  }

  // 生成 Prisma Client
  console.log('🔧 生成 Prisma Client...')
  try {
    execSync('pnpm db:generate', { stdio: 'inherit' })
    console.log('✅ Prisma Client 生成成功\n')
  } catch (error) {
    console.error('❌ Prisma Client 生成失败')
    process.exit(1)
  }

  // 创建数据库表（使用直接 SQL 方式）
  console.log('📝 创建数据库表...')
  try {
    execSync('pnpm db:create-tables', { stdio: 'inherit' })
    console.log('✅ 数据库表创建成功\n')
  } catch (error) {
    console.error('❌ 创建表失败，尝试使用 Prisma push...')
    try {
      execSync('pnpm db:push', { stdio: 'inherit' })
      console.log('✅ 数据库 schema 推送成功\n')
    } catch (pushError) {
      console.error('❌ Prisma push 也失败')
      console.log('请手动运行: pnpm db:create-tables')
      process.exit(1)
    }
  }

  // 运行种子数据
  console.log('🌱 运行种子数据...')
  try {
    execSync('pnpm db:seed', { stdio: 'inherit' })
    console.log('✅ 种子数据创建成功\n')
  } catch (error) {
    console.error('⚠️  种子数据创建失败（可能已经存在）\n')
  }

  console.log('✅ 数据库初始化完成！\n')
  console.log('📋 演示账号:')
  console.log('   管理员: admin@demo.com / admin123')
  console.log('   分析师: analyst@demo.com / analyst123\n')
}

main().catch((error) => {
  console.error('❌ 初始化失败:', error)
  process.exit(1)
})

