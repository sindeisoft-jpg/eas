/**
 * 迁移脚本：为agents表中的tools JSON字段添加operation字段
 * 如果tools中的config没有operation字段，则添加默认值"SELECT"
 * 
 * 使用方法：
 * node scripts/migrate-agent-tools-operation.js
 */

const mysql = require('mysql2/promise')
const fs = require('fs')
const path = require('path')

// 读取 .env 文件
function getDbConfig() {
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

  return {
    host: dbHost,
    port: parseInt(dbPort),
    user: dbUser,
    password: dbPass,
    database: dbName,
  }
}

async function migrateAgentTools() {
  let connection
  
  try {
    const DB_CONFIG = getDbConfig()
    console.log(`📊 连接到数据库: ${DB_CONFIG.database}\n`)
    connection = await mysql.createConnection(DB_CONFIG)
    console.log('✅ 数据库连接成功\n')
    
    // 获取所有agents
    console.log('正在获取所有agents...')
    const [agents] = await connection.execute(
      'SELECT id, name, tools FROM agents WHERE JSON_LENGTH(tools) > 0'
    )
    
    console.log(`找到 ${agents.length} 个包含tools的agents`)
    
    let updatedCount = 0
    let skippedCount = 0
    
    for (const agent of agents) {
      try {
        const tools = JSON.parse(agent.tools)
        let needsUpdate = false
        const updatedTools = tools.map((tool) => {
          // 检查是否是SQL查询工具
          if (tool.type === 'sql_query' && tool.config) {
            // 如果config中没有operation字段，或者operation字段无效，添加默认值
            const validOperations = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CUSTOM']
            if (!tool.config.operation || !validOperations.includes(tool.config.operation)) {
              needsUpdate = true
              return {
                ...tool,
                config: {
                  ...tool.config,
                  operation: 'SELECT', // 默认值
                },
              }
            }
          }
          return tool
        })
        
        if (needsUpdate) {
          // 更新数据库
          await connection.execute(
            'UPDATE agents SET tools = ? WHERE id = ?',
            [JSON.stringify(updatedTools), agent.id]
          )
          console.log(`✓ 已更新 agent: ${agent.name} (${agent.id})`)
          updatedCount++
        } else {
          console.log(`- 跳过 agent: ${agent.name} (${agent.id}) - 已包含operation字段`)
          skippedCount++
        }
      } catch (error) {
        console.error(`✗ 处理 agent ${agent.id} 时出错:`, error.message)
      }
    }
    
    console.log('\n迁移完成!')
    console.log(`- 更新了 ${updatedCount} 个agents`)
    console.log(`- 跳过了 ${skippedCount} 个agents`)
    
  } catch (error) {
    console.error('迁移失败:', error)
    process.exit(1)
  } finally {
    if (connection) {
      await connection.end()
      console.log('数据库连接已关闭')
    }
  }
}

// 运行迁移
migrateAgentTools()
  .then(() => {
    console.log('迁移脚本执行完成')
    process.exit(0)
  })
  .catch((error) => {
    console.error('迁移脚本执行失败:', error)
    process.exit(1)
  })
