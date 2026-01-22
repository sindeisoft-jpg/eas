/**
 * 智能体工具执行器
 * 负责匹配和执行智能体配置的工具
 */

import type { AgentTool, SQLToolConfig, DatabaseConnection, QueryResult } from "./types"
import { SQLExecutor } from "./sql-executor"
import { SQLValidator } from "./sql-validator"

export interface ToolCall {
  toolName: string
  sql?: string
  parameters?: Record<string, any>
}

export interface ToolExecutionResult {
  success: boolean
  result?: QueryResult | any
  error?: string
  toolName: string
}

export class AgentToolExecutor {
  /**
   * 匹配 SQL 工具
   * 检查 LLM 返回的 SQL 是否与配置的工具匹配
   */
  static matchSQLTool(
    sql: string,
    tools: AgentTool[],
    databaseConnection: DatabaseConnection | any
  ): { matched: boolean; tool?: AgentTool; error?: string } {
    // 只检查启用的 SQL 查询工具
    const sqlTools = tools.filter(
      (tool) => tool.type === "sql_query" && tool.enabled
    )

    if (sqlTools.length === 0) {
      return {
        matched: false,
        error: "没有配置可用的 SQL 查询工具",
      }
    }

    // 清理 SQL（移除注释、多余空白）
    const cleanedSQL = this.cleanSQL(sql)

    // 尝试匹配每个工具
    for (const tool of sqlTools) {
      const toolConfig = tool.config as SQLToolConfig
      if (!toolConfig || !toolConfig.sql) {
        continue
      }

      const toolSQL = this.cleanSQL(toolConfig.sql)

      // 完全匹配
      if (this.normalizeSQL(cleanedSQL) === this.normalizeSQL(toolSQL)) {
        return { matched: true, tool }
      }

      // 参数化匹配：检查是否可以通过参数替换匹配
      const paramMatch = this.matchParameterizedSQL(cleanedSQL, toolSQL)
      if (paramMatch.matched) {
        return { matched: true, tool }
      }
    }

    return {
      matched: false,
      error: `SQL 语句不匹配任何配置的工具。可用的工具：${sqlTools.map((t) => t.name).join(", ")}`,
    }
  }

  /**
   * 执行 SQL 工具
   */
  static async executeSQLTool(
    tool: AgentTool,
    databaseConnection: DatabaseConnection | any,
    parameters?: Record<string, any>
  ): Promise<ToolExecutionResult> {
    const toolConfig = tool.config as SQLToolConfig
    if (!toolConfig || !toolConfig.sql) {
      return {
        success: false,
        error: "工具配置无效：缺少 SQL 语句",
        toolName: tool.name,
      }
    }

    try {
      // 替换参数
      let sql = toolConfig.sql
      if (parameters) {
        sql = this.replaceParameters(sql, parameters)
      }

      // 验证 SQL（允许所有操作，因为这是用户配置的工具）
      const validation = SQLValidator.validate(sql, true)
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error || "SQL 验证失败",
          toolName: tool.name,
        }
      }

      // 执行 SQL（允许所有操作，因为这是用户配置的工具）
      const result = await SQLExecutor.executeQuery(databaseConnection, sql, true)

      return {
        success: true,
        result,
        toolName: tool.name,
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "SQL 执行失败",
        toolName: tool.name,
      }
    }
  }

  /**
   * 清理 SQL（移除注释、多余空白）
   */
  private static cleanSQL(sql: string): string {
    return sql
      .replace(/--.*$/gm, "") // 移除单行注释
      .replace(/\/\*[\s\S]*?\*\//g, "") // 移除多行注释
      .replace(/\s+/g, " ") // 合并多个空白
      .trim()
  }

  /**
   * 标准化 SQL（用于比较）
   */
  private static normalizeSQL(sql: string): string {
    return this.cleanSQL(sql)
      .toUpperCase()
      .replace(/\s+/g, " ")
      .trim()
  }

  /**
   * 匹配参数化 SQL
   * 检查 SQL 是否可以通过参数替换匹配配置的 SQL
   */
  private static matchParameterizedSQL(
    sql: string,
    templateSQL: string
  ): { matched: boolean; parameters?: Record<string, any> } {
    // 提取模板中的参数占位符 {{param}}
    const paramRegex = /\{\{(\w+)\}\}/g
    const templateParams: string[] = []
    let match

    while ((match = paramRegex.exec(templateSQL)) !== null) {
      templateParams.push(match[1])
    }

    if (templateParams.length === 0) {
      // 没有参数，需要完全匹配
      return { matched: false }
    }

    // 构建正则表达式来匹配参数化 SQL
    // 将 {{param}} 替换为捕获组，转义其他特殊字符
    let regexPattern = templateSQL
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&") // 先转义所有特殊字符
      .replace(/\\\{\\\{(\w+)\\\}\\\}/g, "(.+?)") // 然后将转义后的 {{param}} 替换为捕获组

    // 尝试匹配（不区分大小写）
    const regex = new RegExp(`^${regexPattern}$`, "i")
    const matchResult = sql.match(regex)

    if (matchResult && matchResult.length === templateParams.length + 1) {
      // 提取参数值
      const parameters: Record<string, any> = {}
      for (let i = 0; i < templateParams.length; i++) {
        parameters[templateParams[i]] = matchResult[i + 1]
      }
      return { matched: true, parameters }
    }

    return { matched: false }
  }

  /**
   * 替换 SQL 中的参数占位符
   */
  private static replaceParameters(
    sql: string,
    parameters: Record<string, any>
  ): string {
    let result = sql
    for (const [key, value] of Object.entries(parameters)) {
      const placeholder = `{{${key}}}`
      // 根据值类型决定是否加引号
      const replacement =
        typeof value === "string" ? `'${value.replace(/'/g, "''")}'` : String(value)
      result = result.replace(new RegExp(placeholder.replace(/[{}]/g, "\\$&"), "g"), replacement)
    }
    return result
  }

  /**
   * 从 LLM 响应中提取工具调用
   */
  static extractToolCall(response: string): ToolCall | null {
    try {
      // 尝试从 JSON 代码块中提取
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1])
        if (parsed.toolCall) {
          return parsed.toolCall
        }
      }

      // 尝试直接解析 JSON
      const jsonMatch2 = response.match(/\{[\s\S]*"toolCall"[\s\S]*\}/)
      if (jsonMatch2) {
        const parsed = JSON.parse(jsonMatch2[0])
        if (parsed.toolCall) {
          return parsed.toolCall
        }
      }

      return null
    } catch (error) {
      return null
    }
  }
}
