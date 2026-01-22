/**
 * SQL 安全验证器
 * 确保只能执行 SELECT 查询，禁止所有增删改操作
 */

import { DatabaseSchema, ColumnInfo } from "./types"
// 已删除：密码查询限制相关的导入
// import { detectSensitiveFieldsInSQL } from "./security-filter"

export class SQLValidator {
  // 禁止的关键字（增删改操作）
  private static readonly FORBIDDEN_KEYWORDS = [
    "INSERT",
    "UPDATE",
    "DELETE",
    "DROP",
    "ALTER",
    "CREATE",
    "TRUNCATE",
    "REPLACE",
    "MERGE",
    "EXEC",
    "EXECUTE",
    "CALL",
    "GRANT",
    "REVOKE",
    "COMMIT",
    "ROLLBACK",
    "SAVEPOINT",
  ]

  // 允许的关键字（只读操作）
  private static readonly ALLOWED_KEYWORDS = ["SELECT", "SHOW", "DESCRIBE", "DESC", "EXPLAIN"]

  /**
   * 验证 SQL 是否安全
   * @param sql SQL 语句
   * @param allowAllOperations 如果为 true，允许所有操作（用于配置的工具）
   */
  static validate(sql: string, allowAllOperations: boolean = false): { valid: boolean; error?: string } {
    if (!sql || typeof sql !== "string") {
      return { valid: false, error: "SQL 查询不能为空" }
    }

    // 移除注释和多余空白
    const cleanedSql = this.cleanSQL(sql)

    // 检查是否有分号分隔的多个语句（防止 SQL 注入）
    const statements = cleanedSql.split(";").filter((s) => s.trim().length > 0)
    if (statements.length > 1) {
      return {
        valid: false,
        error: "不允许执行多个 SQL 语句。请一次只执行一个查询。",
      }
    }

    // 如果允许所有操作（来自配置的工具），只做基本安全检查
    if (allowAllOperations) {
      // 仍然禁止一些危险操作
      const dangerousKeywords = ["DROP", "TRUNCATE", "ALTER", "CREATE", "GRANT", "REVOKE"]
      const upperSql = cleanedSql.toUpperCase().trim()
      for (const keyword of dangerousKeywords) {
        const regex = new RegExp(`\\b${keyword}\\b`, "i")
        if (regex.test(cleanedSql)) {
          // 允许这些操作，但记录警告
          console.warn(`[SQLValidator] 执行危险操作: ${keyword}`)
        }
      }
      // 注意：当 allowAllOperations 为 true 时，允许 information_schema 查询
      // 因为这是用户配置的工具（如获取数据库结构的工具），应该允许执行
      return { valid: true }
    }

    // 默认只允许 SELECT 查询
    const upperSql = cleanedSql.toUpperCase().trim()

    // 检查是否以允许的关键字开头
    const startsWithAllowed = this.ALLOWED_KEYWORDS.some((keyword) => upperSql.startsWith(keyword))

    if (!startsWithAllowed) {
      return {
        valid: false,
        error: `只允许执行 SELECT、SHOW、DESCRIBE 或 EXPLAIN 查询。检测到: ${cleanedSql.substring(0, 50)}...`,
      }
    }

    // 检查是否包含禁止的关键字
    for (const keyword of this.FORBIDDEN_KEYWORDS) {
      // 使用单词边界匹配，避免误判（如 SELECT 中包含 "ELECT"）
      const regex = new RegExp(`\\b${keyword}\\b`, "i")
      if (regex.test(cleanedSql)) {
        return {
          valid: false,
          error: `检测到禁止的操作: ${keyword}。只允许执行 SELECT 查询。`,
        }
      }
    }

    // 已删除：第二层安全防护（SQL中的敏感字段检测限制）

    // 允许查询表结构（information_schema、SHOW、DESCRIBE 等）
    // 系统可以根据需要自由查询表结构信息

    return { valid: true }
  }

  /**
   * 清理 SQL：移除注释和多余空白
   */
  private static cleanSQL(sql: string): string {
    // 移除单行注释
    let cleaned = sql.replace(/--.*$/gm, "")
    // 移除多行注释
    cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, "")
    // 规范化空白
    cleaned = cleaned.replace(/\s+/g, " ").trim()
    return cleaned
  }

  /**
   * 检查 SQL 是否只包含 SELECT 查询
   */
  static isSelectOnly(sql: string): boolean {
    const result = this.validate(sql)
    return result.valid && sql.toUpperCase().trim().startsWith("SELECT")
  }

  /**
   * 验证 SQL 中的表和字段是否存在于数据库 schema 中
   * @param sql SQL 语句
   * @param schema 数据库 schema 信息
   * @param allowAllOperations 如果为 true，允许所有操作（用于配置的工具，包括 information_schema 查询）
   * @returns 验证结果，包含无效的表和字段列表
   */
  static validateSchema(
    sql: string,
    schema: DatabaseSchema[],
    allowAllOperations: boolean = false
  ): { valid: boolean; errors: string[]; invalidTables: string[]; invalidColumns: Array<{ table: string; column: string }> } {
    const errors: string[] = []
    const invalidTables: string[] = []
    const invalidColumns: Array<{ table: string; column: string }> = []

    if (!sql || typeof sql !== "string") {
      return { valid: false, errors: ["SQL 查询不能为空"], invalidTables: [], invalidColumns: [] }
    }

    // 允许查询表结构（information_schema、SHOW、DESCRIBE 等）
    // 系统可以根据需要自由查询表结构信息
    const cleanedSql = this.cleanSQL(sql)
    const upperSql = cleanedSql.toUpperCase().trim()

    if (!schema || !Array.isArray(schema) || schema.length === 0) {
      // 如果没有 schema 信息，跳过验证（向后兼容）
      console.warn("[SQLValidator] No schema provided for validation, skipping schema validation")
      return { valid: true, errors: [], invalidTables: [], invalidColumns: [] }
    }

    // 只验证 SELECT 查询
    if (!upperSql.startsWith("SELECT")) {
      // 非 SELECT 查询跳过字段验证（由其他验证处理）
      return { valid: true, errors: [], invalidTables: [], invalidColumns: [] }
    }

    // 构建表名和字段名的映射
    const schemaMap = new Map<string, Set<string>>()
    schema.forEach((table) => {
      const tableName = table.tableName || ""
      const columns = new Set<string>()
      if (table.columns && Array.isArray(table.columns)) {
        table.columns.forEach((col: ColumnInfo | any) => {
          const colName = col.name || col.columnName || col.COLUMN_NAME || ""
          if (colName) {
            // 同时存储原始大小写和全小写版本（用于大小写不敏感匹配）
            columns.add(colName)
            columns.add(colName.toLowerCase())
            columns.add(colName.toUpperCase())
          }
        })
      }
      // 同时存储原始大小写和全小写版本的表名
      schemaMap.set(tableName, columns)
      schemaMap.set(tableName.toLowerCase(), columns)
      schemaMap.set(tableName.toUpperCase(), columns)
    })

    // 拆分 UNION 语句，对每个 SELECT 子句分别验证
    const selectStatements = this.splitUnionStatements(cleanedSql)
    
    for (const selectSql of selectStatements) {
      // 为当前 SELECT 语句提取表名
      const tableNames = this.extractTableNames(selectSql)
      
      // 验证表名
      for (const tableName of tableNames) {
        const normalizedTableName = tableName.toLowerCase()
        const tableExists = schemaMap.has(normalizedTableName) || 
                           schemaMap.has(tableName) || 
                           schemaMap.has(tableName.toUpperCase())
        
        if (!tableExists) {
          // 检查是否是别名（在 AS 或空格后的别名）
          const isAlias = this.isTableAlias(selectSql, tableName)
          if (!isAlias && !invalidTables.includes(tableName)) {
            invalidTables.push(tableName)
            errors.push(`表 "${tableName}" 不存在于数据库 schema 中`)
          }
        }
      }

      // 提取字段名（SELECT, WHERE, ORDER BY, GROUP BY, HAVING 子句）
      // 注意：extractColumnReferences 已经处理了 UNION，这里传入整个 SQL 用于 ORDER BY 等全局子句
      const { references: columnReferences, aliases: selectAliases, lastSelectAliases } = this.extractColumnReferences(cleanedSql, tableNames)
      
      // 对于 ORDER BY，只使用最后一个 SELECT 的别名
      // 对于其他子句（HAVING），可以使用当前 SELECT 的别名
      // 这里我们使用 selectAliases（所有别名）进行验证，但在 ORDER BY 验证时会特殊处理

      // 验证字段名
      // 需要判断字段引用来自哪个子句，以便正确使用别名
      // 简单方法：ORDER BY 的字段通常在 references 的后面
      // 更准确的方法：在 extractColumnReferences 中标记字段来源
      // 为了简化，我们检查字段是否在 ORDER BY 中，如果是，只使用最后一个 SELECT 的别名
      const orderByFields = new Set<string>()
      const orderByMatch = cleanedSql.match(/ORDER\s+BY\s+(.+?)(?:\s+(?:GROUP|HAVING|LIMIT)\s+|$)/i)
      if (orderByMatch) {
        const orderByClause = orderByMatch[1]
        const orderColumns = this.parseColumnList(orderByClause)
        orderColumns.forEach((col) => {
          const extracted = this.extractActualColumnName(col)
          if (extracted.column) {
            orderByFields.add(extracted.column.toLowerCase())
            orderByFields.add(extracted.column)
            orderByFields.add(extracted.column.toUpperCase())
          }
        })
      }
      
      for (const colRef of columnReferences) {
        const { table, column } = colRef
        
        // extractActualColumnName 已经过滤了字面量，这里只需要验证实际列名
        if (!column) {
          continue
        }
        
        // 判断这个字段是否来自 ORDER BY
        const isFromOrderBy = orderByFields.has(column) || orderByFields.has(column.toLowerCase()) || orderByFields.has(column.toUpperCase())

        // 查找对应的表
        let targetTable: string | null = null
        if (table) {
          // 有表前缀的字段
          const normalizedTable = table.toLowerCase()
          if (schemaMap.has(normalizedTable) || schemaMap.has(table) || schemaMap.has(table.toUpperCase())) {
            targetTable = table
          } else {
            // 可能是别名，尝试查找
            const aliasTable = this.findTableByAlias(selectSql, table)
            if (aliasTable && (schemaMap.has(aliasTable.toLowerCase()) || schemaMap.has(aliasTable) || schemaMap.has(aliasTable.toUpperCase()))) {
              targetTable = aliasTable
            }
          }
        } else {
          // 没有表前缀的字段，需要从 FROM/JOIN 中推断
          if (tableNames.length === 1) {
            targetTable = tableNames[0]
          } else {
            // 多表查询，尝试在所有表中查找
            for (const t of tableNames) {
              const normalizedTable = t.toLowerCase()
              const columns = schemaMap.get(normalizedTable) || schemaMap.get(t) || schemaMap.get(t.toUpperCase())
              if (columns && (columns.has(column.toLowerCase()) || columns.has(column) || columns.has(column.toUpperCase()))) {
                targetTable = t
                break
              }
            }
          }
        }

        if (targetTable) {
          const normalizedTable = targetTable.toLowerCase()
          const columns = schemaMap.get(normalizedTable) || schemaMap.get(targetTable) || schemaMap.get(targetTable.toUpperCase())
          if (columns) {
            const columnExists = columns.has(column.toLowerCase()) || columns.has(column) || columns.has(column.toUpperCase())
            if (!columnExists) {
              // 检查是否是 SELECT 中定义的别名
              // 如果是 ORDER BY 中的字段，只检查最后一个 SELECT 的别名
              // 如果是其他子句，检查所有别名
              const isAlias = isFromOrderBy
                ? (lastSelectAliases.has(column) || lastSelectAliases.has(column.toLowerCase()) || lastSelectAliases.has(column.toUpperCase()))
                : (selectAliases.has(column) || selectAliases.has(column.toLowerCase()) || selectAliases.has(column.toUpperCase()))
              if (!isAlias) {
                // 检查是否已经记录过这个错误
                const existingError = invalidColumns.find(
                  ic => ic.table === targetTable && ic.column === column
                )
                if (!existingError) {
                  invalidColumns.push({ table: targetTable, column })
                  errors.push(`字段 "${table ? table + "." : ""}${column}" 不存在于表 "${targetTable}" 中`)
                }
              }
              // 如果是别名，允许通过验证（ORDER BY 可以使用 SELECT 中定义的别名）
            }
          }
        } else {
          // 没有找到对应的表
          if (table) {
            // 有表前缀但表不存在
            if (!invalidTables.includes(table)) {
              invalidTables.push(table)
              errors.push(`表 "${table}" 不存在于数据库 schema 中`)
            }
          } else {
            // 没有表前缀，且无法确定表，检查字段是否在任何表中存在
            let columnFound = false
            for (const t of tableNames) {
              const normalizedTable = t.toLowerCase()
              const columns = schemaMap.get(normalizedTable) || schemaMap.get(t) || schemaMap.get(t.toUpperCase())
              if (columns && (columns.has(column.toLowerCase()) || columns.has(column) || columns.has(column.toUpperCase()))) {
                columnFound = true
                break
              }
            }
            
            // 如果字段不在任何表中，检查是否是 SELECT 中定义的别名
            // 如果是 ORDER BY 中的字段，只检查最后一个 SELECT 的别名
            // 如果是其他子句，检查所有别名
            if (!columnFound) {
              const isAlias = isFromOrderBy
                ? (lastSelectAliases.has(column) || lastSelectAliases.has(column.toLowerCase()) || lastSelectAliases.has(column.toUpperCase()))
                : (selectAliases.has(column) || selectAliases.has(column.toLowerCase()) || selectAliases.has(column.toUpperCase()))
              if (!isAlias && tableNames.length > 0) {
                // 字段在任何表中都不存在，也不是别名
                const existingError = invalidColumns.find(
                  ic => ic.table === (tableNames[0] || "未知表") && ic.column === column
                )
                if (!existingError) {
                  invalidColumns.push({ table: tableNames[0] || "未知表", column })
                  errors.push(`字段 "${column}" 不存在于任何可用表中（已检查：${tableNames.join(", ")}）`)
                }
              }
              // 如果是别名，允许通过验证
            }
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      invalidTables,
      invalidColumns,
    }
  }

  /**
   * 提取 SQL 中引用到的表名（FROM/JOIN）
   * 用于权限校验（列级）等场景
   */
  static extractTableNamesForPermission(sql: string): string[] {
    if (!sql || typeof sql !== "string") return []
    const cleanedSql = this.cleanSQL(sql)
    return this.extractTableNames(cleanedSql)
  }

  /**
   * 提取 SQL 中引用到的字段（SELECT/WHERE/JOIN ON/GROUP BY/HAVING/ORDER BY）
   * 返回字段引用 + SELECT 中定义的别名集合（便于跳过别名）
   */
  static extractColumnReferencesForPermission(sql: string): {
    references: Array<{ table: string | null; column: string }>
    aliases: Set<string>
    lastSelectAliases: Set<string>
  } {
    if (!sql || typeof sql !== "string") {
      return { references: [], aliases: new Set(), lastSelectAliases: new Set() }
    }
    const cleanedSql = this.cleanSQL(sql)
    const tables = this.extractTableNames(cleanedSql)
    return this.extractColumnReferences(cleanedSql, tables)
  }

  /**
   * 提取 SELECT 列表的原始项（用于检测 SELECT * / t.*）
   */
  static extractSelectItemsForPermission(sql: string): string[] {
    if (!sql || typeof sql !== "string") return []
    const cleanedSql = this.cleanSQL(sql)
    const statements = this.splitUnionStatements(cleanedSql)
    const items: string[] = []
    for (const selectSql of statements) {
      const match = selectSql.match(/SELECT\s+(?:DISTINCT\s+)?(.+?)\s+FROM/i)
      if (!match) continue
      const selectClause = match[1]
      const cols = this.parseColumnList(selectClause)
      items.push(...cols)
    }
    return items
  }

  /**
   * 解析表别名到真实表名（用于权限校验）
   */
  static resolveTableAliasForPermission(sql: string, alias: string): string | null {
    if (!sql || typeof sql !== "string") return null
    return this.findTableByAlias(sql, alias)
  }

  /**
   * 将包含 UNION/UNION ALL 的 SQL 拆分为多个独立的 SELECT 语句
   * @param sql SQL 语句
   * @returns SELECT 语句数组
   */
  private static splitUnionStatements(sql: string): string[] {
    const statements: string[] = []
    const upperSql = sql.toUpperCase()
    
    // 检查是否包含 UNION
    if (!upperSql.includes("UNION")) {
      // 没有 UNION，返回整个 SQL
      return [sql]
    }
    
    // 使用正则匹配 UNION/UNION ALL，同时考虑字符串常量中的 UNION
    let currentPos = 0
    let inString = false
    let stringChar = ''
    let depth = 0 // 括号深度
    
    for (let i = 0; i < sql.length - 5; i++) {
      const char = sql[i]
      const nextChars = sql.substring(i, i + 6).toUpperCase()
      
      // 处理字符串常量
      if ((char === "'" || char === '"') && (i === 0 || sql[i - 1] !== '\\')) {
        if (!inString) {
          inString = true
          stringChar = char
        } else if (char === stringChar) {
          inString = false
          stringChar = ''
        }
        continue
      }
      
      if (inString) {
        continue
      }
      
      // 处理括号深度
      if (char === '(') {
        depth++
        continue
      } else if (char === ')') {
        depth--
        continue
      }
      
      // 在顶层（不在括号内）查找 UNION
      if (depth === 0 && (nextChars.startsWith("UNION ") || nextChars.startsWith("UNION\t") || nextChars.startsWith("UNION\n"))) {
        // 检查是否是 UNION ALL
        const unionAllMatch = sql.substring(i, i + 9).toUpperCase()
        const isUnionAll = unionAllMatch.startsWith("UNION ALL")
        
        // 提取当前 SELECT 语句（从 currentPos 到 i）
        const selectStatement = sql.substring(currentPos, i).trim()
        if (selectStatement) {
          statements.push(selectStatement)
        }
        
        // 移动到下一个 SELECT 的开始位置
        if (isUnionAll) {
          i += 9 // "UNION ALL" 的长度
        } else {
          i += 6 // "UNION" 的长度
        }
        
        // 跳过空白字符
        while (i < sql.length && /\s/.test(sql[i])) {
          i++
        }
        
        currentPos = i
        i-- // 补偿循环的 i++
      }
    }
    
    // 添加最后一个 SELECT 语句
    if (currentPos < sql.length) {
      const lastStatement = sql.substring(currentPos).trim()
      if (lastStatement) {
        statements.push(lastStatement)
      }
    }
    
    return statements.length > 0 ? statements : [sql]
  }

  /**
   * 从 SQL 中提取表名
   */
  private static extractTableNames(sql: string): string[] {
    const tables: string[] = []
    const upperSql = sql.toUpperCase()

    // 提取 FROM 子句中的表
    const fromMatch = sql.match(/FROM\s+([^\s(,]+(?:\s+AS\s+[^\s,]+)?(?:\s*,\s*[^\s(,]+(?:\s+AS\s+[^\s,]+)?)*)/i)
    if (fromMatch) {
      const fromClause = fromMatch[1]
      // 分割多个表（逗号分隔）
      const tableList = fromClause.split(",").map((t) => {
        // 移除 AS 别名
        const cleaned = t.trim().replace(/\s+AS\s+\w+/i, "").trim()
        // 移除反引号、引号、括号等特殊字符
        return cleaned.replace(/[`"'\[\]()]/g, "")
      })
      tables.push(...tableList)
    }

    // 提取 JOIN 子句中的表
    const joinMatches = sql.matchAll(/(?:INNER|LEFT|RIGHT|FULL)?\s+JOIN\s+([^\s(,]+)/gi)
    for (const match of joinMatches) {
      const tableName = match[1].trim().replace(/[`"'\[\]()]/g, "")
      if (tableName && !tables.includes(tableName)) {
        tables.push(tableName)
      }
    }

    return tables.filter((t) => t && t.length > 0)
  }

  /**
   * 从 SQL 中提取字段引用和别名
   * 改进版本：支持 UNION 查询，使用 extractActualColumnName 提取实际列名
   * 返回字段引用和SELECT中定义的别名
   * 注意：对于 UNION 查询，ORDER BY 只能使用最后一个 SELECT 的别名
   */
  private static extractColumnReferences(sql: string, tableNames: string[]): {
    references: Array<{ table: string | null; column: string }>
    aliases: Set<string>
    lastSelectAliases: Set<string> // 最后一个 SELECT 的别名（用于 ORDER BY）
  } {
    const references: Array<{ table: string | null; column: string }> = []
    const aliases = new Set<string>()
    const lastSelectAliases = new Set<string>()
    
    // 如果包含 UNION，需要分别处理每个 SELECT 子句
    const selectStatements = this.splitUnionStatements(sql)
    const lastSelectIndex = selectStatements.length - 1
    
    for (let idx = 0; idx < selectStatements.length; idx++) {
      const selectSql = selectStatements[idx]
      const isLastSelect = idx === lastSelectIndex
      // 为当前 SELECT 语句提取表名
      const currentTableNames = this.extractTableNames(selectSql)
      
      // 提取 SELECT 子句中的字段
      // 支持 DISTINCT 关键字：SELECT DISTINCT ... 或 SELECT ...
      const selectMatch = selectSql.match(/SELECT\s+(?:DISTINCT\s+)?(.+?)\s+FROM/i)
      if (selectMatch) {
        const selectClause = selectMatch[1]
        const columns = this.parseColumnList(selectClause)
        columns.forEach((col) => {
          // 提取别名（如果存在）
          // 支持多种格式：AS alias, AS 'alias', AS "alias", 或直接 alias（空格分隔）
          const trimmedCol = col.trim()
          
          // ✅ 新增：先检查是否是字符串常量（快速路径）
          // 如果整个表达式是字符串常量（以单引号或双引号开头和结尾），直接跳过字段验证
          if ((trimmedCol.startsWith("'") && trimmedCol.endsWith("'")) ||
              (trimmedCol.startsWith('"') && trimmedCol.endsWith('"'))) {
            // 这是字符串常量，提取别名（如果有）但不验证字段
            const asMatch = trimmedCol.match(/\s+AS\s+(\w+)/i)
            if (asMatch) {
              const alias = asMatch[1]
              aliases.add(alias)
              if (isLastSelect) {
                lastSelectAliases.add(alias)
              }
            }
            return // 跳过字段验证
          }
          
          // 提取别名（改进版，更准确地匹配各种格式）
          let extractedAlias: string | null = null
          
          // 方法1: 匹配 AS 关键字（最常用格式）
          // 匹配: COUNT(*) AS customer_count, source AS 来源, name AS '名称', `table`.`column` AS alias 等
          // 改进正则：更准确地匹配 AS 后面的别名，考虑各种引号和反引号，支持中文等Unicode字符
          // 先匹配引号包裹的别名
          const asMatchQuoted = trimmedCol.match(/\s+AS\s+(['"`])([^'"`]+)\1/i)
          if (asMatchQuoted) {
            extractedAlias = asMatchQuoted[2].trim()
          } else {
            // 匹配未引号的别名（支持中文、Unicode字符）
            // 别名可以是任何非空白字符，直到遇到逗号、FROM等关键字或行尾
            const asMatchUnquoted = trimmedCol.match(/\s+AS\s+([^\s,]+?)(?:\s*,\s*|\s+(?:FROM|WHERE|GROUP|ORDER|HAVING|LIMIT|UNION|$)|$)/i)
            if (asMatchUnquoted) {
              extractedAlias = asMatchUnquoted[1].trim().replace(/[`'"]/g, "")
            }
          }
          
          if (!extractedAlias) {
            // 方法2: 如果没有 AS，检查是否是 "表达式 别名" 格式
            // 这适用于 COUNT(*) customer_count 这样的格式（MySQL允许省略AS）
            // 需要更精确的判断：最后一个单词且前面有函数或运算符
            // 改进：使用更准确的正则，避免误匹配
            const aliasPattern = /(?:^|\s+)([`]?[a-zA-Z_][a-zA-Z0-9_]*[`]?)(?:\s*[,]?\s*|$)$/
            const aliasMatch2 = trimmedCol.match(aliasPattern)
            if (aliasMatch2 && aliasMatch2.index !== undefined) {
              const potentialAlias = aliasMatch2[1].replace(/[`'"]/g, "")
              // 检查前面部分是否包含函数调用或运算符（说明这是表达式+别名）
              const beforeAlias = trimmedCol.substring(0, aliasMatch2.index).trim()
              const sqlKeywords = ['FROM', 'WHERE', 'GROUP', 'ORDER', 'HAVING', 'LIMIT', 'UNION', 'ASC', 'DESC', 'AS', 'SELECT', 'DISTINCT']
              
              // 更严格的判断：前面必须有函数、运算符或通配符，且不是关键字
              const hasExpression = beforeAlias.includes("(") || 
                                   beforeAlias.includes("*") || 
                                   beforeAlias.match(/\w+\s*\(/) || 
                                   beforeAlias.includes("+") || 
                                   beforeAlias.includes("-") ||
                                   beforeAlias.includes("/") ||
                                   beforeAlias.includes("%")
              
              if (
                potentialAlias && 
                !sqlKeywords.includes(potentialAlias.toUpperCase()) &&
                hasExpression &&
                beforeAlias.length > 0 // 确保前面有内容
              ) {
                extractedAlias = potentialAlias
              }
            }
          }
          
          // 如果提取到别名，添加到集合中
          if (extractedAlias) {
            aliases.add(extractedAlias)
            // 如果是最后一个 SELECT，也添加到 lastSelectAliases
            if (isLastSelect) {
              lastSelectAliases.add(extractedAlias)
            }
          }
          
          const extracted = this.extractActualColumnName(col)
          // 只处理非字面量（字符串常量、数字等）的列
          if (!extracted.isLiteral && extracted.column) {
            references.push({ 
              table: extracted.table, 
              column: extracted.column 
            })
          }
        })
      }

      // 提取 WHERE 子句中的字段
      const whereMatch = selectSql.match(/WHERE\s+(.+?)(?:\s+(?:GROUP|ORDER|HAVING|LIMIT|UNION)\s+|$)/i)
      if (whereMatch) {
        const whereClause = whereMatch[1]
        const whereColumns = this.extractColumnsFromExpression(whereClause)
        whereColumns.forEach((col) => {
          const extracted = this.extractActualColumnName(col)
          if (!extracted.isLiteral && extracted.column) {
            references.push({ 
              table: extracted.table, 
              column: extracted.column 
            })
          }
        })
      }

      // 提取 JOIN ON 子句中的字段（重要：列级权限必须覆盖 JOIN 条件）
      // 简化实现：匹配 ON ... 直到下一个 JOIN/WHERE/GROUP/ORDER/HAVING/LIMIT/UNION 或结尾
      const onMatches = selectSql.matchAll(
        /\bON\s+([\s\S]*?)(?=\b(?:INNER|LEFT|RIGHT|FULL|CROSS)?\s+JOIN\b|\bWHERE\b|\bGROUP\b|\bORDER\b|\bHAVING\b|\bLIMIT\b|\bUNION\b|$)/gi
      )
      for (const onMatch of onMatches) {
        const onClause = onMatch[1]
        if (!onClause) continue
        const onColumns = this.extractColumnsFromExpression(onClause)
        onColumns.forEach((col) => {
          const extracted = this.extractActualColumnName(col)
          if (!extracted.isLiteral && extracted.column) {
            references.push({
              table: extracted.table,
              column: extracted.column,
            })
          }
        })
      }

      // 提取 ORDER BY 子句中的字段（ORDER BY 通常在最后一个 SELECT 后）
      // 注意：ORDER BY 可以使用列位置（数字）或表达式，这些不需要验证
      if (isLastSelect) {
        const orderByMatch = sql.match(/ORDER\s+BY\s+(.+?)(?:\s+(?:GROUP|HAVING|LIMIT)\s+|$)/i)
        if (orderByMatch) {
          const orderByClause = orderByMatch[1]
          const orderColumns = this.parseColumnList(orderByClause)
          orderColumns.forEach((col) => {
            const trimmedCol = col.trim()
            
            // 跳过列位置（数字）和表达式（包含函数调用）
            // ORDER BY 1, ORDER BY COUNT(*), ORDER BY (expression) 等不需要验证
            if (/^\d+$/.test(trimmedCol) || // 纯数字（列位置）
                trimmedCol.includes("(") || // 包含函数调用
                trimmedCol.match(/^[A-Z_][A-Z0-9_]*\s*\(/i)) { // 函数名开头
              return // 跳过验证
            }
            
            const extracted = this.extractActualColumnName(col)
            if (!extracted.isLiteral && extracted.column) {
              references.push({ 
                table: extracted.table, 
                column: extracted.column 
              })
            }
          })
        }
      }
      
      // 提取 HAVING 子句中的字段（HAVING 也可以使用别名）
      const havingMatch = selectSql.match(/HAVING\s+(.+?)(?:\s+(?:ORDER|LIMIT|UNION)\s+|$)/i)
      if (havingMatch) {
        const havingClause = havingMatch[1]
        const havingColumns = this.extractColumnsFromExpression(havingClause)
        havingColumns.forEach((col) => {
          const extracted = this.extractActualColumnName(col)
          if (!extracted.isLiteral && extracted.column) {
            references.push({ 
              table: extracted.table, 
              column: extracted.column 
            })
          }
        })
      }

      // 提取 GROUP BY 子句中的字段
      const groupByMatch = selectSql.match(/GROUP\s+BY\s+(.+?)(?:\s+(?:ORDER|HAVING|LIMIT|UNION)\s+|$)/i)
      if (groupByMatch) {
        const groupByClause = groupByMatch[1]
        const groupColumns = this.parseColumnList(groupByClause)
        groupColumns.forEach((col) => {
          const extracted = this.extractActualColumnName(col)
          if (!extracted.isLiteral && extracted.column) {
            references.push({ 
              table: extracted.table, 
              column: extracted.column 
            })
          }
        })
      }
    }

    return { references, aliases, lastSelectAliases }
  }

  /**
   * 从列表达式中提取实际的列名
   * 例如：'账户' AS 项目类型 -> null (字符串常量，不是列)
   *      name AS 项目名称 -> name
   *      table.id -> id
   *      COUNT(*) -> null (聚合函数)
   * @param columnExpr 列表达式
   * @returns 提取的列信息
   */
  private static extractActualColumnName(columnExpr: string): { 
    table: string | null; 
    column: string | null;
    isLiteral: boolean;
  } {
    const trimmed = columnExpr.trim()
    
    // 1. 检查是否是字符串常量（单引号或双引号）
    if ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
        (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
      return { table: null, column: null, isLiteral: true }
    }
    
    // 2. 检查是否是数字常量
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return { table: null, column: null, isLiteral: true }
    }
    
    // 3. 检查是否是通配符
    if (trimmed === "*" || trimmed === "1" || trimmed === "'1'") {
      return { table: null, column: null, isLiteral: true }
    }
    
    // 4. 检查是否是聚合函数（COUNT, SUM, AVG, MAX, MIN 等）
    const upperTrimmed = trimmed.toUpperCase()
    const aggregateFunctions = ['COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'GROUP_CONCAT']
    if (aggregateFunctions.some(fn => upperTrimmed.startsWith(fn + '('))) {
      // 尝试从聚合函数中提取列名（如 COUNT(column)）
      const match = trimmed.match(/^\w+\s*\(\s*([^)]+)\s*\)/i)
      if (match && match[1] && match[1] !== '*') {
        const innerExpr = match[1].trim()
        // 递归提取内部表达式中的列名
        return this.extractActualColumnName(innerExpr)
      }
      return { table: null, column: null, isLiteral: true }
    }
    
    // 5. 处理 AS 别名：提取 AS 前的实际列名
    // 支持 AS '别名'、AS "别名"、AS 别名 等多种格式（包括中文别名）
    let actualExpr = trimmed
    // 匹配 AS 关键字，后面可以是引号包裹的字符串或标识符（包括中文等Unicode字符）
    // 改进：支持中文别名，使用更灵活的正则表达式
    // 方法1: 匹配引号包裹的别名（单引号或双引号）
    const asMatchQuoted = trimmed.match(/^(.+?)\s+AS\s+(['"])([^'"]+)\2/i)
    if (asMatchQuoted) {
      actualExpr = asMatchQuoted[1].trim()
    } else {
      // 方法2: 匹配未引号的别名（可以是任何非空白字符，包括中文）
      // 改进：使用更可靠的正则，确保能匹配到 AS 关键字
      // 匹配 AS 后的内容直到遇到逗号、FROM等关键字或行尾
      const asMatchUnquoted = trimmed.match(/^(.+?)\s+AS\s+([^\s,]+?)(?:\s*,\s*|\s+(?:FROM|WHERE|GROUP|ORDER|HAVING|LIMIT|UNION|$)|$)/i)
      if (asMatchUnquoted && asMatchUnquoted[1]) {
        actualExpr = asMatchUnquoted[1].trim()
      } else {
        // 方法3: 如果上述方法都失败，尝试更简单的匹配：找到 AS 关键字的位置
        const asIndex = trimmed.toUpperCase().indexOf(' AS ')
        if (asIndex > 0) {
          actualExpr = trimmed.substring(0, asIndex).trim()
        }
      }
    }
    
    // 6. 处理表前缀（table.column）
    // 注意：需要先移除排序关键字 ASC/DESC，然后再处理表前缀
    // 因为 ORDER BY 子句中可能有 "q.created_at DESC" 这样的格式
    let exprWithoutSort = actualExpr.replace(/\s+(ASC|DESC)$/i, "").trim()
    
    if (exprWithoutSort.includes(".")) {
      const parts = exprWithoutSort.split(".").map(p => p.trim().replace(/[`"'\[\]]/g, ""))
      if (parts.length === 2) {
        // 确保列名部分也移除了排序关键字（双重保险）
        const columnName = parts[1].replace(/\s+(ASC|DESC)$/i, "").trim()
        return { 
          table: parts[0], 
          column: columnName, 
          isLiteral: false 
        }
      }
    }
    
    // 7. 移除可能的引号和反引号
    // 使用已经移除排序关键字的表达式
    let cleaned = exprWithoutSort.replace(/[`"'\[\]]/g, "").trim()
    
    // 7.5. 移除 DISTINCT 关键字（如果存在）
    // DISTINCT 可能出现在字段名前面，如 "DISTINCT source"
    cleaned = cleaned.replace(/^DISTINCT\s+/i, "").trim()
    
    // 7.6. 再次移除排序关键字 ASC/DESC（双重保险，虽然前面已经移除过）
    // ORDER BY 子句中可能包含排序关键字，如 "count DESC" 或 "name ASC"
    cleaned = cleaned.replace(/\s+(ASC|DESC)$/i, "").trim()
    
    // 7.7. 检查是否是 SQL 关键字（如 IS、NULL、NOT 等）
    // 如果是 SQL 关键字，应该被视为字面量而不是列名
    if (this.isSQLKeyword(cleaned)) {
      return { table: null, column: null, isLiteral: true }
    }
    
    // 8. 检查是否是函数调用（非聚合函数）
    if (cleaned.includes("(")) {
      // 尝试提取函数参数中的列名
      const funcMatch = cleaned.match(/^\w+\s*\(\s*([^)]+)\s*\)/i)
      if (funcMatch && funcMatch[1]) {
        const param = funcMatch[1].trim()
        // 如果参数是表.列格式
        if (param.includes(".")) {
          const paramParts = param.split(".").map(p => p.trim().replace(/[`"'\[\]]/g, ""))
          if (paramParts.length === 2) {
            // 检查表名和列名是否都是 SQL 关键字
            if (this.isSQLKeyword(paramParts[0]) || this.isSQLKeyword(paramParts[1])) {
              return { table: null, column: null, isLiteral: true }
            }
            return { 
              table: paramParts[0], 
              column: paramParts[1], 
              isLiteral: false 
            }
          }
        } else {
          // 参数是列名，检查是否是 SQL 关键字
          const paramCleaned = param.replace(/[`"'\[\]]/g, "")
          if (this.isSQLKeyword(paramCleaned)) {
            return { table: null, column: null, isLiteral: true }
          }
          return { 
            table: null, 
            column: paramCleaned, 
            isLiteral: false 
          }
        }
      }
      // 函数调用但无法提取列名，跳过验证
      return { table: null, column: null, isLiteral: true }
    }
    
    // 9. 返回提取的列名
    return { 
      table: null, 
      column: cleaned, 
      isLiteral: false 
    }
  }

  /**
   * 解析列列表（处理逗号分隔的列）
   * 改进版本：能够识别字符串常量、括号、AS 别名等
   */
  private static parseColumnList(clause: string): string[] {
    const columns: string[] = []
    let current = ""
    let depth = 0 // 括号深度
    let inString = false
    let stringChar = ''

    for (let i = 0; i < clause.length; i++) {
      const char = clause[i]
      
      // 处理字符串常量（单引号或双引号）
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
      if (char === "(") {
        depth++
        current += char
      } else if (char === ")") {
        depth--
        current += char
      } else if (char === "," && depth === 0) {
        // 在顶层（不在括号和字符串内）遇到逗号，分割列
        if (current.trim()) {
          columns.push(current.trim())
        }
        current = ""
      } else {
        current += char
      }
    }

    // 添加最后一列
    if (current.trim()) {
      columns.push(current.trim())
    }

    return columns
  }

  /**
   * 从表达式中提取字段名（简单版本，处理常见情况）
   * 修复：过滤掉 SQL 关键字（如 IS、NULL、NOT、AND、OR 等）
   */
  private static extractColumnsFromExpression(expression: string): string[] {
    const columns: string[] = []
    
    // 匹配 表名.字段名 或 字段名
    // 改进正则：避免匹配 SQL 关键字，只匹配在运算符前的标识符
    // 使用负向前瞻，确保不匹配 SQL 关键字
    const columnPattern = /(?:^|\s)(?:(\w+)\.)?(\w+)(?=\s*(?:=|!=|<>|<|>|<=|>=|LIKE|IN|IS\s+NULL|IS\s+NOT\s+NULL|NOT\s+IN|NOT\s+LIKE|AND|OR|$))/gi
    let match
    while ((match = columnPattern.exec(expression)) !== null) {
      const table = match[1]
      const column = match[2]
      
      // 过滤掉 SQL 关键字和函数
      if (column && 
          !this.isSQLKeyword(column) && 
          !this.isAggregateOrFunction(column) && 
          column !== "*") {
        if (table) {
          columns.push(`${table}.${column}`)
        } else {
          columns.push(column)
        }
      }
    }

    return columns
  }

  /**
   * 检查是否是 SQL 关键字（如 IS、NULL、NOT、AND、OR 等）
   */
  private static isSQLKeyword(word: string): boolean {
    const upperWord = word.toUpperCase()
    const sqlKeywords = [
      "IS", "NULL", "NOT", "AND", "OR", "IN", "LIKE", "BETWEEN",
      "EXISTS", "ALL", "ANY", "SOME", "DISTINCT", "AS", "ON",
      "WHERE", "FROM", "SELECT", "INSERT", "UPDATE", "DELETE",
      "JOIN", "INNER", "LEFT", "RIGHT", "FULL", "OUTER", "CROSS",
      "GROUP", "ORDER", "HAVING", "LIMIT", "OFFSET", "UNION",
      "CASE", "WHEN", "THEN", "ELSE", "END", "IF", "ELSEIF",
      "TRUE", "FALSE", "ASC", "DESC"
    ]
    return sqlKeywords.includes(upperWord)
  }

  /**
   * 检查是否是聚合函数或特殊函数
   */
  private static isAggregateOrFunction(column: string): boolean {
    const upperCol = column.toUpperCase()
    const functions = [
      "COUNT", "SUM", "AVG", "MAX", "MIN",
      "DATE", "YEAR", "MONTH", "DAY",
      "CONCAT", "SUBSTRING", "UPPER", "LOWER",
      "CASE", "WHEN", "THEN", "ELSE", "END",
      "IF", "IFNULL", "COALESCE",
      "NOW", "CURDATE", "CURTIME",
    ]
    return functions.some((fn) => upperCol.includes(fn))
  }

  /**
   * 检查是否是表别名
   */
  private static isTableAlias(sql: string, name: string): boolean {
    // 清理表名，移除可能的特殊字符（如括号）
    const cleanedName = name.replace(/[`"'\[\]()]/g, "").trim()
    if (!cleanedName) {
      return false
    }
    
    // 转义正则表达式特殊字符
    const escapedName = cleanedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    
    // 检查是否在 AS 关键字后
    const asPattern = new RegExp(`AS\\s+${escapedName}\\b`, "i")
    if (asPattern.test(sql)) {
      return true
    }
    // 检查是否在 FROM/JOIN 后的直接别名（空格分隔）
    const aliasPattern = new RegExp(`(?:FROM|JOIN)\\s+\\w+\\s+${escapedName}\\b`, "i")
    return aliasPattern.test(sql)
  }

  /**
   * 根据别名查找实际表名
   */
  private static findTableByAlias(sql: string, alias: string): string | null {
    // 清理别名，移除可能的特殊字符
    const cleanedAlias = alias.replace(/[`"'\[\]()]/g, "").trim()
    if (!cleanedAlias) {
      return null
    }
    
    // 转义正则表达式特殊字符
    const escapedAlias = cleanedAlias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    
    // 查找 FROM table AS alias 或 FROM table alias
    const pattern = new RegExp(`(?:FROM|JOIN)\\s+([\\w.]+)\\s+(?:AS\\s+)?${escapedAlias}\\b`, "i")
    const match = sql.match(pattern)
    return match ? match[1].replace(/[`"'\[\]()]/g, "") : null
  }
}
