import { NextResponse } from "next/server"
import { requireAuth, AuthenticatedRequest } from "@/lib/middleware"
import { PromptConfigService } from "@/lib/prompt-config-service"
import { db } from "@/lib/db"
import { SQLExecutor } from "@/lib/sql-executor"
import { SQLValidator } from "@/lib/sql-validator"
import { logAudit } from "@/lib/audit-helper"
import { IntentAnalyzer } from "@/lib/intent-analyzer"
import { DataExplorer } from "@/lib/data-explorer"
import { AgentToolExecutor } from "@/lib/agent-tool-executor"
import { PermissionApplier } from "@/lib/permission-applier"
import type { AgentTool, SQLToolConfig, DatabaseSchema } from "@/lib/types"
import { replaceTemplateVariables, formatDatabaseSchema } from "@/lib/template-engine"
// 已删除：密码查询限制相关的导入
// import { detectPasswordQueryIntent, getPasswordQueryRejectionMessage, filterSensitiveFieldsFromResult, detectSensitiveFieldsInSQL, isSensitiveField } from "@/lib/security-filter"
import { extractAndAnalyzeCities } from "@/lib/utils"
import { FeatureGenerator } from "@/lib/feature-generator"
import { AttributionAnalyzer } from "@/lib/attribution-analyzer"
import { ReportGenerator } from "@/lib/report-generator"
import { createChatTask, updateTaskStatus, sendStreamUpdate } from "@/lib/chat-task-manager"
import { AgentExecutor } from "@/lib/agent-executor"
import { enforceColumnAccess, SQLPermissionError } from "@/lib/sql-permission"
import { applyMaskingToQueryResult } from "@/lib/data-masking"
import { parseCommand } from "@/lib/command-parser"
import { parseLLMResponse } from "@/lib/json-parser"
import { ensureVisualization } from "@/lib/visualization-helper"
import { EntityExtractor } from "@/lib/entity-extractor"
import { EntityQueryGenerator } from "@/lib/entity-query-generator"
import { detectCrossTableNeed } from "@/lib/cross-table-detector"

export const maxDuration = 300 // 增加到300秒（5分钟），支持完整的Agent执行流程

/**
 * 列名翻译映射表
 * 将英文列名翻译为中文显示名称
 */
const columnNameTranslations: Record<string, string> = {
  // 通用字段
  id: "ID",
  name: "名称",
  created_at: "创建时间",
  updated_at: "更新时间",
  created_by: "创建人",
  updated_by: "更新人",
  status: "状态",
  type: "类型",
  description: "描述",
  notes: "备注",
  tags: "标签",
  
  // 客户相关字段
  customer_name: "客户姓名",
  company: "公司名称",
  company_name: "公司名称",
  email: "邮箱",
  phone: "电话",
  address: "地址",
  industry: "行业",
  customer_type: "客户类型",
  source: "来源",
  assigned_to: "负责人",
  
  // 其他常见字段
  title: "标题",
  content: "内容",
  amount: "金额",
  price: "价格",
  quantity: "数量",
  date: "日期",
  time: "时间",
  user_id: "用户ID",
  user_name: "用户名",
  order_id: "订单ID",
  product_id: "产品ID",
}

/**
 * 检测查询结果中的ID字段，并自动通过JOIN查询获取对应的名称信息
 * @param queryResult 查询结果对象
 * @param sql 原始SQL查询
 * @param schema 数据库schema信息
 * @param connection 数据库连接
 * @returns 增强后的查询结果（包含ID对应的名称信息）
 */
async function enrichQueryResultWithIDNames(
  queryResult: any,
  sql: string,
  schema: DatabaseSchema[],
  connection: any
): Promise<{ result: any; enhancedSQL?: string }> {
  if (!queryResult || !queryResult.columns || !queryResult.rows || queryResult.rows.length === 0) {
    return { result: queryResult }
  }

  // 检测ID字段（如 user_id, customer_id, order_id 等）
  // 注意：只检测外键ID字段（xxx_id格式），不检测主键id字段
  // 主键id不应该被enrich，因为它本身就是主键，不是外键
  const idColumns = queryResult.columns.filter((col: string) => {
    const lowerCol = col.toLowerCase()
    // 只匹配外键ID字段模式：xxx_id（如 user_id, customer_id）
    // 不匹配单独的 'id'，因为单独的id通常是主键，不是外键
    return (
      lowerCol.endsWith('_id') && lowerCol !== 'id'
    )
  })

  if (idColumns.length === 0) {
    return { result: queryResult }
  }

  console.log("[Chat] Detected ID columns in query result:", idColumns)

  // 构建schema映射
  const schemaMap = new Map<string, DatabaseSchema>()
  schema.forEach((s) => {
    schemaMap.set(s.tableName.toLowerCase(), s)
    schemaMap.set(s.tableName, s)
  })

  // 为每个ID字段查找对应的表和名称字段
  const enrichments: Array<{
    idColumn: string
    targetTable: string
    targetIdColumn: string
    nameColumn: string
  }> = []

  for (const idColumn of idColumns) {
    // 推断目标表名（如 user_id -> users, customer_id -> customers）
    const idColumnLower = idColumn.toLowerCase()
    let targetTable = ''
    
    if (idColumnLower.endsWith('_id')) {
      // user_id -> users
      const prefix = idColumnLower.replace(/_id$/, '')
      // 尝试单数转复数
      const pluralTable = prefix + 's'
      const singularTable = prefix
      
      // 查找匹配的表
      for (const [tableName, tableSchema] of schemaMap.entries()) {
        const tableNameLower = tableName.toLowerCase()
        if (tableNameLower === pluralTable || tableNameLower === singularTable) {
          targetTable = tableName
          break
        }
      }
      
      // 如果没找到，尝试其他常见模式
      if (!targetTable) {
        // 尝试直接匹配（如 user_id -> user）
        if (schemaMap.has(singularTable)) {
          targetTable = singularTable
        }
      }
    } else if (idColumnLower === 'id') {
      // 如果是单独的id字段，需要从SQL中推断
      // 这里简化处理，跳过单独的id字段
      continue
    }

    if (!targetTable) {
      console.log(`[Chat] Could not infer target table for ID column: ${idColumn}`)
      continue
    }

    const targetSchema = schemaMap.get(targetTable)
    if (!targetSchema) {
      console.log(`[Chat] Target table not found in schema: ${targetTable}`)
      continue
    }

    // 查找目标表中的ID列（通常是 id 或 table_id）
    const targetIdColumn = targetSchema.columns.find((col) => 
      col.isPrimaryKey || col.name.toLowerCase() === 'id'
    )?.name || 'id'

    // 查找名称字段（优先顺序：name, title, username, email, 或其他包含name的字段）
    const nameColumnCandidates = ['name', 'title', 'username', 'email', 'display_name', 'full_name']
    let nameColumn = targetSchema.columns.find((col) => 
      nameColumnCandidates.includes(col.name.toLowerCase())
    )?.name

    // 如果没找到，查找包含'name'的字段
    if (!nameColumn) {
      nameColumn = targetSchema.columns.find((col) => 
        col.name.toLowerCase().includes('name')
      )?.name
    }

    if (!nameColumn) {
      console.log(`[Chat] Could not find name column in table: ${targetTable}`)
      continue
    }

    enrichments.push({
      idColumn,
      targetTable,
      targetIdColumn,
      nameColumn,
    })
  }

  if (enrichments.length === 0) {
    return { result: queryResult }
  }

  console.log("[Chat] Will enrich query result with:", enrichments)

  // 方法1：尝试通过修改SQL添加JOIN（更高效）
  try {
    const selectClauseMatch = sql.match(/SELECT\s+(.+?)\s+FROM/i)
    if (!selectClauseMatch) {
      // 如果无法解析SQL，使用方法2：批量查询
      return await enrichByBatchQuery(queryResult, enrichments, connection)
    }

    const originalSelect = selectClauseMatch[1]
    const fromClauseMatch = sql.match(/FROM\s+([^\s(]+)/i)
    if (!fromClauseMatch) {
      return await enrichByBatchQuery(queryResult, enrichments, connection)
    }

    const mainTable = fromClauseMatch[1].replace(/[`'"]/g, '')

    // 构建新的SELECT子句，添加名称字段
    const additionalSelects: string[] = []
    const joins: string[] = []

    enrichments.forEach((enrichment, index) => {
      const alias = `t${index + 1}`
      const nameAlias = `${enrichment.idColumn.replace(/_id$/i, '')}_name`

      // 添加JOIN
      joins.push(
        `LEFT JOIN \`${enrichment.targetTable}\` AS ${alias} ON \`${mainTable}\`.\`${enrichment.idColumn}\` = ${alias}.\`${enrichment.targetIdColumn}\``
      )

      // 添加名称字段到SELECT
      additionalSelects.push(`${alias}.\`${enrichment.nameColumn}\` AS \`${nameAlias}\``)
    })

    // 构建新的SQL
    const newSelect = `${originalSelect}, ${additionalSelects.join(', ')}`
    let enhancedSQL = sql.replace(/SELECT\s+(.+?)\s+FROM/i, `SELECT ${newSelect} FROM`)
    
    // 添加JOIN子句（在FROM之后，WHERE之前）
    const whereMatch = enhancedSQL.match(/\s+WHERE\s+/i)
    if (whereMatch) {
      enhancedSQL = enhancedSQL.replace(/\s+WHERE\s+/i, ` ${joins.join(' ')} WHERE `)
    } else {
      // 检查是否有GROUP BY, ORDER BY, LIMIT等
      const groupByMatch = enhancedSQL.match(/\s+GROUP\s+BY\s+/i)
      const orderByMatch = enhancedSQL.match(/\s+ORDER\s+BY\s+/i)
      const limitMatch = enhancedSQL.match(/\s+LIMIT\s+/i)
      
      if (groupByMatch) {
        enhancedSQL = enhancedSQL.replace(/\s+GROUP\s+BY\s+/i, ` ${joins.join(' ')} GROUP BY `)
      } else if (orderByMatch) {
        enhancedSQL = enhancedSQL.replace(/\s+ORDER\s+BY\s+/i, ` ${joins.join(' ')} ORDER BY `)
      } else if (limitMatch) {
        enhancedSQL = enhancedSQL.replace(/\s+LIMIT\s+/i, ` ${joins.join(' ')} LIMIT `)
      } else {
        // 没有其他子句，在FROM后添加
        enhancedSQL = enhancedSQL.replace(/FROM\s+([^\s(]+)/i, `FROM $1 ${joins.join(' ')}`)
      }
    }

    console.log("[Chat] Enhanced SQL:", enhancedSQL)

    // 执行增强的查询
    const enhancedResult = await SQLExecutor.executeQuery(connection, enhancedSQL, false)

    return {
      result: enhancedResult,
      enhancedSQL,
    }
  } catch (error: any) {
    console.warn("[Chat] Failed to enrich query result with ID names via SQL enhancement:", error.message)
    // 如果SQL增强失败，使用方法2：批量查询
    return await enrichByBatchQuery(queryResult, enrichments, connection)
  }
}

/**
 * 方法2：通过批量查询ID对应的名称，然后合并到结果中
 */
async function enrichByBatchQuery(
  queryResult: any,
  enrichments: Array<{
    idColumn: string
    targetTable: string
    targetIdColumn: string
    nameColumn: string
  }>,
  connection: any
): Promise<{ result: any; enhancedSQL?: string }> {
  try {
    const enrichedRows = [...queryResult.rows]
    const enrichedColumns = [...queryResult.columns]

    // 为每个enrichment批量查询名称
    for (const enrichment of enrichments) {
      // 收集所有唯一的ID值
      const uniqueIds = new Set<any>()
      queryResult.rows.forEach((row: any) => {
        const idValue = row[enrichment.idColumn]
        if (idValue !== null && idValue !== undefined) {
          uniqueIds.add(idValue)
        }
      })

      if (uniqueIds.size === 0) {
        continue
      }

      // 构建批量查询SQL
      const idList = Array.from(uniqueIds).map(id => {
        if (typeof id === 'string') {
          return `'${id.replace(/'/g, "''")}'`
        }
        return id
      }).join(', ')

      const batchSQL = `SELECT \`${enrichment.targetIdColumn}\`, \`${enrichment.nameColumn}\` FROM \`${enrichment.targetTable}\` WHERE \`${enrichment.targetIdColumn}\` IN (${idList})`

      console.log("[Chat] Batch query for enrichment:", batchSQL)

      // 执行批量查询
      const batchResult = await SQLExecutor.executeQuery(connection, batchSQL, false)

      // 构建ID到名称的映射
      const idToNameMap = new Map<any, any>()
      batchResult.rows.forEach((row: any) => {
        const id = row[enrichment.targetIdColumn]
        const name = row[enrichment.nameColumn]
        idToNameMap.set(id, name)
      })

      // 添加名称列到结果中
      const nameColumnAlias = `${enrichment.idColumn.replace(/_id$/i, '')}_name`
      enrichedColumns.push(nameColumnAlias)

      // 为每行添加名称值
      enrichedRows.forEach((row: any, index: number) => {
        const idValue = row[enrichment.idColumn]
        const nameValue = idToNameMap.get(idValue) || null
        enrichedRows[index] = {
          ...row,
          [nameColumnAlias]: nameValue,
        }
      })
    }

    return {
      result: {
        ...queryResult,
        columns: enrichedColumns,
        rows: enrichedRows,
      },
    }
  } catch (error: any) {
    console.warn("[Chat] Failed to enrich query result with ID names via batch query:", error.message)
    // 如果批量查询也失败，返回原始结果
    return { result: queryResult }
  }
}

/**
 * 使用大模型翻译查询结果的列名为中文
 * @param queryResult 查询结果对象
 * @param llmConnection LLM连接配置
 * @param sampleRows 样本行数据（用于帮助理解列的含义）
 * @returns 翻译后的查询结果
 */
async function translateColumnNamesWithLLM(
  queryResult: any,
  llmConnection: any,
  sampleRows?: any[]
): Promise<any> {
  if (!queryResult || !queryResult.columns || !queryResult.columns.length) {
    return queryResult
  }

  // 如果没有LLM连接，使用默认翻译
  if (!llmConnection) {
    return translateColumnNames(queryResult)
  }

  try {
    // 准备样本数据（最多3行）用于帮助理解列的含义
    const samples = sampleRows || (queryResult.rows && queryResult.rows.slice(0, 3)) || []
    
    // 从配置服务获取提示词
    const columnList = queryResult.columns.map((col: string, idx: number) => `${idx + 1}. ${col}`).join('\n')
    const sampleData = samples.length > 0 ? `**样本数据（用于理解列的含义）：**
${JSON.stringify(samples, null, 2)}

请根据样本数据中的实际值来理解每个列的含义，然后翻译成合适的中文列名。` : ""

    let prompt = await PromptConfigService.getConfigWithVariables(
      "column_translation",
      "translate_column_names_prompt",
      {
        columnList,
        sampleData,
      }
    )

    // 如果配置不存在，使用默认值（向后兼容）
    if (!prompt) {
      prompt = `你是一个数据库查询结果翻译助手。请将以下查询结果的列名翻译成中文。

**列名列表：**
${columnList}

${sampleData}

**要求：**
1. 将每个列名翻译成准确、简洁的中文
2. 翻译应该符合数据库字段的常见命名习惯
3. 如果列名已经是中文，保持原样
4. 如果列名是英文缩写或组合词，根据上下文和样本数据理解其含义后翻译
5. 返回JSON格式，格式为：{"列名1": "中文翻译1", "列名2": "中文翻译2", ...}

**只返回JSON，不要包含其他文字说明。**`
    }

    // 验证并获取API Key
    const validatedApiKey = getValidatedApiKey(llmConnection, false)
    
    const provider = llmConnection.provider || "openai"
    const model = llmConnection.model || "gpt-4o-mini"
    const baseUrl = llmConnection.baseUrl || (llmConnection.provider === "ollama" ? "http://localhost:11434/v1" : "https://api.openai.com/v1")
    const temperature = 0.3 // 使用较低的温度以获得更一致的翻译
    const maxTokens = 500

    // 构建API URL
    let apiUrl = baseUrl.endsWith("/") ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`
    
    if (baseUrl.includes("cloudflare.com")) {
      apiUrl = `https://gateway.ai.cloudflare.com/v1/${provider}/${model}/chat/completions`
    }

    const headers: HeadersInit = {
      "Content-Type": "application/json",
    }

    if (baseUrl.includes("cloudflare.com")) {
      // Cloudflare AI Gateway 不需要 API key
    } else if (provider === "ollama") {
      // Ollama 通常不需要 API Key，但如果提供了则使用
      if (validatedApiKey && validatedApiKey.trim() !== "") {
        headers["Authorization"] = `Bearer ${validatedApiKey}`
      }
    } else if (provider === "anthropic") {
      headers["x-api-key"] = validatedApiKey
      headers["anthropic-version"] = "2023-06-01"
    } else {
      headers["Authorization"] = `Bearer ${validatedApiKey}`
    }

    // 调用LLM进行翻译
    const response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: "system",
            content: (await PromptConfigService.getConfig("column_translation", "translate_column_names_system_message")) || "你是一个专业的数据库查询结果翻译助手，擅长将英文列名翻译成准确、简洁的中文。",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature,
        max_tokens: maxTokens,
        stream: false,
      }),
    })

    if (!response.ok) {
      console.warn("[Chat] LLM translation failed, using default translation:", response.status)
      return translateColumnNames(queryResult)
    }

    const data = await response.json()
    // 支持多种响应格式：OpenAI (choices), Anthropic (content), Ollama (message.content 或 response)
    const translationText = 
      data.choices?.[0]?.message?.content || 
      data.content || 
      data.message?.content ||
      data.response ||
      "{}"
    
    // 提取JSON（可能包含代码块）
    const jsonMatch = translationText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.warn("[Chat] Failed to extract JSON from translation response, using default translation")
      return translateColumnNames(queryResult)
    }

    let translations: Record<string, string> = {}
    try {
      translations = JSON.parse(jsonMatch[0])
    } catch (parseError) {
      console.warn("[Chat] Failed to parse translation JSON, using default translation:", parseError)
      return translateColumnNames(queryResult)
    }

    // 应用翻译
    const columnMapping: Record<string, string> = {}
    const translatedColumns: string[] = []

    queryResult.columns.forEach((col: string) => {
      // 优先使用LLM翻译，如果没有则使用默认翻译
      const translated = translations[col] || columnNameTranslations[col.toLowerCase()] || col
      columnMapping[col] = translated
      translatedColumns.push(translated)
    })

    // 翻译行数据中的列名
    const translatedRows = queryResult.rows.map((row: any) => {
      const translatedRow: any = {}
      Object.keys(row).forEach((originalCol) => {
        const translatedCol = columnMapping[originalCol] || originalCol
        translatedRow[translatedCol] = row[originalCol]
      })
      return translatedRow
    })

    return {
      ...queryResult,
      columns: translatedColumns,
      rows: translatedRows,
    }
  } catch (error: any) {
    console.warn("[Chat] Error in LLM column translation, using default translation:", error.message)
    // 如果LLM翻译失败，回退到默认翻译
    return translateColumnNames(queryResult)
  }
}

/**
 * 翻译查询结果的列名（默认方法，使用映射表）
 * @param queryResult 查询结果对象
 * @returns 翻译后的查询结果
 */
function translateColumnNames(queryResult: any): any {
  if (!queryResult || !queryResult.columns || !queryResult.rows) {
    return queryResult
  }

  // 创建列名映射：原始列名 -> 翻译后的列名
  const columnMapping: Record<string, string> = {}
  const translatedColumns: string[] = []

  queryResult.columns.forEach((col: string) => {
    // 查找翻译，如果没有找到则使用原始列名
    const translated = columnNameTranslations[col.toLowerCase()] || col
    columnMapping[col] = translated
    translatedColumns.push(translated)
  })

  // 翻译行数据中的列名
  const translatedRows = queryResult.rows.map((row: any) => {
    const translatedRow: any = {}
    Object.keys(row).forEach((originalCol) => {
      const translatedCol = columnMapping[originalCol] || originalCol
      translatedRow[translatedCol] = row[originalCol]
    })
    return translatedRow
  })

  return {
    ...queryResult,
    columns: translatedColumns,
    rows: translatedRows,
  }
}

/**
 * 验证并获取有效的API Key
 */
function getValidatedApiKey(llmConnection: any, fallbackToEnv = false): string {
  if (!llmConnection) {
    throw new Error("LLM连接不存在")
  }
  
  let apiKey = llmConnection.apiKey
  if (!apiKey || apiKey.trim() === "" || apiKey === "***") {
    if (fallbackToEnv) {
      apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) {
        throw new Error(`LLM连接"${llmConnection.name}"的API Key未配置，且环境变量中也没有API Key`)
      }
      console.warn("[Chat] Using environment variable API key as fallback")
    } else {
      throw new Error(`LLM连接"${llmConnection.name}"的API Key未配置或无效。请前往"模型管理"页面检查并更新API Key。`)
    }
  }
  
  return apiKey
}

/**
 * 查找用于获取数据库结构的SQL查询配置
 */
function findSchemaTool(tools: AgentTool[]): AgentTool | null {
  if (!tools || tools.length === 0) {
    return null
  }
  
  // 首先尝试查找名称或描述中包含schema相关关键词的SQL查询配置
  const schemaKeywords = ['schema', '结构', '数据库结构', '表结构', 'schema query', '获取结构', '数据库架构', 'information_schema']
  const keywordMatch = tools.find(tool => 
    tool.type === 'sql_query' && 
    tool.enabled &&
    (schemaKeywords.some(keyword => 
      tool.name.toLowerCase().includes(keyword.toLowerCase()) ||
      tool.description?.toLowerCase().includes(keyword.toLowerCase())
    ))
  )
  
  if (keywordMatch) {
    return keywordMatch
  }
  
  // 如果没有找到包含关键词的，使用第一个启用的SQL查询工具
  // 因为通常智能体只会配置一个SQL查询用于获取数据库结构
  const firstEnabled = tools.find(tool => 
    tool.type === 'sql_query' && 
    tool.enabled
  )
  
  if (firstEnabled) {
    console.log("[Chat] No schema keyword match found, using first enabled SQL query tool:", firstEnabled.name)
    return firstEnabled
  }
  
  return null
}

/**
 * 将查询结果转换为DatabaseSchema格式
 */
function convertQueryResultToSchema(
  queryResult: any,
  connection: any
): DatabaseSchema[] {
  const schemas: DatabaseSchema[] = []
  
  if (!queryResult || !queryResult.rows || queryResult.rows.length === 0) {
    return schemas
  }

  // 尝试从查询结果中提取表结构信息
  // 假设查询结果包含表名和列信息
  const tableMap = new Map<string, any[]>()

  for (const row of queryResult.rows) {
    // 尝试多种可能的列名格式
    const tableName = row.TABLE_NAME || row.table_name || row.TABLE || row.table || row.name
    const columnName = row.COLUMN_NAME || row.column_name || row.COLUMN || row.column
    const dataType = row.DATA_TYPE || row.data_type || row.TYPE || row.type
    const isNullable = row.IS_NULLABLE || row.is_nullable || row.NULLABLE || row.nullable
    const isPrimaryKey = row.COLUMN_KEY === 'PRI' || row.is_primary_key || row.IS_PRIMARY_KEY
    const isForeignKey = row.COLUMN_KEY === 'MUL' || row.is_foreign_key || row.IS_FOREIGN_KEY
    const description = row.COLUMN_COMMENT || row.column_comment || row.COMMENT || row.comment || row.description

    if (tableName && columnName) {
      if (!tableMap.has(tableName)) {
        tableMap.set(tableName, [])
      }
      tableMap.get(tableName)!.push({
        name: columnName,
        type: dataType || 'unknown',
        nullable: isNullable === 'YES' || isNullable === true,
        isPrimaryKey: isPrimaryKey === true || isPrimaryKey === 'PRI',
        isForeignKey: isForeignKey === true || isForeignKey === 'MUL',
        description: description || undefined,
      })
    }
  }

  // 转换为DatabaseSchema格式
  for (const [tableName, columns] of tableMap.entries()) {
    schemas.push({
      tableName,
      columns,
    })
  }

  return schemas
}

/**
 * 识别表之间的关系（通过外键字段）
 */
function identifyTableRelationships(schema: DatabaseSchema[]): string {
  if (!schema || schema.length === 0) {
    return ""
  }

  const relationships: string[] = []
  const tableMap = new Map<string, DatabaseSchema>()
  
  schema.forEach(table => {
    tableMap.set(table.tableName.toLowerCase(), table)
    tableMap.set(table.tableName, table)
  })

  // 识别外键关系
  for (const table of schema) {
    const tableName = table.tableName
    const columns = table.columns || []

    for (const column of columns) {
      const colName = column.name || ""
      
      // 检测外键字段（如 customer_id, user_id, product_id 等）
      if (colName.toLowerCase().endsWith('_id') && colName.toLowerCase() !== 'id') {
        // 推断目标表名（如 customer_id -> customers）
        const targetTablePrefix = colName.toLowerCase().replace(/_id$/, '')
        const possibleTargetTables = [
          targetTablePrefix + 's', // 复数形式
          targetTablePrefix,      // 单数形式
        ]

        for (const possibleTable of possibleTargetTables) {
          const targetTable = tableMap.get(possibleTable) || tableMap.get(possibleTable.toLowerCase())
          if (targetTable) {
            // 查找目标表的主键
            const targetPrimaryKey = targetTable.columns.find(col => 
              col.isPrimaryKey || col.name.toLowerCase() === 'id'
            )
            
            if (targetPrimaryKey) {
              relationships.push(
                `- ${tableName}.${colName} → ${targetTable.tableName}.${targetPrimaryKey.name} (外键关系)`
              )
              break
            }
          }
        }
      }
    }
  }

  if (relationships.length === 0) {
    return ""
  }

  return `\n**表关系（用于JOIN查询）**：\n${relationships.join("\n")}\n`
}

/**
 * 从查询结果中提取表结构信息（用于二次查询）
 * 优先从返回结果中提取，而不是使用预先的schema
 */
function extractSchemaFromQueryResult(queryResult: any): { tables: string[], columns: string[], schema: DatabaseSchema[] } {
  const tables: string[] = []
  const columns: string[] = []
  const schema: DatabaseSchema[] = []
  
  if (!queryResult || !queryResult.rows || queryResult.rows.length === 0) {
    return { tables, columns, schema }
  }

  // 识别列名：查找表名列、列名列等
  const tableNameColumn = queryResult.columns.find((col: string) => 
    /表名|table.*name|TABLE_NAME|table_name/i.test(col)
  )
  const columnNameColumn = queryResult.columns.find((col: string) => 
    /列名|column.*name|COLUMN_NAME|column_name/i.test(col)
  )
  const dataTypeColumn = queryResult.columns.find((col: string) => 
    /数据类型|data.*type|DATA_TYPE|data_type|类型|type/i.test(col)
  )

  if (!tableNameColumn || !columnNameColumn) {
    console.warn("[Chat] Cannot find required columns in query result:", {
      columns: queryResult.columns,
      hasTableName: !!tableNameColumn,
      hasColumnName: !!columnNameColumn
    })
    return { tables, columns, schema }
  }

  // 从查询结果中提取表结构
  const tableMap = new Map<string, Set<string>>()
  
  for (const row of queryResult.rows) {
    // 尝试多种键名格式获取表名和列名
    const tableName = row[tableNameColumn] || 
                     row[tableNameColumn.toLowerCase()] || 
                     row[tableNameColumn.toUpperCase()] ||
                     row[tableNameColumn.replace(/\s+/g, '_')] ||
                     row[tableNameColumn.replace(/\s+/g, '')]
    
    const columnName = row[columnNameColumn] || 
                      row[columnNameColumn.toLowerCase()] || 
                      row[columnNameColumn.toUpperCase()] ||
                      row[columnNameColumn.replace(/\s+/g, '_')] ||
                      row[columnNameColumn.replace(/\s+/g, '')]
    
    const dataType = dataTypeColumn ? (
      row[dataTypeColumn] || 
      row[dataTypeColumn.toLowerCase()] || 
      row[dataTypeColumn.toUpperCase()] ||
      row[dataTypeColumn.replace(/\s+/g, '_')] ||
      row[dataTypeColumn.replace(/\s+/g, '')]
    ) : undefined

    if (tableName && typeof tableName === 'string' && tableName.trim()) {
      const cleanTableName = tableName.trim()
      if (!tableMap.has(cleanTableName)) {
        tableMap.set(cleanTableName, new Set())
        tables.push(cleanTableName)
      }
      
      if (columnName && typeof columnName === 'string' && columnName.trim()) {
        const cleanColumnName = columnName.trim()
        tableMap.get(cleanTableName)!.add(cleanColumnName)
        if (!columns.includes(cleanColumnName)) {
          columns.push(cleanColumnName)
        }
      }
    }
  }

  // 构建DatabaseSchema格式
  for (const [tableName, columnSet] of tableMap.entries()) {
    const columnList = Array.from(columnSet).map(colName => ({
      name: colName,
      type: 'unknown',
      nullable: true,
      isPrimaryKey: false,
      isForeignKey: false,
    }))
    
    schema.push({
      tableName,
      columns: columnList,
    })
  }

  console.log("[Chat] Extracted schema from query result:", {
    tableCount: tables.length,
    tables: tables.slice(0, 5),
    columnCount: columns.length,
    columns: columns.slice(0, 10),
    schemaTableCount: schema.length
  })

  return { tables, columns, schema }
}

async function handlePOST(req: AuthenticatedRequest) {
  let taskId: string | null = null
  let actualSessionId: string | null = null
  
  try {
    const user = req.user!
    const { messages, databaseSchema, llmConfig, databaseConnectionId, sessionId, agentId } = await req.json()

    console.log("[Chat] Request received:", {
      databaseConnectionId,
      hasSchema: !!databaseSchema,
      llmConfig,
      messageCount: messages?.length,
      agentId,
    })

    // 注意：actualSessionId 会在后面的代码中确定，这里先不创建任务
    // 任务创建会在确定 actualSessionId 后进行

    // 如果提供了智能体ID，获取智能体配置
    let agent = null
    let agentLLMConnection: any = null  // 保存智能体的LLM连接对象
    let effectiveLLMConfig = llmConfig
    let effectiveDatabaseConnectionId = databaseConnectionId
    let systemMessage = undefined

    if (agentId) {
      agent = await (db as any).agent.findUnique({
        where: { id: agentId },
      })

      if (!agent || agent.organizationId !== user.organizationId) {
        return NextResponse.json({ error: "智能体不存在或无权限" }, { status: 404 })
      }

      if (agent.status !== "active") {
        return NextResponse.json({ error: "智能体未激活" }, { status: 400 })
      }

      // 使用智能体的 LLM 连接 - 必须存在且有效
      if (!agent.llmConnectionId) {
        return NextResponse.json({ 
          error: "智能体未配置 LLM 连接。请前往智能体编辑页面，在\"模型配置\"选项卡中配置 LLM 连接。" 
        }, { status: 400 })
      }

      agentLLMConnection = await db.lLMConnection.findUnique({
        where: { id: agent.llmConnectionId },
      })

      if (!agentLLMConnection) {
        return NextResponse.json({ 
          error: `智能体配置的 LLM 连接不存在（ID: ${agent.llmConnectionId}）。请前往智能体编辑页面检查模型配置。` 
        }, { status: 404 })
      }

      if (agentLLMConnection.organizationId !== user.organizationId) {
        return NextResponse.json({ 
          error: "智能体配置的 LLM 连接无权限访问" 
        }, { status: 403 })
      }

      // 验证API Key是否存在
      if (!agentLLMConnection.apiKey || agentLLMConnection.apiKey.trim() === "" || agentLLMConnection.apiKey === "***") {
        return NextResponse.json({ 
          error: `智能体配置的 LLM 连接"${agentLLMConnection.name}"的 API Key 未配置或无效。请前往"模型管理"页面检查并更新 API Key。` 
        }, { status: 400 })
      }

      console.log("[Chat] Agent LLM connection loaded:", {
        agentId: agent.id,
        agentName: agent.name,
        llmConnectionId: agentLLMConnection.id,
        llmConnectionName: agentLLMConnection.name,
        provider: agentLLMConnection.provider,
        model: agentLLMConnection.model,
        hasApiKey: !!agentLLMConnection.apiKey,
        apiKeyLength: agentLLMConnection.apiKey?.length || 0,
        apiKeyPrefix: agentLLMConnection.apiKey ? agentLLMConnection.apiKey.substring(0, 10) + "..." : "none",
        baseUrl: agentLLMConnection.baseUrl,
      })

      effectiveLLMConfig = {
        provider: agentLLMConnection.provider,
        model: agentLLMConnection.model,
        temperature: agentLLMConnection.temperature,
        maxTokens: agentLLMConnection.maxTokens,
        baseUrl: agentLLMConnection.baseUrl,
      }

      // 使用智能体的数据库连接（如果配置了）
      if (agent.databaseConnectionId) {
        effectiveDatabaseConnectionId = agent.databaseConnectionId
      }

      // 使用智能体的系统消息
      systemMessage = agent.systemMessage
    }

    if (!effectiveDatabaseConnectionId) {
      return NextResponse.json({ error: "数据库连接ID不能为空" }, { status: 400 })
    }

    // 获取数据库连接
    const connection = await db.databaseConnection.findUnique({
      where: { id: effectiveDatabaseConnectionId },
    })

    if (!connection || connection.organizationId !== user.organizationId) {
      return NextResponse.json({ error: "数据库连接不存在或无权限" }, { status: 404 })
    }

    // 性能监控：记录开始时间
    const performanceStartTime = Date.now()
    const performanceLog: Record<string, number> = {}
    
    // 工作过程记录
    const workProcess: string[] = []
    workProcess.push("📋 **步骤 1: 数据准备与意图分析**")

    // 获取用户的最新问题
    const lastUserMessage = messages && messages.length > 0 ? messages[messages.length - 1] : null
    // 提取用户问题和命令类型
    // 优先使用 metadata 中的 processedQuestion（清理后的，不包含命令），如果没有则从 content 中解析
    const rawContent = lastUserMessage?.content || ""
    const processedQuestion = lastUserMessage?.metadata?.processedQuestion as string | undefined
    const commandType = lastUserMessage?.metadata?.commandType as 'report' | 'chart' | 'table' | null | undefined
    const chartType = lastUserMessage?.metadata?.chartType as string | null | undefined
    
    // 如果 metadata 中有 processedQuestion，使用它；否则从 content 中解析命令
    let userQuestion = processedQuestion || rawContent
    if (!processedQuestion && rawContent) {
      // 如果 metadata 中没有 processedQuestion，尝试解析命令
      const commandResult = parseCommand(rawContent)
      if (commandResult.command) {
        userQuestion = commandResult.question
      }
    }
    
    console.log("[Chat] Command detection:", {
      commandType,
      chartType,
      rawContent: rawContent.substring(0, 100),
      processedQuestion: processedQuestion?.substring(0, 100),
      userQuestion: userQuestion.substring(0, 100),
      hasMetadata: !!lastUserMessage?.metadata,
      metadataCommandType: lastUserMessage?.metadata?.commandType,
      metadataChartType: lastUserMessage?.metadata?.chartType
    })
    
    // 确定实际使用的会话ID（在创建任务之前）
    // 这部分逻辑会在后面处理，但我们需要先确定 actualSessionId 来创建任务
    let actualSessionId = sessionId || `session_${Date.now()}`
    
    // 发送流式更新：意图分析开始（在actualSessionId初始化之后）
    if (actualSessionId && !actualSessionId.startsWith("session_")) {
      sendStreamUpdate(actualSessionId, "step_started", {
        step: "data_preparation",
        message: "正在分析用户意图...",
        workProcess: [...workProcess],
      })
    }

    // 已删除：第一层安全防护（密码查询限制）

    // 判断用户意图是否是查询数据库
    const isQueryIntent = (question: string): boolean => {
      if (!question || question.trim().length === 0) {
        return false
      }
      
      const lowerQuestion = question.toLowerCase().trim()
      
      // 查询相关的关键词
      const queryKeywords = [
        // 中文查询关键词
        "查询", "查找", "搜索", "显示", "列出", "统计", "汇总", "有多少", 
        "数量", "总数", "前", "最好", "最多", "最少", "最高", "最低",
        "关联", "连接", "join", "select", "where", "from",
        // 英文查询关键词
        "query", "search", "find", "show", "list", "count", "select",
        "how many", "what", "which", "top", "best", "most", "least",
        "highest", "lowest", "join", "aggregate", "group by"
      ]
      
      // 非查询意图的关键词（对话、配置等）
      const nonQueryKeywords = [
        "你好", "谢谢", "再见", "帮助", "说明", "解释", "什么是",
        "hello", "hi", "thanks", "bye", "help", "what is", "explain"
      ]
      
      // 如果包含非查询关键词且没有查询关键词，则不是查询意图
      const hasNonQueryKeyword = nonQueryKeywords.some(keyword => lowerQuestion.includes(keyword))
      const hasQueryKeyword = queryKeywords.some(keyword => lowerQuestion.includes(keyword))
      
      // 如果明确包含查询关键词，则是查询意图
      if (hasQueryKeyword) {
        return true
      }
      
      // 如果只有非查询关键词，则不是查询意图
      if (hasNonQueryKeyword && !hasQueryKeyword) {
        return false
      }
      
      // 默认情况：如果问题很短（少于10个字符）且没有查询关键词，可能不是查询
      if (question.length < 10 && !hasQueryKeyword) {
        return false
      }
      
      // 其他情况默认认为是查询意图（保守策略）
      return true
    }
    
    // 检测是否是"列出功能"类问题
    const isFeatureListIntent = (question: string): boolean => {
      if (!question || question.trim().length === 0) {
        return false
      }
      
      const lowerQuestion = question.toLowerCase().trim()
      
      // 功能列表相关的关键词（必须是完整的短语，避免误判数据查询）
      // 注意：不能包含单独的"列出"、"功能"等词，否则"列出所有客户"会被误判
      const featureListKeywords = [
        // 中文完整短语
        "列出功能", "有什么功能", "你能做什么", "功能列表", "有哪些功能",
        "你能帮我做什么", "你有什么功能", "可以做什么", "支持什么功能",
        "列出所有功能", "显示功能", "查看功能", "功能说明", "功能介绍",
        // 英文完整短语
        "list features", "what can you do", "what features", "capabilities",
        "what are your capabilities", "show features", "what do you support",
        "what functions", "what abilities"
      ]
      
      // 检查是否包含功能列表关键词（必须是完整短语匹配）
      return featureListKeywords.some(keyword => lowerQuestion.includes(keyword))
    }
    
    const userWantsFeatureList = isFeatureListIntent(userQuestion)
    
    // ========== 新架构：Agent Function Calling 模式 ==========
    // 如果配置了智能体且有工具，优先使用新的 Agent 架构
    const useAgentArchitecture = agent && 
                                 agent.tools && 
                                 Array.isArray(agent.tools) && 
                                 agent.tools.some((t: AgentTool) => t.enabled) &&
                                 agentLLMConnection
    
    if (useAgentArchitecture && !userWantsFeatureList) {
      console.log("[Chat] Using new Agent architecture with Function Calling")
      workProcess.push("🤖 **使用 Agent 架构（Function Calling 模式）**")
      
      try {
        // 在新架构中，也需要先获取数据库 schema（与旧架构保持一致）
        // 这样可以确保 Agent 有完整的数据库结构信息
        let agentSchema = databaseSchema
        if (!agentSchema && connection.metadata && (connection.metadata as any).schemas) {
          agentSchema = (connection.metadata as any).schemas
        }
        
        // 如果仍然没有 schema，尝试从智能体的 schema 查询工具获取
        if (!agentSchema || (Array.isArray(agentSchema) && agentSchema.length === 0)) {
          workProcess.push("📊 **正在获取数据库结构...**")
          
          // 查找 schema 查询工具
          const availableTools: AgentTool[] = agent.tools?.filter((t: AgentTool) => t.enabled && t.type === "sql_query") || []
          const schemaTool = availableTools.find((tool: AgentTool) => {
            const config = tool.config as any
            return config?.sql && tool.name.toLowerCase().includes("schema")
          }) || availableTools[0] // 如果没有找到 schema 工具，使用第一个工具
          
          if (schemaTool) {
            try {
              const toolResult = await AgentToolExecutor.executeSQLTool(
                schemaTool,
                connection as any
              )
              
              if (toolResult.success && toolResult.result) {
                // 转换查询结果为 schema 格式（使用与旧架构相同的函数）
                const convertedSchema = convertQueryResultToSchema(toolResult.result, connection as any)
                if (convertedSchema.length > 0) {
                  agentSchema = convertedSchema
                  workProcess.push(`✅ **已获取数据库结构**：${convertedSchema.length} 个表`)
                } else {
                  // 如果转换失败，尝试使用备用方案
                  if (connection.metadata && (connection.metadata as any).schemas) {
                    agentSchema = (connection.metadata as any).schemas
                    workProcess.push(`✅ **使用备用schema**: ${agentSchema.length} 个表`)
                  }
                }
              }
            } catch (error: any) {
              console.warn("[Chat] Failed to fetch schema for Agent:", error)
              workProcess.push(`⚠️ **无法获取数据库结构，继续执行**`)
            }
          }
        }

        // 🔒 新架构也必须做“表/列”权限过滤：让 Agent 只看到允许的表与列（生产安全优先）
        if (user.role !== "admin") {
          const permissionContext = {
            user,
            databaseConnectionId: effectiveDatabaseConnectionId,
            organizationId: user.organizationId,
          }
          const compiled = await PermissionApplier.compilePermissions(permissionContext)
          agentSchema = PermissionApplier.filterSchemaForUser(agentSchema || [], compiled)
        }
        
        // 准备 Agent 上下文
        const agentContext: any = {
          user,
          agent,
          llmConnection: agentLLMConnection,
          databaseConnection: connection,
          databaseSchema: agentSchema || [],
          messages: messages || [],
          workProcess,
          sessionId: actualSessionId || sessionId,
        }
        
        // 执行 Agent
        const agentExecutionStartTime = Date.now()
        const agentResult = await AgentExecutor.execute(userQuestion, agentContext)
        performanceLog.agentExecution = Date.now() - agentExecutionStartTime
        console.log(`[Performance] Agent execution: ${performanceLog.agentExecution}ms (${(performanceLog.agentExecution / 1000).toFixed(2)}s)`)
        
        // 记录审计日志
        await logAudit({
          userId: user.id,
          userName: user.email,
          action: "agent_execution",
          resourceType: "agent",
          resourceId: agent.id,
          details: `Agent执行: ${userQuestion.substring(0, 100)}`,
          status: agentResult.success ? "success" : "failed",
          organizationId: user.organizationId,
        })
        
        // 返回结果
        // 确保message不为空，如果为空则从workProcess中提取最后一条有意义的信息
        let finalMessage = agentResult.message
        if (!finalMessage || finalMessage.trim() === "" || finalMessage === "未生成响应") {
          // 从workProcess中提取最后一条有意义的信息
          if (agentResult.workProcess && agentResult.workProcess.length > 0) {
            // 查找最后一条包含实际内容的信息（排除统计信息）
            const meaningfulMessages = agentResult.workProcess.filter((step: string) => {
              return !step.includes("统计") && 
                     !step.includes("执行完成") && 
                     !step.includes("迭代") &&
                     step.trim().length > 0
            })
            if (meaningfulMessages.length > 0) {
              finalMessage = meaningfulMessages[meaningfulMessages.length - 1]
                .replace(/\*\*/g, '') // 移除markdown加粗标记
                .replace(/^[🔍💬📊🔄🤖⚙️✅❌]\s*/, '') // 移除emoji前缀
                .trim()
            } else {
              // 如果找不到有意义的信息，使用默认消息
              finalMessage = "Agent执行完成，但未生成响应内容。"
            }
          } else {
            finalMessage = "Agent执行完成，但未生成响应内容。"
          }
        }
        
        console.log("[Chat] Agent execution result:", {
          success: agentResult.success,
          messageLength: finalMessage?.length || 0,
          messagePreview: finalMessage?.substring(0, 100) || "empty",
          workProcessLength: agentResult.workProcess?.length || 0,
          toolCallsCount: agentResult.toolCalls?.length || 0,
        })
        
        // 从 toolCalls 中提取 SQL 查询结果
        let extractedQueryResult = null
        let extractedSQL = null
        
        if (agentResult.toolCalls && agentResult.toolCalls.length > 0) {
          // 找到所有 SQL 工具调用
          // 改进识别逻辑：不仅检查工具名称，还检查结果结构（是否有 columns 字段）
          const sqlToolCalls = agentResult.toolCalls.filter(tc => {
            // 检查是否是成功的工具调用
            if (!tc.result?.success || !tc.result?.result) {
              return false
            }
            
            const result = tc.result.result
            
            // 方法1: 检查工具名称是否包含 'sql'
            const isSQLByName = tc.toolName?.toLowerCase().includes('sql')
            
            // 方法2: 检查参数中是否有 sql
            const hasSQLInArgs = !!tc.arguments?.sql
            
            // 方法3: 检查结果结构是否有 columns 和 rows（这是 SQL 查询结果的典型特征）
            const hasQueryResultStructure = result?.columns && Array.isArray(result.columns) && 
                                           (result?.rows || Array.isArray(result.rows))
            
            // 只要满足任一条件，就认为是 SQL 工具调用
            return (isSQLByName || hasSQLInArgs || hasQueryResultStructure)
          })
          
          // 使用最后一个成功的 SQL 查询结果
          if (sqlToolCalls.length > 0) {
            const lastSQLToolCall = sqlToolCalls[sqlToolCalls.length - 1]
            extractedQueryResult = lastSQLToolCall.result.result
            extractedSQL = lastSQLToolCall.arguments?.sql || lastSQLToolCall.result?.sql || null
            
            console.log('[Chat] Extracted query result from toolCalls', {
              toolCallsCount: agentResult.toolCalls.length,
              sqlToolCallsCount: sqlToolCalls.length,
              hasQueryResult: !!extractedQueryResult,
              rowCount: extractedQueryResult?.rows?.length || 0,
              columns: extractedQueryResult?.columns,
              sql: extractedSQL?.substring(0, 100),
              toolName: lastSQLToolCall.toolName
            })
          } else {
            console.log('[Chat] No successful SQL tool calls found', {
              toolCallsCount: agentResult.toolCalls.length,
              toolCalls: agentResult.toolCalls.map(tc => ({
                toolName: tc.toolName,
                hasResult: !!tc.result,
                success: tc.result?.success,
                hasQueryResult: !!tc.result?.result,
                hasColumns: !!tc.result?.result?.columns,
                hasRows: !!tc.result?.result?.rows,
                resultType: tc.result?.result ? typeof tc.result.result : 'null',
                resultKeys: tc.result?.result && typeof tc.result.result === 'object' ? Object.keys(tc.result.result) : []
              }))
            })
          }
        }
        
        return NextResponse.json({
          message: finalMessage,
          queryResult: extractedQueryResult,  // ✅ 使用提取的查询结果
          sql: extractedSQL,                  // ✅ 使用提取的 SQL
          error: agentResult.error || null,
          workProcess: agentResult.workProcess,
          sessionId: actualSessionId || sessionId,
          agentExecution: {
            success: agentResult.success,
            toolCalls: agentResult.toolCalls,
          },
        })
      } catch (error: any) {
        console.error("[Chat] Agent execution error:", error)
        workProcess.push(`❌ **Agent 执行错误**: ${error.message}`)
        
        // 如果 Agent 执行失败，回退到旧架构
        console.log("[Chat] Falling back to legacy architecture")
        workProcess.push("⚠️ **回退到传统架构**")
        // 继续执行下面的旧架构代码
      }
    }
    
    // ========== 旧架构：传统分支处理模式 ==========
    
    // 如果是"列出功能"类问题，需要获取数据库结构来生成功能列表
    if (userWantsFeatureList) {
      console.log("[Chat] User wants feature list, fetching database schema")
      workProcess.push("📋 **步骤 1: 数据准备与意图分析**")
      workProcess.push("📋 **正在生成功能列表...**")
      
      // 获取数据库结构（使用与后续代码相同的方式）
      let schema = databaseSchema
      if (!schema && connection.metadata && (connection.metadata as any).schemas) {
        schema = (connection.metadata as any).schemas
      }
      
      // 如果仍然没有 schema，尝试直接查询数据库获取结构
      if (!schema || (Array.isArray(schema) && schema.length === 0)) {
        try {
          // 使用 SQLExecutor 直接查询数据库结构
          if (connection.type === "mysql") {
            const tablesResult = await SQLExecutor.executeQuery(
              connection as any,
              `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = '${connection.database}' AND TABLE_TYPE = 'BASE TABLE'`
            )
            
            const schemas: DatabaseSchema[] = []
            for (const row of tablesResult.rows) {
              const tableName = (row as any).TABLE_NAME
              const columnsResult = await SQLExecutor.executeQuery(
                connection as any,
                `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_COMMENT
                 FROM information_schema.COLUMNS 
                 WHERE TABLE_SCHEMA = '${connection.database}' AND TABLE_NAME = '${tableName}'
                 ORDER BY ORDINAL_POSITION`
              )
              
              schemas.push({
                tableName,
                columns: columnsResult.rows.map((col: any) => ({
                  name: col.COLUMN_NAME,
                  type: col.DATA_TYPE,
                  nullable: col.IS_NULLABLE === "YES",
                  isPrimaryKey: col.COLUMN_KEY === "PRI",
                  isForeignKey: col.COLUMN_KEY === "MUL",
                  description: col.COLUMN_COMMENT || undefined,
                })),
              })
            }
            schema = schemas
          }
        } catch (error) {
          console.warn("[Chat] Failed to fetch schema for feature list:", error)
        }
      }
      
      // 使用LLM生成功能列表
      if (schema && Array.isArray(schema) && schema.length > 0) {
        // 获取LLM连接
        let llmConnection = agentLLMConnection
        
        if (!llmConnection) {
          if (agent && agent.llmConnectionId) {
            llmConnection = await db.lLMConnection.findUnique({
              where: { id: agent.llmConnectionId },
            })
          }
          
          if (!llmConnection) {
            llmConnection = await db.lLMConnection.findFirst({
              where: { 
                organizationId: user.organizationId,
                status: "active",
              },
            })
          }
        }
        
        if (!llmConnection) {
          return NextResponse.json({
            message: "无法生成功能列表：未配置 AI 模型连接。请前往\"模型管理\"页面创建 LLM 连接。",
            queryResult: null,
            sql: null,
            error: "LLM连接不可用",
            workProcess: workProcess,
            sessionId: sessionId,
          })
        }
        
        try {
          // 生成功能列表提示词
          const featurePrompt = await FeatureGenerator.generateFeaturesWithLLM(schema, llmConnection)
          
          // 验证并获取API Key
          const validatedApiKey = getValidatedApiKey(llmConnection, false)
          
          const provider = llmConnection.provider || "openai"
          const model = llmConnection.model || "gpt-4o-mini"
          const baseUrl = llmConnection.baseUrl || (llmConnection.provider === "ollama" ? "http://localhost:11434/v1" : "https://api.openai.com/v1")
          const temperature = llmConnection.temperature || 0.7
          const maxTokens = llmConnection.maxTokens || 3000
          
          // 构建API URL
          let apiUrl = baseUrl.endsWith("/") ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`
          
          if (baseUrl.includes("cloudflare.com")) {
            apiUrl = `https://gateway.ai.cloudflare.com/v1/${provider}/${model}/chat/completions`
          }
          
          const headers: HeadersInit = {
            "Content-Type": "application/json",
          }
          
          if (baseUrl.includes("cloudflare.com")) {
            // Cloudflare AI Gateway 不需要 API key
          } else if (provider === "anthropic") {
            headers["x-api-key"] = validatedApiKey
            headers["anthropic-version"] = "2023-06-01"
          } else {
            headers["Authorization"] = `Bearer ${validatedApiKey}`
          }
          
          // 调用LLM生成功能列表
          const response = await fetch(apiUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({
              model: model,
              messages: [
                {
                  role: "system",
                  content: (await PromptConfigService.getConfig("feature_list", "generate_features_system_message")) || "你是一个智能体（AI Agent），专门帮助用户通过自然语言查询和分析数据库。请从智能体的角度，根据数据库结构分析你可以为用户提供的功能，生成详细、实用的功能列表。",
                },
                {
                  role: "user",
                  content: featurePrompt,
                },
              ],
              temperature,
              max_tokens: maxTokens,
              stream: false,
            }),
          })
          
          if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`LLM API调用失败: ${response.status} - ${errorText}`)
          }
          
          const data = await response.json()
          // 支持多种响应格式：OpenAI (choices), Anthropic (content), Ollama (message.content 或 response)
          const featuresText = 
            data.choices?.[0]?.message?.content || 
            data.content || 
            data.message?.content ||
            data.response ||
            "无法生成功能列表"
          
          // 记录审计日志
          await logAudit({
            userId: user.id,
            userName: user.email,
            action: "query",
            resourceType: "database",
            resourceId: effectiveDatabaseConnectionId,
            details: "查询系统功能列表（通过LLM生成）",
            status: "success",
            organizationId: user.organizationId,
          })
          
          return NextResponse.json({
            message: featuresText,
            queryResult: null,
            sql: null,
            error: null,
            workProcess: workProcess,
            sessionId: sessionId,
            isFeatureList: true,
          })
        } catch (error: any) {
          console.error("[Chat] Failed to generate feature list with LLM:", error)
          return NextResponse.json({
            message: `生成功能列表失败：${error.message || "未知错误"}`,
            queryResult: null,
            sql: null,
            error: error.message || "LLM生成功能列表失败",
            workProcess: workProcess,
            sessionId: sessionId,
          })
        }
      } else {
        return NextResponse.json({
          message: "无法获取数据库结构信息，无法生成功能列表。请确保数据库连接正常。",
          queryResult: null,
          sql: null,
          error: "数据库结构信息不可用",
          workProcess: workProcess,
          sessionId: sessionId,
        })
      }
    }
    
    const userWantsToQuery = isQueryIntent(userQuestion)
    
    console.log("[Chat] User intent analysis:", {
      question: userQuestion.substring(0, 100),
      isQueryIntent: userWantsToQuery,
      isFeatureListIntent: userWantsFeatureList
    })
    
    // 如果不是查询意图，直接返回对话响应，不需要获取数据库结构
    if (!userWantsToQuery) {
      console.log("[Chat] User intent is not a query, skipping database schema fetch")
      workProcess.push("📋 **步骤 1: 数据准备与意图分析**")
      workProcess.push("💬 **正在生成对话响应...**")
      
      // 直接调用LLM生成对话响应，不需要数据库相关信息
      // 优先使用智能体的LLM连接（如果已加载）
      let llmConnection = agentLLMConnection
      
      // 如果没有智能体的LLM连接，尝试从其他地方获取
      if (!llmConnection) {
        if (agent && agent.llmConnectionId) {
          llmConnection = await db.lLMConnection.findUnique({
            where: { id: agent.llmConnectionId },
          })
        }
        
        if (!llmConnection) {
          llmConnection = await db.lLMConnection.findFirst({
            where: { 
              organizationId: user.organizationId,
              status: "active",
            },
          })
        }
      }
      
      if (!llmConnection) {
        return NextResponse.json({ 
          error: "未配置 AI 模型连接。请确保智能体已配置 LLM 连接，或前往\"模型管理\"页面创建 LLM 连接。" 
        }, { status: 400 })
      }
      
      console.log("[Chat] Using LLM connection for non-query response:", {
        llmConnectionId: llmConnection.id,
        llmConnectionName: llmConnection.name,
        provider: llmConnection.provider,
        model: llmConnection.model,
        hasApiKey: !!llmConnection.apiKey,
        apiKeyLength: llmConnection.apiKey?.length || 0,
        apiKeyPrefix: llmConnection.apiKey ? llmConnection.apiKey.substring(0, 10) + "..." : "none",
        isFromAgent: llmConnection.id === agentLLMConnection?.id,
      })
      
      // 验证并获取API Key
      let apiKey: string
      try {
        apiKey = getValidatedApiKey(llmConnection, false)
      } catch (error: any) {
        console.error("[Chat] LLM connection has invalid API key:", {
          connectionId: llmConnection.id,
          connectionName: llmConnection.name,
          error: error.message,
        })
        return NextResponse.json({ 
          error: error.message || `AI 模型连接 "${llmConnection.name}" 的 API Key 未配置或无效。请前往"模型管理"页面检查并更新 API Key。` 
        }, { status: 400 })
      }
      
      const provider = llmConnection.provider || "openai"
      const model = llmConnection.model || "gpt-4o-mini"
      const baseUrl = llmConnection.baseUrl || (llmConnection.provider === "ollama" ? "http://localhost:11434/v1" : "https://api.openai.com/v1")
      const temperature = llmConnection.temperature || 0.3
      const maxTokens = llmConnection.maxTokens || 2000
      
      console.log("[Chat] Using LLM connection:", {
        name: llmConnection.name,
        provider,
        model,
        hasApiKey: !!apiKey && apiKey.length > 0,
        apiKeyPrefix: apiKey ? apiKey.substring(0, 10) + "..." : "none",
        baseUrl,
      })
      
      const systemPrompt = (await PromptConfigService.getConfig("conversation", "non_query_response_system_prompt")) || `你是一个友好的AI助手。用户的问题不是数据库查询相关的，请用自然、友好的方式回答用户的问题。`
      
      // 构建API URL
      const apiUrl = baseUrl.includes("/v1") 
        ? `${baseUrl}/chat/completions`
        : `${baseUrl}/v1/chat/completions`
      
      // 验证并获取API Key
      let validatedApiKey: string
      try {
        if (llmConnection) {
          validatedApiKey = getValidatedApiKey(llmConnection, false)
        } else {
          validatedApiKey = apiKey || ""
          if (!validatedApiKey || validatedApiKey.trim() === "") {
            throw new Error("API Key未配置")
          }
        }
      } catch (error: any) {
        console.error("[Chat] API Key validation failed in non-query path:", error)
        return NextResponse.json({ 
          error: error.message || "AI 模型 API Key 未配置或无效。请前往\"模型管理\"页面检查并更新 API Key。" 
        }, { status: 400 })
      }
      
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      }
      
      if (provider === "ollama") {
        // Ollama 通常不需要 API Key，但如果提供了则使用
        if (validatedApiKey && validatedApiKey.trim() !== "") {
          headers["Authorization"] = `Bearer ${validatedApiKey}`
        }
      } else if (provider === "openai" || provider === "deepseek") {
        headers["Authorization"] = `Bearer ${validatedApiKey}`
      } else if (provider === "anthropic") {
        headers["x-api-key"] = validatedApiKey
        headers["anthropic-version"] = "2023-06-01"
      } else {
        // 默认使用Bearer格式
        headers["Authorization"] = `Bearer ${validatedApiKey}`
      }
      
      const response = await fetch(apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: model,
          messages: [
            { role: "system", content: systemPrompt },
            ...messages
          ],
          temperature,
          max_tokens: maxTokens,
          stream: false,
        }),
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = `AI 服务调用失败: ${response.status}`
        
        // 尝试解析错误信息
        try {
          const errorJson = JSON.parse(errorText)
          errorMessage = errorJson.error?.message || errorJson.message || errorText || errorMessage
        } catch {
          errorMessage = errorText ? `${errorMessage} ${errorText}` : errorMessage
        }
        
        // 401 错误通常是 API Key 问题
        if (response.status === 401) {
          errorMessage = `AI 模型 API Key 认证失败。请检查：\n1. API Key 是否正确\n2. API Key 是否已过期\n3. 前往"模型管理"页面检查模型配置\n\n原始错误: ${errorText}`
        }
        
        // 返回 500 而不是 LLM API 的状态码，避免前端误认为是后端认证失败
        return NextResponse.json({ 
          error: errorMessage,
          details: {
            llmApiStatus: response.status,
            llmApiError: errorText
          }
        }, { status: 500 })
      }
      
      const data = await response.json()
      // 支持多种响应格式：OpenAI (choices), Anthropic (content), Ollama (message.content 或 response)
    const assistantMessage = 
      data.choices?.[0]?.message?.content || 
      data.content || 
      data.message?.content ||
      data.response ||
      "无法生成响应。"
      
      return NextResponse.json({
        message: assistantMessage,
        queryResult: null,
        sql: null,
        error: null,
        workProcess: workProcess,
        sessionId: sessionId,
      })
    }
    
    // ========== 第一次查询：获取数据库结构（仅在查询意图时执行）==========
    let schema = databaseSchema
    let schemaQueryResult: any = null
    let schemaSQL: string | null = null
    
    // 提取智能体的SQL查询配置（用于查找schema查询）
    let availableTools: AgentTool[] = []
    if (agent && agent.tools && Array.isArray(agent.tools)) {
      availableTools = agent.tools.filter((tool: AgentTool) => tool.enabled && tool.type === "sql_query")
      console.log("[Chat] Available SQL query tools:", {
        count: availableTools.length,
        tools: availableTools.map(t => ({ name: t.name, description: t.description, enabled: t.enabled }))
      })
    } else {
      console.warn("[Chat] Agent has no tools or tools is not an array:", {
        hasAgent: !!agent,
        hasTools: !!(agent && agent.tools),
        toolsType: agent && agent.tools ? typeof agent.tools : 'none',
        toolsIsArray: agent && agent.tools ? Array.isArray(agent.tools) : false
      })
    }

    // 查找schema查询配置
    const schemaTool = findSchemaTool(availableTools)
    
    // 执行第一次查询：执行智能体的内置SQL语句，获取数据结构
    workProcess.push("📊 **正在获取数据库结构...**")
    
    // 如果配置了SQL查询配置，必须使用它来获取数据库结构
    if (!schemaTool) {
      console.error("[Chat] No schema SQL query config found!", {
        availableToolsCount: availableTools.length,
        agentId: agent?.id,
        agentName: agent?.name,
        hasTools: !!(agent && agent.tools),
        toolsType: agent && agent.tools ? typeof agent.tools : 'none'
      })
      return NextResponse.json({
        message: "错误：智能体未配置数据库结构查询。请先在智能体的SQL查询配置中添加获取数据库结构的查询，并确保该配置已启用。",
        queryResult: null,
        sql: null,
        error: "缺少数据库结构查询配置",
        workProcess: workProcess.length > 0 ? workProcess : undefined,
        sessionId: sessionId,
      })
    }
    
    try {
      // 使用智能体配置的schema查询（必须执行）
      console.log("[Chat] Using schema query config:", schemaTool.name)
      const toolConfig = schemaTool.config as SQLToolConfig
      schemaSQL = toolConfig.sql
      
      if (!schemaSQL || !schemaSQL.trim()) {
        console.error("[Chat] Schema SQL query config has empty SQL!")
        return NextResponse.json({
          message: "错误：SQL查询配置中的SQL语句为空。请检查智能体的SQL查询配置。",
          queryResult: null,
          sql: null,
          error: "SQL查询配置无效",
          workProcess: workProcess.length > 0 ? workProcess : undefined,
          sessionId: sessionId,
        })
      }
      
      console.log("[Chat] Executing schema query config SQL:", schemaSQL.substring(0, 100))
      const schemaQueryStartTime = Date.now()
      const toolResult = await AgentToolExecutor.executeSQLTool(
        schemaTool,
        connection as any
      )
      performanceLog.schemaQuery = Date.now() - schemaQueryStartTime
      console.log(`[Performance] Schema query execution: ${performanceLog.schemaQuery}ms`)
      
      if (!toolResult.success || !toolResult.result) {
        console.warn("[Chat] Schema query config execution failed, continuing with fallback:", toolResult.error)
        workProcess.push(`⚠️ **数据库结构查询失败，使用备用方案**: ${toolResult.error || "未知错误"}`)
        
        // 尝试使用connection.metadata中的schema作为备用方案
        if (connection.metadata && (connection.metadata as any).schemas) {
          schema = (connection.metadata as any).schemas
          console.log("[Chat] Using schema from connection.metadata as fallback")
          workProcess.push(`✅ **使用备用schema**: ${schema.length} 个表`)
        } else {
          // 如果也没有备用schema，使用空schema继续执行
          console.warn("[Chat] No fallback schema available, continuing with empty schema")
          schema = []
          workProcess.push(`⚠️ **继续执行（无schema信息）**`)
        }
        
        // 不返回错误，继续执行
        schemaQueryResult = null
      } else {
        schemaQueryResult = toolResult.result
        console.log("[Chat] Schema query config executed successfully, rows:", schemaQueryResult.rows?.length || 0)
        
        // 将查询结果转换为schema格式
        const convertedSchema = convertQueryResultToSchema(schemaQueryResult, connection as any)
        if (convertedSchema.length > 0) {
          schema = convertedSchema
          console.log(`[Chat] Schema converted successfully, ${convertedSchema.length} tables`)
          workProcess.push(`✅ **已获取数据库结构**：${convertedSchema.length} 个表`)
        } else {
          // 如果转换失败，尝试直接使用查询结果构建schema
          console.warn("[Chat] Schema conversion failed, attempting to build schema from raw result")
          
          // 尝试从查询结果中提取表结构信息
          if (schemaQueryResult.rows && schemaQueryResult.rows.length > 0) {
            const tableMap = new Map<string, Set<string>>()
            
            // 检查是否有表名列和列名列（支持中文和英文）
            const hasTableNameColumn = schemaQueryResult.columns && schemaQueryResult.columns.some((col: string) => 
              /表名|table.*name|TABLE_NAME|table_name/i.test(col)
            )
            const hasColumnNameColumn = schemaQueryResult.columns && schemaQueryResult.columns.some((col: string) => 
              /列名|column.*name|COLUMN_NAME|column_name/i.test(col)
            )
            
            // 尝试识别表名和列名
            schemaQueryResult.rows.forEach((row: any) => {
              let tableName: string | null = null
              let columnName: string | null = null
              
              if (hasTableNameColumn && schemaQueryResult.columns) {
                // 查找表名列
                const tableNameColumn = schemaQueryResult.columns.find((col: string) => 
                  /表名|table.*name|TABLE_NAME|table_name/i.test(col)
                )
                if (tableNameColumn) {
                  tableName = row[tableNameColumn] || 
                             row.TABLE_NAME || 
                             row.table_name || 
                             row.TABLE || 
                             row.table || 
                             row.name ||
                             null
                }
              } else {
                // 如果没有找到表名列，尝试所有可能的英文格式
                tableName = row.TABLE_NAME || row.table_name || row.TABLE || row.table || row.name || null
              }
              
              if (hasColumnNameColumn && schemaQueryResult.columns) {
                // 查找列名列
                const columnNameColumn = schemaQueryResult.columns.find((col: string) => 
                  /列名|column.*name|COLUMN_NAME|column_name/i.test(col)
                )
                if (columnNameColumn) {
                  columnName = row[columnNameColumn] || 
                              row.COLUMN_NAME || 
                              row.column_name || 
                              row.COLUMN || 
                              row.column ||
                              null
                }
              } else {
                // 如果没有找到列名列，尝试所有可能的英文格式
                columnName = row.COLUMN_NAME || row.column_name || row.COLUMN || row.column || null
              }
              
              if (tableName && columnName) {
                const tableNameStr = String(tableName).trim()
                const columnNameStr = String(columnName).trim()
                if (tableNameStr && columnNameStr) {
                  if (!tableMap.has(tableNameStr)) {
                    tableMap.set(tableNameStr, new Set())
                  }
                  tableMap.get(tableNameStr)!.add(columnNameStr)
                }
              }
            })
            
            if (tableMap.size > 0) {
              const schemas: any[] = []
              tableMap.forEach((columns, tableName) => {
                schemas.push({
                  tableName,
                  columns: Array.from(columns).map(col => ({
                    name: col,
                    type: "unknown",
                    nullable: false,
                    isPrimaryKey: false,
                  })),
                })
              })
              schema = schemas
              console.log(`[Chat] Schema built from raw result, ${schemas.length} tables`)
              workProcess.push(`✅ **已获取数据库结构**：${schemas.length} 个表（从原始结果构建）`)
            }
          }
          
          // 如果仍然无法构建schema，使用备用方案或空schema继续执行
          if (!schema || (Array.isArray(schema) && schema.length === 0)) {
            console.warn("[Chat] Failed to build schema from query result, using fallback")
            workProcess.push(`⚠️ **无法从查询结果中提取表结构信息，使用备用方案**`)
            
            // 尝试使用connection.metadata中的schema作为备用方案
            if (connection.metadata && (connection.metadata as any).schemas) {
              schema = (connection.metadata as any).schemas
              console.log("[Chat] Using schema from connection.metadata as fallback")
              workProcess.push(`✅ **使用备用schema**: ${schema.length} 个表`)
            } else {
              // 如果也没有备用schema，使用空schema继续执行
              console.warn("[Chat] No fallback schema available, continuing with empty schema")
              schema = []
              workProcess.push(`⚠️ **继续执行（无schema信息）**`)
            }
          }
        }
      }
    } catch (error: any) {
      console.warn("[Chat] Failed to fetch schema, continuing with fallback:", error)
      workProcess.push(`⚠️ **获取数据库结构失败，使用备用方案**: ${error.message || "未知错误"}`)
      
      // 尝试使用connection.metadata中的schema作为备用方案
      if (connection.metadata && (connection.metadata as any).schemas) {
        schema = (connection.metadata as any).schemas
        console.log("[Chat] Using schema from connection.metadata as fallback")
        workProcess.push(`✅ **使用备用schema**: ${schema.length} 个表`)
      } else {
        // 如果也没有备用schema，使用空schema继续执行
        console.warn("[Chat] No fallback schema available, continuing with empty schema")
        schema = []
        workProcess.push(`⚠️ **继续执行（无schema信息）**`)
      }
      
      // 不返回错误，继续执行
      schemaQueryResult = null
    }

    // 保存第一次查询的系统消息（隐藏，不返回给前端）
    if (sessionId && (schemaSQL || schemaQueryResult)) {
      try {
        // 查找或创建会话
        let session: any = await db.chatSession.findUnique({
          where: { id: sessionId },
        })
        
        if (!session) {
          // 如果会话不存在，创建新会话
          session = await db.chatSession.create({
            data: {
              id: sessionId,
              title: userQuestion.substring(0, 50) + (userQuestion.length > 50 ? "..." : ""),
              databaseConnectionId: effectiveDatabaseConnectionId,
              organizationId: user.organizationId,
              createdBy: user.id,
            },
          })
        }
        
        // 保存系统消息（role="system"）
        await db.chatMessage.create({
          data: {
            sessionId: session.id,
            role: "system",
            content: `获取数据库结构${schemaSQL ? ` (使用SQL查询配置: ${schemaTool?.name || 'unknown'})` : ' (使用information_schema)'}`,
            metadata: JSON.parse(JSON.stringify({
              sql: schemaSQL || "information_schema query",
              queryResult: schemaQueryResult,
              schema: schema,
            })),
          },
        })
        
        console.log("[Chat] System message saved for schema query")
      } catch (error) {
        console.error("[Chat] Failed to save system message:", error)
        // 不抛出错误，继续执行
      }
    }
    // ========== 第一次查询结束 ==========
    // ========== Aggregate阶段：处理第一次查询结果，从实际数据中提取字段白名单 ==========
    workProcess.push("🔄 **正在提取字段白名单...**")
    
    // 从第一次查询的实际数据结果中提取字段白名单
    // 优先从查询结果的列名中提取，而不是从schema转换
    let fieldWhitelistFromData: Record<string, string[]> = {}
    
    if (schemaQueryResult && schemaQueryResult.columns && schemaQueryResult.columns.length > 0) {
      // 情况1：如果查询结果返回的是表结构信息（包含TABLE_NAME和COLUMN_NAME）
      const hasTableNameColumn = schemaQueryResult.columns.some((col: string) => 
        /表名|table.*name|TABLE_NAME|table_name/i.test(col)
      )
      const hasColumnNameColumn = schemaQueryResult.columns.some((col: string) => 
        /列名|column.*name|COLUMN_NAME|column_name/i.test(col)
      )
      
      if (hasTableNameColumn && hasColumnNameColumn && schemaQueryResult.rows && schemaQueryResult.rows.length > 0) {
        // 从表结构查询结果中提取字段白名单
        console.log("[Chat] Extracting field whitelist from schema query result (TABLE_NAME/COLUMN_NAME format)")
        console.log("[Chat] Schema query result columns:", schemaQueryResult.columns)
        console.log("[Chat] First row sample:", schemaQueryResult.rows[0])
        const tableMap = new Map<string, Set<string>>()
        
        schemaQueryResult.rows.forEach((row: any) => {
          // 查找表名列 - 支持中文和英文列名
          let tableName: string | null = null
          const tableNameColumn = schemaQueryResult.columns.find((col: string) => 
            /表名|table.*name|TABLE_NAME|table_name/i.test(col)
          )
          if (tableNameColumn) {
            // 优先使用找到的列名作为key
            tableName = row[tableNameColumn] || 
                       row.TABLE_NAME || 
                       row.table_name || 
                       row.TABLE || 
                       row.table ||
                       (typeof row === 'object' ? row[Object.keys(row).find((k: string) => /表名|table.*name|TABLE_NAME|table_name/i.test(k)) || ''] : null)
          } else {
            // 如果没有找到表名列，尝试所有可能的英文格式
            tableName = row.TABLE_NAME || row.table_name || row.TABLE || row.table || null
          }
          
          // 查找列名列 - 支持中文和英文列名
          let columnName: string | null = null
          const columnNameColumn = schemaQueryResult.columns.find((col: string) => 
            /列名|column.*name|COLUMN_NAME|column_name/i.test(col)
          )
          if (columnNameColumn) {
            // 优先使用找到的列名作为key
            columnName = row[columnNameColumn] || 
                        row.COLUMN_NAME || 
                        row.column_name || 
                        row.COLUMN || 
                        row.column ||
                        (typeof row === 'object' ? row[Object.keys(row).find((k: string) => /列名|column.*name|COLUMN_NAME|column_name/i.test(k)) || ''] : null)
          } else {
            // 如果没有找到列名列，尝试所有可能的英文格式
            columnName = row.COLUMN_NAME || row.column_name || row.COLUMN || row.column || null
          }
          
          if (tableName && columnName) {
            const tableNameStr = String(tableName).trim()
            const columnNameStr = String(columnName).trim()
            if (tableNameStr && columnNameStr) {
              if (!tableMap.has(tableNameStr)) {
                tableMap.set(tableNameStr, new Set())
              }
              tableMap.get(tableNameStr)!.add(columnNameStr)
            }
          }
        })
        
        // 转换为字段白名单格式
        tableMap.forEach((columns, tableName) => {
          fieldWhitelistFromData[tableName] = Array.from(columns)
        })
        
        console.log("[Chat] Field whitelist extracted from schema query result:", {
          tableCount: Object.keys(fieldWhitelistFromData).length,
          tables: Object.keys(fieldWhitelistFromData),
          totalFields: Object.values(fieldWhitelistFromData).reduce((sum, fields) => sum + fields.length, 0),
          sampleTable: Object.keys(fieldWhitelistFromData)[0],
          sampleFields: Object.keys(fieldWhitelistFromData).length > 0 ? fieldWhitelistFromData[Object.keys(fieldWhitelistFromData)[0]].slice(0, 5) : []
        })
      } else if (schemaQueryResult.rows && schemaQueryResult.rows.length > 0) {
        // 情况2：如果查询结果返回的是实际数据（不是表结构信息）
        // 从数据的列名中提取字段白名单
        console.log("[Chat] Extracting field whitelist from actual data result (using column names)")
        
        // 尝试从第一行数据中推断表名（如果有表名列）
        const firstRow = schemaQueryResult.rows[0]
        let inferredTableName: string | null = null
        
        // 尝试从列名或数据中推断表名
        for (const col of schemaQueryResult.columns) {
          if (/table.*name|TABLE_NAME|table_name/i.test(col) && firstRow[col]) {
            inferredTableName = String(firstRow[col])
            break
          }
        }
        
        // 如果没有找到表名，尝试使用默认表名或从SQL中提取
        if (!inferredTableName) {
          // 尝试从SQL中提取表名
          const tableMatch = schemaSQL.match(/FROM\s+([`"]?)(\w+)\1/i) || 
                           schemaSQL.match(/JOIN\s+([`"]?)(\w+)\1/i)
          if (tableMatch) {
            inferredTableName = tableMatch[2]
          } else {
            // 使用默认表名
            inferredTableName = "data_table"
          }
        }
        
        // 使用查询结果的列名作为字段白名单
        fieldWhitelistFromData[inferredTableName] = schemaQueryResult.columns.map((col: string) => String(col))
        
        console.log("[Chat] Field whitelist extracted from actual data:", {
          tableName: inferredTableName,
          fieldCount: schemaQueryResult.columns.length,
          fields: schemaQueryResult.columns
        })
      }
    }
    
    // 如果从数据中提取失败，回退到使用schema转换的结果
    if (Object.keys(fieldWhitelistFromData).length === 0) {
      console.log("[Chat] Failed to extract whitelist from data, falling back to schema conversion")
      
      // 检查 schema 是否有效
      const hasValidSchema = schema && Array.isArray(schema) && schema.length > 0
      const tableNames = hasValidSchema 
        ? schema.map((table: any) => table.tableName || table.name || "").filter(Boolean)
        : []

      // 如果 schema 无效或没有表，使用备用方案或空schema继续执行
      if (!hasValidSchema || tableNames.length === 0) {
        console.warn("[Chat] Schema is invalid or empty after SQL query config execution, using fallback")
        workProcess.push(`⚠️ **数据库结构信息无效，使用备用方案**`)
        
        // 尝试使用connection.metadata中的schema作为备用方案
        if (connection.metadata && (connection.metadata as any).schemas) {
          schema = (connection.metadata as any).schemas
          console.log("[Chat] Using schema from connection.metadata as fallback")
          workProcess.push(`✅ **使用备用schema**: ${schema.length} 个表`)
          
          // 从备用schema中构建字段白名单
          schema.forEach((table: any) => {
            const tableName = table.tableName || table.name || ""
            if (tableName) {
              const columns = table.columns || []
              const fieldNames = columns.map((col: any) => {
                const colName = col.name || col.columnName || col.COLUMN_NAME || col.column_name
                return colName ? String(colName).trim() : null
              }).filter((name: any): name is string => typeof name === 'string' && name.length > 0)
              
              if (fieldNames.length > 0) {
                fieldWhitelistFromData[tableName] = fieldNames
              }
            }
          })
        } else {
          // 如果也没有备用schema，使用空schema继续执行
          console.warn("[Chat] No fallback schema available, continuing with empty schema")
          schema = []
          workProcess.push(`⚠️ **继续执行（无schema信息）**`)
        }
      }
      
      // 从schema中构建字段白名单（回退方案）
      schema.forEach((table: any) => {
        const tableName = table.tableName || table.name || ""
        if (tableName) {
          const columns = table.columns || []
          const fieldNames = columns.map((col: any) => {
            const colName = col.name || col.columnName || col.COLUMN_NAME || col.column_name
            return colName ? String(colName).trim() : null
          }).filter((name: any): name is string => typeof name === 'string' && name.length > 0)
          
          if (fieldNames.length > 0) {
            fieldWhitelistFromData[tableName] = fieldNames
          }
        }
      })
    }
    
    // 如果字段白名单为空，使用空白名单继续执行（不阻止执行）
    if (Object.keys(fieldWhitelistFromData).length === 0) {
      console.warn("[Chat] Field whitelist is empty after extraction, continuing with empty whitelist")
      workProcess.push(`⚠️ **无法提取字段白名单，继续执行（无字段白名单）**`)
      // 不返回错误，继续执行，后续步骤会处理空白名单的情况
    }
    
    const tableNames = Object.keys(fieldWhitelistFromData)
    
    console.log("[Chat] Aggregate: Field whitelist extracted from query result:", {
      tableCount: tableNames.length,
      tables: tableNames,
      schemaQueryResultRows: schemaQueryResult?.rows?.length || 0,
      schemaQueryResultColumns: schemaQueryResult?.columns || [],
      whitelist: Object.entries(fieldWhitelistFromData).map(([table, fields]) => ({
        table,
        fieldCount: fields.length,
        fields: fields.slice(0, 10) // 只显示前10个字段
      }))
    })
    
    // Aggregate: 从第一次查询结果中提取表结构信息（用于后续Agent决策）
    // 这是关键：Agent需要看到第一次查询的原始结果，而不仅仅是转换后的schema
    const firstQueryResultForAgent = {
      sql: schemaSQL,
      result: schemaQueryResult,
      extractedSchema: schema,
      fieldWhitelist: fieldWhitelistFromData, // 添加字段白名单
      tableNames: tableNames
    }
    
    workProcess.push(`✅ **Aggregate完成**：已从查询结果中提取 ${tableNames.length} 个表的字段白名单，共 ${Object.values(fieldWhitelistFromData).reduce((sum, fields) => sum + fields.length, 0)} 个字段`)

    // ========== Agent阶段：智能体决策 ==========
    workProcess.push("💡 **步骤 2: 查询生成与执行**")
    
    // 发送流式更新：开始生成SQL
    if (actualSessionId && !actualSessionId.startsWith("session_")) {
      sendStreamUpdate(actualSessionId, "step_started", {
        step: "query_generation",
        message: "正在生成SQL查询...",
        workProcess: [...workProcess],
      })
    }
    
    // 获取 LLM 连接配置
    // 优先使用智能体的LLM连接（如果已加载）
    let llmConnection: any = agentLLMConnection
    
    // 如果智能体的LLM连接已加载，直接使用
    if (llmConnection) {
      console.log("[Chat] Using agent's LLM connection (pre-loaded):", llmConnection.name)
      console.log("[Chat] LLM connection details:", {
        id: llmConnection.id,
        name: llmConnection.name,
        provider: llmConnection.provider,
        model: llmConnection.model,
        hasApiKey: !!llmConnection.apiKey,
        apiKeyLength: llmConnection.apiKey?.length || 0,
        apiKeyPrefix: llmConnection.apiKey ? llmConnection.apiKey.substring(0, 10) + "..." : "none",
        baseUrl: llmConnection.baseUrl,
      })
    } else if (agent && agent.llmConnectionId) {
      // 如果没有预加载，但有智能体配置，尝试加载
      llmConnection = await db.lLMConnection.findUnique({
        where: { id: agent.llmConnectionId },
      })
      if (llmConnection) {
        console.log("[Chat] Using agent's LLM connection (loaded from agent):", llmConnection.name)
        console.log("[Chat] LLM connection details:", {
          id: llmConnection.id,
          name: llmConnection.name,
          provider: llmConnection.provider,
          model: llmConnection.model,
          hasApiKey: !!llmConnection.apiKey,
          apiKeyLength: llmConnection.apiKey?.length || 0,
          apiKeyPrefix: llmConnection.apiKey ? llmConnection.apiKey.substring(0, 10) + "..." : "none",
          baseUrl: llmConnection.baseUrl,
        })
      }
    }
    
    // 如果没有智能体的 LLM 连接，尝试从配置中获取
    if (!llmConnection && effectiveLLMConfig?.provider && effectiveLLMConfig?.model) {
      // 尝试从数据库获取配置的 LLM 连接
      const connections = await db.lLMConnection.findMany({
        where: {
          organizationId: user.organizationId,
          provider: effectiveLLMConfig.provider,
          model: effectiveLLMConfig.model,
          status: "active",
        },
        take: 1,
      })
      if (connections.length > 0) {
        llmConnection = connections[0]
        console.log("[Chat] Using configured LLM connection:", llmConnection.name)
        console.log("[Chat] LLM connection details:", {
          id: llmConnection.id,
          name: llmConnection.name,
          provider: llmConnection.provider,
          model: llmConnection.model,
          hasApiKey: !!llmConnection.apiKey,
          apiKeyLength: llmConnection.apiKey?.length || 0,
          apiKeyPrefix: llmConnection.apiKey ? llmConnection.apiKey.substring(0, 10) + "..." : "none",
          baseUrl: llmConnection.baseUrl,
        })
      } else {
        // 尝试获取默认的 LLM 连接
        const defaultConnections = await db.lLMConnection.findMany({
          where: {
            organizationId: user.organizationId,
            status: "active",
            isDefault: true,
          },
          take: 1,
        })
        if (defaultConnections.length > 0) {
          llmConnection = defaultConnections[0]
          console.log("[Chat] Using default LLM connection:", llmConnection.name)
          console.log("[Chat] LLM connection details:", {
            id: llmConnection.id,
            name: llmConnection.name,
            provider: llmConnection.provider,
            model: llmConnection.model,
            hasApiKey: !!llmConnection.apiKey,
            apiKeyLength: llmConnection.apiKey?.length || 0,
            apiKeyPrefix: llmConnection.apiKey ? llmConnection.apiKey.substring(0, 10) + "..." : "none",
            baseUrl: llmConnection.baseUrl,
          })
        } else {
          // 尝试获取任何激活的 LLM 连接
          const anyConnections = await db.lLMConnection.findMany({
            where: {
              organizationId: user.organizationId,
              status: "active",
            },
            take: 1,
          })
          if (anyConnections.length > 0) {
            llmConnection = anyConnections[0]
            console.log("[Chat] Using first available LLM connection:", llmConnection.name)
            console.log("[Chat] LLM connection details:", {
              id: llmConnection.id,
              name: llmConnection.name,
              provider: llmConnection.provider,
              model: llmConnection.model,
              hasApiKey: !!llmConnection.apiKey,
              apiKeyLength: llmConnection.apiKey?.length || 0,
              apiKeyPrefix: llmConnection.apiKey ? llmConnection.apiKey.substring(0, 10) + "..." : "none",
              baseUrl: llmConnection.baseUrl,
            })
          }
        }
      }
    }

    // 🔒 权限过滤：在构建schema之前，先过滤掉用户无权访问的表
    // 优化：添加性能监控
    // 这样AI就只会看到允许访问的表，不会尝试生成访问未授权表的SQL
    let filteredSchema = schema
    if (user.role !== "admin" && schema && Array.isArray(schema)) {
      try {
        const permissionStartTime = Date.now()
        const permissionContext = {
          user,
          databaseConnectionId: effectiveDatabaseConnectionId,
          organizationId: user.organizationId,
        }
        const compiled = await PermissionApplier.compilePermissions(permissionContext)
        performanceLog.permissionCheck = Date.now() - permissionStartTime
        console.log(`[Performance] Permission check: ${performanceLog.permissionCheck}ms`)
        
        // 过滤schema：表+列（列级权限会把 accessible=false 的列移除）
        filteredSchema = PermissionApplier.filterSchemaForUser(schema as any[], compiled)
        
        console.log("[Chat] Permission filtering applied:", {
          originalTableCount: schema.length,
          filteredTableCount: filteredSchema.length,
          accessibleTables: Array.from(compiled.allowedTables),
          filteredTables: filteredSchema.map((t: any) => t.tableName || t.name),
        })
        
        // 如果过滤后没有表，拒绝访问
        if (filteredSchema.length === 0) {
          throw new Error(
            "您没有访问任何数据表的权限。请联系管理员配置相应权限。"
          )
        }
      } catch (permError: any) {
        // 权限检查失败，直接抛出错误
        throw permError
      }
    }

    // 格式化数据库结构（使用过滤后的schema）
    const formattedSchema = formatDatabaseSchema(filteredSchema)
    const schemaText = formattedSchema

    // 识别表关系（用于JOIN查询，基于过滤后的schema）
    const tableRelationships =
      filteredSchema && Array.isArray(filteredSchema) && filteredSchema.length > 0
        ? identifyTableRelationships(filteredSchema as DatabaseSchema[])
        : ""

    // 识别是否需要跨表/多表查询（JOIN）
    const crossTableDetection = detectCrossTableNeed({
      question: userQuestion,
      schema: (filteredSchema as any) || [],
      tableNames: (typeof tableNames !== "undefined" ? tableNames : []) as any,
    })
    const needsJoinQuery = crossTableDetection.needsJoin

    // 当需要跨表时，为提示词追加强约束（避免逗号多表导致笛卡尔积、避免字段歧义）
    const joinRequirementsText = needsJoinQuery
      ? `\n\n**JOIN 生成约束（必须遵守）**：\n- 当前问题需要跨表/多表查询，请使用显式 \`JOIN ... ON ...\` 连接表，**禁止**使用 \`FROM t1, t2\` 这类逗号多表方式（会造成笛卡尔积）。\n- 多表查询时，所有字段必须使用表名/别名前缀（如 \`t.column\`），避免字段歧义。\n- JOIN 条件应优先使用上方“表关系（用于JOIN查询）”中的外键关系；如果关系不明确，请选择最合理的外键字段并在 explanation 中说明。\n`
      : ""

    const relationshipsText = tableRelationships
      ? `\n${tableRelationships}${joinRequirementsText}`
      : joinRequirementsText

    // 构建字段白名单（仅在查询意图时构建）
    // 构建表结构摘要（用于系统提示词，让 LLM 更容易理解）
    const schemaSummary = filteredSchema.map((table: any) => {
      const tableName = table.tableName || table.name || "未知表"
      const columns = table.columns || []
      const columnNames = columns.map((col: any) => 
        col.name || col.columnName || col.COLUMN_NAME
      ).filter(Boolean)
      return {
        table: tableName,
        columns: columnNames
      }
    })

    // 构建详细的表结构摘要，列出每个表的所有字段（使用过滤后的schema）
    const detailedSchemaSummary = filteredSchema.map((table: any) => {
      const tableName = table.tableName || table.name || "未知表"
      const columns = table.columns || []
      const columnList = columns.map((col: any) => {
        const colName = col.name || col.columnName || col.COLUMN_NAME
        const colType = col.type || col.dataType || col.DATA_TYPE || "unknown"
        const isPrimaryKey = col.isPrimaryKey || col.COLUMN_KEY === "PRI" ? " [主键]" : ""
        return `${colName}(${colType})${isPrimaryKey}`
      }).filter(Boolean)
      return { table: tableName, columns: columnList }
    })
    
    // 使用从第一次查询结果中提取的字段白名单（优先使用）
    // 如果从数据中提取失败，则从schema中构建（已在Aggregate阶段处理）
    const fieldWhitelist: Record<string, string[]> = fieldWhitelistFromData
    
    // 如果字段白名单为空，尝试从schema中补充（双重保险，使用过滤后的schema）
    if (Object.keys(fieldWhitelist).length === 0 && filteredSchema && Array.isArray(filteredSchema) && filteredSchema.length > 0) {
      console.log("[Chat] Field whitelist from data is empty, building from schema as fallback")
      filteredSchema.forEach((table: any) => {
        const tableName = table.tableName || table.name || ""
        if (tableName && !fieldWhitelist[tableName]) {
          const columns = table.columns || []
          const fieldNames = columns.map((col: any) => {
            const colName = col.name || 
                           col.columnName || 
                           col.COLUMN_NAME || 
                           col.column_name ||
                           (typeof col === 'string' ? col : null)
            
            if (!colName || typeof colName !== 'string') {
              return null
            }
            
            return colName.trim()
          }).filter((name: any): name is string => typeof name === 'string' && name.length > 0)
          
          if (fieldNames.length > 0) {
            fieldWhitelist[tableName] = fieldNames
          }
        }
      })
    }
    
    // 验证字段白名单是否正确构建
    console.log("[Chat] Field whitelist (final):", {
      tableCount: Object.keys(fieldWhitelist).length,
      tables: Object.keys(fieldWhitelist),
      whitelist: Object.entries(fieldWhitelist).map(([table, fields]) => ({
        table,
        fieldCount: fields.length,
        fields: fields.slice(0, 10) // 只显示前10个字段
      })),
      totalFields: Object.values(fieldWhitelist).reduce((sum, fields) => sum + fields.length, 0),
      source: Object.keys(fieldWhitelistFromData).length > 0 ? "from_query_result" : "from_schema"
    })
    
    // 验证字段白名单不为空
    if (Object.keys(fieldWhitelist).length === 0) {
      console.error("[Chat] Field whitelist is empty! Cannot generate SQL safely.")
      throw new Error("数据库结构信息不完整，无法构建字段白名单。请检查数据库连接和表结构。")
    }
    
    // 验证每个表都有字段
    for (const [table, fields] of Object.entries(fieldWhitelist)) {
      if (!fields || fields.length === 0) {
        console.warn(`[Chat] Table "${table}" has no fields in whitelist!`)
      }
    }
    
    // 构建字段白名单文本，确保格式清晰易读
    const fieldWhitelistText = Object.entries(fieldWhitelist).map(([table, fields]) => 
      `**${table}**: ${fields.join(", ")}`
    ).join("\n")
    
    // 如果字段白名单为空，记录警告
    if (!fieldWhitelistText || fieldWhitelistText.trim().length === 0) {
      console.error("[Chat] Field whitelist text is empty! This will cause LLM to generate invalid SQL.")
      throw new Error("字段白名单为空，无法安全生成SQL。请检查数据库结构。")
    }
    
    // 构建第一次查询结果的摘要信息，用于上下文
    let firstQueryResultSummary = ""
    if (schemaQueryResult && schemaQueryResult.rows && schemaQueryResult.rows.length > 0) {
      const rowCount = schemaQueryResult.rows.length
      const columnCount = schemaQueryResult.columns?.length || 0
      const sampleRows = schemaQueryResult.rows.slice(0, 3) // 显示前3行作为示例
      
      firstQueryResultSummary = `\n\n# 📊 第一次查询结果（数据结构信息）\n\n**第一次查询已执行完成，返回了以下数据结构信息：**\n\n- **查询SQL**: \`${schemaSQL}\`\n- **返回行数**: ${rowCount} 行\n- **返回列数**: ${columnCount} 列\n- **列名**: ${schemaQueryResult.columns?.join(", ") || "未知"}\n\n**示例数据（前3行）：**\n\`\`\`\n${JSON.stringify(sampleRows, null, 2)}\n\`\`\`\n\n**重要提示：**\n- 上述数据结构是从第一次查询的实际结果中提取的\n- 字段白名单基于这些实际数据构建\n- 生成第二次查询时，必须参考上述数据结构，确保字段名完全匹配\n\n`
    }
    
    // 从配置服务获取字段白名单说明文本
    // 优先使用合并后的提示词以提升性能
    const detailedSchemaSummaryText = detailedSchemaSummary.map((s: any) => `- **${s.table}**: ${s.columns.join(", ")}`).join("\n")
    
    // 先初始化 schemaSummaryText（可能为空，后续会根据需要填充）
    let schemaSummaryText = ""
    
    // 尝试使用合并后的提示词（性能优化）
    // 注意：合并提示词可能需要 schemaSummaryText，但我们可以先尝试获取合并提示词
    // 如果合并提示词不存在，再获取 schemaSummaryText
    let mergedPrompt = await PromptConfigService.getConfigWithVariables(
      "sql_generation",
      "sql_generation_merged_system_prompt",
      {
        databaseType: connection.type || "MySQL",
        databaseName: connection.database,
        schemaText: schemaText,
        relationshipsText: relationshipsText,
        schemaSummaryText: schemaSummaryText, // 使用已初始化的变量（可能为空，合并提示词模板会处理）
        toolsDescription: "", // 将在后面添加
        toolCallOrSql: availableTools.length > 0 ? '"toolCall": { "toolName": "SQL查询配置名称", "sql": "SQL语句" },' : '"sql": "完整且可执行的 SQL 查询语句",',
        firstQueryResultSummary,
        fieldWhitelistText: fieldWhitelistText || "⚠️ 警告：字段白名单为空，请检查数据库结构",
        detailedSchemaSummary: detailedSchemaSummaryText,
        tableNames: tableNames.join(", "),
      }
    )
    
    // 如果合并提示词不存在，回退到分别获取（向后兼容）
    if (!mergedPrompt) {
      schemaSummaryText = await PromptConfigService.getConfigWithVariables(
        "sql_generation",
        "sql_generation_field_whitelist_description",
        {
          firstQueryResultSummary,
          fieldWhitelistText: fieldWhitelistText || "⚠️ 警告：字段白名单为空，请检查数据库结构",
          detailedSchemaSummary: detailedSchemaSummaryText,
        }
      )

      // 如果配置不存在，使用默认值（向后兼容）
      if (!schemaSummaryText) {
        schemaSummaryText = `\n\n# 🚨🚨🚨 字段白名单（这是唯一可用的字段列表，只能使用这些字段！）🚨🚨🚨\n\n**⚠️ 重要说明：以下字段白名单是从智能体的内置SQL查询结果中提取的实际数据字段。这是生成SQL时唯一可用的字段列表。任何不在这个列表中的字段都是不存在的，使用它们会导致查询失败！**\n\n**📊 字段白名单来源：**\n这些字段是从智能体配置的内置SQL查询执行后返回的实际数据结果中提取的。系统已经执行了第一次查询获取了数据结构，并从中提取了所有可用的字段作为白名单。\n\n${firstQueryResultSummary}\n\n${fieldWhitelistText || "⚠️ 警告：字段白名单为空，请检查数据库结构"}\n\n**🔍 使用字段白名单的步骤（必须严格遵守）：**\n1. **生成SQL前，必须查看上面的字段白名单和第一次查询结果**\n2. **对于每个要使用的字段，在白名单中查找对应的表**\n3. **确认字段名完全匹配（注意大小写）**\n4. **如果字段不在白名单中，绝对不要使用，返回 sql: null**\n\n# 数据库表结构摘要（快速参考）\n\n${detailedSchemaSummaryText}\n\n**🚫 绝对禁止（违反将导致查询失败）：**\n- ❌ 使用白名单之外的任何字段名（包括猜测、编造、从示例中看到的、或从其他地方看到的字段名）\n- ❌ 使用 SELECT * 而不展开为具体列名（必须使用白名单中的字段）\n- ❌ 假设字段存在（如 country, email, phone 等常见字段名，除非它们确实在白名单中）\n- ❌ 如果字段不在白名单中，返回 sql: null 并在 explanation 中说明\n\n**✅ 必须严格遵守（这是生成SQL的唯一规则）：**\n- ✅ **生成SQL前，必须逐一检查每个字段名是否在白名单中**\n- ✅ **如果使用 SELECT *，必须展开为白名单中的具体列名**\n- ✅ **表名和字段名必须与白名单中的完全一致（注意大小写）**\n- ✅ **如果用户要求的字段不在白名单中，返回 sql: null，不要生成SQL**\n- ✅ **不要使用示例中的字段名（如 country, email），除非它们确实在字段白名单中**\n- ✅ **完整的表结构信息已在上方提供，请直接使用，不要查询表结构**\n\n**📋 字段验证检查清单（生成SQL前必须完成）：**\n- [ ] 所有表名都在字段白名单中存在\n- [ ] 所有字段名都在对应表的字段白名单中存在\n- [ ] 字段名的大小写与白名单中完全一致\n- [ ] 没有使用任何白名单中未定义的字段\n- [ ] 如果用户要求的字段不在白名单中，已返回 sql: null\n`
      }
    }

    // availableTools 已在第一次查询时定义，这里直接使用
    // 构建SQL查询配置描述（如果有配置）
    let toolsDescription = ""
    let allowDynamicSQL = true // 默认允许动态 SQL 生成
    
    if (availableTools.length > 0) {
      // 检查是否允许动态 SQL（如果所有查询配置都标记为"仅配置模式"，则不允许动态 SQL）
      // 这里我们默认允许混合模式：可以使用预配置的SQL查询，也可以动态生成
      allowDynamicSQL = true
      
      toolsDescription = "\n\n# 可用的SQL查询配置\n\n你可以使用以下预配置的 SQL 查询：\n\n"
      availableTools.forEach((tool, index) => {
        const toolConfig = tool.config as SQLToolConfig
        toolsDescription += `${index + 1}. **${tool.name}**: ${tool.description}\n`
        toolsDescription += `   SQL: \`${toolConfig.sql}\`\n`
        toolsDescription += `   操作类型: ${toolConfig.operation}\n\n`
      })
      
      if (allowDynamicSQL) {
        toolsDescription += `**使用规则：**\n`
        toolsDescription += `- 优先使用上述预配置的SQL查询（如果它们能满足用户需求）\n`
        toolsDescription += `- 如果预配置的SQL查询无法满足用户需求，你可以基于数据库结构动态生成新的 SQL 查询\n`
        toolsDescription += `- 动态生成的 SQL 必须是 SELECT 查询，且只能查询数据库架构中存在的表和列\n`
        toolsDescription += `- 调用预配置的SQL查询时，使用 toolCall 字段；动态生成 SQL 时，直接使用 sql 字段\n\n`
        toolsDescription += `**SQL查询配置调用格式：**\n\n`
        toolsDescription += `\`\`\`json\n`
        toolsDescription += `{\n`
        toolsDescription += `  "explanation": "说明为什么要使用这个SQL查询配置",\n`
        toolsDescription += `  "toolCall": {\n`
        toolsDescription += `    "toolName": "SQL查询配置名称",\n`
        toolsDescription += `    "sql": "要执行的 SQL 语句（必须与SQL查询配置中的完全匹配）",\n`
        toolsDescription += `    "parameters": { "参数名": "参数值" }\n`
        toolsDescription += `  }\n`
        toolsDescription += `}\n`
        toolsDescription += `\`\`\`\n\n`
        toolsDescription += `**动态 SQL 格式：**\n\n`
        toolsDescription += `\`\`\`json\n`
        toolsDescription += `{\n`
        toolsDescription += `  "explanation": "说明这个查询要做什么",\n`
        toolsDescription += `  "sql": "基于数据库结构动态生成的 SQL 查询语句",\n`
        toolsDescription += `  "reasoning": "解释为什么需要这个查询"\n`
        toolsDescription += `}\n`
        toolsDescription += `\`\`\`\n\n`
      } else {
        toolsDescription += `**重要规则：**\n`
        toolsDescription += `- 你只能执行上述SQL查询配置中的 SQL 语句，不能生成新的 SQL\n`
        toolsDescription += `- 如果用户的需求无法通过现有SQL查询配置满足，请说明原因\n`
        toolsDescription += `- 调用SQL查询配置时，必须在响应中包含 toolCall 字段，格式如下：\n\n`
        toolsDescription += `\`\`\`json\n`
        toolsDescription += `{\n`
        toolsDescription += `  "explanation": "说明为什么要使用这个SQL查询配置",\n`
        toolsDescription += `  "toolCall": {\n`
        toolsDescription += `    "toolName": "SQL查询配置名称",\n`
        toolsDescription += `    "sql": "要执行的 SQL 语句（必须与SQL查询配置中的完全匹配）",\n`
        toolsDescription += `    "parameters": { "参数名": "参数值" }\n`
        toolsDescription += `  }\n`
        toolsDescription += `}\n`
        toolsDescription += `\`\`\`\n\n`
      }
    }

    // 如果有智能体，使用智能体的系统消息作为基础，否则使用默认提示词
    let systemPrompt = ""
    if (systemMessage) {
      // 检查是否是表达式模式
      const systemMessageMode = (agent as any)?.systemMessageMode || "fixed"
      
      let processedSystemMessage = systemMessage
      
      // 如果是表达式模式，替换模板变量
      if (systemMessageMode === "expression") {
        processedSystemMessage = replaceTemplateVariables(systemMessage, {
          userInput: userQuestion,
          databaseSchema: formattedSchema, // 使用格式化后的易读格式
          databaseName: connection.database,
          databaseType: connection.type || "MySQL",
        })
      }
      
      // 如果表达式模式中没有包含数据库信息，则添加
      // 如果固定值模式，添加数据库相关信息
      if (systemMessageMode === "fixed" || !processedSystemMessage.includes("数据库")) {
        // 如果已使用合并提示词，则不需要单独获取查询配置要求
        let queryConfigRequirements = ""
        if (!mergedPrompt) {
          // 从配置服务获取SQL查询配置要求（向后兼容）
          queryConfigRequirements = await PromptConfigService.getConfigWithVariables(
            "sql_generation",
            "sql_generation_query_config_requirements",
            {
              tableNames: tableNames.join(", "),
            }
          ) || ""
        }

        // 如果配置不存在，使用默认值（向后兼容）
        if (!queryConfigRequirements) {
          queryConfigRequirements = `# 使用SQL查询配置的要求

**⚠️ 重要警告：绝对不要生成查询表结构的 SQL！**

系统已经提供了完整的数据库结构信息（表名、列名、数据类型等），你不需要查询表结构。
如果用户问的是数据相关问题（如"有多少"、"查询"、"显示"等），直接生成查询实际数据的 SQL。

**🚨 字段使用规则（最高优先级，必须严格遵守）：**

1. **字段白名单制度**：你只能使用上面"字段白名单"中明确列出的字段。任何不在白名单中的字段都是不存在的，绝对不要使用！

2. **生成SQL前的检查流程**：
   - 第一步：确定要查询的表名，检查表名是否在白名单中
   - 第二步：对于每个要查询的字段，逐一检查是否在该表的字段白名单中
   - 第三步：如果任何字段不在白名单中，不要生成SQL，返回 sql: null，并在 explanation 中说明缺少的字段

3. **SELECT * 的处理**：
   - 绝对禁止直接使用 SELECT * FROM table
   - 必须将 SELECT * 展开为该表字段白名单中的所有字段
   - 例如：如果 customers 表的字段白名单是 [id, name, email]，则必须写成 SELECT id, name, email FROM customers

4. **列名显示（重要）**：
   - **绝对禁止在SQL中使用 AS 别名**（如 SELECT id AS 'ID' 或 SELECT name AS '客户姓名'）
   - 系统会在应用层自动将列名翻译为中文显示，你不需要在SQL中处理
   - 直接使用原始列名即可，例如：SELECT id, name, email FROM customers
   - 如果用户要求中文表头，系统会自动处理，你不需要添加 AS 别名

5. **字段名匹配**：
   - 字段名必须与白名单中的完全一致（注意大小写）
   - 不要使用别名、缩写或猜测的字段名
   - **绝对不要假设字段存在**：即使是很常见的字段名（如 country, email, phone, name），也必须先检查字段白名单
   - 如果用户提到"国家"但白名单中没有"country"字段，必须返回 sql: null，不要猜测或使用其他字段名
   - 如果白名单中有类似的字段（如 country_code, nation），可以使用，但必须确认它在白名单中

6. **错误处理**：
   - 如果用户要求的字段不在白名单中，返回：
     \`\`\`json
     {
       "explanation": "数据库中没有找到字段 'XXX'。该表的可用字段有：id, name, email。请使用上述可用字段重新提问。",
       "sql": null,
       "reasoning": "用户要求的字段不在字段白名单中，无法生成查询"
     }
     \`\`\`

**如果数据库中没有相关表：**
- **必须**在 explanation 中明确告诉用户"数据库中没有 XXX 表"或"未找到相关表"
- **绝对不要**生成包含不存在表名的 SQL 语句
- **绝对不要**查询表结构来回答用户的问题
- **绝对不要**使用 information_schema、SHOW、DESCRIBE 等查询表结构
- **如果表不存在，直接说明，不要生成 SQL**

❌ **错误示例（绝对禁止）：**
- 用户问："有几个产品？" → 生成：\`SELECT COUNT(*) FROM products\`（如果 products 表不存在）❌
- 用户问："有几个产品？" → 生成：\`SELECT * FROM information_schema.COLUMNS WHERE TABLE_NAME LIKE '%product%'\` ❌
- 用户问："查询用户表结构" → 生成：\`SHOW COLUMNS FROM users\` ❌
- 用户问："有多少客户？" → 生成：\`DESCRIBE customers\` ❌

✅ **正确示例：**
- 用户问："有几个产品？" → 如果数据库中没有 products 表，返回：
  \`\`\`json
  {
    "explanation": "数据库中没有找到 'products' 或 '产品' 相关的数据表。当前数据库中可用的表有：${tableNames.join(", ")}。如果您需要查询产品信息，请确认表名是否正确，或者使用上述可用表名重新提问。",
    "sql": null,
    "reasoning": "用户询问产品数量，但数据库 schema 中没有 products 表，因此无法生成查询。应该明确告知用户可用的表名。"
  }
  \`\`\` ✅
- 用户问："有多少条记录？" → 如果用户没有指定表，返回：
  \`\`\`json
  {
    "explanation": "您想查询哪个表的记录数？当前数据库中可用的表有：${tableNames.join(", ")}。请指定表名，例如：'查询 users 表的记录数'。",
    "sql": null,
    "reasoning": "用户询问记录数但没有指定表名，需要询问用户想查询哪个表。"
  }
  \`\`\` ✅
- 用户问："显示所有数据" → 如果用户没有指定表，返回：
  \`\`\`json
  {
    "explanation": "您想查询哪个表的数据？当前数据库中可用的表有：${tableNames.join(", ")}。请指定表名，例如：'显示 users 表的所有数据'。",
    "sql": null,
    "reasoning": "用户要求显示所有数据但没有指定表名，需要询问用户想查询哪个表。"
  }
  \`\`\` ✅
- 用户问："查询 customers 表的记录数" → 如果 customers 表存在，生成：\`SELECT COUNT(*) FROM customers\` ✅

1、不要输出与问题无关的数据。

2、注意列和其他表之间的关联。

# 输出格式

必须以 JSON 格式返回，格式如下：

\`\`\`json
{
  "explanation": "用中文详细说明这个查询要做什么，包括查询逻辑和预期结果",
  ${availableTools.length > 0 ? '"toolCall": { "toolName": "SQL查询配置名称", "sql": "SQL语句" },' : '"sql": "完整且可执行的 SQL 查询语句",'}
  "reasoning": "详细解释为什么这个 SQL 能回答用户的问题，包括使用的技术（JOIN、聚合、排序等）和优化考虑"
}
\`\`\``
        }

        // 如果使用合并提示词，直接使用合并后的内容
        if (mergedPrompt) {
          // 将工具描述添加到合并提示词中
          const mergedWithTools = mergedPrompt.replace(
            "{{toolsDescription}}",
            toolsDescription
          )
          processedSystemMessage = `${processedSystemMessage}\n\n${mergedWithTools}`
        } else {
          // 向后兼容：分别添加各个部分
          processedSystemMessage = `${processedSystemMessage}${toolsDescription}

# 数据库信息
- 数据库类型: ${connection.type || "MySQL"}
- 数据库名称: ${connection.database}

# 数据库架构（完整信息）
${schemaText}
${relationshipsText}

${schemaSummaryText}

${queryConfigRequirements}`
        }
      } else {
        // 表达式模式已经包含了数据库信息，只添加工具描述和输出格式
        // 如果已使用合并提示词，则不需要单独获取查询配置要求
        let queryConfigRequirements = ""
        if (!mergedPrompt) {
          // 从配置服务获取SQL查询配置要求（向后兼容）
          queryConfigRequirements = await PromptConfigService.getConfigWithVariables(
            "sql_generation",
            "sql_generation_query_config_requirements",
            {
              tableNames: tableNames.join(", "),
            }
          ) || ""
        }

        // 如果配置不存在，使用默认值（向后兼容）
        if (!queryConfigRequirements) {
          queryConfigRequirements = `# 使用SQL查询配置的要求

**⚠️ 重要警告：绝对不要生成查询表结构的 SQL！**

系统已经提供了完整的数据库结构信息（表名、列名、数据类型等），你不需要查询表结构。
如果用户问的是数据相关问题（如"有多少"、"查询"、"显示"等），直接生成查询实际数据的 SQL。

**🚨 字段使用规则（最高优先级，必须严格遵守）：**

1. **字段白名单制度**：你只能使用上面"字段白名单"中明确列出的字段。任何不在白名单中的字段都是不存在的，绝对不要使用！

2. **生成SQL前的检查流程**：
   - 第一步：确定要查询的表名，检查表名是否在白名单中
   - 第二步：对于每个要查询的字段，逐一检查是否在该表的字段白名单中
   - 第三步：如果任何字段不在白名单中，不要生成SQL，返回 sql: null，并在 explanation 中说明缺少的字段

3. **SELECT * 的处理**：
   - 绝对禁止直接使用 SELECT * FROM table
   - 必须将 SELECT * 展开为该表字段白名单中的所有字段
   - 例如：如果 customers 表的字段白名单是 [id, name, email]，则必须写成 SELECT id, name, email FROM customers

4. **列名显示（重要）**：
   - **绝对禁止在SQL中使用 AS 别名**（如 SELECT id AS 'ID' 或 SELECT name AS '客户姓名'）
   - 系统会在应用层自动将列名翻译为中文显示，你不需要在SQL中处理
   - 直接使用原始列名即可，例如：SELECT id, name, email FROM customers
   - 如果用户要求中文表头，系统会自动处理，你不需要添加 AS 别名

5. **字段名匹配**：
   - 字段名必须与白名单中的完全一致（注意大小写）
   - 不要使用别名、缩写或猜测的字段名
   - **绝对不要假设字段存在**：即使是很常见的字段名（如 country, email, phone, name），也必须先检查字段白名单
   - 如果用户提到"国家"但白名单中没有"country"字段，必须返回 sql: null，不要猜测或使用其他字段名
   - 如果白名单中有类似的字段（如 country_code, nation），可以使用，但必须确认它在白名单中

6. **错误处理**：
   - 如果用户要求的字段不在白名单中，返回：
     \`\`\`json
     {
       "explanation": "数据库中没有找到字段 'XXX'。该表的可用字段有：id, name, email。请使用上述可用字段重新提问。",
       "sql": null,
       "reasoning": "用户要求的字段不在字段白名单中，无法生成查询"
     }
     \`\`\`

**如果数据库中没有相关表：**
- **必须**在 explanation 中明确告诉用户"数据库中没有 XXX 表"或"未找到相关表"
- **绝对不要**生成包含不存在表名的 SQL 语句
- **绝对不要**查询表结构来回答用户的问题
- **绝对不要**使用 information_schema、SHOW、DESCRIBE 等查询表结构
- **如果表不存在，直接说明，不要生成 SQL**

❌ **错误示例（绝对禁止）：**
- 用户问："有几个产品？" → 生成：\`SELECT COUNT(*) FROM products\`（如果 products 表不存在）❌
- 用户问："有几个产品？" → 生成：\`SELECT * FROM information_schema.COLUMNS WHERE TABLE_NAME LIKE '%product%'\` ❌
- 用户问："查询用户表结构" → 生成：\`SHOW COLUMNS FROM users\` ❌
- 用户问："有多少客户？" → 生成：\`DESCRIBE customers\` ❌

✅ **正确示例：**
- 用户问："有几个产品？" → 如果数据库中没有 products 表，返回：
  \`\`\`json
  {
    "explanation": "数据库中没有找到 'products' 或 '产品' 相关的数据表。当前数据库中可用的表有：${tableNames.join(", ")}。如果您需要查询产品信息，请确认表名是否正确，或者使用上述可用表名重新提问。",
    "sql": null,
    "reasoning": "用户询问产品数量，但数据库 schema 中没有 products 表，因此无法生成查询。应该明确告知用户可用的表名。"
  }
  \`\`\` ✅
- 用户问："有多少条记录？" → 如果用户没有指定表，返回：
  \`\`\`json
  {
    "explanation": "您想查询哪个表的记录数？当前数据库中可用的表有：${tableNames.join(", ")}。请指定表名，例如：'查询 users 表的记录数'。",
    "sql": null,
    "reasoning": "用户询问记录数但没有指定表名，需要询问用户想查询哪个表。"
  }
  \`\`\` ✅
- 用户问："显示所有数据" → 如果用户没有指定表，返回：
  \`\`\`json
  {
    "explanation": "您想查询哪个表的数据？当前数据库中可用的表有：${tableNames.join(", ")}。请指定表名，例如：'显示 users 表的所有数据'。",
    "sql": null,
    "reasoning": "用户要求显示所有数据但没有指定表名，需要询问用户想查询哪个表。"
  }
  \`\`\` ✅
- 用户问："查询 customers 表的记录数" → 如果 customers 表存在，生成：\`SELECT COUNT(*) FROM customers\` ✅

# 输出格式

必须以 JSON 格式返回，格式如下：

\`\`\`json
{
  "explanation": "用中文详细说明这个查询要做什么，包括查询逻辑和预期结果",
  ${availableTools.length > 0 ? '"toolCall": { "toolName": "SQL查询配置名称", "sql": "SQL语句" },' : '"sql": "完整且可执行的 SQL 查询语句",'}
  "reasoning": "详细解释为什么这个 SQL 能回答用户的问题，包括使用的技术（JOIN、聚合、排序等）和优化考虑"
}
\`\`\``
        }

        // 如果使用合并提示词，直接使用合并后的内容
        if (mergedPrompt) {
          // 将工具描述添加到合并提示词中
          const mergedWithTools = mergedPrompt.replace(
            "{{toolsDescription}}",
            toolsDescription
          )
          processedSystemMessage = `${processedSystemMessage}\n\n${mergedWithTools}`
        } else {
          // 向后兼容：分别添加各个部分
          processedSystemMessage = `${processedSystemMessage}${toolsDescription}

${queryConfigRequirements}`
        }
      }
      
      systemPrompt = processedSystemMessage
      
      // 如果检测到图表命令，添加JSON数据输出要求
      if (commandType === 'chart' && chartType) {
        const chartTypeNames: Record<string, string> = {
          'bar': '柱状图',
          'line': '折线图',
          'pie': '饼图',
          'area': '面积图',
          'scatter': '散点图',
          'radar': '雷达图',
          'gauge': '仪表盘',
          'funnel': '漏斗图',
          'heatmap': '热力图',
        }
        const chartTypeName = chartTypeNames[chartType] || chartType
        
        const chartDataInstruction = `

# 📊 图表数据输出要求（重要）

用户明确要求生成 ${chartTypeName}（类型：${chartType}）（使用了 @${chartTypeName} 命令）。

**你必须严格遵守以下规则：**

1. **必须返回 visualization 字段**：这是**强制要求**，不是可选项。无论查询结果如何，你**必须**在响应中包含 \`visualization\` 字段。

2. **使用指定的图表类型**：用户明确指定了图表类型为 ${chartType}，你必须使用这个类型。

## 输出格式要求

在正常的 explanation 和 sql 之后，**必须**添加一个 \`visualization\` 字段，包含图表数据：

\`\`\`json
{
  "explanation": "查询说明...",
  "sql": "SELECT ...",
  "reasoning": "查询逻辑...",
  "visualization": {
    "type": "${chartType}",
    "title": "图表标题（根据查询内容生成）",
    "data": [
      {"name": "类别1", "value": 100},
      {"name": "类别2", "value": 200}
    ]
  }
}
\`\`\`

## 数据格式要求

1. **visualization.data** 必须是一个数组，每个元素是一个对象
2. 每个对象至少包含：
   - 一个字符串字段（作为分类/名称，如 "name", "category", "date" 等）
   - 一个数值字段（作为数值，如 "value", "count", "amount" 等）
3. 数据应该从查询结果中提取，格式化为适合图表显示的结构
4. 如果查询返回多行数据，将每行转换为 visualization.data 中的一个对象

## 示例

用户查询："统计每个产品的销售额"

\`\`\`json
{
  "explanation": "查询每个产品的销售额统计",
  "sql": "SELECT product_name, SUM(amount) as total FROM orders GROUP BY product_name",
  "reasoning": "使用 GROUP BY 按产品分组，SUM 计算总销售额",
  "visualization": {
    "type": "${chartType}",
    "title": "产品销售额统计",
    "data": [
      {"name": "产品A", "value": 10000},
      {"name": "产品B", "value": 15000},
      {"name": "产品C", "value": 8000}
    ]
  }
}
\`\`\`

**重要**：
- ✅ **必须**返回 visualization 字段，这是强制要求
- ✅ 即使查询结果为空，也要返回 visualization 字段（data 为空数组）
- ✅ 如果数据不适合图表，也要返回 visualization 字段，前端会处理降级显示
- ❌ **禁止**忽略或省略 visualization 字段`
        
        systemPrompt = systemPrompt + chartDataInstruction
        console.log("[Chat] Added chart data instruction to system prompt", {
          chartType,
          commandType,
          emphasis: "必须返回 visualization 字段"
        })
      } else if (commandType === 'chart') {
        // 通用图表命令，不指定具体类型
        const chartDataInstruction = `

# 📊 图表数据输出要求（重要）

用户明确要求使用**图表**方式呈现数据（使用了 @图表 命令）。

**你必须严格遵守以下规则：**

1. **必须返回 visualization 字段**：这是**强制要求**，不是可选项。无论查询结果如何，你**必须**在响应中包含 \`visualization\` 字段。

2. **根据查询结果自动选择合适的图表类型**：你需要根据数据特征（分类对比、时间序列、占比等）自动选择最合适的图表类型。

## 输出格式要求

在正常的 explanation 和 sql 之后，**必须**添加一个 \`visualization\` 字段，包含图表数据：

\`\`\`json
{
  "explanation": "查询说明...",
  "sql": "SELECT ...",
  "reasoning": "查询逻辑...",
  "visualization": {
    "type": "bar",
    "title": "图表标题（根据查询内容生成）",
    "data": [
      {"name": "类别1", "value": 100},
      {"name": "类别2", "value": 200}
    ]
  }
}
\`\`\`

## 图表类型选择

根据数据特征选择合适的图表类型：
- 分类对比数据 → bar（柱状图）
- 时间序列数据 → line（折线图）
- 占比数据 → pie（饼图）
- 分布数据 → scatter（散点图）

## 数据格式要求

1. **visualization.data** 必须是一个数组，每个元素是一个对象
2. 每个对象至少包含：
   - 一个字符串字段（作为分类/名称）
   - 一个数值字段（作为数值）
3. 数据应该从查询结果中提取，格式化为适合图表显示的结构

**重要**：即使查询结果为空，也要返回 visualization 字段（data 为空数组）。`
        
        systemPrompt = systemPrompt + chartDataInstruction
        console.log("[Chat] Added generic chart data instruction to system prompt", {
          commandType,
          chartType: null
        })
      } else if (commandType === 'table') {
        // 表格命令，明确告诉智能体不要返回 visualization 字段
        const tableDataInstruction = `

# 📋 表格数据输出要求（重要）

用户明确要求使用**表格**方式呈现数据。

**你必须遵守以下规则：**

1. **绝对不要返回 visualization 字段**：用户要求使用表格，不是图表，因此你的响应中**不能包含** \`visualization\` 字段。

2. **只返回查询结果**：你的响应格式应该只包含以下字段：
   - \`explanation\`: 查询说明
   - \`sql\`: SQL查询语句
   - \`reasoning\`: 查询逻辑说明

3. **输出格式示例**：

\`\`\`json
{
  "explanation": "查询说明...",
  "sql": "SELECT ...",
  "reasoning": "查询逻辑..."
}
\`\`\`

**重要**：
- ❌ **禁止**返回 \`visualization\` 字段
- ✅ **只返回** explanation、sql、reasoning 三个字段
- ✅ 数据将通过表格方式在前端展示，你不需要生成图表数据`
        
        systemPrompt = systemPrompt + tableDataInstruction
        console.log("[Chat] Added table data instruction to system prompt", {
          commandType,
          instruction: "禁止返回 visualization 字段"
        })
      }
    }
    
    // 增强概念识别：即使没有明确命令，也检测用户问题中的关键词
    if (!commandType && userQuestion) {
      const lowerQuestion = userQuestion.toLowerCase()
      
      // 检测图表关键词
      const chartKeywords = [
        '图表', 'chart', '可视化', 'visualization', '柱状图', '折线图', '饼图', 
        '面积图', '散点图', '雷达图', '仪表盘', '漏斗图', '热力图',
        '用图表', '生成图表', '创建图表', '制作图表', '画图表', '绘制图表',
        '展示图表', '显示图表', '图表展示', '图表显示'
      ]
      const hasChartIntent = chartKeywords.some(keyword => lowerQuestion.includes(keyword))
      
      // 检测表格关键词
      const tableKeywords = [
        '表格', 'table', '列表', 'list', '数据表', '以表格形式', '用表格展示',
        '用表格显示', '表格形式', '表格展示', '表格显示', '列表形式'
      ]
      const hasTableIntent = tableKeywords.some(keyword => lowerQuestion.includes(keyword))
      
      // 检测报表/报告关键词
      const reportKeywords = [
        '报表', '报告', 'report', '分析报告', '生成报表', '创建报表', '制作报表',
        '生成报告', '创建报告', '制作报告', '业务报表', '数据报表', '统计报表'
      ]
      const hasReportIntent = reportKeywords.some(keyword => lowerQuestion.includes(keyword))
      
      // 根据检测结果添加相应的提示词说明
      if (hasChartIntent && !hasTableIntent && !hasReportIntent) {
        const chartIntentInstruction = `

# 📊 图表数据输出要求（重要）

检测到用户问题中包含图表相关关键词，用户希望使用**图表**方式呈现数据。

**你必须严格遵守以下规则：**

1. **必须返回 visualization 字段**：这是**强制要求**，不是可选项。无论查询结果如何，你**必须**在响应中包含 \`visualization\` 字段。

2. **根据查询结果自动选择合适的图表类型**：你需要根据数据特征（分类对比、时间序列、占比等）自动选择最合适的图表类型。

## 输出格式要求

在正常的 explanation 和 sql 之后，**必须**添加一个 \`visualization\` 字段，包含图表数据：

\`\`\`json
{
  "explanation": "查询说明...",
  "sql": "SELECT ...",
  "reasoning": "查询逻辑...",
  "visualization": {
    "type": "bar|line|pie|area|scatter|...",
    "title": "图表标题（根据查询内容生成）",
    "data": [
      {"name": "类别1", "value": 100},
      {"name": "类别2", "value": 200}
    ]
  }
}
\`\`\`

## 图表类型选择

根据数据特征选择合适的图表类型：
- 分类对比数据 → bar（柱状图）
- 时间序列数据 → line（折线图）
- 占比数据 → pie（饼图）
- 分布数据 → scatter（散点图）

**重要**：即使查询结果为空，也要返回 visualization 字段（data 为空数组）。`
        
        systemPrompt = systemPrompt + chartIntentInstruction
        console.log("[Chat] Added chart intent instruction based on keywords", {
          hasChartIntent,
          userQuestion: userQuestion.substring(0, 100)
        })
      } else if (hasTableIntent && !hasChartIntent && !hasReportIntent) {
        const tableIntentInstruction = `

# 📋 表格数据输出要求（重要）

检测到用户问题中包含表格相关关键词，用户希望使用**表格**方式呈现数据。

**你必须遵守以下规则：**

1. **绝对不要返回 visualization 字段**：用户要求使用表格，不是图表，因此你的响应中**不能包含** \`visualization\` 字段。

2. **只返回查询结果**：你的响应格式应该只包含以下字段：
   - \`explanation\`: 查询说明
   - \`sql\`: SQL查询语句
   - \`reasoning\`: 查询逻辑说明

3. **输出格式示例**：

\`\`\`json
{
  "explanation": "查询说明...",
  "sql": "SELECT ...",
  "reasoning": "查询逻辑..."
}
\`\`\`

**重要**：
- ❌ **禁止**返回 \`visualization\` 字段
- ✅ **只返回** explanation、sql、reasoning 三个字段
- ✅ 数据将通过表格方式在前端展示，你不需要生成图表数据`
        
        systemPrompt = systemPrompt + tableIntentInstruction
        console.log("[Chat] Added table intent instruction based on keywords", {
          hasTableIntent,
          userQuestion: userQuestion.substring(0, 100)
        })
      } else if (hasReportIntent && !hasChartIntent && !hasTableIntent) {
        const reportIntentInstruction = `

# 📄 报表/报告输出要求（重要）

检测到用户问题中包含报表/报告相关关键词，用户希望生成完整的**分析报告**。

**你必须遵守以下规则：**

1. **必须返回 aiReport 字段**：这是**强制要求**，不是可选项。你需要生成完整的分析报告，包含 \`aiReport\` 字段。

2. **报告内容要求**：
   - 包含数据摘要、关键发现、趋势分析、建议等
   - 可以包含多个图表和数据表格
   - 使用清晰的结构和专业的术语

3. **输出格式示例**：

\`\`\`json
{
  "explanation": "查询说明...",
  "sql": "SELECT ...",
  "reasoning": "查询逻辑...",
  "aiReport": {
    "title": "报告标题",
    "sections": [
      {
        "title": "章节标题",
        "content": "章节内容",
        "charts": [...],
        "tables": [...]
      }
    ]
  }
}
\`\`\`

**重要**：
- ✅ **必须**返回 \`aiReport\` 字段
- ✅ 报表/报告是完整的分析文档，包含多个图表、数据摘要、分析结论等
- ❌ **不要**只返回单个图表或表格，要生成完整的报告`
        
        systemPrompt = systemPrompt + reportIntentInstruction
        console.log("[Chat] Added report intent instruction based on keywords", {
          hasReportIntent,
          userQuestion: userQuestion.substring(0, 100)
        })
      }
    }
    
    if (!commandType) {
      // 使用默认系统提示词（优先使用合并后的提示词以提升性能）
      if (mergedPrompt) {
        // 使用合并后的提示词
        systemPrompt = mergedPrompt.replace("{{toolsDescription}}", toolsDescription)
      } else {
        // 向后兼容：使用默认系统提示词
        systemPrompt = `# 角色

作为卓越的数据库查询助手，你需要按以下步骤执行，并回答问题。

# 执行步骤

1、根据问题和数据库结构，使用SQL查询配置或动态生成SQL查询出相关结果。

2、根据查询出的结果回答问题。

3、使用图表工具生成合适的图表并展示。

# 数据库信息
- 数据库类型: ${connection.type || "MySQL"}
- 数据库名称: ${connection.database}

# 数据库架构
${schemaText}
${relationshipsText}

${schemaSummaryText}

# 使用SQL查询配置的要求

**🚨 字段使用规则（最高优先级，必须严格遵守）：**

1. **字段白名单制度**：你只能使用上面"字段白名单"中明确列出的字段。任何不在白名单中的字段都是不存在的，绝对不要使用！

2. **生成SQL前的检查流程**：
   - 第一步：确定要查询的表名，检查表名是否在白名单中
   - 第二步：对于每个要查询的字段，逐一检查是否在该表的字段白名单中
   - 第三步：如果任何字段不在白名单中，不要生成SQL，返回 sql: null，并在 explanation 中说明缺少的字段

3. **SELECT * 的处理**：
   - 绝对禁止直接使用 SELECT * FROM table
   - 必须将 SELECT * 展开为该表字段白名单中的所有字段
   - 例如：如果 customers 表的字段白名单是 [id, name, email]，则必须写成 SELECT id, name, email FROM customers

4. **列名显示（重要）**：
   - **绝对禁止在SQL中使用 AS 别名**（如 SELECT id AS \'ID\' 或 SELECT name AS \'客户姓名\'）
   - 系统会在应用层自动将列名翻译为中文显示，你不需要在SQL中处理
   - 直接使用原始列名即可，例如：SELECT id, name, email FROM customers
   - 如果用户要求中文表头，系统会自动处理，你不需要添加 AS 别名

5. **字段名匹配**：
   - 字段名必须与白名单中的完全一致（注意大小写）
   - 不要使用别名、缩写或猜测的字段名
   - **绝对不要假设字段存在**：即使是很常见的字段名（如 country, email, phone, name），也必须先检查字段白名单
   - 如果用户提到"国家"但白名单中没有"country"字段，必须返回 sql: null，不要猜测或使用其他字段名
   - 如果白名单中有类似的字段（如 country_code, nation），可以使用，但必须确认它在白名单中

5. **其他要求**：
   - 不要输出与问题无关的数据
   - 注意列和其他表之间的关联

# 输出格式

必须以 JSON 格式返回，格式如下：

\`\`\`json
{
  "explanation": "用中文详细说明这个查询要做什么，包括查询逻辑和预期结果",
  "sql": "完整且可执行的 SQL 查询语句",
  "reasoning": "详细解释为什么这个 SQL 能回答用户的问题，包括使用的技术（JOIN、聚合、排序等）和优化考虑"
}
\`\`\`

# 重要规则（必须严格遵守）

1. **只能生成 SELECT 查询**，绝对禁止：
   - INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE 等
   - 任何会修改数据的操作
2. **🚨 字段白名单制度（最高优先级，必须严格遵守）**：
   - **只能使用字段白名单中的字段**：上面已经提供了每个表的字段白名单，你只能使用白名单中明确列出的字段
   - **绝对禁止使用白名单外的字段**：任何不在白名单中的字段都是不存在的，使用它们会导致查询失败
   - **SELECT * 必须展开**：绝对禁止使用 SELECT *，必须展开为白名单中的具体字段列表
   - **生成SQL前的强制检查**：在生成SQL前，必须逐一检查每个字段名是否在该表的字段白名单中
   - **如果字段不在白名单中**：返回 sql: null，在 explanation 中明确说明该字段不存在，并列出该表的可用字段
   - **字段名必须完全匹配**：字段名必须与白名单中的完全一致（注意大小写），不要使用别名、缩写或猜测
3. **使用适合 ${connection.type || "MySQL"} 的正确 SQL 语法**
4. **SQL 必须完整且可执行**，不要包含注释或说明文字
5. **只查询与问题相关的数据**，不要输出无关信息
6. **跨表查询支持**：
   - **如果用户意图需要跨表查询，必须使用 JOIN 进行跨表查询**
   - 仔细分析用户问题，判断是否需要从多个表获取数据
   - 当需要关联多个表时，使用适当的 JOIN（INNER JOIN, LEFT JOIN, RIGHT JOIN 等）
   - 注意表之间的外键关系和关联字段
   - 例如：查询"客户的订单信息"需要 JOIN customers 和 orders 表
   - 例如：查询"销售人员的业绩"可能需要 JOIN users、opportunities、accounts 等多个表
   - **不要因为跨表查询复杂就避免，应该根据用户需求主动进行跨表查询**
7. **优先使用索引列**进行查询以提高性能
8. **处理常见需求**：
   - "最新" → 使用 ORDER BY 时间字段 DESC LIMIT
   - "最多/最少" → 使用 COUNT/SUM + GROUP BY + ORDER BY
   - "平均/总计" → 使用 AVG/SUM + GROUP BY
   - "前 N 个" → 使用 ORDER BY + LIMIT
   - "包含/包含于" → 使用 LIKE 或 IN
9. **如果架构中没有所需字段或表**：
   - **绝对不要**生成包含不存在字段或表名的 SQL
   - 在 explanation 中明确说明："数据库 schema 中没有找到字段 XXX" 或 "数据库中没有 XXX 表"
   - 提供替代方案（如果可能）：使用 schema 中存在的相似字段或表
   - 如果完全无法满足需求，明确告知用户，并列出可用的表和字段
   - **如果表不存在，sql 字段应该为 null，不要生成 SQL**
10. **如果问题不明确或表不存在**：
    - 如果用户没有指定表名，询问用户想查询哪个表，并列出可用表名
    - 如果指定的表不存在，明确告知用户，并列出可用的表名
    - 不要猜测表名，只使用 schema 中明确存在的表名
11. **字段验证检查清单**（生成 SQL 前必须确认）：
    - ✅ 所有表名都在 schema 中存在
    - ✅ 所有字段名都在对应表的 columns 中存在
    - ✅ 字段名的大小写与 schema 中完全一致
    - ✅ 没有使用任何 schema 中未定义的字段

# 高级查询技巧

- **多表关联（跨表查询）**：
  - **主动识别跨表查询需求**：当用户问题涉及多个实体（如"客户的订单"、"销售人员的业绩"、"产品的库存"等）时，必须使用 JOIN 进行跨表查询
  - **表关系自动识别**：
    - 通过外键字段名推断表关系（如 orders.customer_id → customers.id）
    - 通过表名推断关系（如 customers 和 orders 通过 customer_id 关联）
    - 优先使用 schema 中明确的外键关系
  - **JOIN 类型选择**：
    - INNER JOIN：只返回两表都有匹配的记录（默认选择，适用于大多数场景）
    - LEFT JOIN：返回左表所有记录，右表没有匹配则为 NULL（需要保留左表所有数据时使用）
    - RIGHT JOIN：返回右表所有记录，左表没有匹配则为 NULL（较少使用）
    - 根据业务需求选择合适的 JOIN 类型：
      * 查询"客户的订单" → 使用 LEFT JOIN，保留所有客户（即使没有订单）
      * 查询"有订单的客户" → 使用 INNER JOIN，只返回有订单的客户
  - **关联字段识别**：
    - 优先查找外键字段（如 customer_id, user_id, product_id）
    - 字段名可能不同（如 customer_id, customerId, customer_id），需要根据实际 schema 匹配
    - 如果找不到明确的外键，通过表名和字段名推断（如 orders 表的 customer_id 关联 customers 表的 id）
  - **多表 JOIN**：
    - 可以连接多个表，例如：FROM table1 JOIN table2 ON ... JOIN table3 ON ...
    - 注意 JOIN 的顺序，通常从主表开始（如 customers → orders → order_items）
    - 每个 JOIN 都需要明确的 ON 条件
  - **别名使用**：
    - 当表名较长或需要多次引用时，使用表别名提高可读性
    - 别名应该有意义（如 c for customers, o for orders）
    - 在 SELECT、WHERE、ORDER BY 等子句中使用别名引用字段
  - **性能考虑**：
    - 在 JOIN 条件中使用索引字段（通常是主键和外键）
    - 避免在 JOIN 条件中使用函数或计算
    - 合理使用 WHERE 条件过滤，减少 JOIN 的数据量
- **聚合分析**：使用 COUNT, SUM, AVG, MAX, MIN 进行统计分析
- **时间处理**：使用 DATE(), YEAR(), MONTH() 等函数处理时间字段
- **字符串处理**：使用 LIKE, CONCAT, SUBSTRING 等处理文本
- **条件逻辑**：使用 CASE WHEN 处理复杂条件
- **去重**：使用 DISTINCT 去除重复记录
- **排序和限制**：合理使用 ORDER BY 和 LIMIT

# 示例

示例1 - 简单查询：
用户: "查询所有客户"
你: \`\`\`json
{
  "explanation": "查询 customers 表中的所有客户信息，返回所有列",
  "sql": "SELECT * FROM customers",
  "reasoning": "用户要求查询所有客户，使用 SELECT * 可以获取所有列的信息"
}
\`\`\`

示例2 - 带排序的查询：
用户: "查询最新的10个订单"
你: \`\`\`json
{
  "explanation": "查询最新的10个订单，按创建时间降序排列，只返回前10条记录",
  "sql": "SELECT * FROM orders ORDER BY created_at DESC LIMIT 10",
  "reasoning": "用户要求'最新'的订单，需要使用 ORDER BY created_at DESC 按时间降序排列，LIMIT 10 限制返回10条记录"
}
\`\`\`

示例3 - 聚合查询（注意：必须使用字段白名单中的字段）：
用户: "统计每个国家的客户数量"
你: \`\`\`json
{
  "explanation": "按国家分组统计客户数量，返回每个国家及其对应的客户数。注意：必须使用字段白名单中存在的字段，如果白名单中没有'country'字段，返回 sql: null",
  "sql": "SELECT [国家字段名], COUNT(*) AS customer_count FROM customers GROUP BY [国家字段名] ORDER BY customer_count DESC",
  "reasoning": "用户要求统计每个国家的客户数量，但必须首先检查字段白名单中是否有国家相关的字段。如果白名单中没有'country'或类似字段，必须返回 sql: null 并说明原因。如果有，使用该字段进行 GROUP BY 分组统计"
}
\`\`\`

**⚠️ 重要：上面的示例中的 [国家字段名] 只是占位符，你必须：**
1. **先检查字段白名单**，找到实际存在的国家相关字段（可能是 country_code, nation, region 等）
2. **如果白名单中没有国家相关字段**，返回 sql: null，并在 explanation 中说明
3. **绝对不要猜测或使用示例中的字段名**（如 country），除非它确实在字段白名单中

示例4 - 多表关联（注意表关联）：
用户: "查询每个客户的订单总数和总金额"
你: \`\`\`json
{
  "explanation": "关联 customers 和 orders 表，通过 customer_id 外键关联，按客户分组统计订单数量和总金额",
  "sql": "SELECT c.id, c.name, COUNT(o.id) AS order_count, SUM(o.amount) AS total_amount FROM customers c LEFT JOIN orders o ON c.id = o.customer_id GROUP BY c.id, c.name",
  "reasoning": "需要关联两个表，注意 customers.id 和 orders.customer_id 之间的关联关系，使用 LEFT JOIN 确保没有订单的客户也会显示，GROUP BY 按客户分组，COUNT 统计订单数，SUM 计算总金额"
}
\`\`\`

示例5 - 表关系自动识别：
用户: "查询销售人员的业绩，包括姓名、负责的客户数和商机金额"
你: \`\`\`json
{
  "explanation": "需要关联 users（销售人员）、customers（客户）、opportunities（商机）三个表。通过外键关系：users.id = customers.assigned_to, customers.id = opportunities.customer_id",
  "sql": "SELECT u.name AS salesperson_name, COUNT(DISTINCT c.id) AS customer_count, SUM(o.amount) AS total_opportunity_amount FROM users u LEFT JOIN customers c ON u.id = c.assigned_to LEFT JOIN opportunities o ON c.id = o.customer_id WHERE u.role = 'sales' GROUP BY u.id, u.name",
  "reasoning": "识别到需要三个表的关联：1) users 表（销售人员）2) customers 表（通过 assigned_to 关联）3) opportunities 表（通过 customer_id 关联）。使用 LEFT JOIN 保留所有销售人员，即使没有客户或商机。使用 COUNT(DISTINCT) 统计客户数，SUM 计算商机总金额"
}
\`\`\`

示例5 - 处理缺失字段：
用户: "查询最新的客户"
你: \`\`\`json
{
  "explanation": "查询所有客户信息。注意：customers 表中没有创建时间字段，无法确定哪些是最新的客户，因此返回所有客户。如果需要按时间排序，建议添加 created_at 或 updated_at 字段。",
  "sql": "SELECT * FROM customers",
  "reasoning": "用户要求查询'最新'的客户，但数据库架构显示 customers 表没有时间相关字段（如 created_at, updated_at），因此无法按时间排序。返回所有客户信息，并在 explanation 中说明这个限制"
}
\`\`\`

现在开始帮助用户查询数据库。记住：
- 严格按照执行步骤：查询 → 回答问题 → 生成图表
- 只查询与问题相关的数据
- 注意表之间的关联关系
- 只能执行 SELECT 查询！`
      }
    }
    
    // 如果检测到图表命令，在system prompt中添加JSON数据输出要求
    if (commandType === 'chart' && chartType) {
      const chartTypeNames: Record<string, string> = {
        'bar': '柱状图',
        'line': '折线图',
        'pie': '饼图',
        'area': '面积图',
        'scatter': '散点图',
        'radar': '雷达图',
        'gauge': '仪表盘',
        'funnel': '漏斗图',
        'heatmap': '热力图',
        'tree': '树图',
        'treemap': '矩形树图',
        'sunburst': '旭日图',
        'graph': '关系图',
        'parallel': '平行坐标',
        'sankey': '桑基图',
        'boxplot': '箱线图',
        'candlestick': 'K线图',
        'map': '地图',
      }
      const chartTypeName = chartTypeNames[chartType] || chartType
      
      const chartDataInstruction = `

# 📊 图表数据输出要求（重要）

用户要求生成 ${chartTypeName}（类型：${chartType}）。

**你必须**在查询结果后，额外返回一个 JSON 格式的数据结构，用于前端渲染图表。

## 输出格式要求

在正常的 explanation 和 sql 之后，**必须**添加一个 \`visualization\` 字段，包含图表数据：

\`\`\`json
{
  "explanation": "查询说明...",
  "sql": "SELECT ...",
  "reasoning": "查询逻辑...",
  "visualization": {
    "type": "${chartType}",
    "title": "图表标题（根据查询内容生成）",
    "data": [
      {"name": "类别1", "value": 100},
      {"name": "类别2", "value": 200}
    ]
  }
}
\`\`\`

## 数据格式要求

1. **visualization.data** 必须是一个数组，每个元素是一个对象
2. 每个对象至少包含：
   - 一个字符串字段（作为分类/名称，如 "name", "category", "date" 等）
   - 一个数值字段（作为数值，如 "value", "count", "amount" 等）
3. 数据应该从查询结果中提取，格式化为适合图表显示的结构
4. 如果查询返回多行数据，将每行转换为 visualization.data 中的一个对象

## 示例

用户查询："统计每个产品的销售额"

\`\`\`json
{
  "explanation": "查询每个产品的销售额统计",
  "sql": "SELECT product_name, SUM(amount) as total FROM orders GROUP BY product_name",
  "reasoning": "使用 GROUP BY 按产品分组，SUM 计算总销售额",
  "visualization": {
    "type": "${chartType}",
    "title": "产品销售额统计",
    "data": [
      {"name": "产品A", "value": 10000},
      {"name": "产品B", "value": 15000},
      {"name": "产品C", "value": 8000}
    ]
  }
}
\`\`\`

**重要**：即使查询结果为空，也要返回 visualization 字段（data 为空数组）。`
      
      systemPrompt = systemPrompt + chartDataInstruction
      console.log("[Chat] Added chart data instruction to system prompt", {
        chartType,
        commandType,
        instructionLength: chartDataInstruction.length
      })
    } else if (commandType === 'chart') {
      // 通用图表命令，不指定具体类型
      const chartDataInstruction = `

# 📊 图表数据输出要求（重要）

用户要求生成图表，你需要根据查询结果自动选择合适的图表类型。

**你必须**在查询结果后，额外返回一个 JSON 格式的数据结构，用于前端渲染图表。

## 输出格式要求

在正常的 explanation 和 sql 之后，**必须**添加一个 \`visualization\` 字段，包含图表数据：

\`\`\`json
{
  "explanation": "查询说明...",
  "sql": "SELECT ...",
  "reasoning": "查询逻辑...",
  "visualization": {
    "type": "bar",
    "title": "图表标题（根据查询内容生成）",
    "data": [
      {"name": "类别1", "value": 100},
      {"name": "类别2", "value": 200}
    ]
  }
}
\`\`\`

## 图表类型选择

根据数据特征选择合适的图表类型：
- 分类对比数据 → bar（柱状图）
- 时间序列数据 → line（折线图）
- 占比数据 → pie（饼图）
- 分布数据 → scatter（散点图）

## 数据格式要求

1. **visualization.data** 必须是一个数组，每个元素是一个对象
2. 每个对象至少包含：
   - 一个字符串字段（作为分类/名称）
   - 一个数值字段（作为数值）
3. 数据应该从查询结果中提取，格式化为适合图表显示的结构

**重要**：
- ✅ **必须**返回 visualization 字段，这是强制要求
- ✅ 即使查询结果为空，也要返回 visualization 字段（data 为空数组）
- ✅ 如果数据不适合图表，也要返回 visualization 字段，前端会处理降级显示
- ❌ **禁止**忽略或省略 visualization 字段`
        
        systemPrompt = systemPrompt + chartDataInstruction
        console.log("[Chat] Added generic chart data instruction to system prompt", {
          commandType,
          emphasis: "必须返回 visualization 字段"
        })
    }

    // 使用配置的 LLM 或默认配置
    const provider = llmConnection?.provider || effectiveLLMConfig?.provider || "openai"
    const model = llmConnection?.model || effectiveLLMConfig?.model || "gpt-4o-mini"
    
    // 验证并获取API Key（优先使用数据库中的，如果无效则使用环境变量）
    let apiKey: string
    try {
      if (llmConnection) {
        apiKey = getValidatedApiKey(llmConnection, true) // 允许回退到环境变量
      } else {
        // 如果没有LLM连接，尝试使用环境变量
        apiKey = process.env.OPENAI_API_KEY || ""
        if (!apiKey || apiKey.trim() === "") {
          throw new Error("未配置LLM连接且环境变量中也没有API Key")
        }
      }
    } catch (error: any) {
      // 提供更详细的错误信息
      const errorMsg = `未配置 AI 模型 API Key。

请按以下步骤配置：
1. 前往"模型管理"页面
2. 点击"添加模型连接"
3. 选择 AI 提供商（如 OpenAI、Anthropic、Deepseek 等）
4. 输入有效的 API Key
5. 保存并激活连接

如果没有 API Key，可以：
- OpenAI: https://platform.openai.com/api-keys
- Anthropic: https://console.anthropic.com/
- Deepseek: https://platform.deepseek.com/
- 其他提供商请查看对应文档`
      throw new Error(errorMsg)
    }
    
    const baseUrl = llmConnection?.baseUrl || effectiveLLMConfig?.baseUrl || (provider === "ollama" ? "http://localhost:11434/v1" : "https://api.openai.com/v1")
    const temperature = llmConnection?.temperature || effectiveLLMConfig?.temperature || 0.3
    const maxTokens = llmConnection?.maxTokens || effectiveLLMConfig?.maxTokens || 2000

    // 构建 API 请求 URL
    let apiUrl: string
    if (baseUrl.includes("openai.com") || baseUrl.includes("anthropic.com") || baseUrl.includes("deepseek.com")) {
      apiUrl = baseUrl.endsWith("/") ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`
    } else if (baseUrl.includes("cloudflare.com")) {
      // Cloudflare AI Gateway
      apiUrl = `https://gateway.ai.cloudflare.com/v1/${provider}/${model}/chat/completions`
    } else {
      // 包括 Ollama 在内的其他 OpenAI 兼容格式
      apiUrl = baseUrl.endsWith("/") ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`
    }

    // 构建请求头
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    }

    // 根据 provider 设置认证头
    if (baseUrl.includes("cloudflare.com")) {
      // Cloudflare AI Gateway 不需要 API key
    } else if (provider === "ollama") {
      // Ollama 通常不需要 API Key，但如果提供了则使用
      if (apiKey && apiKey.trim() !== "") {
        headers["Authorization"] = `Bearer ${apiKey}`
      }
    } else if (provider === "anthropic") {
      headers["x-api-key"] = apiKey
      headers["anthropic-version"] = "2023-06-01"
    } else {
      headers["Authorization"] = `Bearer ${apiKey}`
    }

    // 验证系统提示词中是否包含字段白名单
    const hasFieldWhitelistInPrompt = systemPrompt.includes("字段白名单") || systemPrompt.includes("fieldWhitelist")
    const fieldWhitelistInPrompt = systemPrompt.match(/字段白名单[^:]*:\s*\n\n([\s\S]*?)(?:\n\n|$)/)
    
    // 验证字段白名单是否在提示词中
    if (!hasFieldWhitelistInPrompt) {
      console.error("[Chat] Field whitelist not found in system prompt! This will cause LLM to generate invalid SQL.")
      console.error("[Chat] System prompt preview:", systemPrompt.substring(0, 500))
    }
    
    // 验证字段白名单内容是否正确
    const expectedWhitelistText = Object.entries(fieldWhitelist).slice(0, 1).map(([table, fields]) => 
      `- **${table}**: ${fields.join(", ")}`
    ).join("\n")
    const whitelistInPrompt = fieldWhitelistInPrompt ? fieldWhitelistInPrompt[1] : ""
    const whitelistMatches = expectedWhitelistText && whitelistInPrompt.includes(expectedWhitelistText.substring(0, 50))
    
    console.log("[Chat] Calling LLM API:", {
      url: apiUrl.replace(apiKey || "", "***"),
      provider,
      model,
      hasApiKey: !!apiKey,
      systemPromptLength: systemPrompt.length,
      hasFieldWhitelistInPrompt,
      whitelistMatches,
      fieldWhitelistPreview: fieldWhitelistInPrompt ? fieldWhitelistInPrompt[1].substring(0, 200) : "not found",
      actualFieldWhitelist: Object.entries(fieldWhitelist).slice(0, 2).map(([table, fields]) => 
        `${table}: [${fields.slice(0, 3).join(", ")}...]`
      ),
      expectedFirstTable: Object.keys(fieldWhitelist)[0],
      expectedFirstFields: fieldWhitelist[Object.keys(fieldWhitelist)[0]]?.slice(0, 5)
    })

    let response: Response
    try {
      // 创建 AbortController 用于超时控制
      // 优化：减少超时时间，Ollama使用60秒，其他使用20秒（原来分别是120秒和30秒）
      const timeout = provider === "ollama" ? 60000 : 20000 // Ollama: 60秒，其他: 20秒
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      console.log("[Chat] Sending request to LLM:", {
        provider,
        model,
        baseUrl,
        apiUrl: apiUrl.replace(apiKey || "", "***"),
        timeout,
        hasApiKey: !!apiKey,
      })

      const llmCallStartTime = Date.now()
      response = await fetch(apiUrl, {
      method: "POST",
        headers,
      body: JSON.stringify({
        model: model,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
          temperature,
          max_tokens: maxTokens,
        stream: false,
      }),
        signal: controller.signal,
      })
      
      clearTimeout(timeoutId)
      performanceLog.llmCall = Date.now() - llmCallStartTime
      console.log(`[Performance] LLM API call: ${performanceLog.llmCall}ms (provider: ${provider}, model: ${model})`)
    } catch (fetchError: any) {
      console.error("[Chat] Fetch error:", {
        error: fetchError,
        name: fetchError.name,
        message: fetchError.message,
        cause: fetchError.cause,
        provider,
        model,
        baseUrl,
        apiUrl: apiUrl.replace(apiKey || "", "***"),
      })
      
      if (fetchError.name === "AbortError") {
        const timeoutSeconds = provider === "ollama" ? 60 : 20
        let errorMsg = `请求超时（${timeoutSeconds}秒），请稍后重试`
        
        if (provider === "ollama") {
          errorMsg = `❌ **Ollama 请求超时**\n\n请求在 ${timeoutSeconds} 秒内未完成。\n\n**可能的原因：**\n1. Ollama 服务未运行或无法访问\n2. 模型需要加载，耗时较长\n3. 网络连接问题（如果 Ollama 不在本地）\n\n**解决方案：**\n1. 检查 Ollama 服务是否运行：\`ollama serve\`\n2. 确认 baseUrl 配置正确（默认: http://localhost:11434/v1）\n3. 如果 Ollama 运行在远程服务器，确保 baseUrl 指向正确的地址\n4. 检查模型是否已下载：\`ollama list\`\n5. 尝试使用较小的模型或减少 max_tokens`
        }
        
        throw new Error(errorMsg)
      } else if (fetchError.message?.includes("fetch failed") || fetchError.cause || fetchError.name === "TypeError") {
        // 提取更详细的错误信息
        const errorMsg = fetchError.cause?.message || fetchError.message || "网络连接失败"
        const errorCode = fetchError.cause?.code || fetchError.code
        const errorSyscall = fetchError.cause?.syscall || fetchError.syscall
        
        // 构建详细的错误诊断信息
        let diagnosticInfo = ""
        if (errorCode) {
          diagnosticInfo += `\n错误代码: ${errorCode}`
        }
        if (errorSyscall) {
          diagnosticInfo += `\n系统调用: ${errorSyscall}`
        }
        if (baseUrl) {
          diagnosticInfo += `\nAPI 地址: ${baseUrl}`
        }
        
        let detailedError = `无法连接到 AI 服务: ${errorMsg}${diagnosticInfo}\n\n请检查：\n1. 网络连接是否正常\n2. AI 模型 API 配置是否正确（前往"模型管理"页面）\n3. API Key 是否有效\n4. API 服务是否可访问\n5. 如果使用自定义 baseUrl，请确认地址正确`
        
        if (provider === "ollama") {
          detailedError = `❌ **无法连接到 Ollama 服务**\n\n错误信息: ${errorMsg}${diagnosticInfo}\n\n**可能的原因：**\n1. Ollama 服务未运行\n2. baseUrl 配置错误（当前: ${baseUrl}）\n3. 网络连接问题（如果 Ollama 不在本地）\n4. 防火墙阻止连接\n\n**解决方案：**\n1. 启动 Ollama 服务：\`ollama serve\`\n2. 检查 baseUrl 配置：\n   - 本地运行：http://localhost:11434/v1\n   - 远程运行：http://<服务器IP>:11434/v1\n3. 测试连接：\`curl http://localhost:11434/api/tags\`\n4. 检查防火墙设置\n5. 确认模型已下载：\`ollama list\``
        } else if (errorCode === "ENOTFOUND" || errorCode === "ECONNREFUSED" || errorMsg.includes("getaddrinfo")) {
          detailedError = `❌ **DNS 解析失败或连接被拒绝**\n\n错误信息: ${errorMsg}${diagnosticInfo}\n\n**可能的原因：**\n1. API 地址配置错误（${baseUrl}）\n2. 网络无法访问该域名或 IP\n3. 防火墙或代理阻止连接\n4. 服务未运行或端口不正确\n\n**解决方案：**\n1. 检查 baseUrl 配置是否正确\n2. 确认网络可以访问该地址\n3. 检查防火墙和代理设置\n4. 验证服务是否正在运行`
        } else if (errorCode === "ETIMEDOUT" || errorMsg.includes("timeout")) {
          detailedError = `❌ **连接超时**\n\n错误信息: ${errorMsg}${diagnosticInfo}\n\n**可能的原因：**\n1. 网络连接速度慢\n2. API 服务响应慢或无响应\n3. 防火墙或代理延迟\n\n**解决方案：**\n1. 检查网络连接速度\n2. 确认 API 服务正常运行\n3. 检查防火墙和代理设置\n4. 尝试增加超时时间`
        }
        
        throw new Error(detailedError)
      }
      throw new Error(`网络请求失败: ${fetchError.message || "未知错误"}`)
    }

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[Chat] LLM API error:", {
        status: response.status,
        statusText: response.statusText,
        provider,
        model,
        baseUrl,
        apiUrl: apiUrl.replace(apiKey || "", "***"),
        errorText: errorText.substring(0, 500),
        hasApiKey: !!apiKey,
      })
      
      let errorMessage = `AI 模型请求失败 (${response.status})`
      let errorCode: number | undefined
      
      try {
        const errorJson = JSON.parse(errorText)
        errorCode = errorJson.error?.code || errorJson.code
        errorMessage = errorJson.error?.message || errorJson.message || errorMessage
        
        // 针对特定提供商的错误代码提供友好的错误提示
        if (provider === "minimax") {
          if (errorCode === 1008 || errorMessage.toLowerCase().includes("insufficient balance")) {
            errorMessage = `❌ **MiniMax 账户余额不足**\n\n您的 MiniMax 账户余额不足，无法完成请求。\n\n**解决方案：**\n1. 前往 MiniMax 控制台充值：https://platform.minimax.chat/\n2. 检查账户余额和套餐状态\n3. 确认 API Key 对应的账户是否有足够的余额\n\n错误代码: ${errorCode || "1008"}\n原始错误: ${errorMessage}`
          } else if (errorCode === 1001 || errorMessage.toLowerCase().includes("invalid api key")) {
            errorMessage = `❌ **MiniMax API Key 无效**\n\nMiniMax API Key 无效或已过期。\n\n**解决方案：**\n1. 前往 MiniMax 控制台：https://platform.minimax.chat/\n2. 检查并重新生成 API Key\n3. 在"模型管理"页面更新 API Key\n\n错误代码: ${errorCode || "1001"}`
          } else if (errorCode === 1002 || errorMessage.toLowerCase().includes("rate limit")) {
            errorMessage = `❌ **MiniMax 请求频率超限**\n\nMiniMax API 请求频率超过限制。\n\n**解决方案：**\n1. 稍后重试\n2. 检查账户的 API 调用限制\n3. 考虑升级套餐以提高调用频率\n\n错误代码: ${errorCode || "1002"}`
          }
        }
      } catch {
        errorMessage = errorText || errorMessage
      }
      
      // 针对 Ollama 的特殊错误处理
      if (provider === "ollama") {
        if (response.status === 404) {
          errorMessage = `❌ **Ollama 模型未找到**\n\n模型 "${model}" 不存在或未下载。\n\n**解决方案：**\n1. 检查模型是否已下载：\`ollama list\`\n2. 如果未下载，运行：\`ollama pull ${model}\`\n3. 确认模型名称拼写正确\n4. 前往"模型管理"页面检查模型配置`
        } else if (response.status === 500) {
          errorMessage = `❌ **Ollama 服务器错误**\n\nOllama 服务返回了 500 错误。\n\n**可能的原因：**\n1. Ollama 服务崩溃或未正常运行\n2. 模型加载失败\n3. 内存不足\n4. 请求格式不正确\n\n**解决方案：**\n1. 检查 Ollama 服务状态：\`ollama serve\`\n2. 查看 Ollama 日志：\`journalctl -u ollama\` 或检查控制台输出\n3. 重启 Ollama 服务\n4. 检查系统资源（内存、磁盘空间）\n5. 尝试使用其他模型\n\n**原始错误：**\n${errorText.substring(0, 500)}`
        } else if (response.status === 401) {
          errorMessage = `❌ **Ollama 认证失败**\n\nOllama 通常不需要 API Key，但如果配置了认证，请检查：\n1. API Key 是否正确\n2. Ollama 是否配置了认证（默认不需要）\n3. 前往"模型管理"页面检查配置\n\n**原始错误：**\n${errorText.substring(0, 500)}`
        } else {
          errorMessage = `❌ **Ollama 请求失败**\n\n状态码: ${response.status}\n\n**可能的原因：**\n1. Ollama 服务未运行或无法访问\n2. 模型不存在或未下载\n3. 网络连接问题\n4. 服务器内部错误\n\n**解决方案：**\n1. 检查 Ollama 服务是否运行：\`ollama serve\`\n2. 确认 baseUrl 配置正确（当前: ${baseUrl}）\n3. 检查模型是否已下载：\`ollama list\`\n4. 查看 Ollama 日志获取详细错误信息\n5. 尝试重启 Ollama 服务\n\n**原始错误：**\n${errorText.substring(0, 500)}`
        }
      } else if (response.status === 401) {
        // 401 错误通常是 API Key 问题，提供更详细的错误信息
        console.error("[Chat] LLM API 401 Authentication Failed:", {
          provider,
          model,
          baseUrl,
          hasApiKey: !!apiKey,
          apiKeyLength: apiKey?.length || 0,
          apiKeyPrefix: apiKey ? apiKey.substring(0, 10) + "..." : "none",
          llmConnectionId: llmConnection?.id,
          llmConnectionName: llmConnection?.name,
          errorText,
        })
        // 如果已经有针对性的错误消息，就不覆盖
        if (!errorMessage.includes("❌")) {
          errorMessage = `AI 模型 API Key 认证失败。请检查：\n1. API Key 是否正确\n2. API Key 是否已过期\n3. 前往"模型管理"页面检查模型配置\n\n原始错误: ${errorText}`
        }
      } else if (response.status === 500) {
        // 500 错误通常是服务器内部错误
        if (!errorMessage.includes("❌")) {
          errorMessage = `❌ **请求失败**\n\n请求超时（30秒），请稍后重试\n\n状态码: 500\n\n**服务器错误**\n\n可能的原因：\n1. 服务器内部错误\n2. 数据库连接失败\n3. LLM 服务不可用\n\n**解决方案：**\n1. 稍后重试\n2. 检查服务器日志\n3. 联系管理员\n\n**原始错误：**\n${errorText.substring(0, 500)}`
        }
      }
      
      throw new Error(errorMessage)
    }

    let data: any
    try {
      data = await response.json()
    } catch (error) {
      const text = await response.text()
      console.error("[Chat] Failed to parse JSON response:", text.substring(0, 200))
      throw new Error("AI 服务返回了无效的响应格式")
    }
    
    // 支持多种响应格式：OpenAI (choices), Anthropic (content), Ollama (message.content 或 response)
    let assistantMessage = 
      data.choices?.[0]?.message?.content || 
      data.content || 
      data.message?.content ||
      data.response ||
      "无法生成响应。"
    
    // 解析LLM响应，确保visualization字段存在
    const parsedResponse = parseLLMResponse(assistantMessage)
    if (parsedResponse.hasJson && parsedResponse.json) {
      // 如果查询成功，确保visualization字段存在
      // 注意：此时queryResult可能还未执行，所以先不自动生成，等查询完成后再处理
      // 这里只验证和修复已有的visualization格式
      if (parsedResponse.json.visualization && queryResult) {
        const { validateAndFixVisualization } = require('@/lib/visualization-helper')
        parsedResponse.json.visualization = validateAndFixVisualization(
          parsedResponse.json.visualization,
          queryResult
        )
        // 重新构建消息
        assistantMessage = `\`\`\`json\n${JSON.stringify(parsedResponse.json, null, 2)}\n\`\`\``
      }
    }
    
    console.log("[Chat] Agent response received, message length:", assistantMessage.length)
    workProcess.push("✅ **Agent已生成响应**")
    
    // 发送流式更新：SQL生成完成
    if (actualSessionId && !actualSessionId.startsWith("session_")) {
      sendStreamUpdate(actualSessionId, "step_completed", {
        step: "query_generation",
        message: "SQL查询已生成",
        workProcess: [...workProcess],
      })
    }
    
    // 发送流式更新：开始执行查询
    if (actualSessionId && !actualSessionId.startsWith("session_")) {
      sendStreamUpdate(actualSessionId, "step_started", {
        step: "query_generation",
        message: "准备执行数据库查询...",
        workProcess: [...workProcess],
      })
    }

    // ========== Agent执行阶段：解析Agent响应并执行新查询，返回结果给用户 ==========
    workProcess.push("⚙️ **正在执行查询...**")
    
    // 提取并执行 SQL
    let queryResult = null
    let sql = null
    let errorMessage = null
    let joinRegenerated = false

    const cleanSQLForJoinCheck = (input: string): string => {
      return String(input || "")
        .replace(/--.*$/gm, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\s+/g, " ")
        .trim()
    }

    const assessJoinRequirement = (inputSQL: string): { shouldRegenerate: boolean; reason?: string; tables: string[] } => {
      const cleaned = cleanSQLForJoinCheck(inputSQL)
      const tables = SQLValidator.extractTableNamesForPermission(cleaned)
      const hasJoinKeyword = /\bJOIN\b/i.test(cleaned)

      // FROM 子句中出现逗号（FROM t1, t2）且没有 JOIN，视为需要重写为显式 JOIN
      let hasCommaSeparatedFrom = false
      const fromMatch = cleaned.match(
        /FROM\s+(.+?)(?:\s+WHERE\s+|\s+GROUP\s+BY\s+|\s+ORDER\s+BY\s+|\s+HAVING\s+|\s+LIMIT\s+|\s+UNION\s+|$)/i
      )
      if (fromMatch && fromMatch[1]) {
        hasCommaSeparatedFrom = fromMatch[1].includes(",")
      }

      if (!needsJoinQuery) {
        return { shouldRegenerate: false, tables }
      }

      if (tables.length < 2) {
        return { shouldRegenerate: true, reason: "needs_join_but_single_table", tables }
      }

      if (tables.length >= 2 && !hasJoinKeyword && hasCommaSeparatedFrom) {
        return { shouldRegenerate: true, reason: "comma_multi_table_without_join", tables }
      }

      return { shouldRegenerate: false, tables }
    }

    const regenerateSQLForJoin = async (params: {
      reason: string
      originalSQL: string
    }): Promise<string | null> => {
      try {
        if (!llmConnection) {
          console.warn("[Chat] No llmConnection available for JOIN regeneration")
          return null
        }

        const joinSystemMessage =
          (await PromptConfigService.getConfig("sql_generation", "sql_generation_join_required_regenerate_system_message")) ||
          `你是一个 SQL 查询生成助手。当前用户问题需要跨表/多表查询。\n\n**必须遵守：**\n- 必须使用显式 JOIN ... ON ...，禁止 FROM t1, t2 这种逗号多表方式（会造成笛卡尔积）。\n- 多表查询时，所有字段必须使用表名/别名前缀（如 t.col）。\n- 必须严格遵守字段白名单：只能使用白名单中出现的表和字段。\n- 禁止 SELECT *，必须展开为具体字段。\n\n**输出格式：**只能输出 JSON（不要输出其它文本）：\n{\n  \"explanation\": \"用中文说明\",\n  \"sql\": \"完整可执行的 SQL（若无法生成则为 null）\",\n  \"reasoning\": \"简要理由\"\n}`

        const candidateTablesText =
          crossTableDetection?.candidateTables && crossTableDetection.candidateTables.length > 0
            ? crossTableDetection.candidateTables.join(", ")
            : "（未检测到明确表名，请根据 schema/表关系自行选择）"

        const joinRegeneratePrompt = `需要跨表/多表查询，但当前 SQL 未满足 JOIN 要求。\n\n- 失败原因: ${params.reason}\n- 原始 SQL: \`${params.originalSQL}\`\n\n用户问题: \"${userQuestion}\"\n\n候选表（参考）: ${candidateTablesText}\n\n${relationshipsText ? `表关系信息：\n${relationshipsText}\n` : ""}\n\n数据库结构（参考）：\n${formatDatabaseSchema(schema)}\n\n🚨 字段白名单（只能使用这些字段！）：\n${Object.entries(fieldWhitelist).map(([table, fields]) => `- **${table}**: ${fields.join(", ")}`).join("\n")}\n\n请生成满足 JOIN 约束的 SQL。`

        const baseUrl = llmConnection?.baseUrl || "https://api.openai.com/v1"
        let apiUrl = baseUrl.endsWith("/") ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`
        if (baseUrl.includes("cloudflare.com")) {
          apiUrl = `https://gateway.ai.cloudflare.com/v1/${llmConnection?.provider}/${effectiveLLMConfig.model}/chat/completions`
        }

        const headers: HeadersInit = { "Content-Type": "application/json" }
        const validatedApiKey = getValidatedApiKey(llmConnection, false)
        if (baseUrl.includes("cloudflare.com")) {
          // Cloudflare AI Gateway 不需要 API key
        } else if (llmConnection?.provider === "anthropic") {
          headers["x-api-key"] = validatedApiKey
          headers["anthropic-version"] = "2023-06-01"
        } else {
          headers["Authorization"] = `Bearer ${validatedApiKey}`
        }

        console.log("[Chat] Regenerating SQL due to JOIN requirement", {
          reason: params.reason,
          candidateTables: crossTableDetection?.candidateTables || [],
        })

        const resp = await fetch(apiUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: effectiveLLMConfig.model,
            messages: [
              { role: "system", content: joinSystemMessage },
              { role: "user", content: joinRegeneratePrompt },
            ],
            temperature: effectiveLLMConfig.temperature || 0.7,
            max_tokens: effectiveLLMConfig.maxTokens || 2000,
          }),
        })

        if (!resp.ok) {
          const errorText = await resp.text()
          console.error("[Chat] JOIN regeneration failed", { status: resp.status, errorText })
          return null
        }

        const data = await resp.json()
        const content = data.choices?.[0]?.message?.content || data.content || ""
        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
          console.warn("[Chat] JOIN regeneration response has no JSON, will ignore")
          return null
        }

        const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0])
        if (!parsed || typeof parsed !== "object") return null
        const regenerated = parsed.sql ? String(parsed.sql).trim() : ""
        if (!regenerated) return null
        return regenerated
      } catch (e: any) {
        console.error("[Chat] JOIN regeneration exception:", e?.message || e)
        return null
      }
    }

    /**
     * 触发第二次查询（当检测到表结构查询结果时）
     * 优先使用已有的表结构信息，避免重复查询
     */
    async function triggerSecondQueryForSchemaResult(
      schemaQueryResult: any,
      schemaSQL: string,
      userQuestion: string,
      llmConn: any,
      availableSchema?: any  // 已有的表结构信息（优先使用）
    ): Promise<{ success: boolean; result?: any; sql?: string; error?: string }> {
      // 优先使用智能体的LLM连接（如果已加载）
      const effectiveLLMConn = llmConn || agentLLMConnection
      
      if (!effectiveLLMConn) {
        console.warn("[Chat] LLM connection not available for second query")
        return { success: false, error: "LLM 连接不可用。请确保智能体已配置 LLM 连接。" }
      }
      
      console.log("[Chat] ========== Starting second query process ==========")
      console.log("[Chat] Second query input:", {
        hasSchemaQueryResult: !!schemaQueryResult,
        rowCount: schemaQueryResult?.rows?.length || 0,
        columns: schemaQueryResult?.columns || [],
        hasAvailableSchema: !!(availableSchema && Array.isArray(availableSchema)),
        availableSchemaLength: availableSchema?.length || 0,
        userQuestion: userQuestion.substring(0, 100)
      })
      console.log("[Chat] Using LLM connection for second query:", {
        llmConnectionId: effectiveLLMConn.id,
        llmConnectionName: effectiveLLMConn.name,
        provider: effectiveLLMConn.provider,
        model: effectiveLLMConfig.model,
        hasApiKey: !!effectiveLLMConn.apiKey,
        apiKeyLength: effectiveLLMConn.apiKey?.length || 0,
        isFromAgent: effectiveLLMConn.id === agentLLMConnection?.id,
      })
      // **关键修改：优先从第一次查询返回的结果中提取表结构，而不是使用预先的schema**
      // 这是用户明确要求的：二次查询应该基于第一次查询返回的数据结构
      let tableList: string[] = []
      let sampleColumns: string[] = []
      let extractedSchema: DatabaseSchema[] = []
      let useExtractedSchema = false

      // 优先从schemaQueryResult中提取表结构（第一次查询返回的结果）
      if (schemaQueryResult && schemaQueryResult.rows && schemaQueryResult.rows.length > 0) {
        console.log("[Chat] Step 1: Extracting schema from first query result")
        console.log("[Chat] Query result structure:", {
          rowCount: schemaQueryResult.rows.length,
          columns: schemaQueryResult.columns,
          firstRow: schemaQueryResult.rows[0]
        })
        
        const extracted = extractSchemaFromQueryResult(schemaQueryResult)
        
        console.log("[Chat] Step 2: Schema extraction result:", {
          tableCount: extracted.tables.length,
          tables: extracted.tables,
          columnCount: extracted.columns.length,
          columns: extracted.columns.slice(0, 20),
          schemaTableCount: extracted.schema.length
        })
        
        if (extracted.tables.length > 0) {
          useExtractedSchema = true
          tableList = extracted.tables
          sampleColumns = extracted.columns
          extractedSchema = extracted.schema
          
          console.log("[Chat] Step 3: Using extracted schema for second query:", {
            tableCount: tableList.length,
            tables: tableList,
            columnCount: sampleColumns.length,
            schemaTableCount: extractedSchema.length,
            schemaDetails: extractedSchema.map(t => ({
              table: t.tableName,
              columnCount: t.columns.length,
              columns: t.columns.map(c => c.name).slice(0, 5)
            }))
          })
        } else {
          console.warn("[Chat] Failed to extract schema from query result, falling back to availableSchema")
        }
      }

      // 如果无法从返回结果中提取，回退到使用预先的schema
      if (!useExtractedSchema && availableSchema && Array.isArray(availableSchema) && availableSchema.length > 0) {
        console.log("[Chat] Falling back to availableSchema for second query")
        tableList = availableSchema.map((table: any) => 
          table.tableName || table.name || ""
        ).filter(Boolean)
        
        // 提取所有列名
        availableSchema.forEach((table: any) => {
          const columns = table.columns || []
          columns.forEach((col: any) => {
            const colName = col.name || col.columnName || col.COLUMN_NAME
            if (colName && typeof colName === 'string' && !sampleColumns.includes(colName)) {
              sampleColumns.push(colName)
            }
          })
        })
        
        extractedSchema = availableSchema
        
        console.log("[Chat] Using available schema info (fallback):", {
          tableList,
          columnCount: sampleColumns.length,
          totalTables: availableSchema.length
        })
      }

      // 如果仍然没有表结构信息，返回错误
      if (tableList.length === 0) {
        console.error("[Chat] No schema information available for second query", {
          hasSchemaQueryResult: !!schemaQueryResult,
          hasRows: !!(schemaQueryResult && schemaQueryResult.rows),
          rowCount: schemaQueryResult?.rows?.length || 0,
          hasAvailableSchema: !!(availableSchema && Array.isArray(availableSchema)),
          availableSchemaLength: availableSchema?.length || 0
        })
        return { success: false, error: "无法从第一次查询结果中提取表结构信息，无法生成二次查询" }
      }

      // 构建字段白名单（基于从第一次查询结果中提取的表结构）
      const secondQueryFieldWhitelist: Record<string, string[]> = {}
      extractedSchema.forEach((table: any) => {
        const tableName = table.tableName || table.name || ""
        if (tableName) {
          const columns = table.columns || []
          const fieldNames = columns.map((col: any) => col.name || col.columnName || col.COLUMN_NAME).filter(Boolean)
          if (fieldNames.length > 0) {
            secondQueryFieldWhitelist[tableName] = fieldNames
          }
        }
      })
      
      const secondQueryFieldWhitelistText = Object.entries(secondQueryFieldWhitelist).map(([table, fields]) => 
        `**${table}**: ${fields.join(", ")}`
      ).join("\n")
      
      // 构建第二次查询的提示（基于从第一次查询结果中提取的表结构信息）
      const secondQueryPrompt = useExtractedSchema
        ? `刚才的查询返回了表结构信息，但用户需要的是实际数据。我已经从返回结果中提取了表结构信息。

用户原始问题："${userQuestion}"

**🚨🚨🚨 字段白名单（这是唯一可用的字段列表，只能使用这些字段！）🚨🚨🚨**

**⚠️ 警告：以下字段白名单是生成SQL时唯一可用的字段。任何不在这个列表中的字段都是不存在的，使用它们会导致查询失败！**

${secondQueryFieldWhitelistText || "⚠️ 警告：字段白名单为空"}

**从第一次查询结果中提取的表结构：**
${extractedSchema.map(table => {
  const cols = table.columns.map(c => c.name).join(", ")
  return `- **${table.tableName}**: ${cols}`
}).join("\n")}

**🔍 使用字段白名单的步骤（必须严格遵守）：**
1. **生成SQL前，必须查看上面的字段白名单**
2. **对于每个要使用的字段，在白名单中查找对应的表**
3. **确认字段名完全匹配（注意大小写）**
4. **如果字段不在白名单中，绝对不要使用，返回 sql: null**

**🚫 绝对禁止：**
- ❌ 使用白名单之外的任何字段名（包括猜测、编造、从示例中看到的字段名）
- ❌ 使用 SELECT * 而不展开为具体列名（必须使用白名单中的字段）
- ❌ 假设字段存在（如 country, email, phone 等常见字段名，除非它们确实在白名单中）

**✅ 必须严格遵守：**
- ✅ **生成SQL前，必须逐一检查每个字段名是否在白名单中**
- ✅ **如果使用 SELECT *，必须展开为白名单中的具体列名**
- ✅ **表名和字段名必须与白名单中的完全一致（注意大小写）**
- ✅ **如果用户要求的字段不在白名单中，返回 sql: null，不要生成SQL**

请基于用户的问题和上述字段白名单，直接生成查询实际数据的 SQL 语句。不要查询表结构（information_schema、SHOW、DESCRIBE 等）。`
        : `刚才的查询返回了表结构信息，但用户需要的是实际数据。

用户原始问题："${userQuestion}"

**🚨🚨🚨 字段白名单（这是唯一可用的字段列表，只能使用这些字段！）🚨🚨🚨**

**⚠️ 警告：以下字段白名单是生成SQL时唯一可用的字段。任何不在这个列表中的字段都是不存在的，使用它们会导致查询失败！**

${Object.entries(secondQueryFieldWhitelist).map(([table, fields]) => 
  `**${table}**: ${fields.join(", ")}`
).join("\n") || "⚠️ 警告：字段白名单为空"}

可用的表：${tableList.join(", ")}
${sampleColumns.length > 0 ? `所有列名：${sampleColumns.slice(0, 50).join(", ")}${sampleColumns.length > 50 ? "..." : ""}` : ''}

**🔍 使用字段白名单的步骤（必须严格遵守）：**
1. **生成SQL前，必须查看上面的字段白名单**
2. **对于每个要使用的字段，在白名单中查找对应的表**
3. **确认字段名完全匹配（注意大小写）**
4. **如果字段不在白名单中，绝对不要使用，返回 sql: null**

请基于用户的问题和上述字段白名单，生成查询实际数据的 SQL 语句。直接查询数据表，不要再次查询表结构（information_schema、SHOW、DESCRIBE 等）。`

      try {
        // 构建 API URL（使用与主查询相同的逻辑）
        const baseUrl = effectiveLLMConn.baseUrl || effectiveLLMConfig?.baseUrl || "https://api.openai.com/v1"
        let apiUrl = baseUrl.endsWith("/") ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`
        
        // 处理 Cloudflare 等特殊 URL
        if (baseUrl.includes("cloudflare.com")) {
          apiUrl = `https://gateway.ai.cloudflare.com/v1/${effectiveLLMConn.provider}/${effectiveLLMConfig.model}/chat/completions`
        }
        
        const headers: HeadersInit = {
          "Content-Type": "application/json",
        }
        
        // 验证并获取API Key
        const validatedApiKey = getValidatedApiKey(effectiveLLMConn, false)
        
        if (baseUrl.includes("cloudflare.com")) {
          // Cloudflare AI Gateway 不需要 API key
        } else if (effectiveLLMConn.provider === "anthropic") {
          headers["x-api-key"] = validatedApiKey
          headers["anthropic-version"] = "2023-06-01"
        } else {
          headers["Authorization"] = `Bearer ${validatedApiKey}`
        }
        
        console.log("[Chat] Step 4: Calling LLM for second query generation")
        console.log("[Chat] Second query prompt preview:", {
          useExtractedSchema,
          tableCount: tableList.length,
          columnCount: sampleColumns.length,
          promptLength: secondQueryPrompt.length,
          promptPreview: secondQueryPrompt.substring(0, 300)
        })
        
        const secondQueryResponse = await fetch(apiUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: effectiveLLMConfig.model,
            messages: [
              {
                role: "system",
                content: (await PromptConfigService.getConfig("sql_generation", "sql_generation_second_query_system_message")) || `你是一个 SQL 查询生成助手。

⚠️ 重要：绝对不要生成查询表结构的 SQL！

系统已经提供了完整的数据库结构信息，你只需要生成查询实际数据的 SQL 语句。

**🚨🚨🚨 字段白名单制度（最高优先级，必须严格遵守）🚨🚨🚨**

1. **字段白名单制度**：你只能使用下面"字段白名单"中明确列出的字段。任何不在白名单中的字段都是不存在的，绝对不要使用！

2. **生成SQL前的检查流程**：
   - 第一步：确定要查询的表名，检查表名是否在白名单中
   - 第二步：对于每个要查询的字段，逐一检查是否在该表的字段白名单中
   - 第三步：如果任何字段不在白名单中，不要生成SQL，返回 sql: null，并在 explanation 中说明缺少的字段

3. **SELECT * 的处理**：
   - 绝对禁止直接使用 SELECT * FROM table
   - 必须将 SELECT * 展开为该表字段白名单中的所有字段
   - 例如：如果 customers 表的字段白名单是 [id, name, email]，则必须写成 SELECT id, name, email FROM customers

4. **字段名匹配**：
   - 字段名必须与白名单中的完全一致（注意大小写）
   - 不要使用别名、缩写或猜测的字段名
   - **绝对不要假设字段存在**：即使是很常见的字段名（如 country, email, phone, name），也必须先检查字段白名单
   - 如果用户提到"国家"但白名单中没有"country"字段，必须返回 sql: null，不要猜测或使用其他字段名

5. **如果字段不在白名单中**：
   - 返回 sql: null
   - 在 explanation 中明确说明该字段不存在，并列出该表的可用字段

用户问题：${userQuestion}

请直接基于上述字段白名单生成查询实际数据的 SQL，格式如下：
\`\`\`json
{
  "sql": "SELECT ... FROM table_name WHERE ...",
  "explanation": "说明这个查询的目的"
}
\`\`\`

**重要：生成SQL前，必须逐一检查每个字段名是否在字段白名单中！**`
              },
              {
                role: "user",
                content: secondQueryPrompt
              }
            ],
            temperature: effectiveLLMConfig.temperature || 0.7,
            max_tokens: effectiveLLMConfig.maxTokens || 2000,
          }),
        })
        
        if (secondQueryResponse.ok) {
          const secondData = await secondQueryResponse.json()
          const secondMessage = secondData.choices?.[0]?.message?.content || secondData.content || ""
          
          console.log("[Chat] Step 5: Second query LLM response received, length:", secondMessage.length)
          console.log("[Chat] LLM response preview:", secondMessage.substring(0, 500))
          
          // 提取第二次查询的 SQL
          const secondJsonMatch = secondMessage.match(/```json\s*([\s\S]*?)\s*```/) || 
                                 secondMessage.match(/\{[\s\S]*\}/)
          
          if (secondJsonMatch) {
            try {
              const secondParsed = JSON.parse(secondJsonMatch[1] || secondJsonMatch[0])
              console.log("[Chat] Step 6: Parsed second query response:", {
                hasSQL: !!secondParsed.sql,
                sql: secondParsed.sql ? secondParsed.sql.substring(0, 200) : "none",
                hasExplanation: !!secondParsed.explanation
              })
              
              if (secondParsed.sql) {
                const secondSQL = secondParsed.sql.trim()
                
                console.log("[Chat] Step 7: Extracted second SQL:", secondSQL)
                
                // 验证并执行第二次查询
                const secondValidation = SQLValidator.validate(secondSQL, false)
                if (secondValidation.valid) {
                  // 验证第二次查询的 schema（优先使用从返回结果中提取的schema）
                  const schemaForValidation = extractedSchema.length > 0 ? extractedSchema : availableSchema
                  if (schemaForValidation && Array.isArray(schemaForValidation) && schemaForValidation.length > 0) {
                    const secondSchemaValidation = SQLValidator.validateSchema(secondSQL, schemaForValidation)
                    if (!secondSchemaValidation.valid) {
                      console.warn("[Chat] Second SQL schema validation failed:", secondSchemaValidation.errors)
                      
                      // 构建详细的错误信息
                      let errorMsg = `生成的 SQL 包含不存在的表或字段：${secondSchemaValidation.errors.join("; ")}`
                      
                      if (secondSchemaValidation.invalidTables.length > 0) {
                        errorMsg += `\n不存在的表：${secondSchemaValidation.invalidTables.join(", ")}`
                      }
                      
                      if (secondSchemaValidation.invalidColumns.length > 0) {
                        errorMsg += `\n不存在的字段：${secondSchemaValidation.invalidColumns.map(c => `${c.table}.${c.column}`).join(", ")}`
                      }
                      
                      return {
                        success: false,
                        error: errorMsg,
                      }
                    }
                  }
                  
                  console.log("[Chat] Step 8: Executing second query:", secondSQL)
                  
                  // 应用权限规则
                  let finalSecondSQL = secondSQL
                  if (user.role !== "admin") {
                    try {
                      const permissionContext = {
                        user,
                        databaseConnectionId: effectiveDatabaseConnectionId,
                        organizationId: user.organizationId,
                      }
                      const applied = await PermissionApplier.applyPermissions(secondSQL, permissionContext)
                      finalSecondSQL = applied.modifiedSQL
                      
                      if (applied.restrictedTables.length > 0) {
                        throw new Error(`无权限访问以下表: ${applied.restrictedTables.join(", ")}`)
                      }
                    } catch (permError: any) {
                      throw permError
                    }
                  }
                  
                  // 🔒 列级权限校验（第二次查询同样必须校验）
                  if (user.role !== "admin") {
                    const permissionContext = {
                      user,
                      databaseConnectionId: effectiveDatabaseConnectionId,
                      organizationId: user.organizationId,
                    }
                    const compiled = await PermissionApplier.compilePermissions(permissionContext)
                    enforceColumnAccess({
                      sql: finalSecondSQL,
                      schema: schemaForValidation || availableSchema || [],
                      policy: {
                        tablePermissionMap: compiled.tablePermissionMap,
                        columnPermissionMap: compiled.columnPermissionMap,
                      },
                    })
                  }
                  
                  const secondResult = await SQLExecutor.executeQuery(connection as any, finalSecondSQL)
                  
                  // 🔒 结果脱敏
                  if (user.role !== "admin") {
                    const permissionContext = {
                      user,
                      databaseConnectionId: effectiveDatabaseConnectionId,
                      organizationId: user.organizationId,
                    }
                    const compiled = await PermissionApplier.compilePermissions(permissionContext)
                    ;(secondResult as any) && Object.assign(secondResult, applyMaskingToQueryResult(secondResult, compiled.permission))
                  }
                  
                  console.log("[Chat] Step 9: Second query executed successfully:", {
                    rowCount: secondResult.rows.length,
                    columnCount: secondResult.columns?.length || 0,
                    columns: secondResult.columns || [],
                    firstRow: secondResult.rows[0] || null
                  })
                  
                  // 记录审计日志（第二次查询）
                  await logAudit({
                    userId: user.id,
                    userName: user.email,
                    action: "query",
                    resourceType: "database",
                    resourceId: effectiveDatabaseConnectionId,
                    details: `执行第二次查询（基于表结构）: ${secondSQL.substring(0, 100)}`,
                    sql: secondSQL,
                    status: "success",
                    organizationId: user.organizationId,
                  })
                  
                  return { success: true, result: secondResult, sql: secondSQL }
                } else {
                  console.warn("[Chat] Second SQL validation failed:", secondValidation.error)
                }
              } else {
                console.warn("[Chat] Second query response does not contain SQL")
              }
            } catch (parseError: any) {
              console.error("[Chat] Failed to parse second query JSON:", parseError)
            }
          } else {
            console.warn("[Chat] Second query response does not contain valid JSON")
          }
        } else {
          const errorText = await secondQueryResponse.text()
          console.error("[Chat] Second query LLM API error:", {
            status: secondQueryResponse.status,
            errorText,
            provider: effectiveLLMConn.provider,
            model: effectiveLLMConfig.model,
            baseUrl,
            hasApiKey: !!validatedApiKey,
            apiKeyLength: validatedApiKey?.length || 0,
            apiKeyPrefix: validatedApiKey ? validatedApiKey.substring(0, 10) + "..." : "none",
            llmConnectionId: effectiveLLMConn.id,
            llmConnectionName: effectiveLLMConn.name,
          })
          
          // 如果是 401 错误，抛出明确的错误信息
          if (secondQueryResponse.status === 401) {
            throw new Error(`AI 模型 API Key 认证失败（第二次查询）。请检查：\n1. API Key 是否正确\n2. API Key 是否已过期\n3. 前往"模型管理"页面检查模型配置\n\n原始错误: ${errorText}`)
          }
        }
      } catch (secondQueryError: any) {
        console.error("[Chat] Second query generation/execution failed:", secondQueryError)
      }

      return { success: false }
    }

    try {
      // 尝试从 JSON 代码块中提取
      const jsonBlockMatch = assistantMessage.match(/```json\s*([\s\S]*?)\s*```/)
      const jsonMatch = jsonBlockMatch
        ? jsonBlockMatch[1]
        : assistantMessage.match(/\{[\s\S]*\}/)?.[0]

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch)
        
        // 检查是否是执行计划（即使有sql字段，如果sql为空或只是说明性文字，也可能是执行计划）
        const hasValidSQL = parsed.sql && parsed.sql.trim() && 
                           !parsed.sql.match(/^(说明|解释|将|我会|我将)/i) &&
                           parsed.sql.match(/^(SELECT|WITH|INSERT|UPDATE|DELETE)/i)
        
        // 如果 LLM 没有返回有效的SQL，检查是否是执行计划
        if (!hasValidSQL) {
          // 检查 explanation 中是否说明了原因或执行计划
          if (parsed.explanation) {
            // 更宽松的检测：如果explanation中提到了表和查询相关词汇，但没有有效SQL，就认为是执行计划
            const explanationText = parsed.explanation || assistantMessage || ""
            const hasTableMention = /表|table|`[a-z_]+`|"[a-z_]+"/i.test(explanationText)
            const hasQueryMention = /查询|执行|获取|列出|显示|返回|select|SELECT/i.test(explanationText)
            const hasFutureTense = /将|会|要|准备|计划|我会|我将/i.test(explanationText)
            const hasTableName = /customers|orders|products|users|客户|订单|产品|用户/i.test(explanationText)
            
            // 更宽松的检测：如果提到了表名和查询意图，即使没有明确的"将"字，也认为是执行计划
            const isExecutionPlan = (!hasValidSQL && hasTableMention && hasQueryMention) ||
                                   (!hasValidSQL && hasTableName && hasQueryMention) ||
                                   hasFutureTense ||
                                   /我将/i.test(explanationText) ||
                                   /我会/i.test(explanationText) ||
                                   /准备(查询|执行)/i.test(explanationText) ||
                                   /计划(查询|执行)/i.test(explanationText) ||
                                   /根据数据库结构/i.test(explanationText) ||
                                   /该表包含/i.test(explanationText)
            
            console.log("[Chat] Execution plan detection:", {
              hasTableMention,
              hasQueryMention,
              hasFutureTense,
              hasTableName,
              hasValidSQL,
              isExecutionPlan,
              hasExplanation: !!parsed.explanation,
              explanation: parsed.explanation ? parsed.explanation.substring(0, 200) : "none",
              sql: parsed.sql || "none"
            })
            
            if (isExecutionPlan && schema && Array.isArray(schema) && schema.length > 0) {
              // 这是一个执行计划，需要自动生成SQL并执行
              console.log("[Chat] Detected execution plan without SQL, generating SQL automatically")
              
              // 从explanation中提取表名
              const tableNames = schema.map((t: any) => t.tableName || t.name || "").filter(Boolean)
              let detectedTable = null
              
              // 中文表名映射（常见的中文表名对应关系）
              const chineseTableMap: Record<string, string[]> = {
                "customers": ["客户", "顾客", "用户"],
                "orders": ["订单", "订购"],
                "products": ["产品", "商品"],
                "users": ["用户", "使用者"],
                "employees": ["员工", "雇员"],
                "suppliers": ["供应商", "供货商"],
              }
              
              // 构建反向映射（中文 -> 英文表名）
              const reverseMap: Record<string, string> = {}
              for (const [enName, zhNames] of Object.entries(chineseTableMap)) {
                for (const zhName of zhNames) {
                  reverseMap[zhName.toLowerCase()] = enName
                }
              }
              
              // 尝试从explanation中匹配表名（更宽松的匹配）
              const explanationText = parsed.explanation || assistantMessage || ""
              const explanationLower = explanationText.toLowerCase()
              
              // 首先尝试直接匹配表名
              for (const tableName of tableNames) {
                const tableNameLower = tableName.toLowerCase()
                if (explanationLower.includes(tableNameLower) ||
                    explanationLower.includes(`\`${tableNameLower}\``) ||
                    explanationLower.includes(`"${tableNameLower}"`) ||
                    explanationLower.includes(`'${tableNameLower}'`)) {
                  detectedTable = tableName
                  console.log("[Chat] Detected table from explanation:", tableName)
                  break
                }
              }
              
              // 如果用户问题中提到了表名，也尝试匹配
              if (!detectedTable) {
                const questionLower = userQuestion.toLowerCase()
                for (const tableName of tableNames) {
                  const tableNameLower = tableName.toLowerCase()
                  if (questionLower.includes(tableNameLower)) {
                    detectedTable = tableName
                    console.log("[Chat] Detected table from user question:", tableName)
                    break
                  }
                }
              }
              
              // 如果还没找到，尝试通过中文表名映射匹配
              if (!detectedTable) {
                const combinedText = (explanationText + " " + userQuestion).toLowerCase()
                for (const [zhName, enName] of Object.entries(reverseMap)) {
                  if (combinedText.includes(zhName)) {
                    // 检查这个英文表名是否在schema中存在
                    const foundTable = tableNames.find(t => t.toLowerCase() === enName.toLowerCase())
                    if (foundTable) {
                      detectedTable = foundTable
                      console.log("[Chat] Detected table from Chinese mapping:", foundTable, "for", zhName)
                      break
                    }
                  }
                }
              }
              
              if (detectedTable) {
                // 找到表，自动生成查询SQL
                const tableSchema = schema.find((t: any) => 
                  (t.tableName || t.name || "").toLowerCase() === detectedTable.toLowerCase()
                )
                
                if (tableSchema && tableSchema.columns) {
                  // 生成查询所有字段的SQL，但排除敏感字段
                  const columns = tableSchema.columns
                    .map((c: any) => c.name || c.columnName || c.COLUMN_NAME)
                    .filter(Boolean)
                  if (columns.length > 0) {
                    const autoSQL = `SELECT ${columns.join(", ")} FROM ${detectedTable}`
                    console.log("[Chat] Auto-generated SQL from execution plan:", autoSQL)
                    
                    // 将自动生成的SQL赋值给parsed.sql，继续执行流程
                    parsed.sql = autoSQL
                    // 更新explanation，说明这是自动生成的
                    parsed.explanation = `${parsed.explanation}\n\n**系统已自动生成并执行查询：**`
                    console.log("[Chat] Execution plan detected and SQL auto-generated, will execute:", autoSQL)
                    // 确保hasValidSQL标志更新，以便后续流程能识别这是有效的SQL
                    const hasValidSQLAfterAutoGen = parsed.sql && parsed.sql.trim() && 
                                                   parsed.sql.match(/^(SELECT|WITH|INSERT|UPDATE|DELETE)/i)
                    console.log("[Chat] SQL validation after auto-generation:", {
                      hasValidSQL: hasValidSQLAfterAutoGen,
                      sql: parsed.sql.substring(0, 100)
                    })
                  } else {
                    // 如果无法获取列信息，使用SELECT *
                    parsed.sql = `SELECT * FROM ${detectedTable}`
                    console.log("[Chat] Auto-generated SQL (SELECT *) from execution plan:", parsed.sql)
                    parsed.explanation = `${parsed.explanation}\n\n**系统已自动生成并执行查询：**`
                  }
                } else {
                  // 表存在但无法获取结构，使用SELECT *
                  parsed.sql = `SELECT * FROM ${detectedTable}`
                  console.log("[Chat] Auto-generated SQL (SELECT *) from execution plan:", parsed.sql)
                  parsed.explanation = `${parsed.explanation}\n\n**系统已自动生成并执行查询：**`
                }
              } else {
                // 无法识别表名，返回错误
                errorMessage = parsed.explanation + "\n\n⚠️ **无法自动生成查询**：无法从执行计划中识别要查询的表名。请确保执行计划中明确提到了表名，或者直接提供SQL查询语句。"
                return NextResponse.json({
                  message: errorMessage,
                  queryResult: null,
                  sql: null,
                  error: null,
                  workProcess: workProcess.length > 0 ? workProcess : undefined,
                  sessionId: sessionId,
                })
              }
            } else {
              // 不是执行计划，或者没有schema
              // 但如果explanation中提到了表和字段，仍然尝试自动生成SQL
              if (parsed.explanation && schema && Array.isArray(schema) && schema.length > 0) {
                // 检查explanation中是否提到了表名
                const tableNames = schema.map((t: any) => t.tableName || t.name || "").filter(Boolean)
                const explanationLower = parsed.explanation.toLowerCase()
                let mentionedTable = null
                
                for (const tableName of tableNames) {
                  if (explanationLower.includes(tableName.toLowerCase()) || 
                      explanationLower.includes(`\`${tableName}\``) ||
                      explanationLower.includes(`"${tableName}"`)) {
                    mentionedTable = tableName
                    break
                  }
                }
                
                // 如果提到了表名，尝试自动生成SQL
                if (mentionedTable) {
                  console.log("[Chat] Table mentioned in explanation, auto-generating SQL:", mentionedTable)
                  const tableSchema = schema.find((t: any) => 
                    (t.tableName || t.name || "").toLowerCase() === mentionedTable.toLowerCase()
                  )
                  
                  if (tableSchema && tableSchema.columns) {
                    const columns = tableSchema.columns
                      .map((c: any) => c.name || c.columnName || c.COLUMN_NAME)
                      .filter(Boolean)
                    if (columns.length > 0) {
                      const autoSQL = `SELECT ${columns.join(", ")} FROM ${mentionedTable}`
                      console.log("[Chat] Auto-generated SQL from explanation (fallback), will execute:", autoSQL)
                      parsed.sql = autoSQL
                      parsed.explanation = `${parsed.explanation}\n\n**系统已自动生成并执行查询：**`
                      console.log("[Chat] SQL auto-generated from explanation, validation:", {
                        hasValidSQL: !!parsed.sql && parsed.sql.trim().length > 0,
                        sql: parsed.sql.substring(0, 100)
                      })
                    }
                  }
                }
              }
              
              // 如果仍然没有SQL，返回解释
              if (!parsed.sql || !parsed.sql.trim()) {
                errorMessage = parsed.explanation
                return NextResponse.json({
                  message: parsed.explanation,
                  queryResult: null,
                  sql: null,
                  error: null,
                  workProcess: workProcess.length > 0 ? workProcess : undefined,
                  sessionId: sessionId,
                })
              }
            }
          } else if (!parsed.sql || !parsed.sql.trim()) {
            // 没有explanation也没有SQL，返回错误
            errorMessage = "无法生成 SQL 查询，请检查数据库结构或重新提问"
            return NextResponse.json({
              message: errorMessage,
              queryResult: null,
              sql: null,
              error: errorMessage,
              workProcess: workProcess.length > 0 ? workProcess : undefined,
              sessionId: sessionId,
            })
          }
        }
        
        // 检查是否是SQL查询配置调用
        // 注意：toolExecuted需要在执行计划检测之前声明，以便在执行计划检测时可以使用
        let toolExecuted = false
        
        // 如果已经自动生成了SQL（从执行计划），确保toolExecuted为false
        if (parsed.sql && parsed.sql.trim() && parsed.sql.match(/^(SELECT|WITH)/i)) {
          toolExecuted = false
        }
        
        if (parsed.toolCall && availableTools.length > 0) {
          const toolCall = parsed.toolCall
          const toolSQL = toolCall.sql

          if (toolSQL) {
            sql = toolSQL.trim()
            
            // 检查toolCall中的SQL是否是执行计划（说明性文字而非实际SQL）
            const isToolSQLExecutionPlan = !sql.match(/^(SELECT|WITH)/i) && 
                                          (sql.match(/^(说明|解释|将|我会|我将)/i) ||
                                           (parsed.explanation && /将(查询|执行|获取|列出|显示)/i.test(parsed.explanation)))
            
            if (isToolSQLExecutionPlan && schema && Array.isArray(schema) && schema.length > 0) {
              console.log("[Chat] ToolCall SQL is execution plan, auto-generating SQL")
              // 从explanation或toolSQL中提取表名并生成SQL
              const tableNames = schema.map((t: any) => t.tableName || t.name || "").filter(Boolean)
              const combinedText = (parsed.explanation || "" + " " + toolSQL).toLowerCase()
              let detectedTable = null
              
              for (const tableName of tableNames) {
                if (combinedText.includes(tableName.toLowerCase()) || 
                    combinedText.includes(`\`${tableName}\``) ||
                    combinedText.includes(`"${tableName}"`)) {
                  detectedTable = tableName
                  break
                }
              }
              
              if (detectedTable) {
                const tableSchema = schema.find((t: any) => 
                  (t.tableName || t.name || "").toLowerCase() === detectedTable.toLowerCase()
                )
                
                if (tableSchema && tableSchema.columns) {
                  const columns = tableSchema.columns
                    .map((c: any) => c.name || c.columnName || c.COLUMN_NAME)
                    .filter(Boolean)
                  if (columns.length > 0) {
                    sql = `SELECT ${columns.join(", ")} FROM ${detectedTable}`
                    console.log("[Chat] Auto-generated SQL from toolCall execution plan:", sql)
                    // 更新toolCall中的SQL
                    toolCall.sql = sql
                  }
                }
              }
            }

            // ========== JOIN 必需性校验：需要跨表但 SQL 不满足 ==========
            // 说明：此处在“匹配工具/执行工具”之前先校验。若不满足，先触发一次重写，
            // 让流程回落到动态 SQL 执行（或匹配到新的工具）。
            if (needsJoinQuery && typeof sql === "string" && sql.match(/^(SELECT|WITH)/i) && !joinRegenerated) {
              const joinAssessment = assessJoinRequirement(sql)
              if (joinAssessment.shouldRegenerate) {
                const regenerated = await regenerateSQLForJoin({
                  reason: joinAssessment.reason || "join_requirement_failed",
                  originalSQL: sql,
                })
                if (regenerated) {
                  sql = regenerated
                  parsed.sql = regenerated
                  joinRegenerated = true
                  // 尽量让后续流程走动态 SQL（匹配不到工具时会自然回落）
                  try {
                    toolCall.sql = regenerated
                  } catch {}
                }
              }
            }

            // 匹配SQL查询配置
            const matchResult = AgentToolExecutor.matchSQLTool(sql, availableTools, connection as any)
            
            if (matchResult.matched && matchResult.tool) {
              // 执行SQL查询配置前，先验证 SQL 字段
              // 注意：对于用户配置的工具，允许 information_schema 查询（如获取数据库结构的工具）
              let sqlRegenerated = false
              if (schema && Array.isArray(schema) && schema.length > 0) {
                const schemaValidation = SQLValidator.validateSchema(sql, schema as DatabaseSchema[], true)
                if (!schemaValidation.valid) {
                  console.warn("[Chat] Tool SQL schema validation failed, attempting to regenerate:", schemaValidation.errors)
                  
                  // 尝试重新生成 SQL（基于正确的 schema 信息）
                  const invalidFieldsList = schemaValidation.invalidColumns.map(c => `- ${c.table}.${c.column}`).join("\n")
                  const invalidTablesList = schemaValidation.invalidTables.map(t => `- ${t}`).join("\n")
                  
                  const regeneratePrompt = `刚才生成的 SQL 语句包含不存在的表或字段：

**不存在的表：**
${invalidTablesList || "无"}

**不存在的字段：**
${invalidFieldsList || "无"}

**原始 SQL：**
\`${sql}\`

请基于以下数据库结构信息重新生成正确的 SQL 查询：

${formatDatabaseSchema(schema)}

用户问题："${userQuestion}"

**🚨 字段白名单（只能使用这些字段！）：**

${Object.entries(fieldWhitelist).map(([table, fields]) => 
  `- **${table}**: ${fields.join(", ")}`
).join("\n")}

**⚠️ 重要要求：**
1. **必须只使用上述字段白名单中的字段**：任何不在白名单中的字段都是不存在的，绝对不要使用！
2. **绝对禁止使用 SELECT ***：必须展开为字段白名单中的具体字段列表
3. **字段名必须完全匹配**：字段名必须与白名单中的完全一致（注意大小写）
4. **生成前逐一检查**：对于每个字段，必须确认它在对应表的字段白名单中
5. **如果字段不在白名单中**：返回 sql: null，在 explanation 中说明

请重新生成正确的 SQL 查询，确保所有字段都在字段白名单中。`

                  try {
                    // 调用 LLM 重新生成 SQL
                    const baseUrl = llmConnection?.baseUrl || "https://api.openai.com/v1"
                    let apiUrl = baseUrl.endsWith("/") ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`
                    
                    if (baseUrl.includes("cloudflare.com")) {
                      apiUrl = `https://gateway.ai.cloudflare.com/v1/${llmConnection?.provider}/${effectiveLLMConfig.model}/chat/completions`
                    }
                    
                    const headers: HeadersInit = {
                      "Content-Type": "application/json",
                    }
                    
                    // 验证并获取API Key
                    const validatedApiKey = getValidatedApiKey(llmConnection, false)
                    
                    if (baseUrl.includes("cloudflare.com")) {
                      // Cloudflare AI Gateway 不需要 API key
                    } else if (llmConnection?.provider === "anthropic") {
                      headers["x-api-key"] = validatedApiKey
                      headers["anthropic-version"] = "2023-06-01"
                    } else {
                      headers["Authorization"] = `Bearer ${validatedApiKey}`
                    }

                    console.log("[Chat] Regenerating SQL for tool call due to schema validation failure")
                    const regenerateResponse = await fetch(apiUrl, {
                      method: "POST",
                      headers,
                      body: JSON.stringify({
                        model: effectiveLLMConfig.model,
                        messages: [
                          {
                            role: "system",
                            content: (await PromptConfigService.getConfig("sql_generation", "sql_generation_regenerate_system_message")) || `你是一个 SQL 查询生成助手。**必须严格遵守字段白名单制度**：

🚨 **字段白名单规则（最高优先级）：**
1. **只能使用字段白名单中明确列出的字段**：任何不在白名单中的字段都是不存在的，绝对不要使用！
2. **生成SQL前必须逐一检查**：对于每个字段，必须确认它在对应表的字段白名单中
3. **字段名必须完全匹配**：字段名必须与白名单中的完全一致（注意大小写）
4. **绝对禁止使用 SELECT ***：必须展开为字段白名单中的具体字段列表
5. **如果字段不在白名单中**：返回 sql: null，在 explanation 中说明

**输出格式要求：**
必须以 JSON 格式返回，格式如下：
\`\`\`json
{
  "explanation": "用中文详细说明这个查询要做什么",
  "sql": "完整且可执行的 SQL 查询语句（如果字段不在白名单中，则为 null）",
  "reasoning": "详细解释为什么这个 SQL 能回答用户的问题，或为什么无法生成 SQL"
}
\`\`\``,
                          },
                          {
                            role: "user",
                            content: regeneratePrompt,
                          },
                        ],
                        temperature: effectiveLLMConfig.temperature || 0.7,
                        max_tokens: effectiveLLMConfig.maxTokens || 2000,
                      }),
                    })

                    if (regenerateResponse.ok) {
                      const regenerateData = await regenerateResponse.json()
                      const regenerateMessage = regenerateData.choices?.[0]?.message?.content || regenerateData.content || ""
                      
                      // 提取重新生成的 SQL
                      const regenerateJsonMatch = regenerateMessage.match(/```json\s*([\s\S]*?)\s*```/) || 
                                                 regenerateMessage.match(/\{[\s\S]*\}/)
                      
                      if (regenerateJsonMatch) {
                        try {
                          const regenerateParsed = JSON.parse(regenerateJsonMatch[1] || regenerateJsonMatch[0])
                          if (regenerateParsed.sql) {
                            const regeneratedSQL = regenerateParsed.sql.trim()
                            
                            // 再次验证重新生成的 SQL
                            // 注意：重新生成的SQL如果是工具SQL，应该允许 information_schema 查询
                            const reValidation = SQLValidator.validate(regeneratedSQL, true)
                            if (reValidation.valid) {
                              const reSchemaValidation = SQLValidator.validateSchema(regeneratedSQL, schema as DatabaseSchema[], true)
                              if (reSchemaValidation.valid) {
                                console.log("[Chat] Tool SQL regenerated successfully with correct schema")
                                // 更新 SQL，标记为已重新生成，跳过工具执行，直接作为动态SQL执行
                                sql = regeneratedSQL
                                parsed.sql = regeneratedSQL // 同时更新parsed.sql，确保动态SQL执行时使用
                                sqlRegenerated = true
                                // 跳过工具执行，直接作为动态SQL执行
                                toolExecuted = false
                              } else {
                                console.warn("[Chat] Regenerated tool SQL still has schema errors:", reSchemaValidation.errors)
                                // 如果重新生成后仍然有错误，继续执行原SQL（让数据库报错，而不是在这里阻止）
                                console.log("[Chat] Continuing with original SQL, will let database report error")
                              }
                            } else {
                              console.warn("[Chat] Regenerated tool SQL validation failed:", reValidation.error)
                              // 如果重新生成后仍然有错误，继续执行原SQL（让数据库报错，而不是在这里阻止）
                              console.log("[Chat] Continuing with original SQL, will let database report error")
                            }
                          } else {
                            console.warn("[Chat] Regenerated response does not contain SQL, continuing with original SQL")
                          }
                        } catch (parseError) {
                          console.error("[Chat] Failed to parse regenerated tool SQL:", parseError)
                          // 解析失败，继续执行原SQL
                        }
                      } else {
                        console.warn("[Chat] Regenerated response does not contain valid JSON, continuing with original SQL")
                      }
                    } else {
                      const errorText = await regenerateResponse.text()
                      console.error("[Chat] Failed to regenerate tool SQL:", {
                        status: regenerateResponse.status,
                        errorText,
                        provider: llmConnection?.provider,
                        model: effectiveLLMConfig.model,
                      })
                      
                      // 如果是 401 错误，抛出明确的错误信息
                      if (regenerateResponse.status === 401) {
                        throw new Error(`AI 模型 API Key 认证失败（工具SQL重新生成）。请检查：\n1. API Key 是否正确\n2. API Key 是否已过期\n3. 前往"模型管理"页面检查模型配置\n\n原始错误: ${errorText}`)
                      }
                      // 重新生成失败，继续执行原SQL
                    }
                  } catch (regenerateError: any) {
                    console.error("[Chat] Tool SQL regeneration failed:", regenerateError)
                    // 重新生成失败，继续执行原SQL
                  }
                  
                  // 注意：即使重新生成失败，我们也继续执行原SQL，让数据库报错
                  // 这样可以给用户更明确的错误信息
                  console.log("[Chat] Tool SQL schema validation failed, but continuing execution to get database error")
                } else {
                  console.log("[Chat] Tool SQL schema validation passed")
                }
              }
              
              // 如果SQL已重新生成，跳过SQL查询配置执行，直接作为动态SQL执行
              if (sqlRegenerated) {
                console.log("[Chat] SQL regenerated, skipping SQL query config execution, will execute as dynamic SQL")
                toolExecuted = false
              } else {
                // 执行SQL查询配置
                try {
                  const executionResult = await AgentToolExecutor.executeSQLTool(
                    matchResult.tool,
                    connection as any,
                    toolCall.parameters
                  )

                if (executionResult.success) {
                  queryResult = executionResult.result
                  toolExecuted = true

                  // 检测SQL查询配置返回的结果是否是表结构信息（在记录审计日志之前）
                  const isSchemaQuery = /information_schema/i.test(sql) || /SHOW\s+(COLUMNS|FIELDS|TABLES)/i.test(sql) || /DESCRIBE/i.test(sql)
                  
                  // 检查查询结果是否看起来像表结构信息
                  const isSchemaResult = queryResult && queryResult.columns && queryResult.rows && queryResult.rows.length > 0 && (
                    // 检测表名列（更宽松的匹配）
                    queryResult.columns.some((col: string) => 
                      /表名|table.*name|TABLE_NAME|table_name/i.test(col)
                    ) && (
                      // 检测列名列或数据类型列或列注释（只要有一个即可）
                      queryResult.columns.some((col: string) => 
                        /列名|column.*name|COLUMN_NAME|column_name/i.test(col)
                      ) || queryResult.columns.some((col: string) => 
                        /数据类型|data.*type|DATA_TYPE|data_type|类型|type/i.test(col)
                      ) || queryResult.columns.some((col: string) => 
                        /列注释|column.*comment|COLUMN_COMMENT|column_comment|注释|comment/i.test(col)
                      )
                    )
                  )

                  // 如果返回的是表结构信息，Agent需要执行二次查询（使用工具）
                  if ((isSchemaQuery || isSchemaResult) && queryResult && queryResult.rows && queryResult.rows.length > 0) {
                    console.log("[Chat] Agent tool returned schema query result, triggering second query (Agent decision)", {
                      sql,
                      columns: queryResult.columns,
                      isSchemaQuery,
                      isSchemaResult,
                      rowCount: queryResult.rows.length,
                      userQuestion
                    })
                    workProcess.push("📊 **步骤 3: 结果处理与报告**")
                    workProcess.push("🔄 **检测到表结构结果，执行二次查询**")

                    const secondQueryResult = await triggerSecondQueryForSchemaResult(
                      queryResult,  // 第一次查询返回的结果（表结构）
                      sql,
                      userQuestion,
                      llmConnection,
                      schema  // 传递已有的表结构信息作为回退
                    )

                    if (secondQueryResult.success && secondQueryResult.result) {
                      // 用第二次查询的结果替换第一次的结果
                      queryResult = secondQueryResult.result
                      sql = secondQueryResult.sql || sql
                      console.log("[Chat] Second query succeeded, replaced result with actual data")
                      
                      // 记录审计日志（第二次查询）
                      await logAudit({
                        userId: user.id,
                        userName: user.email,
                        action: "query",
                        resourceType: "database",
                        resourceId: effectiveDatabaseConnectionId,
                        details: `执行第二次查询（基于表结构）: ${sql.substring(0, 100)}`,
                        sql,
                        status: "success",
                        organizationId: user.organizationId,
                      })
                    } else {
                      console.warn("[Chat] Second query failed, keeping original schema result", {
                        error: secondQueryResult.error || "Unknown error"
                      })
                      
                      // 如果二次查询失败，生成明确的错误消息，而不是返回表结构信息
                      const errorMsg = secondQueryResult.error || "无法生成第二次查询"
                      errorMessage = `查询失败：${errorMsg}。系统检测到返回的是表结构信息，但无法生成查询实际数据的 SQL。`
                      
                      // 检查是否是表不存在的情况
                      if (errorMsg.includes("没有找到") || errorMsg.includes("不存在") || errorMsg.includes("doesn't exist")) {
                        // 尝试从用户问题中提取表名
                        const tableMatch = userQuestion.match(/(产品|product|客户|customer|订单|order|用户|user)/i)
                        if (tableMatch) {
                          errorMessage = `数据库中没有找到 "${tableMatch[1]}" 相关的数据表，无法执行查询。请检查数据库结构或重新提问。`
                        } else {
                          errorMessage = `数据库中没有找到相关的数据表，无法执行查询。请检查数据库结构或重新提问。`
                        }
                      }
                      
                      // 记录第一次查询的审计日志（标记为失败）
                      await logAudit({
                        userId: user.id,
                        userName: user.email,
                        action: "query",
                        resourceType: "database",
                        resourceId: effectiveDatabaseConnectionId,
                        details: `执行工具 "${executionResult.toolName}": ${sql.substring(0, 100)} (返回表结构，二次查询失败: ${errorMsg})`,
                        sql,
                        status: "failed",
                        organizationId: user.organizationId,
                      })
                      
                      // 清空查询结果，让错误消息显示给用户
                      queryResult = null
                    }
                  } else {
                    // 如果不是表结构信息，正常记录审计日志
                    await logAudit({
                      userId: user.id,
                      userName: user.email,
                      action: "query",
                      resourceType: "database",
                      resourceId: effectiveDatabaseConnectionId,
                      details: `执行工具 "${executionResult.toolName}": ${sql.substring(0, 100)}`,
                      sql,
                      status: "success",
                      organizationId: user.organizationId,
                    })
                  }
                } else {
                  // 工具执行失败
                  const toolError = executionResult.error || "工具执行失败"
                  
                  // 检查是否是列不存在错误，如果是，直接触发重新生成逻辑
                  const isColumnError = /Unknown column|列.*不存在|does not exist|column.*not found/i.test(toolError)
                  const isTableError = /Unknown table|表.*不存在|Table.*doesn't exist|table.*not found/i.test(toolError)
                  
                  if ((isColumnError || isTableError) && schema && Array.isArray(schema) && schema.length > 0 && llmConnection) {
                    console.log("[Chat] Tool execution failed with column/table error, will trigger regeneration in dynamic SQL path:", toolError)
                    // 设置错误信息，让动态SQL路径处理重新生成
                    errorMessage = toolError
                    // 继续执行动态SQL逻辑，在那里会触发重新生成
                    toolExecuted = false
                  } else if (allowDynamicSQL) {
                    console.log("[Chat] Tool execution failed, trying as dynamic SQL:", toolError)
                    // 继续执行下面的动态 SQL 逻辑
                    toolExecuted = false
                  } else {
                    errorMessage = toolError
                    throw new Error(errorMessage)
                  }
                }
              } catch (queryError: any) {
                // 工具执行异常
                const toolError = queryError.message || "工具执行失败"
                
                // 检查是否是列不存在错误，如果是，直接触发重新生成逻辑
                const isColumnError = /Unknown column|列.*不存在|does not exist|column.*not found/i.test(toolError)
                const isTableError = /Unknown table|表.*不存在|Table.*doesn't exist|table.*not found/i.test(toolError)
                
                if ((isColumnError || isTableError) && schema && Array.isArray(schema) && schema.length > 0 && llmConnection) {
                  console.log("[Chat] Tool execution exception with column/table error, will trigger regeneration in dynamic SQL path:", toolError)
                  // 设置错误信息，让动态SQL路径处理重新生成
                  errorMessage = toolError
                  // 继续执行动态SQL逻辑，在那里会触发重新生成
                  toolExecuted = false
                } else if (allowDynamicSQL) {
                  console.log("[Chat] Tool execution exception, trying as dynamic SQL:", toolError)
                  // 继续执行下面的动态 SQL 逻辑
                  toolExecuted = false
                } else {
                  errorMessage = toolError
                  throw queryError
                }
              }
              }
              } else {
                // SQL查询配置不匹配，如果允许动态 SQL，尝试作为动态 SQL 执行
                if (allowDynamicSQL) {
                  console.log("[Chat] SQL query config not matched, trying as dynamic SQL")
                // 继续执行下面的动态 SQL 逻辑
              } else {
                errorMessage = matchResult.error || "SQL 语句不匹配任何配置的SQL查询"
                throw new Error(errorMessage)
              }
            }
          }
        }
        
        // 处理动态 SQL（如果没有工具调用，或工具调用失败且允许动态 SQL）
        if (parsed.sql && parsed.sql.trim() && !toolExecuted) {
          sql = parsed.sql.trim()
          
          console.log("[Chat] Executing dynamic SQL (from parsed.sql):", {
            sql: sql.substring(0, 200),
            sqlLength: sql.length,
            isExecutionPlan: false,
            toolExecuted
          })

          // ========== JOIN 必需性校验：需要跨表但 SQL 不满足 ==========
          if (needsJoinQuery && typeof sql === "string" && sql.match(/^(SELECT|WITH)/i) && !joinRegenerated) {
            const joinAssessment = assessJoinRequirement(sql)
            if (joinAssessment.shouldRegenerate) {
              const regenerated = await regenerateSQLForJoin({
                reason: joinAssessment.reason || "join_requirement_failed",
                originalSQL: sql,
              })
              if (regenerated) {
                sql = regenerated
                parsed.sql = regenerated
                joinRegenerated = true
                console.log("[Chat] JOIN-regenerated SQL will be executed as dynamic SQL", {
                  sql: sql.substring(0, 200),
                })
              }
            }
          }
          
          // 如果 SQL 为空字符串或只有空白，说明 LLM 认为无法生成查询
          if (!sql || sql.length === 0) {
            errorMessage = parsed.explanation || "无法生成 SQL 查询，请检查数据库结构或重新提问"
            return NextResponse.json({
              message: parsed.explanation || "无法生成 SQL 查询",
              queryResult: null,
              sql: null,
              error: errorMessage,
              workProcess: workProcess.length > 0 ? workProcess : undefined,
              sessionId: sessionId,
            })
          }

          // 验证 SQL 安全性（只允许 SELECT）
          const sqlValidation = SQLValidator.validate(sql, false)
          if (!sqlValidation.valid) {
            errorMessage = sqlValidation.error || "SQL 验证失败"
            throw new Error(errorMessage)
          }

          // 验证 SQL 中的表和字段是否存在于 schema 中
          if (schema && Array.isArray(schema) && schema.length > 0) {
            const schemaValidation = SQLValidator.validateSchema(sql, schema)
            if (!schemaValidation.valid) {
              const errorDetails = schemaValidation.errors.join("; ")
              
              // 构建详细的错误信息，包括建议的正确字段名
              let detailedError = `SQL 字段验证失败：${errorDetails}`
              
              if (schemaValidation.invalidTables.length > 0) {
                detailedError += `\n\n❌ **不存在的表：**\n${schemaValidation.invalidTables.map(t => `- ${t}`).join("\n")}`
                // 提供建议的表名
                const availableTables = schema.map((t: any) => t.tableName || t.name).filter(Boolean)
                if (availableTables.length > 0) {
                  detailedError += `\n\n💡 **可用的表：**\n${availableTables.map(t => `- ${t}`).join("\n")}`
                }
              }
              
              if (schemaValidation.invalidColumns.length > 0) {
                detailedError += `\n\n❌ **不存在的字段：**\n${schemaValidation.invalidColumns.map((c: { table: string; column: string }) => `- ${c.table}.${c.column}`).join("\n")}`
                // 为每个无效字段提供建议
                schemaValidation.invalidColumns.forEach(({ table, column }: { table: string; column: string }) => {
                  const tableSchema = (schema as DatabaseSchema[]).find((t: DatabaseSchema) => 
                    (t.tableName || (t as any).name || "").toLowerCase() === table.toLowerCase()
                  )
                  if (tableSchema && tableSchema.columns) {
                    const availableColumns = tableSchema.columns.map((c: any) => c.name || c.columnName || c.COLUMN_NAME).filter(Boolean)
                    if (availableColumns.length > 0) {
                      detailedError += `\n\n💡 **表 "${table}" 的可用字段：**\n${availableColumns.map((c: string) => `- ${c}`).join(", ")}`
                    }
                  }
                })
              }
              
              errorMessage = detailedError
              
              console.warn("[Chat] Schema validation failed:", {
                sql,
                errors: schemaValidation.errors,
                invalidTables: schemaValidation.invalidTables,
                invalidColumns: schemaValidation.invalidColumns,
              })
              
              // 尝试重新生成 SQL（基于正确的 schema 信息）
              console.log("[Chat] Attempting to regenerate SQL with correct schema information")
              
              // 构建包含错误信息的提示，让 LLM 重新生成
              const invalidFieldsList = schemaValidation.invalidColumns.map(c => `- ${c.table}.${c.column}`).join("\n")
              const invalidTablesList = schemaValidation.invalidTables.map(t => `- ${t}`).join("\n")
              
              const regeneratePrompt = `刚才生成的 SQL 语句包含不存在的表或字段：

**不存在的表：**
${invalidTablesList || "无"}

**不存在的字段：**
${invalidFieldsList || "无"}

**原始 SQL：**
\`${sql}\`

请基于以下数据库结构信息重新生成正确的 SQL 查询：

${formatDatabaseSchema(schema)}

用户问题："${userQuestion}"

**🚨 字段白名单（只能使用这些字段！）：**

${Object.entries(fieldWhitelist).map(([table, fields]) => 
  `- **${table}**: ${fields.join(", ")}`
).join("\n")}

**⚠️ 重要要求：**
1. **必须只使用上述字段白名单中的字段**：任何不在白名单中的字段都是不存在的，绝对不要使用！
2. **绝对禁止使用 SELECT ***：必须展开为字段白名单中的具体字段列表
3. **字段名必须完全匹配**：字段名必须与白名单中的完全一致（注意大小写）
4. **生成前逐一检查**：对于每个字段，必须确认它在对应表的字段白名单中
5. **如果字段不在白名单中**：返回 sql: null，在 explanation 中说明

请重新生成正确的 SQL 查询，确保所有字段都在字段白名单中。`

              try {
                // 调用 LLM 重新生成 SQL
                const baseUrl = llmConnection?.baseUrl || "https://api.openai.com/v1"
                let apiUrl = baseUrl.endsWith("/") ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`
                
                if (baseUrl.includes("cloudflare.com")) {
                  apiUrl = `https://gateway.ai.cloudflare.com/v1/${llmConnection?.provider}/${effectiveLLMConfig.model}/chat/completions`
                }
                
                const headers: HeadersInit = {
                  "Content-Type": "application/json",
                }
                
                // 验证并获取API Key
                const validatedApiKey = getValidatedApiKey(llmConnection, false)
                
                if (baseUrl.includes("cloudflare.com")) {
                  // Cloudflare AI Gateway 不需要 API key
                } else if (llmConnection?.provider === "anthropic") {
                  headers["x-api-key"] = validatedApiKey
                  headers["anthropic-version"] = "2023-06-01"
                } else {
                  headers["Authorization"] = `Bearer ${validatedApiKey}`
                }

                const regenerateResponse = await fetch(apiUrl, {
                  method: "POST",
                  headers,
                  body: JSON.stringify({
                    model: effectiveLLMConfig.model,
                    messages: [
                      {
                        role: "system",
                        content: `你是一个 SQL 查询生成助手。必须严格使用提供的数据库 schema 中的表和字段名。`,
                      },
                      {
                        role: "user",
                        content: regeneratePrompt,
                      },
                    ],
                    temperature: effectiveLLMConfig.temperature || 0.7,
                    max_tokens: effectiveLLMConfig.maxTokens || 2000,
                  }),
                })

                if (regenerateResponse.ok) {
                  const regenerateData = await regenerateResponse.json()
                  const regenerateMessage = regenerateData.choices?.[0]?.message?.content || regenerateData.content || ""
                  
                  // 提取重新生成的 SQL
                  const regenerateJsonMatch = regenerateMessage.match(/```json\s*([\s\S]*?)\s*```/) || 
                                             regenerateMessage.match(/\{[\s\S]*\}/)
                  
                  if (regenerateJsonMatch) {
                    try {
                      const regenerateParsed = JSON.parse(regenerateJsonMatch[1] || regenerateJsonMatch[0])
                      if (regenerateParsed.sql) {
                        const regeneratedSQL = regenerateParsed.sql.trim()
                        
                        // 再次验证重新生成的 SQL
                        const reValidation = SQLValidator.validate(regeneratedSQL, false)
                        if (reValidation.valid) {
                          const reSchemaValidation = SQLValidator.validateSchema(regeneratedSQL, schema)
                          if (reSchemaValidation.valid) {
                            console.log("[Chat] SQL regenerated successfully with correct schema")
                            sql = regeneratedSQL
                            // 继续执行，不抛出错误
                          } else {
                            console.warn("[Chat] Regenerated SQL still has schema errors:", reSchemaValidation.errors)
                            throw new Error(errorMessage)
                          }
                        } else {
                          console.warn("[Chat] Regenerated SQL validation failed:", reValidation.error)
                          throw new Error(errorMessage)
                        }
                      } else {
                        throw new Error(errorMessage)
                      }
                    } catch (parseError) {
                      console.error("[Chat] Failed to parse regenerated SQL:", parseError)
                      throw new Error(errorMessage)
                    }
                  } else {
                    throw new Error(errorMessage)
                  }
                } else {
                  const errorText = await regenerateResponse.text()
                  console.error("[Chat] Failed to regenerate SQL:", {
                    status: regenerateResponse.status,
                    errorText,
                    provider: llmConnection?.provider,
                    model: effectiveLLMConfig.model,
                  })
                  
                  // 如果是 401 错误，提供更明确的错误信息
                  if (regenerateResponse.status === 401) {
                    throw new Error(`AI 模型 API Key 认证失败（SQL重新生成）。请检查：\n1. API Key 是否正确\n2. API Key 是否已过期\n3. 前往"模型管理"页面检查模型配置\n\n原始错误: ${errorText}`)
                  }
                  
                  throw new Error(errorMessage)
                }
              } catch (regenerateError: any) {
                console.error("[Chat] SQL regeneration failed:", regenerateError)
                throw new Error(errorMessage)
              }
            } else {
              console.log("[Chat] Schema validation passed")
            }
          }

          // 检查是否是查询表结构的 SQL（information_schema 查询）
          const isSchemaQuery = /information_schema/i.test(sql) || /SHOW\s+(COLUMNS|FIELDS|TABLES)/i.test(sql) || /DESCRIBE/i.test(sql)
          
          // 应用权限规则（除非是管理员或查询表结构）
          let finalSQL = sql
          if (user.role !== "admin" && !isSchemaQuery) {
            try {
              const permissionContext = {
                user,
                databaseConnectionId: effectiveDatabaseConnectionId,
                organizationId: user.organizationId,
              }
              const applied = await PermissionApplier.applyPermissions(sql, permissionContext)
              finalSQL = applied.modifiedSQL
              
              if (applied.restrictedTables.length > 0) {
                errorMessage = `无权限访问以下表: ${applied.restrictedTables.join(", ")}。请联系管理员配置相应权限。`
                throw new Error(errorMessage)
              }
              
              if (applied.appliedFilters.length > 0) {
                console.log("[Chat] Applied permission filters:", applied.appliedFilters)
                workProcess.push(`🔒 **已应用权限过滤**: ${applied.appliedFilters.join("; ")}`)
              }
            } catch (permError: any) {
              errorMessage = permError.message || "权限检查失败"
              throw permError
            }
          }

          // 🔒 列级权限校验：任何位置引用不可访问列直接阻断（生产安全优先）
          if (user.role !== "admin" && !isSchemaQuery) {
            const permissionContext = {
              user,
              databaseConnectionId: effectiveDatabaseConnectionId,
              organizationId: user.organizationId,
            }
            const compiled = await PermissionApplier.compilePermissions(permissionContext)
            enforceColumnAccess({
              sql: finalSQL,
              schema: filteredSchema || schema || [],
              policy: {
                tablePermissionMap: compiled.tablePermissionMap,
                columnPermissionMap: compiled.columnPermissionMap,
              },
            })
          }
          
          // 执行查询
          let sqlRegeneratedAfterError = false
          try {
            // 发送流式更新：开始执行查询
            if (actualSessionId && !actualSessionId.startsWith("session_")) {
              sendStreamUpdate(actualSessionId, "step_started", {
                step: "query_generation",
                message: "正在执行数据库查询...",
                sql: finalSQL,
                workProcess: [...workProcess],
              })
            }
            
            const sqlExecutionStartTime = Date.now()
            queryResult = await SQLExecutor.executeQuery(connection as any, finalSQL)
            performanceLog.sqlExecution = Date.now() - sqlExecutionStartTime
            console.log(`[Performance] SQL execution: ${performanceLog.sqlExecution}ms`)

            // 🔒 结果脱敏：对 masked=true 的列自动脱敏（基于原始列名映射）
            if (!isSchemaQuery) {
              const permissionContext = {
                user,
                databaseConnectionId: effectiveDatabaseConnectionId,
                organizationId: user.organizationId,
              }
              const compiled = await PermissionApplier.compilePermissions(permissionContext)
              queryResult = applyMaskingToQueryResult(queryResult, compiled.permission)
            }
            
            // 发送流式更新：查询执行完成
            if (actualSessionId && !actualSessionId.startsWith("session_") && queryResult) {
              sendStreamUpdate(actualSessionId, "step_completed", {
                step: "query_generation",
                message: `查询完成，返回 ${queryResult.rowCount || queryResult.rows?.length || 0} 条结果`,
                queryResult: {
                  rowCount: queryResult.rowCount || queryResult.rows?.length || 0,
                  columnCount: queryResult.columns?.length || 0,
                },
                workProcess: [...workProcess],
              })
            }

            // 如果返回的是表结构信息，且用户的问题需要实际数据，需要触发第二次查询
            // 开始步骤3：结果处理与报告
            if (!workProcess.some(step => step.includes("步骤 3"))) {
              workProcess.push("📊 **步骤 3: 结果处理与报告**")
              // 发送流式更新：开始结果处理
              if (actualSessionId && !actualSessionId.startsWith("session_")) {
                sendStreamUpdate(actualSessionId, "step_started", {
                  step: "result_processing",
                  message: "正在处理查询结果...",
                  workProcess: [...workProcess],
                })
              }
            }
            
            // 检查查询结果是否看起来像表结构信息（更宽松的检测条件）
            const isSchemaResult = queryResult && queryResult.columns && queryResult.rows && queryResult.rows.length > 0 && (
              // 检测表名列（更宽松的匹配）
              queryResult.columns.some((col: string) => 
                /表名|table.*name|TABLE_NAME|table_name/i.test(col)
              ) && (
                // 检测列名列或数据类型列或列注释（只要有一个即可）
                queryResult.columns.some((col: string) => 
                  /列名|column.*name|COLUMN_NAME|column_name/i.test(col)
                ) || queryResult.columns.some((col: string) => 
                  /数据类型|data.*type|DATA_TYPE|data_type|类型|type/i.test(col)
                ) || queryResult.columns.some((col: string) => 
                  /列注释|column.*comment|COLUMN_COMMENT|column_comment|注释|comment/i.test(col)
                )
              )
            )

            // 如果返回的是表结构信息，Agent需要执行二次查询（使用工具）
            if ((isSchemaQuery || isSchemaResult) && queryResult && queryResult.rows && queryResult.rows.length > 0) {
              console.log("[Chat] Agent SQL returned schema query result, triggering second query (Agent decision)", {
                sql,
                columns: queryResult.columns,
                isSchemaQuery,
                isSchemaResult,
                rowCount: queryResult.rows.length,
                userQuestion
              })
              workProcess.push("🔄 **检测到表结构结果，执行二次查询**")

              const secondQueryResult = await triggerSecondQueryForSchemaResult(
                queryResult,  // 第一次查询返回的结果（表结构）
                sql,
                userQuestion,
                llmConnection,
                schema  // 传递已有的表结构信息作为回退
              )

              if (secondQueryResult.success && secondQueryResult.result) {
                // 用第二次查询的结果替换第一次的结果
                queryResult = secondQueryResult.result
                sql = secondQueryResult.sql || sql
                console.log("[Chat] Second query succeeded, replaced result with actual data")
                
                // 发送流式更新：第二次查询完成
                if (actualSessionId && !actualSessionId.startsWith("session_")) {
                  sendStreamUpdate(actualSessionId, "step_started", {
                    step: "result_processing",
                    message: `第二次查询完成，返回 ${queryResult.rowCount || queryResult.rows?.length || 0} 条结果`,
                    queryResult: {
                      rowCount: queryResult.rowCount || queryResult.rows?.length || 0,
                      columnCount: queryResult.columns?.length || 0,
                    },
                    workProcess: [...workProcess],
                  })
                }
                
                // 记录审计日志（第二次查询）
                await logAudit({
                  userId: user.id,
                  userName: user.email,
                  action: "query",
                  resourceType: "database",
                  resourceId: effectiveDatabaseConnectionId,
                  details: `执行第二次查询（基于表结构）: ${sql.substring(0, 100)}`,
                  sql,
                  status: "success",
                  organizationId: user.organizationId,
                })
              } else {
                console.warn("[Chat] Second query failed, keeping original schema result", {
                  error: secondQueryResult.error || "Unknown error"
                })
                
                // 如果二次查询失败，生成明确的错误消息，而不是返回表结构信息
                const errorMsg = secondQueryResult.error || "无法生成第二次查询"
                errorMessage = `查询失败：${errorMsg}。系统检测到返回的是表结构信息，但无法生成查询实际数据的 SQL。`
                
                // 检查是否是表不存在的情况
                if (errorMsg.includes("没有找到") || errorMsg.includes("不存在") || errorMsg.includes("doesn't exist")) {
                  // 尝试从用户问题中提取表名
                  const tableMatch = userQuestion.match(/(产品|product|客户|customer|订单|order|用户|user)/i)
                  if (tableMatch) {
                    errorMessage = `数据库中没有找到 "${tableMatch[1]}" 相关的数据表，无法执行查询。请检查数据库结构或重新提问。`
                  } else {
                    errorMessage = `数据库中没有找到相关的数据表，无法执行查询。请检查数据库结构或重新提问。`
                  }
                }
                
                // 清空查询结果，让错误消息显示给用户
                queryResult = null
              }
            }

            // 记录审计日志（第一次查询，如果第二次查询没有执行或失败）
            // 如果第二次查询成功，sql 会被更新为第二次查询的 SQL，且已经记录了审计日志
            // 这里只记录第一次查询的审计日志（如果第二次查询没有执行）
            // 检查第二次查询是否成功：如果结果不再是表结构信息，说明第二次查询成功了
            const isStillSchemaResult = queryResult && queryResult.columns && queryResult.columns.some((col: string) => 
              /表名|table.*name|TABLE_NAME|table_name/i.test(col)
            ) && (
              queryResult.columns.some((col: string) => 
                /列名|column.*name|COLUMN_NAME|column_name/i.test(col)
              ) || queryResult.columns.some((col: string) => 
                /数据类型|data.*type|DATA_TYPE|data_type|类型|type/i.test(col)
              ) || queryResult.columns.some((col: string) => 
                /列注释|column.*comment|COLUMN_COMMENT|column_comment|注释|comment/i.test(col)
              )
            )
            const secondQueryExecuted = (isSchemaQuery || isSchemaResult) && !isStillSchemaResult
            
            if (sql && queryResult && !secondQueryExecuted) {
              await logAudit({
                userId: user.id,
                userName: user.email,
                action: "query",
                resourceType: "database",
                resourceId: effectiveDatabaseConnectionId,
                details: `执行 SQL 查询: ${sql.substring(0, 100)}`,
                sql,
                status: "success",
                organizationId: user.organizationId,
              })
            }
          } catch (queryError: any) {
            // 🔒 列级权限阻断：不做SQL重生成，直接返回并落审计
            if (queryError instanceof SQLPermissionError || queryError?.name === "SQLPermissionError") {
              const blockedCols = (queryError as any).blockedColumns || []
              const reason = (queryError as any).reason || "column_access_blocked"
              const detailSuffix = blockedCols.length > 0
                ? `；阻断字段: ${blockedCols.map((c: any) => (c.table ? `${c.table}.${c.column}` : c.column)).join(", ")}`
                : ""

              await logAudit({
                userId: user.id,
                userName: user.email,
                action: "query",
                resourceType: "database",
                resourceId: effectiveDatabaseConnectionId,
                details: `列级权限阻断(${reason}): ${queryError.message}${detailSuffix}`,
                sql,
                status: "blocked",
                errorMessage: queryError.message,
                organizationId: user.organizationId,
              })

              throw queryError
            }

            // 提取更清晰的错误信息
            let errorMsg = queryError.message || "SQL 执行失败"
            
            // 如果是 SQL 执行错误，提取原始错误信息
            if (queryError.message?.includes("SQL 执行错误:")) {
              const match = queryError.message.match(/SQL 执行错误:\s*(.+)/)
              if (match) {
                errorMsg = match[1].trim()
              }
            }
            
            // 检测是否是列不存在或表不存在的错误
            const isColumnError = /Unknown column|列.*不存在|does not exist|column.*not found/i.test(errorMsg)
            const isTableError = /Unknown table|表.*不存在|Table.*doesn't exist|table.*not found/i.test(errorMsg)
            
            console.log("[Chat] SQL execution error detected:", {
              error: errorMsg,
              sql,
              isColumnError,
              isTableError,
              hasSchema: !!(schema && Array.isArray(schema) && schema.length > 0),
              hasLLMConnection: !!llmConnection
            })
            
            // 如果检测到列或表不存在的错误，尝试重新生成SQL
            if ((isColumnError || isTableError) && schema && Array.isArray(schema) && schema.length > 0 && llmConnection) {
              console.log("[Chat] Detected column/table error, attempting to regenerate SQL:", {
                error: errorMsg,
                sql,
                isColumnError,
                isTableError,
                schemaTables: schema.map((t: any) => t.tableName || t.name).filter(Boolean)
              })
              
              // 从错误信息中提取不存在的列名和表名
              let invalidColumns: string[] = []
              let invalidTables: string[] = []
              
              if (isColumnError) {
                // 尝试匹配多种错误格式
                const columnMatches = [
                  errorMsg.match(/Unknown column ['"]([^'"]+)['"]/i),
                  errorMsg.match(/列 ['"]([^'"]+)['"] 不存在/i),
                  errorMsg.match(/column ['"]([^'"]+)['"] does not exist/i),
                  errorMsg.match(/column ['"]([^'"]+)['"] not found/i),
                ]
                
                for (const match of columnMatches) {
                  if (match && match[1]) {
                    invalidColumns.push(match[1])
                    break
                  }
                }
              }
              
              if (isTableError) {
                // 尝试匹配多种错误格式
                const tableMatches = [
                  errorMsg.match(/Unknown table ['"]([^'"]+)['"]/i),
                  errorMsg.match(/表 ['"]([^'"]+)['"] 不存在/i),
                  errorMsg.match(/Table ['"]([^'"]+)['"] doesn't exist/i),
                  errorMsg.match(/table ['"]([^'"]+)['"] not found/i),
                ]
                
                for (const match of tableMatches) {
                  if (match && match[1]) {
                    invalidTables.push(match[1])
                    break
                  }
                }
              }
              
              // 如果SQL是SELECT *，尝试从SQL中提取表名
              if (invalidColumns.length === 0 && /SELECT\s+\*\s+FROM/i.test(sql)) {
                const fromMatch = sql.match(/FROM\s+([^\s,;]+)/i)
                if (fromMatch && fromMatch[1]) {
                  const tableName = fromMatch[1].trim().replace(/[`"'\[\]]/g, "")
                  // 查找该表在schema中的实际列
                  const tableSchema = schema.find((t: any) => 
                    (t.tableName || t.name || "").toLowerCase() === tableName.toLowerCase()
                  )
                  if (tableSchema && tableSchema.columns) {
                    const actualColumns = tableSchema.columns.map((c: any) => c.name || c.columnName || c.COLUMN_NAME).filter(Boolean)
                    // 如果SQL中提到了不存在的列（在reasoning或explanation中），我们需要重新生成
                    // 这里我们假设SELECT *可能引用了不存在的列，需要展开为具体列名
                    console.log("[Chat] SELECT * query failed, will regenerate with explicit columns:", actualColumns)
                  }
                }
              }
              
              // 构建重新生成的提示
              const invalidFieldsList = invalidColumns.length > 0 
                ? invalidColumns.map(c => `- ${c}`).join("\n")
                : "无"
              const invalidTablesList = invalidTables.length > 0
                ? invalidTables.map(t => `- ${t}`).join("\n")
                : "无"
              
              const regeneratePrompt = `SQL 执行失败，错误信息：${errorMsg}

**不存在的表：**
${invalidTablesList}

**不存在的字段：**
${invalidFieldsList}

**原始 SQL：**
\`${sql}\`

请基于以下数据库结构信息重新生成正确的 SQL 查询：

${formatDatabaseSchema(schema)}

用户问题："${userQuestion}"

**🚨 字段白名单（只能使用这些字段！）：**

${Object.entries(fieldWhitelist).map(([table, fields]) => 
  `- **${table}**: ${fields.join(", ")}`
).join("\n")}

**⚠️ 重要要求：**
1. **必须只使用上述字段白名单中的字段**：任何不在白名单中的字段都是不存在的，绝对不要使用！
2. **绝对禁止使用 SELECT ***：必须展开为字段白名单中的具体字段列表
3. **字段名必须完全匹配**：字段名必须与白名单中的完全一致（注意大小写）
4. **生成前逐一检查**：对于每个字段，必须确认它在对应表的字段白名单中
5. **如果字段不在白名单中**：返回 sql: null，在 explanation 中说明

请重新生成正确的 SQL 查询，确保所有字段都在字段白名单中。`

              try {
                // 调用 LLM 重新生成 SQL
                const baseUrl = llmConnection.baseUrl || (llmConnection.provider === "ollama" ? "http://localhost:11434/v1" : "https://api.openai.com/v1")
                let apiUrl = baseUrl.endsWith("/") ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`
                
                if (baseUrl.includes("cloudflare.com")) {
                  apiUrl = `https://gateway.ai.cloudflare.com/v1/${llmConnection.provider}/${effectiveLLMConfig.model}/chat/completions`
                }
                
                const headers: HeadersInit = {
                  "Content-Type": "application/json",
                }
                
                // 验证并获取API Key
                const validatedApiKey = getValidatedApiKey(llmConnection, false)
                
                if (baseUrl.includes("cloudflare.com")) {
                  // Cloudflare AI Gateway 不需要 API key
                } else if (llmConnection.provider === "anthropic") {
                  headers["x-api-key"] = validatedApiKey
                  headers["anthropic-version"] = "2023-06-01"
                } else {
                  headers["Authorization"] = `Bearer ${validatedApiKey}`
                }

                console.log("[Chat] Regenerating SQL after execution error", {
                  invalidColumns,
                  invalidTables,
                  originalSQL: sql,
                  userQuestion,
                  hasFieldWhitelist: Object.keys(fieldWhitelist).length > 0
                })
                
                // 构建更详细的system message，强调字段白名单（从配置服务获取）
                const regenerateSystemMessage = (await PromptConfigService.getConfig("sql_generation", "sql_generation_regenerate_system_message")) || `你是一个 SQL 查询生成助手。**必须严格遵守字段白名单制度**：

🚨 **字段白名单规则（最高优先级）：**
1. **只能使用字段白名单中明确列出的字段**：任何不在白名单中的字段都是不存在的，绝对不要使用！
2. **生成SQL前必须逐一检查**：对于每个字段，必须确认它在对应表的字段白名单中
3. **字段名必须完全匹配**：字段名必须与白名单中的完全一致（注意大小写）
4. **绝对禁止使用 SELECT ***：必须展开为字段白名单中的具体字段列表
5. **如果字段不在白名单中**：返回 sql: null，在 explanation 中说明

**输出格式要求：**
必须以 JSON 格式返回，格式如下：
\`\`\`json
{
  "explanation": "用中文详细说明这个查询要做什么",
  "sql": "完整且可执行的 SQL 查询语句（只能使用字段白名单中的字段）",
  "reasoning": "详细解释为什么这个 SQL 能回答用户的问题"
}
\`\`\`

**重要：必须返回有效的 JSON 格式，不要添加任何额外的文本或说明。**`
                
                const regenerateResponse = await fetch(apiUrl, {
                  method: "POST",
                  headers,
                  body: JSON.stringify({
                    model: effectiveLLMConfig.model,
                    messages: [
                      {
                        role: "system",
                        content: regenerateSystemMessage,
                      },
                      {
                        role: "user",
                        content: regeneratePrompt,
                      },
                    ],
                    temperature: effectiveLLMConfig.temperature || 0.3, // 降低温度以提高准确性
                    max_tokens: effectiveLLMConfig.maxTokens || 2000,
                  }),
                })

                if (regenerateResponse.ok) {
                  const regenerateData = await regenerateResponse.json()
                  const regenerateMessage = regenerateData.choices?.[0]?.message?.content || regenerateData.content || ""
                  
                  console.log("[Chat] Regenerated response received:", {
                    messageLength: regenerateMessage.length,
                    messagePreview: regenerateMessage.substring(0, 500),
                    hasJsonBlock: /```json/.test(regenerateMessage),
                    hasJsonObject: /\{[\s\S]*\}/.test(regenerateMessage)
                  })
                  
                  // 提取重新生成的 SQL - 多种格式尝试
                  let regenerateParsed: any = null
                  
                  // 方法1: 尝试匹配 ```json ... ``` 代码块
                  const jsonBlockMatch = regenerateMessage.match(/```json\s*([\s\S]*?)\s*```/)
                  if (jsonBlockMatch) {
                    try {
                      regenerateParsed = JSON.parse(jsonBlockMatch[1])
                    } catch (e) {
                      console.warn("[Chat] Failed to parse JSON from code block:", e)
                    }
                  }
                  
                  // 方法2: 如果方法1失败，尝试直接匹配 JSON 对象
                  if (!regenerateParsed) {
                    const jsonObjectMatch = regenerateMessage.match(/\{[\s\S]*\}/)
                    if (jsonObjectMatch) {
                      try {
                        regenerateParsed = JSON.parse(jsonObjectMatch[0])
                      } catch (e) {
                        console.warn("[Chat] Failed to parse JSON object:", e)
                      }
                    }
                  }
                  
                  // 方法3: 如果前两种方法都失败，尝试直接解析整个消息
                  if (!regenerateParsed) {
                    try {
                      regenerateParsed = JSON.parse(regenerateMessage.trim())
                    } catch (e) {
                      console.warn("[Chat] Failed to parse entire message as JSON:", e)
                    }
                  }
                  
                  if (regenerateParsed && regenerateParsed.sql) {
                    const regeneratedSQL = regenerateParsed.sql.trim()
                    
                    console.log("[Chat] SQL regenerated after execution error:", regeneratedSQL)
                    
                    // 验证重新生成的 SQL
                    const reValidation = SQLValidator.validate(regeneratedSQL, false)
                    if (reValidation.valid) {
                      const reSchemaValidation = SQLValidator.validateSchema(regeneratedSQL, schema)
                      if (reSchemaValidation.valid) {
                        // 应用权限规则
                        let finalRegeneratedSQL = regeneratedSQL
                        if (user.role !== "admin") {
                          try {
                            const permissionContext = {
                              user,
                              databaseConnectionId: effectiveDatabaseConnectionId,
                              organizationId: user.organizationId,
                            }
                            const applied = await PermissionApplier.applyPermissions(regeneratedSQL, permissionContext)
                            finalRegeneratedSQL = applied.modifiedSQL
                            
                            if (applied.restrictedTables.length > 0) {
                              throw new Error(`无权限访问以下表: ${applied.restrictedTables.join(", ")}`)
                            }
                          } catch (permError: any) {
                            throw permError
                          }
                        }
                        
                        // 执行重新生成的 SQL
                        try {
                          console.log("[Chat] Executing regenerated SQL:", finalRegeneratedSQL)
                          queryResult = await SQLExecutor.executeQuery(connection as any, finalRegeneratedSQL)
                          sql = finalRegeneratedSQL
                          sql = regeneratedSQL
                          console.log("[Chat] Regenerated SQL executed successfully, rows:", queryResult?.rows?.length || 0)
                          
                          // 记录审计日志
                          await logAudit({
                            userId: user.id,
                            userName: user.email,
                            action: "query",
                            resourceType: "database",
                            resourceId: effectiveDatabaseConnectionId,
                            details: `执行重新生成的 SQL（原SQL执行失败）: ${sql.substring(0, 100)}`,
                            sql,
                            status: "success",
                            organizationId: user.organizationId,
                          })
                          
                          // 成功执行，标记为已重新生成，不抛出错误
                          errorMessage = null
                          sqlRegeneratedAfterError = true
                          // 不抛出错误，让代码继续执行
                        } catch (retryError: any) {
                          console.warn("[Chat] Regenerated SQL also failed:", retryError.message)
                          // 重新生成的SQL也失败了，记录详细错误
                          const retryErrorMsg = retryError.message || "未知错误"
                          errorMessage = `${errorMsg}\n\n⚠️ **系统已尝试自动重新生成SQL，但重新生成的SQL执行仍然失败：**\n${retryErrorMsg}\n\n**可能的原因：**\n1. 数据库结构信息不完整\n2. 重新生成的SQL仍然包含不存在的字段\n3. 数据库连接或权限问题\n\n**建议：**\n1. 检查数据库结构，确认正确的字段名\n2. 重新提问，明确指定要查询的字段\n3. 前往"数据库管理"页面查看完整的数据库架构信息`
                        }
                      } else {
                        console.warn("[Chat] Regenerated SQL schema validation failed:", reSchemaValidation.errors)
                        const validationErrors = reSchemaValidation.errors.join("; ")
                        errorMessage = `${errorMsg}\n\n⚠️ **系统已尝试自动重新生成SQL，但重新生成的SQL包含不存在的字段：**\n${validationErrors}\n\n**字段白名单：**\n${Object.entries(fieldWhitelist).map(([table, fields]) => `- **${table}**: ${fields.join(", ")}`).join("\n")}\n\n请使用上述字段白名单中的字段重新提问。`
                      }
                    } else {
                      console.warn("[Chat] Regenerated SQL validation failed:", reValidation.error)
                      errorMessage = `${errorMsg}\n\n⚠️ **系统已尝试自动重新生成SQL，但重新生成的SQL验证失败：**\n${reValidation.error}\n\n请检查数据库结构或重新提问。`
                    }
                  } else if (regenerateParsed) {
                    // 解析成功但没有sql字段
                    console.warn("[Chat] Regenerated response does not contain SQL", {
                      parsedKeys: Object.keys(regenerateParsed),
                      parsedContent: JSON.stringify(regenerateParsed).substring(0, 200),
                      messagePreview: regenerateMessage.substring(0, 500)
                    })
                    errorMessage = `${errorMsg}\n\n⚠️ **系统已尝试自动重新生成SQL，但LLM返回的响应中没有包含SQL语句。**\n\n**返回的内容：**\n${regenerateMessage.substring(0, 500)}\n\n请检查数据库结构或重新提问。`
                  } else {
                    // 无法解析JSON
                    console.warn("[Chat] Regenerated response does not contain valid JSON", {
                      messagePreview: regenerateMessage.substring(0, 500),
                      messageLength: regenerateMessage.length
                    })
                    errorMessage = `${errorMsg}\n\n⚠️ **系统已尝试自动重新生成SQL，但LLM返回的响应格式不正确。**\n\n**返回的内容：**\n${regenerateMessage.substring(0, 500)}\n\n**提示：**LLM应该返回JSON格式的响应，包含explanation、sql和reasoning字段。\n\n请检查数据库结构或重新提问。`
                  }
                } else {
                  const errorText = await regenerateResponse.text()
                  console.error("[Chat] Failed to regenerate SQL:", {
                    status: regenerateResponse.status,
                    errorText,
                    provider: llmConnection.provider,
                    model: effectiveLLMConfig.model,
                  })
                  
                  // 如果是 401 错误，提供更明确的错误信息
                  if (regenerateResponse.status === 401) {
                    errorMessage = `AI 模型 API Key 认证失败（执行错误后SQL重新生成）。请检查：\n1. API Key 是否正确\n2. API Key 是否已过期\n3. 前往"模型管理"页面检查模型配置\n\n原始错误: ${errorText}`
                  } else {
                    errorMessage = `${errorMsg}\n\n⚠️ **系统已尝试自动重新生成SQL，但LLM API调用失败（状态码：${regenerateResponse.status}）。**\n\n请检查数据库结构或重新提问。`
                  }
                }
              } catch (regenerateError: any) {
                console.error("[Chat] SQL regeneration after execution error failed:", regenerateError)
                errorMessage = `${errorMsg}\n\n⚠️ **系统已尝试自动重新生成SQL，但重新生成过程出错：**\n${regenerateError.message || "未知错误"}\n\n请检查数据库结构或重新提问。`
              }
              
              // 如果重新生成失败，确保有错误信息
              if (!errorMessage || errorMessage === errorMsg) {
                errorMessage = `${errorMsg}\n\n⚠️ **系统已尝试自动重新生成SQL，但未能成功。**\n\n请检查数据库结构或重新提问。`
              }
            } else {
              // 不是列/表不存在错误，使用原始错误信息
              errorMessage = errorMsg
            }
            
            // 只有在没有成功重新生成时才抛出错误
            // 但即使抛出错误，errorMessage已经被设置了，会在catch块中被使用
            if (!sqlRegeneratedAfterError) {
              // 确保errorMessage已经被设置（如果重新生成失败，应该已经设置了）
              if (!errorMessage || errorMessage === errorMsg) {
                errorMessage = errorMsg
              }
              throw queryError
            }
          }
        }
      }
    } catch (error: any) {
      console.error("[Chat] SQL extraction/execution error:", error)
      // 只有在errorMessage还没有被设置时才使用error.message
      // 如果重新生成失败时已经设置了详细的errorMessage，应该保留它
      if (!errorMessage) {
        errorMessage = error.message || "无法解析或执行 SQL"
      } else {
        // 如果errorMessage已经设置（比如重新生成失败时的详细错误信息），保留它
        console.log("[Chat] Keeping existing errorMessage:", errorMessage.substring(0, 100))
      }

      // 记录失败的审计日志
      await logAudit({
        userId: user.id,
        userName: user.email,
        action: "query",
        resourceType: "database",
        resourceId: databaseConnectionId,
        details: `查询失败: ${errorMessage}`,
        sql: sql || null,
        status: "failed",
        errorMessage,
        organizationId: user.organizationId,
      })
    }

    // 自动通过ID查询对应的名称信息（如果查询成功且包含ID字段）
    let enrichedQueryResult = queryResult
    let enrichedSQL = sql
    if (queryResult && !errorMessage && schema && Array.isArray(schema) && schema.length > 0) {
      try {
        const enrichment = await enrichQueryResultWithIDNames(
          queryResult,
          sql || '',
          schema as DatabaseSchema[],
          connection
        )
        if (enrichment.enhancedSQL) {
          enrichedQueryResult = enrichment.result
          enrichedSQL = enrichment.enhancedSQL
          console.log("[Chat] Query result enriched with ID names")
          
          // 发送流式更新：数据增强完成，开始处理查询结果
          if (actualSessionId && !actualSessionId.startsWith("session_")) {
            sendStreamUpdate(actualSessionId, "step_started", {
              step: "result_processing",
              message: "正在处理查询结果...",
              workProcess: [...workProcess],
            })
          }
        }
      } catch (enrichmentError: any) {
        console.warn("[Chat] Failed to enrich query result with ID names:", enrichmentError.message)
        // 如果增强失败，继续使用原始结果
      }
    }

    // 使用大模型翻译查询结果的列名为中文（如果查询成功）
    // 注意：翻译必须在数据增强之后，因为需要enrichedQueryResult
    let translatedQueryResult = enrichedQueryResult
    if (enrichedQueryResult && !errorMessage) {
      // 优先使用大模型翻译，如果没有LLM连接则使用默认翻译
      if (llmConnection || agentLLMConnection) {
        try {
          translatedQueryResult = await translateColumnNamesWithLLM(
            enrichedQueryResult,
            llmConnection || agentLLMConnection,
            enrichedQueryResult.rows?.slice(0, 3) // 传递前3行作为样本数据
          )
        } catch (translationError: any) {
          console.warn("[Chat] LLM translation failed, using default translation:", translationError.message)
          translatedQueryResult = translateColumnNames(enrichedQueryResult)
        }
      } else {
        translatedQueryResult = translateColumnNames(enrichedQueryResult)
      }
    }

    // 智能归因分析和AI报告生成：并行执行（如果都需要）
    let attributionAnalysis: any = null
    let aiReport: any = null
    
    // 检测是否需要归因分析和报告生成
    const needsAttributionAnalysis = translatedQueryResult && !errorMessage && (llmConnection || agentLLMConnection)
    const needsReportGeneration = translatedQueryResult && !errorMessage && (llmConnection || agentLLMConnection)
    
    if (needsAttributionAnalysis || needsReportGeneration) {
      // 检测归因分析需求
      let shouldDoAttribution = false
      if (needsAttributionAnalysis) {
        try {
          const hasTimeColumn = translatedQueryResult.columns.some((col: string) => 
            /时间|日期|date|time|created_at|updated_at|month|year|week/i.test(col)
          )
          const hasValueColumn = translatedQueryResult.columns.some((col: string) => 
            /数量|金额|value|count|sum|total|amount|price/i.test(col) || 
            translatedQueryResult.rows.some((row: any) => typeof row[col] === 'number')
          )
          const needsAttribution = /原因|为什么|归因|分析.*变化|变化.*原因|为什么.*变化|为什么.*下降|为什么.*上升|为什么.*减少|为什么.*增加/i.test(userQuestion || '')
          shouldDoAttribution = (hasTimeColumn && hasValueColumn) || needsAttribution
        } catch (e) {
          // 检测失败，不进行归因分析
        }
      }
      
      // 检测报告生成需求
      let shouldDoReport = false
      if (needsReportGeneration) {
        try {
          const needsReport = /报告|总结|分析报告|生成报告|详细分析|深度分析|全面分析/i.test(userQuestion || '')
          const hasSignificantData = translatedQueryResult.rows.length >= 5
          shouldDoReport = needsReport || hasSignificantData
        } catch (e) {
          // 检测失败，不生成报告
        }
      }
      
      // 并行执行归因分析和报告生成
      const analysisPromises: Promise<any>[] = []
      
      if (shouldDoAttribution) {
        console.log("[Chat] Detected attribution analysis need, starting analysis")
        workProcess.push("🔍 **执行智能归因分析**")
        
        const effectiveLLMConn = llmConnection || agentLLMConnection
        const validatedApiKey = getValidatedApiKey(effectiveLLMConn, false)
        const schemaForAttribution = Array.isArray(schema) ? schema as DatabaseSchema[] : []
        
        analysisPromises.push(
          AttributionAnalyzer.analyzeWithLLM(
            translatedQueryResult,
            effectiveLLMConn,
            validatedApiKey,
            schemaForAttribution,
            userQuestion
          ).then((result) => {
            if (result && result.insights.length > 0) {
              console.log("[Chat] Attribution analysis completed:", {
                insightsCount: result.insights.length,
                turningPointsCount: result.turningPoints.length
              })
              workProcess.push(`✅ **归因分析完成**：识别到 ${result.insights.length} 个关键洞察`)
            }
            return result
          }).catch((error: any) => {
            console.warn("[Chat] Attribution analysis failed:", error.message)
            return null
          })
        )
      }
      
      // 如果用户通过命令指定了报表类型，强制生成报表
      const shouldForceReport = commandType === 'report'
      const shouldDoReportFinal = shouldForceReport || shouldDoReport
      
      // 检测实体报告模式：xxx的报告
      let isEntityReport = false
      let entityReportData: any = null
      
      if (shouldDoReportFinal && userQuestion) {
        const entityName = EntityExtractor.extractEntityName(userQuestion)
        if (entityName) {
          console.log("[Chat] Detected entity report pattern:", { entityName, userQuestion })
          isEntityReport = true
          workProcess.push(`🔍 **检测到实体报告请求**：正在查找实体 "${entityName}"`)
          
          try {
            const schemaForEntity = Array.isArray(schema) ? schema as DatabaseSchema[] : []
            const entityType = await EntityExtractor.identifyEntityType(entityName, userQuestion, schemaForEntity)
            console.log("[Chat] Identified entity type:", { entityName, entityType })
            
            if (entityType !== 'unknown') {
              const entityInfo = await EntityExtractor.findEntityInDatabase(
                entityName,
                entityType,
                schemaForEntity,
                connection as any
              )
              
              if (entityInfo) {
                console.log("[Chat] Found entity in database:", { entityInfo })
                workProcess.push(`✅ **找到实体**：${entityInfo.tableName} - ${entityInfo.matchedField}`)
                
                // 生成实体查询
                const querySet = await EntityQueryGenerator.generateEntityQueries(
                  entityInfo,
                  schemaForEntity,
                  connection as any
                )
                
                console.log("[Chat] Generated entity queries:", {
                  hasMainQuery: !!querySet.mainEntityQuery,
                  relatedQueriesCount: querySet.relatedDataQueries.length,
                  statisticsCount: querySet.statisticsQueries.length
                })
                
                // 合并查询结果
                entityReportData = EntityQueryGenerator.mergeQueryResults(querySet)
                
                if (entityReportData && entityReportData.rows && entityReportData.rows.length > 0) {
                  workProcess.push(`📊 **已收集实体数据**：主实体信息 + ${querySet.relatedDataQueries.length} 个关联表 + ${querySet.statisticsQueries.length} 个统计查询`)
                } else {
                  workProcess.push(`⚠️ **实体数据为空**：未找到相关数据`)
                  entityReportData = null
                }
              } else {
                console.log("[Chat] Entity not found in database:", { entityName, entityType })
                workProcess.push(`❌ **未找到实体**：数据库中不存在 "${entityName}"`)
                entityReportData = null
              }
            } else {
              console.log("[Chat] Could not identify entity type:", { entityName })
              workProcess.push(`⚠️ **无法识别实体类型**：请明确指定实体类型（如"客户"、"产品"等）`)
              entityReportData = null
            }
          } catch (error: any) {
            console.error("[Chat] Error processing entity report:", error)
            workProcess.push(`❌ **实体报告处理失败**：${error.message}`)
            entityReportData = null
          }
        }
      }
      
      if (shouldDoReportFinal) {
        console.log("[Chat] Detected report generation need, starting report generation", {
          commandType,
          shouldForceReport,
          shouldDoReport,
          isEntityReport,
          hasEntityData: !!entityReportData
        })
        if (!workProcess.some(step => step.includes("步骤 3"))) {
          workProcess.push("📊 **步骤 3: 结果处理与报告**")
        }
        workProcess.push("📊 **正在生成AI分析报告...**")
        
        const effectiveLLMConn = llmConnection || agentLLMConnection
        const validatedApiKey = getValidatedApiKey(effectiveLLMConn, false)
        const schemaForReport = Array.isArray(schema) ? schema as DatabaseSchema[] : []
        
        // 使用实体数据（如果存在），否则使用原始查询结果
        const reportData = entityReportData || translatedQueryResult
        
        analysisPromises.push(
          ReportGenerator.generateReportWithLLM(
            reportData,
            effectiveLLMConn,
            validatedApiKey,
            schemaForReport,
            userQuestion,
            enrichedSQL || sql || null,
            isEntityReport // 传递是否为实体报告的标志
          ).then((result) => {
            if (result && result.sections && result.sections.length > 0) {
              console.log("[Chat] Report generation completed:", {
                sectionsCount: result.sections.length,
                keyFindingsCount: result.keyFindings?.length || 0,
                isEntityReport
              })
              workProcess.push(`✅ **报告生成完成**：包含 ${result.sections.length} 个章节，${result.keyFindings?.length || 0} 个关键发现`)
            }
            return result
          }).catch((error: any) => {
            console.warn("[Chat] Report generation failed:", error.message)
            return null
          })
        )
      }
      
      // 并行等待所有分析完成
      if (analysisPromises.length > 0) {
        const results = await Promise.all(analysisPromises)
        
        // 分配结果
        if (shouldDoAttribution && results[0] !== null) {
          attributionAnalysis = results[0]
        }
        if (shouldDoReportFinal) {
          const reportIndex = shouldDoAttribution ? 1 : 0
          if (results[reportIndex] !== null) {
            aiReport = results[reportIndex]
          }
        }
      }
    }
    

    // 检测是否需要从地址字段提取城市信息进行分析
    // 如果用户问题包含城市分析相关的关键词，且查询结果包含地址字段，则提取城市并统计
    let cityAnalysisResult: any = null
    let visualizationConfig: any = null
    
    if (translatedQueryResult && !errorMessage && userQuestion) {
      const lowerQuestion = userQuestion.toLowerCase()
      const needsCityAnalysis = 
        /城市|city|地区|region|地域|地理|分布|来自.*城市|客户.*城市|城市.*分布|城市.*统计/i.test(userQuestion) ||
        lowerQuestion.includes('city') ||
        lowerQuestion.includes('城市')
      
      if (needsCityAnalysis) {
        console.log("[Chat] Detected city analysis intent, attempting to extract cities from address field")
        
        // 尝试从查询结果中提取城市信息
        cityAnalysisResult = extractAndAnalyzeCities(translatedQueryResult)
        
        if (cityAnalysisResult && cityAnalysisResult.rows && cityAnalysisResult.rows.length > 0) {
          console.log("[Chat] Successfully extracted city information:", {
            cityCount: cityAnalysisResult.rows.length,
            totalRecords: cityAnalysisResult.rows.reduce((sum: number, row: any) => sum + (row['数量'] || 0), 0)
          })
          
          // 使用城市统计结果替换原始查询结果
          translatedQueryResult = cityAnalysisResult
          
          // 生成可视化配置（柱状图）
          visualizationConfig = {
            chart_type: "柱状图",
            chart_config: {
              chart_type: "bar",
              x_axis: "城市",
              y_axis: "数量",
              title: "客户城市分布",
              description: "从地址字段中提取的城市信息统计"
            }
          }
          
          // 更新工作过程
          workProcess.push("📍 **从地址字段提取城市信息并生成统计**")
        } else {
          console.log("[Chat] Failed to extract city information from address field")
        }
      }
    }

    // 构建响应消息 - 如果查询成功，只显示 AI 的解释，不显示额外的成功消息
    let finalMessage = assistantMessage
    
    // 如果生成了城市分析结果和可视化配置，将其添加到消息中
    if (visualizationConfig && cityAnalysisResult) {
      try {
        // 尝试解析assistantMessage中的JSON
        let messageJson: any = null
        const jsonBlockMatch = assistantMessage.match(/```json\s*([\s\S]*?)\s*```/)
        if (jsonBlockMatch) {
          try {
            messageJson = JSON.parse(jsonBlockMatch[1])
          } catch (e) {
            // 解析失败，创建新的JSON对象
          }
        } else if (assistantMessage.trim().startsWith('{') && assistantMessage.trim().endsWith('}')) {
          try {
            messageJson = JSON.parse(assistantMessage.trim())
          } catch (e) {
            // 解析失败，创建新的JSON对象
          }
        }
        
        // 如果成功解析了JSON，添加visualization字段
        if (messageJson) {
          messageJson.visualization = visualizationConfig
          finalMessage = `\`\`\`json\n${JSON.stringify(messageJson, null, 2)}\n\`\`\``
        } else {
          // 如果无法解析，创建新的JSON对象包含visualization
          const newJson = {
            explanation: assistantMessage,
            visualization: visualizationConfig
          }
          finalMessage = `\`\`\`json\n${JSON.stringify(newJson, null, 2)}\n\`\`\``
        }
      } catch (e) {
        console.error("[Chat] Failed to add visualization config to message:", e)
        // 如果添加失败，保持原消息不变
      }
    } else if (errorMessage) {
      // 如果有错误，在消息中说明，但保持简洁
      finalMessage = assistantMessage
    } else if (queryResult && sql) {
      // 查询成功时，确保visualization字段存在
      try {
        const parsedResponse = parseLLMResponse(assistantMessage)
        if (parsedResponse.hasJson && parsedResponse.json) {
          // 确保visualization字段存在，如果不存在则自动生成
          const enhancedJson = ensureVisualization(
            parsedResponse.json,
            translatedQueryResult || queryResult,
            userQuestion
          )
          
          // 如果visualization被添加或修改，更新消息
          if (enhancedJson.visualization) {
            finalMessage = `\`\`\`json\n${JSON.stringify(enhancedJson, null, 2)}\n\`\`\``
          } else {
            finalMessage = assistantMessage
          }
        } else {
          finalMessage = assistantMessage
        }
      } catch (error) {
        console.warn("[Chat] Failed to ensure visualization field:", error)
        finalMessage = assistantMessage
      }
    } else {
      finalMessage = assistantMessage
    }

    // 保存消息到会话
    if (sessionId) {
      try {
        // 查找对应的 LLM 连接
        let llmConnectionId: string | undefined = undefined
        if (llmConfig?.model && llmConfig?.provider) {
          const llmConnection = await db.lLMConnection.findFirst({
            where: {
              organizationId: user.organizationId,
              model: llmConfig.model,
              provider: llmConfig.provider,
            },
          })
          llmConnectionId = llmConnection?.id
        }

        // 先检查会话是否存在
        let session: any = null
        // actualSessionId 已在函数开头定义，这里直接使用
        actualSessionId = sessionId
        
        // 优化：在作用域开始处定义 userMessageCount，避免重复查询
        let userMessageCount: number | undefined = undefined
        
        // 如果 sessionId 是临时 ID（以 session_ 开头），检查是否已经有相同标题的会话
        // 避免重复创建相同的会话
        if (sessionId && sessionId.startsWith("session_")) {
          // 临时 ID，检查是否已经有相同标题和数据库的会话（最近创建的）
          const existingSession = await db.chatSession.findFirst({
            where: {
              organizationId: user.organizationId,
              createdBy: user.id,
              databaseConnectionId: effectiveDatabaseConnectionId,
              title: {
                contains: userQuestion.substring(0, 30), // 部分匹配标题
              },
              createdAt: {
                gte: new Date(Date.now() - 60000), // 最近1分钟内创建的
              },
            },
            orderBy: {
              createdAt: "desc",
            },
          })
          
          if (existingSession) {
            // 使用已存在的会话
            session = existingSession
            actualSessionId = existingSession.id
          } else {
            // 创建新会话，使用数据库生成的 UUID（不使用临时 ID）
            const createData: any = {
              title: userQuestion.substring(0, 50) + (userQuestion.length > 50 ? "..." : ""),
              databaseConnectionId: effectiveDatabaseConnectionId,
              organizationId: user.organizationId,
              createdBy: user.id,
            }
            if (llmConnection?.id) {
              createData.llmConnectionId = llmConnection.id
            }
            session = await db.chatSession.create({
              data: createData,
            })
            actualSessionId = session.id
          }
        } else {
          // 非临时 ID，查找现有会话
          session = await db.chatSession.findUnique({
            where: { id: sessionId },
          })
          
          if (!session) {
            // 会话不存在，创建新会话
            const createData: any = {
              id: sessionId,
              title: userQuestion.substring(0, 50) + (userQuestion.length > 50 ? "..." : ""),
              databaseConnectionId: effectiveDatabaseConnectionId,
              organizationId: user.organizationId,
              createdBy: user.id,
            }
            if (llmConnection?.id) {
              createData.llmConnectionId = llmConnection.id
            }
            session = await db.chatSession.create({
              data: {
                ...createData,
                status: "processing", // 创建会话时设置为处理中
              },
            })
            actualSessionId = session.id
            
            // 创建任务
            taskId = await createChatTask(actualSessionId, user.id, user.organizationId)
            
            // 发送流式更新：任务已创建
            sendStreamUpdate(actualSessionId, "task_created", {
              taskId,
              sessionId: actualSessionId,
            })
            
            // 发送流式更新：处理开始
            sendStreamUpdate(actualSessionId, "processing_started", {
              message: "开始处理您的请求...",
              workProcess: workProcess,
            })
          } else {
            // 如果会话已存在，检查是否需要更新标题
            // 优化：只查询一次用户消息数量，后续使用递增计数
            userMessageCount = await db.chatMessage.count({
              where: {
                sessionId: sessionId,
                role: "user",
              },
            })
            
            const updateData: any = { updatedAt: new Date() }
            
            // 如果这是第一条用户消息且标题是"新对话"，更新标题
            if (userMessageCount === 0 && session.title === "新对话" && lastUserMessage && lastUserMessage.content) {
              updateData.title = lastUserMessage.content.substring(0, 50) + (lastUserMessage.content.length > 50 ? "..." : "")
            }
            
            // 更新 llmConnectionId（如果之前没有设置）
            if (!session.llmConnectionId && llmConnection?.id) {
              updateData.llmConnectionId = llmConnection.id
            }
            
            if (Object.keys(updateData).length > 1 || updateData.title) {
              await db.chatSession.update({
                where: { id: sessionId },
                data: updateData,
              })
            }
          }
        }
        
        // 保存用户消息（最后一条用户消息）
        // 检查是否已经保存过（避免重复保存）
        // 注意：去重检查严格按sessionId隔离，不同会话允许相同内容
        let userMessageTimestamp: Date | null = null
        // 注意：userMessageCount 已在上面定义（第 5503 行），这里直接使用
        
        if (lastUserMessage && lastUserMessage.content) {
          // 获取当前时间，用于确保消息顺序
          userMessageTimestamp = new Date()
          
          // 检查消息ID是否包含sessionId，如果包含则更可靠地验证
          const messageIdContainsSession = lastUserMessage.id && lastUserMessage.id.includes(actualSessionId)
          
          // 如果消息ID包含sessionId，优先使用ID检查；否则使用内容和时间窗口检查
          let existingUserMessage = null
          if (messageIdContainsSession && lastUserMessage.id) {
            // 优先通过消息ID查找（更可靠）
            existingUserMessage = await db.chatMessage.findUnique({
              where: {
                id: lastUserMessage.id,
              },
            })
            // 如果找到的消息不属于当前会话，忽略它（可能是ID冲突）
            if (existingUserMessage && existingUserMessage.sessionId !== actualSessionId) {
              existingUserMessage = null
            }
          }
          
          // 如果通过ID没找到，使用内容和时间窗口检查（仅在同一会话内）
          if (!existingUserMessage) {
            existingUserMessage = await db.chatMessage.findFirst({
              where: {
                sessionId: actualSessionId, // 严格按sessionId过滤
                role: "user",
                content: lastUserMessage.content,
                timestamp: {
                  gte: new Date(Date.now() - 5000), // 最近5秒内（仅用于同一会话内的去重）
                },
              },
            })
          }
          
          if (!existingUserMessage) {
            // 保存用户消息的 metadata（包括 commandType、chartType、processedQuestion 等）
            const userMessageMetadata = lastUserMessage.metadata 
              ? JSON.parse(JSON.stringify(lastUserMessage.metadata))
              : null
            
            console.log('[Chat] Saving user message with metadata', {
              messageId: lastUserMessage.id,
              hasMetadata: !!lastUserMessage.metadata,
              metadata: userMessageMetadata,
              commandType: userMessageMetadata?.commandType
            })
            
            await db.chatMessage.create({
              data: {
                id: lastUserMessage.id || undefined, // 如果提供了ID，使用它
                sessionId: actualSessionId,
                role: "user",
                content: lastUserMessage.content,
                metadata: userMessageMetadata, // 保存 metadata，包括 commandType
                timestamp: userMessageTimestamp, // 显式设置时间戳
              },
            })
            
            // 优化：如果 userMessageCount 未定义，查询一次；否则递增
            if (userMessageCount === undefined) {
              userMessageCount = await db.chatMessage.count({
                where: {
                  sessionId: actualSessionId,
                  role: "user",
                },
              })
            } else {
              userMessageCount++ // 递增，避免再次查询
            }
          } else {
            // 如果用户消息已存在，检查是否需要更新 metadata
            const userMessageMetadata = lastUserMessage.metadata 
              ? JSON.parse(JSON.stringify(lastUserMessage.metadata))
              : null
            
            // 如果 metadata 有变化（特别是 commandType），更新消息
            if (userMessageMetadata && JSON.stringify(existingUserMessage.metadata) !== JSON.stringify(userMessageMetadata)) {
              console.log('[Chat] Updating user message metadata', {
                messageId: existingUserMessage.id,
                oldMetadata: existingUserMessage.metadata,
                newMetadata: userMessageMetadata
              })
              
              await db.chatMessage.update({
                where: { id: existingUserMessage.id },
                data: {
                  metadata: userMessageMetadata,
                },
              })
            }
            
            // 如果用户消息已存在，使用它的时间戳
            userMessageTimestamp = existingUserMessage.timestamp
            // 如果 userMessageCount 未定义，需要查询一次
            if (userMessageCount === undefined) {
              userMessageCount = await db.chatMessage.count({
                where: {
                  sessionId: actualSessionId,
                  role: "user",
                },
              })
            }
          }
        }
        
        // 保存助手消息
        // 确保助手消息的时间戳晚于用户消息（至少晚1毫秒）
        // 如果用户消息时间戳存在，基于它计算；否则使用当前时间
        const assistantMessageTimestamp = userMessageTimestamp 
          ? new Date(userMessageTimestamp.getTime() + 1)
          : new Date(Date.now() + 1)
        
        await db.chatMessage.create({
          data: {
            sessionId: actualSessionId,
            role: "assistant",
            content: finalMessage,
            metadata: queryResult || schemaQueryResult || workProcess.length > 0
              ? JSON.parse(JSON.stringify({
                  sql,
                  queryResult,
                  firstQueryResult: schemaQueryResult || null,
                  firstQuerySQL: schemaSQL || null,
                  error: errorMessage || null,
                  workProcess: workProcess.length > 0 ? workProcess : undefined, // 保存工作过程
                }))
              : workProcess.length > 0
              ? JSON.parse(JSON.stringify({
                  workProcess: workProcess,
                }))
              : null,
            timestamp: assistantMessageTimestamp, // 显式设置时间戳，确保晚于用户消息
          },
        })
        
        // 优化：合并会话更新操作，避免多次更新
        // 更新会话的 updatedAt、状态和标题（如果需要）
        const sessionUpdateData: any = { 
          updatedAt: new Date(),
          status: "idle", // 消息保存完成，状态设为 idle
        }
        
        // 如果这是第一条用户消息且会话标题是"新对话"，更新标题
        if (session && session.title === "新对话" && lastUserMessage && lastUserMessage.content) {
          // userMessageCount 现在应该是创建消息后的数量
          if (userMessageCount === 1) {
            sessionUpdateData.title = lastUserMessage.content.substring(0, 50) + (lastUserMessage.content.length > 50 ? "..." : "")
          }
        }
        
        await db.chatSession.update({
          where: { id: actualSessionId },
          data: sessionUpdateData,
        })
      } catch (error) {
        console.error("[Chat] Failed to save message:", error)
        // 不抛出错误，继续执行
      }
    }

    // 获取实际使用的 sessionId（如果是临时 ID，返回创建的会话的真实 ID）
    let returnedSessionId = sessionId
    if (sessionId && sessionId.startsWith("session_")) {
      // 查找刚才创建或使用的会话
      const session = await db.chatSession.findFirst({
        where: {
          organizationId: user.organizationId,
          createdBy: user.id,
          databaseConnectionId: effectiveDatabaseConnectionId,
          createdAt: {
            gte: new Date(Date.now() - 10000), // 最近10秒内创建的
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      })
      if (session) {
        returnedSessionId = session.id
      }
    }

    // 已删除：第三层安全防护（结果中的敏感字段过滤限制）
    let filteredQueryResult = translatedQueryResult
    let filteredSchemaQueryResult = schemaQueryResult
    
    // 使用大模型翻译第一次查询结果的列名
    if (schemaQueryResult && (llmConnection || agentLLMConnection)) {
      try {
        filteredSchemaQueryResult = await translateColumnNamesWithLLM(
          schemaQueryResult,
          llmConnection || agentLLMConnection,
          schemaQueryResult.rows?.slice(0, 3) // 传递前3行作为样本数据
        )
      } catch (translationError: any) {
        console.warn("[Chat] LLM translation for schema query result failed, using default translation:", translationError.message)
        filteredSchemaQueryResult = translateColumnNames(schemaQueryResult)
      }
    } else if (schemaQueryResult) {
      filteredSchemaQueryResult = translateColumnNames(schemaQueryResult)
    }

    const result = {
      message: finalMessage,
      queryResult: filteredQueryResult, // 第二次查询的结果（实际数据，列名已翻译，已过滤敏感字段，已通过ID查询名称）
      firstQueryResult: filteredSchemaQueryResult || null, // 第一次查询的结果（数据结构，已过滤敏感字段）
      firstQuerySQL: schemaSQL || null, // 第一次查询的SQL
      sql: enrichedSQL || sql, // 最终执行的SQL（如果进行了ID增强，则使用增强后的SQL）
      error: errorMessage || null,
      workProcess: workProcess.length > 0 ? workProcess : undefined, // 工作过程
      sessionId: returnedSessionId, // 返回实际使用的会话ID，让前端更新
      attributionAnalysis: attributionAnalysis || null, // 智能归因分析结果
      aiReport: aiReport || null, // AI总结报告
    }

    // 发送流式更新：最终结果准备完成
    if (actualSessionId && !actualSessionId.startsWith("session_")) {
      sendStreamUpdate(actualSessionId, "final_result_ready", {
        message: "处理完成，结果已准备就绪",
        workProcess: [...workProcess],
        hasQueryResult: !!filteredQueryResult,
        hasFirstQueryResult: !!filteredSchemaQueryResult,
      })
    }
    
    // 性能监控：记录总耗时并输出性能报告
    const totalTime = Date.now() - performanceStartTime
    performanceLog.total = totalTime
    const totalSeconds = (totalTime / 1000).toFixed(2)
    console.log("[Performance] ========== Chat API Performance Report ==========")
    console.log(`[Performance] Total time: ${totalTime}ms (${totalSeconds}s)`)
    Object.entries(performanceLog).forEach(([key, value]) => {
      if (key !== 'total') {
        const percentage = ((value / totalTime) * 100).toFixed(1)
        console.log(`[Performance] ${key}: ${value}ms (${percentage}%)`)
      }
    })
    console.log("[Performance] =================================================")
    
    // 如果总时间超过警告阈值，记录警告
    const WARNING_THRESHOLD = 60000 // 60秒
    const CRITICAL_THRESHOLD = 240000 // 240秒（4分钟）
    
    if (totalTime >= CRITICAL_THRESHOLD) {
      console.warn(`[Performance] ⚠️ CRITICAL: Total execution time (${totalSeconds}s) exceeds critical threshold (${CRITICAL_THRESHOLD / 1000}s)`)
    } else if (totalTime >= WARNING_THRESHOLD) {
      console.warn(`[Performance] ⚠️ WARNING: Total execution time (${totalSeconds}s) exceeds warning threshold (${WARNING_THRESHOLD / 1000}s)`)
    }
    
    // 更新任务状态为完成
    if (taskId) {
      await updateTaskStatus(taskId, "completed", result)
      
      // 发送流式更新：任务完成
      sendStreamUpdate(actualSessionId || returnedSessionId, "task_completed", {
        taskId,
        result,
      })
    }

    return NextResponse.json({
      ...result,
      taskId, // 返回任务ID，前端可以用它来追踪任务状态
      performance: performanceLog, // 返回性能数据（可选，用于调试）
    })
  } catch (error: any) {
    console.error("[Chat] API error:", error)
    
    // 检查是否是超时错误
    const isTimeoutError = 
      error.message?.includes("timeout") ||
      error.message?.includes("超时") ||
      error.message?.includes("AbortError") ||
      error.name === "AbortError" ||
      error.code === "ECONNABORTED" ||
      error.message?.includes("执行时间接近API超时限制")
    
    // 检查是否是Next.js路由超时
    const isRouteTimeout = 
      error.message?.includes("maxDuration") ||
      error.message?.includes("Function execution exceeded")
    
    // 检查是否是网络连接错误
    const isNetworkError = 
      error.message?.includes("fetch failed") ||
      error.message?.includes("无法连接") ||
      error.message?.includes("网络") ||
      error.cause?.code === "ENOTFOUND" ||
      error.cause?.code === "ECONNREFUSED" ||
      error.cause?.code === "ETIMEDOUT" ||
      error.code === "ENOTFOUND" ||
      error.code === "ECONNREFUSED" ||
      error.code === "ETIMEDOUT" ||
      error.name === "TypeError"
    
    let errorMessage = error.message || "处理请求失败"
    let statusCode = 500
    let userFriendlyMessage = `抱歉，处理您的请求时遇到错误: ${errorMessage}`
    
    if (isTimeoutError || isRouteTimeout) {
      statusCode = 408 // Request Timeout
      userFriendlyMessage = `⏱️ **请求处理超时**\n\n处理您的请求超过了时间限制（5分钟）。\n\n**可能的原因：**\n1. 查询过于复杂，需要多次迭代\n2. LLM响应较慢（特别是使用Ollama时）\n3. 数据库查询耗时较长\n\n**建议：**\n1. 尝试简化查询问题\n2. 如果使用Ollama，考虑使用更快的模型\n3. 检查数据库连接和查询性能\n4. 稍后重试`
      errorMessage = "请求处理超时（超过5分钟）"
      
      console.warn("[Chat] Request timeout:", {
        taskId,
        sessionId: actualSessionId,
        error: error.message,
        errorName: error.name,
        errorCode: error.code,
      })
    } else if (isNetworkError) {
      // 网络连接错误，提供详细的诊断信息
      const errorCode = error.cause?.code || error.code
      const errorSyscall = error.cause?.syscall || error.syscall
      const originalMessage = error.cause?.message || error.message || "网络连接失败"
      
      let diagnosticInfo = ""
      if (errorCode) {
        diagnosticInfo += `\n错误代码: ${errorCode}`
      }
      if (errorSyscall) {
        diagnosticInfo += `\n系统调用: ${errorSyscall}`
      }
      
      if (errorCode === "ENOTFOUND" || originalMessage.includes("getaddrinfo")) {
        userFriendlyMessage = `❌ **DNS 解析失败**\n\n无法解析 API 服务地址。${diagnosticInfo}\n\n**可能的原因：**\n1. API 地址配置错误\n2. 网络无法访问该域名\n3. DNS 服务器问题\n\n**解决方案：**\n1. 检查 AI 模型 API 配置（前往"模型管理"页面）\n2. 确认 baseUrl 配置正确\n3. 检查网络连接和 DNS 设置`
        errorMessage = `DNS 解析失败: ${originalMessage}`
      } else if (errorCode === "ECONNREFUSED") {
        userFriendlyMessage = `❌ **连接被拒绝**\n\n无法连接到 API 服务。${diagnosticInfo}\n\n**可能的原因：**\n1. API 服务未运行\n2. 端口配置错误\n3. 防火墙阻止连接\n\n**解决方案：**\n1. 检查 AI 模型 API 配置（前往"模型管理"页面）\n2. 确认服务正在运行\n3. 检查防火墙设置`
        errorMessage = `连接被拒绝: ${originalMessage}`
      } else if (errorCode === "ETIMEDOUT" || originalMessage.includes("timeout")) {
        userFriendlyMessage = `❌ **连接超时**\n\n连接 API 服务超时。${diagnosticInfo}\n\n**可能的原因：**\n1. 网络连接速度慢\n2. API 服务响应慢\n3. 防火墙或代理延迟\n\n**解决方案：**\n1. 检查网络连接\n2. 确认 API 服务正常运行\n3. 检查防火墙和代理设置`
        errorMessage = `连接超时: ${originalMessage}`
      } else {
        userFriendlyMessage = `❌ **网络连接失败**\n\n无法连接到 AI 服务。${diagnosticInfo}\n\n错误信息: ${originalMessage}\n\n**请检查：**\n1. 网络连接是否正常\n2. AI 模型 API 配置是否正确（前往"模型管理"页面）\n3. API Key 是否有效\n4. API 服务是否可访问`
        errorMessage = `网络连接失败: ${originalMessage}`
      }
      
      statusCode = 503 // Service Unavailable
      
      console.warn("[Chat] Network error:", {
        taskId,
        sessionId: actualSessionId,
        error: error.message,
        errorName: error.name,
        errorCode: error.code,
        cause: error.cause,
      })
    }
    
    // 更新任务状态为错误
    if (taskId && actualSessionId) {
      await updateTaskStatus(taskId, "error", undefined, errorMessage)
      
      // 发送流式更新：任务错误
      sendStreamUpdate(actualSessionId, "task_error", {
        taskId,
        error: errorMessage,
        userFriendlyMessage,
      })
    }
    
    return NextResponse.json(
      {
        error: errorMessage,
        message: userFriendlyMessage,
        taskId,
        timeout: isTimeoutError || isRouteTimeout,
      },
      { status: statusCode }
    )
  }
}

export const POST = requireAuth(handlePOST)
