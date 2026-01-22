/**
 * 安全过滤工具模块
 * 用于检测和过滤敏感字段（密码、密钥等）
 */

/**
 * 敏感字段名列表（大小写不敏感）
 */
const SENSITIVE_FIELD_PATTERNS = [
  // 英文密码字段
  /password/i,
  /pwd/i,
  /passwd/i,
  /pass/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /apikey/i,
  /auth[_-]?token/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /credential/i,
  /private[_-]?key/i,
  /privatekey/i,
  
  // 中文密码字段
  /密码/i,
  /口令/i,
  /密钥/i,
  /私钥/i,
  /凭证/i,
]

/**
 * 检测字段名是否为敏感字段
 */
export function isSensitiveField(fieldName: string): boolean {
  if (!fieldName || typeof fieldName !== 'string') {
    return false
  }
  
  return SENSITIVE_FIELD_PATTERNS.some(pattern => pattern.test(fieldName))
}

/**
 * 检测用户输入是否包含密码查询意图
 */
export function detectPasswordQueryIntent(userInput: string): boolean {
  if (!userInput || typeof userInput !== 'string') {
    return false
  }
  
  const lowerInput = userInput.toLowerCase()
  
  // 检测密码相关关键词
  const passwordKeywords = [
    'password', 'pwd', 'passwd', 'pass', 'secret', 'token',
    '密码', '口令', '密钥', '私钥', '凭证'
  ]
  
  // 检测查询意图关键词
  const queryIntentKeywords = [
    '输出', '显示', '查询', '查看', '列出', '获取', '返回',
    'output', 'show', 'display', 'list', 'get', 'return', 'query', 'select'
  ]
  
  // 检查是否同时包含密码关键词和查询意图
  const hasPasswordKeyword = passwordKeywords.some(keyword => 
    lowerInput.includes(keyword.toLowerCase())
  )
  
  const hasQueryIntent = queryIntentKeywords.some(keyword =>
    lowerInput.includes(keyword.toLowerCase())
  )
  
  // 如果包含密码关键词，且上下文表明是查询意图，则认为是密码查询
  if (hasPasswordKeyword && hasQueryIntent) {
    return true
  }
  
  // 检查明确的密码查询模式
  const explicitPatterns = [
    /(?:输出|显示|查询|查看|列出|获取|返回).*?(?:密码|password|pwd|口令)/i,
    /(?:密码|password|pwd|口令).*?(?:输出|显示|查询|查看|列出|获取|返回)/i,
    /(?:用户名|username).*?(?:密码|password|pwd)/i,
    /(?:密码|password|pwd).*?(?:用户名|username)/i,
  ]
  
  return explicitPatterns.some(pattern => pattern.test(userInput))
}

/**
 * 检测SQL语句是否包含敏感字段
 */
export function detectSensitiveFieldsInSQL(sql: string): {
  hasSensitiveFields: boolean
  sensitiveFields: string[]
} {
  if (!sql || typeof sql !== 'string') {
    return { hasSensitiveFields: false, sensitiveFields: [] }
  }
  
  const sensitiveFields: string[] = []
  const upperSql = sql.toUpperCase()
  
  // 只检查SELECT查询
  if (!upperSql.trim().startsWith('SELECT')) {
    return { hasSensitiveFields: false, sensitiveFields: [] }
  }
  
  // 提取SELECT子句中的字段
  const selectMatch = sql.match(/SELECT\s+(?:DISTINCT\s+)?(.+?)\s+FROM/i)
  if (selectMatch) {
    const selectClause = selectMatch[1]
    
    // 处理SELECT *的情况
    if (selectClause.trim() === '*') {
      // SELECT * 需要特别处理，因为可能包含所有字段
      // 这种情况下，我们会在结果过滤阶段处理
      // 但为了安全，我们仍然标记为可能包含敏感字段
      return { hasSensitiveFields: true, sensitiveFields: ['* (可能包含敏感字段)'] }
    }
    
    // 解析字段列表
    const fields = parseFieldList(selectClause)
    
    fields.forEach(field => {
      // 提取实际字段名（去除表前缀、别名等）
      const actualField = extractActualFieldName(field)
      if (actualField && isSensitiveField(actualField)) {
        if (!sensitiveFields.includes(actualField)) {
          sensitiveFields.push(actualField)
        }
      }
    })
  }
  
  // 检查WHERE子句中的字段引用（虽然WHERE子句通常不直接输出，但为了安全也检查）
  const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+(?:GROUP|ORDER|HAVING|LIMIT)\s+|$)/i)
  if (whereMatch) {
    const whereClause = whereMatch[1]
    const whereFields = extractFieldsFromExpression(whereClause)
    
    whereFields.forEach(field => {
      const actualField = extractActualFieldName(field)
      if (actualField && isSensitiveField(actualField)) {
        if (!sensitiveFields.includes(actualField)) {
          sensitiveFields.push(actualField)
        }
      }
    })
  }
  
  return {
    hasSensitiveFields: sensitiveFields.length > 0,
    sensitiveFields,
  }
}

/**
 * 解析字段列表（处理逗号分隔）
 */
function parseFieldList(clause: string): string[] {
  const fields: string[] = []
  let current = ''
  let depth = 0
  let inString = false
  let stringChar = ''
  
  for (let i = 0; i < clause.length; i++) {
    const char = clause[i]
    
    // 处理字符串常量
    if ((char === "'" || char === '"') && (i === 0 || clause[i - 1] !== '\\')) {
      if (!inString) {
        inString = true
        stringChar = char
      } else if (char === stringChar) {
        inString = false
        stringChar = ''
      }
      current += char
      continue
    }
    
    if (inString) {
      current += char
      continue
    }
    
    // 处理括号深度
    if (char === '(') {
      depth++
      current += char
    } else if (char === ')') {
      depth--
      current += char
    } else if (char === ',' && depth === 0) {
      if (current.trim()) {
        fields.push(current.trim())
      }
      current = ''
    } else {
      current += char
    }
  }
  
  if (current.trim()) {
    fields.push(current.trim())
  }
  
  return fields
}

/**
 * 从表达式中提取字段名
 */
function extractFieldsFromExpression(expression: string): string[] {
  const fields: string[] = []
  
  // 匹配 表名.字段名 或 字段名
  const fieldPattern = /(?:^|\s)(?:(\w+)\.)?(\w+)(?=\s*(?:=|!=|<>|<|>|<=|>=|LIKE|IN|IS|NOT|AND|OR|$))/gi
  let match
  
  while ((match = fieldPattern.exec(expression)) !== null) {
    const table = match[1]
    const field = match[2]
    if (field && field !== '*' && !/^\d+$/.test(field)) {
      if (table) {
        fields.push(`${table}.${field}`)
      } else {
        fields.push(field)
      }
    }
  }
  
  return fields
}

/**
 * 提取实际字段名（去除表前缀、别名、引号等）
 */
function extractActualFieldName(fieldExpr: string): string | null {
  if (!fieldExpr) return null
  
  // 移除引号和反引号
  let cleaned = fieldExpr.replace(/[`'"]/g, '').trim()
  
  // 处理表前缀（table.column）
  if (cleaned.includes('.')) {
    const parts = cleaned.split('.')
    cleaned = parts[parts.length - 1].trim()
  }
  
  // 处理AS别名（column AS alias）
  const asMatch = cleaned.match(/^(.+?)\s+AS\s+/i)
  if (asMatch) {
    cleaned = asMatch[1].trim()
  }
  
  // 处理函数调用（COUNT(column) -> column）
  const funcMatch = cleaned.match(/^\w+\s*\(\s*([^)]+)\s*\)/i)
  if (funcMatch) {
    cleaned = funcMatch[1].trim()
    // 如果函数参数中还有表前缀，再次处理
    if (cleaned.includes('.')) {
      const parts = cleaned.split('.')
      cleaned = parts[parts.length - 1].trim()
    }
  }
  
  // 移除可能的排序关键字
  cleaned = cleaned.replace(/\s+(ASC|DESC)$/i, '').trim()
  
  return cleaned || null
}

/**
 * 过滤查询结果中的敏感字段
 */
export function filterSensitiveFieldsFromResult(queryResult: any): any {
  if (!queryResult) {
    return queryResult
  }
  
  // 处理标准查询结果格式
  if (queryResult.columns && Array.isArray(queryResult.columns)) {
    const filteredColumns: string[] = []
    const sensitiveColumnIndices = new Set<number>()
    
    // 找出敏感字段的索引
    queryResult.columns.forEach((col: string, index: number) => {
      if (isSensitiveField(col)) {
        sensitiveColumnIndices.add(index)
      } else {
        filteredColumns.push(col)
      }
    })
    
    // 过滤行数据
    let filteredRows: any[] = []
    if (queryResult.rows && Array.isArray(queryResult.rows)) {
      filteredRows = queryResult.rows.map((row: any) => {
        if (Array.isArray(row)) {
          // 如果是数组格式的行
          return row.filter((_, index) => !sensitiveColumnIndices.has(index))
        } else if (typeof row === 'object') {
          // 如果是对象格式的行
          const filteredRow: any = {}
          Object.keys(row).forEach(key => {
            if (!isSensitiveField(key)) {
              filteredRow[key] = row[key]
            }
          })
          return filteredRow
        }
        return row
      })
    }
    
    return {
      ...queryResult,
      columns: filteredColumns,
      rows: filteredRows,
      rowCount: filteredRows.length,
    }
  }
  
  // 如果结果格式不标准，尝试递归处理对象
  if (typeof queryResult === 'object' && !Array.isArray(queryResult)) {
    const filtered: any = {}
    Object.keys(queryResult).forEach(key => {
      if (isSensitiveField(key)) {
        // 跳过敏感字段
        return
      }
      
      if (typeof queryResult[key] === 'object' && queryResult[key] !== null) {
        // 递归处理嵌套对象
        filtered[key] = filterSensitiveFieldsFromResult(queryResult[key])
      } else {
        filtered[key] = queryResult[key]
      }
    })
    return filtered
  }
  
  return queryResult
}

/**
 * 生成拒绝密码查询的消息
 */
export function getPasswordQueryRejectionMessage(): string {
  return `🚫 **安全限制：禁止查询密码字段**

根据系统安全策略，禁止查询和输出以下敏感字段信息：
- password（密码）
- pwd（密码）
- PWD（密码）
- 以及其他所有密码相关字段

这些信息属于敏感数据，不允许进行查询和展示。如果您需要其他数据，请重新提问。`
}
