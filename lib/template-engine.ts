/**
 * 模板引擎
 * 用于替换智能体系统消息中的模板变量
 */

export interface TemplateContext {
  userInput?: string
  databaseSchema?: any
  databaseName?: string
  databaseType?: string
  [key: string]: any
}

/**
 * 替换模板变量
 * 支持 {{variableName}} 格式的变量
 */
export function replaceTemplateVariables(
  template: string,
  context: TemplateContext
): string {
  let result = template

  // 替换所有 {{variableName}} 格式的变量
  const variableRegex = /\{\{(\w+)\}\}/g
  result = result.replace(variableRegex, (match, variableName) => {
    const value = context[variableName]
    if (value === undefined || value === null) {
      // 如果变量未定义，保留原样或返回空字符串
      console.warn(`[TemplateEngine] Variable ${variableName} is not defined`)
      return match
    }

    // 如果是对象或数组，对于 databaseSchema 使用格式化函数，其他转换为 JSON
    if (typeof value === "object") {
      if (variableName === "databaseSchema") {
        // databaseSchema 已经在调用时格式化了，直接返回字符串
        return String(value)
      }
      return JSON.stringify(value, null, 2)
    }

    return String(value)
  })

  return result
}

/**
 * 格式化数据库结构为易读的文本格式
 */
export function formatDatabaseSchema(schema: any): string {
  if (!schema) {
    return "数据库结构信息未提供，请谨慎生成查询。"
  }

  if (Array.isArray(schema)) {
    // 如果是表数组格式
    if (schema.length === 0) {
      return "数据库中没有表"
    }

    let result = "数据库包含以下表：\n\n"
    result += schema
      .map((table: any, index: number) => {
        if (typeof table === "string") {
          return `${index + 1}. 表名: ${table}`
        }

        const tableName = table.tableName || table.name || "未知表"
        const columns = table.columns || []

        let tableInfo = `${index + 1}. 表名: ${tableName}\n`
        if (columns.length > 0) {
          tableInfo += "   列信息:\n"
          columns.forEach((col: any) => {
            const colName = col.name || col.columnName || col.COLUMN_NAME || "未知列"
            const colType = col.type || col.dataType || col.DATA_TYPE || "未知类型"
            const nullable = col.nullable !== false && col.IS_NULLABLE !== "NO" ? "可空" : "非空"
            const isPrimaryKey = col.isPrimaryKey || col.COLUMN_KEY === "PRI" ? " [主键]" : ""
            const comment = col.description || col.COLUMN_COMMENT || ""
            const commentText = comment ? ` - ${comment}` : ""
            tableInfo += `     - ${colName}: ${colType} (${nullable})${isPrimaryKey}${commentText}\n`
          })
        } else {
          tableInfo += "   (无列信息)\n"
        }
        return tableInfo
      })
      .join("\n\n")
    
    return result
  }

  // 如果是对象格式，检查是否有 tables 或 schemas 字段
  if (typeof schema === "object") {
    if (schema.tables && Array.isArray(schema.tables)) {
      return formatDatabaseSchema(schema.tables)
    }
    if (schema.schemas && Array.isArray(schema.schemas)) {
      return formatDatabaseSchema(schema.schemas)
    }
    // 如果是普通对象，转换为 JSON
    return JSON.stringify(schema, null, 2)
  }

  // 其他情况，转换为字符串
  return String(schema)
}
