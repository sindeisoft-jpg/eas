/**
 * Agent 执行器
 * 实现真正的 Agent 架构，支持 Function Calling 和工具调用循环
 */

import type { AgentTool, DatabaseConnection, DatabaseSchema } from "./types"
import { AgentToolExecutor } from "./agent-tool-executor"
import { SQLExecutor } from "./sql-executor"
import { SQLValidator } from "./sql-validator"
import { formatDatabaseSchema, replaceTemplateVariables } from "./template-engine"
import { detectSensitiveFieldsInSQL, filterSensitiveFieldsFromResult, isSensitiveField } from "./security-filter"
import { PermissionApplier } from "./permission-applier"
import { enforceColumnAccess } from "./sql-permission"
import { applyMaskingToQueryResult } from "./data-masking"

export interface AgentContext {
  user: any
  agent: any
  llmConnection: any // LLMConnection 类型
  databaseConnection?: DatabaseConnection | any
  databaseSchema?: DatabaseSchema[]
  messages: Array<{ role: "system" | "user" | "assistant" | "tool"; content: string; tool_call_id?: string; tool_calls?: any[] }>
  workProcess: string[]
  sessionId?: string
}

export interface AgentExecutionResult {
  success: boolean
  message: string
  toolCalls?: Array<{
    toolName: string
    arguments: any
    result: any
  }>
  workProcess: string[]
  error?: string
}

export class AgentExecutor {
  private static readonly MAX_ITERATIONS = 10 // 最大迭代次数，防止无限循环
  private static readonly MAX_TOOL_CALLS_PER_ITERATION = 5 // 每次迭代最多调用工具数
  private static readonly MAX_TOTAL_TOOL_CALLS = 15 // 总工具调用次数限制
  private static readonly MAX_SQL_QUERIES = 10 // SQL 查询次数限制
  private static readonly MAX_CONSECUTIVE_FAILURES = 3 // 最大连续失败次数
  private static readonly MAX_EXECUTION_TIME = 280000 // 最大执行时间：280秒（接近API路由的300秒超时）

  /**
   * 执行 Agent 循环
   */
  static async execute(
    userQuestion: string,
    context: AgentContext
  ): Promise<AgentExecutionResult> {
    const startTime = Date.now()
    const toolCalls: AgentExecutionResult["toolCalls"] = []
    let iteration = 0
    let totalToolCalls = 0 // 总工具调用次数
    let sqlQueryCount = 0 // SQL 查询次数
    let consecutiveFailures = 0 // 连续失败次数
    let currentMessages = [...context.messages]
    const queryCache = new Map<string, any>() // 查询缓存（SQL -> 结果）
    const executedQueries: Array<{ sql: string; result: any; iteration: number }> = [] // 已执行的查询记录

    // 处理消息历史：如果历史太长，生成摘要
    const processedMessages = AgentExecutor.processMessageHistory(currentMessages, context.messages.length)
    
    // 添加用户问题
    processedMessages.push({
      role: "user",
      content: userQuestion,
    })

    context.workProcess.push("🤖 **Agent 开始执行**")
    context.workProcess.push(`📝 **用户问题**: ${userQuestion.substring(0, 100)}${userQuestion.length > 100 ? "..." : ""}`)
    
    // 如果消息历史被摘要，记录信息
    if (processedMessages.length < currentMessages.length) {
      context.workProcess.push(`📚 **消息历史已摘要**：从 ${currentMessages.length} 条消息摘要为 ${processedMessages.length} 条关键消息`)
    }

    try {
      // 创建工具名称映射（清理后的名称 -> 工具对象）
      const toolNameMap = new Map<string, AgentTool>()
      const enabledTools = (context.agent.tools || []).filter((tool: AgentTool) => tool.enabled)
      
      for (const tool of enabledTools) {
        const sanitizedName = this.sanitizeToolName(tool.name, tool.id)
        toolNameMap.set(sanitizedName, tool)
        
        // 调试日志：只在开发环境且启用调试时输出
        if (process.env.NODE_ENV === 'development' && process.env.DEBUG_AGENT === 'true') {
          console.log('[AgentExecutor] Tool name mapping:', {
            id: tool.id,
            originalName: tool.name,
            sanitizedName: sanitizedName,
          })
        }
      }
      
      // 转换工具为 Function Calling 格式
      const tools = AgentExecutor.convertToolsToFunctionCalling(context.agent.tools || [])

      if (tools.length === 0) {
        context.workProcess.push("⚠️ **警告**: 智能体未配置任何工具，将使用纯对话模式")
      } else {
        context.workProcess.push(`🔧 **可用工具**: ${tools.length} 个`)
        // 调试日志：只在开发环境且启用调试时输出
        if (process.env.NODE_ENV === 'development' && process.env.DEBUG_AGENT === 'true') {
          console.log('[AgentExecutor] Available tools:', Array.from(toolNameMap.keys()))
        }
      }

      // Agent 循环
      while (iteration < AgentExecutor.MAX_ITERATIONS) {
        // 检查执行时间，如果接近API超时时间则提前终止
        const elapsedTime = Date.now() - startTime
        if (elapsedTime >= AgentExecutor.MAX_EXECUTION_TIME) {
          const elapsedSeconds = Math.floor(elapsedTime / 1000)
          context.workProcess.push(`⚠️ **执行时间接近API超时限制（${elapsedSeconds}秒），提前终止执行**`)
          console.warn('[AgentExecutor] Execution time limit reached:', {
            elapsedTime,
            maxExecutionTime: AgentExecutor.MAX_EXECUTION_TIME,
            iteration,
            totalToolCalls,
            sqlQueryCount,
          })
          break
        }

        iteration++
        // 迭代信息只在内部记录，不显示给用户
        context.workProcess.push(`\n🔄 **迭代 ${iteration}/${AgentExecutor.MAX_ITERATIONS}** (已执行 ${Math.floor(elapsedTime / 1000)}秒)`)

        // 调用 LLM（传递迭代信息）
        const iterationStartTime = Date.now()
        const llmResponse = await AgentExecutor.callLLM(
          processedMessages,
          context.llmConnection,
          context.agent.systemMessage,
          tools,
          context,
          iteration // 传递当前迭代次数
        )
        const iterationLLMTime = Date.now() - iterationStartTime
        // 性能日志：只在开发环境或需要调试时输出
        if (process.env.NODE_ENV === 'development' && process.env.DEBUG_AGENT === 'true') {
          console.log(`[AgentExecutor] Iteration ${iteration} LLM call: ${iterationLLMTime}ms (${(iterationLLMTime / 1000).toFixed(2)}s)`)
        }

        // 添加 LLM 响应到消息历史
        processedMessages.push(llmResponse.message)

        // 检查是否有工具调用
        if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
          // 检查总工具调用次数限制
          if (totalToolCalls >= AgentExecutor.MAX_TOTAL_TOOL_CALLS) {
            context.workProcess.push(`⚠️ **达到总工具调用次数限制 (${AgentExecutor.MAX_TOTAL_TOOL_CALLS})，停止执行**`)
            break
          }

              // 不显示工具调用详情给用户，只在内部记录
              context.workProcess.push(`🔧 **工具调用**: ${llmResponse.toolCalls.length} 个 (总调用: ${totalToolCalls}/${AgentExecutor.MAX_TOTAL_TOOL_CALLS})`)

          // 执行工具调用
          const toolCallsToExecute = llmResponse.toolCalls.slice(0, AgentExecutor.MAX_TOOL_CALLS_PER_ITERATION)
          for (const toolCall of toolCallsToExecute) {
            // 检查总工具调用次数限制
            if (totalToolCalls >= AgentExecutor.MAX_TOTAL_TOOL_CALLS) {
              context.workProcess.push(`⚠️ **达到总工具调用次数限制，跳过剩余工具调用**`)
              break
            }

            totalToolCalls++
            try {
              // 检查 SQL 查询次数限制
              const isSQLTool = toolCall.function.name.toLowerCase().includes('sql') || 
                                toolNameMap.get(toolCall.function.name)?.type === 'sql_query'
              
              if (isSQLTool && sqlQueryCount >= AgentExecutor.MAX_SQL_QUERIES) {
                throw new Error(`已达到 SQL 查询次数限制 (${AgentExecutor.MAX_SQL_QUERIES})。请优化查询策略，或向用户说明情况。`)
              }

              // 检查是否是重复查询（仅对 SQL 工具）
              let isDuplicateQuery = false
              let cachedResult = null
              if (isSQLTool && toolCall.function.arguments?.sql) {
                const sql = toolCall.function.arguments.sql.trim()
                const normalizedSQL = AgentExecutor.normalizeSQL(sql)
                
                // 检查缓存
                if (queryCache.has(normalizedSQL)) {
                  cachedResult = queryCache.get(normalizedSQL)
                  isDuplicateQuery = true
                  // 静默处理重复查询（减少日志）
                } else {
                  // 检查是否与之前的查询相似
                  for (const prevQuery of executedQueries) {
                    const similarity = AgentExecutor.calculateSQLSimilarity(normalizedSQL, AgentExecutor.normalizeSQL(prevQuery.sql))
                    if (similarity > 0.9) { // 90% 相似度
                      isDuplicateQuery = true
                      cachedResult = prevQuery.result
                      // 静默处理相似查询（减少日志）
                      break
                    }
                  }
                }
              }

              // 调试日志：只在开发环境且启用调试时输出
              if (process.env.NODE_ENV === 'development' && process.env.DEBUG_AGENT === 'true') {
                console.log('[AgentExecutor] Executing tool call:', {
                  toolName: toolCall.function.name,
                  arguments: toolCall.function.arguments,
                  totalToolCalls,
                  sqlQueryCount,
                  isDuplicateQuery,
                })
              }
              
              const toolExecutionStartTime = Date.now()
              let toolResult
              if (isDuplicateQuery && cachedResult) {
                // 使用缓存结果
                toolResult = cachedResult
                context.workProcess.push(`⚠️ **检测到重复查询，使用缓存结果**`)
              } else {
                // 执行工具
                toolResult = await AgentExecutor.executeTool(
                  toolCall,
                  context,
                  toolNameMap
                )
                const toolExecutionTime = Date.now() - toolExecutionStartTime
                // 性能日志：只在开发环境或需要调试时输出
                if (process.env.NODE_ENV === 'development' && process.env.DEBUG_AGENT === 'true') {
                  console.log(`[AgentExecutor] Tool "${toolCall.function.name}" execution: ${toolExecutionTime}ms (${(toolExecutionTime / 1000).toFixed(2)}s)`)
                }
                
                // 如果是 SQL 工具，缓存结果
                if (isSQLTool && toolResult.success && toolResult.result && toolCall.function.arguments?.sql) {
                  const sql = toolCall.function.arguments.sql.trim()
                  const normalizedSQL = AgentExecutor.normalizeSQL(sql)
                  queryCache.set(normalizedSQL, toolResult)
                  executedQueries.push({
                    sql: sql,
                    result: toolResult,
                    iteration: iteration,
                  })
                }
              }

              // 如果是 SQL 工具，增加计数
              if (isSQLTool) {
                sqlQueryCount++
                // 静默记录SQL查询计数（减少日志）
              }

              // 重置连续失败次数
              consecutiveFailures = 0

              toolCalls.push({
                toolName: toolCall.function.name,
                arguments: toolCall.function.arguments,
                result: toolResult,
              })

              // 判断结果是否满足用户需求（仅对 SQL 工具）
              let isResultSatisfied = false
              if (isSQLTool && toolResult.success && toolResult.result) {
                isResultSatisfied = AgentExecutor.isResultSatisfied(userQuestion, toolResult.result)
              }

              // 格式化工具结果，使其更易读
              let toolResultContent: string
              if (typeof toolResult === "string") {
                toolResultContent = toolResult
              } else if (toolResult && typeof toolResult === "object") {
                // 如果是 SQL 查询结果，格式化输出
                if (toolResult.success && toolResult.result) {
                  const result = toolResult.result
                  if (result.columns && result.rows) {
                    // 检测用户是否要求所有数据
                    const userQuestion = context.messages?.[context.messages.length - 1]?.content || ""
                    const lowerQuestion = userQuestion.toLowerCase()
                    const requiresAllData = lowerQuestion.includes('所有') ||
                                           lowerQuestion.includes('全部') ||
                                           lowerQuestion.includes('all') ||
                                           lowerQuestion.includes('列出所有') ||
                                           lowerQuestion.includes('显示所有') ||
                                           lowerQuestion.includes('list all') ||
                                           lowerQuestion.includes('show all')
                    
                    // 如果用户要求所有数据，返回完整数据；否则只返回前10行作为预览
                    const displayRows = requiresAllData ? result.rows : result.rows.slice(0, 10)
                    const totalRows = result.rowCount || result.rows.length
                    
                    // 分析数据特征，帮助智能体决定展示格式
                    const columns = result.columns || []
                    const hasTimeColumn = columns.some((col: string) => 
                      /date|time|month|year|quarter|week|day|created_at|updated_at|timestamp|日期|时间|月份|年份|季度|周|天/i.test(col)
                    )
                    const hasNumericColumn = displayRows.length > 0 && columns.some((col: string) => {
                      const sampleValue = displayRows[0]?.[col]
                      return typeof sampleValue === 'number' && isFinite(sampleValue)
                    })
                    const hasCategoryColumn = columns.some((col: string) => {
                      if (hasTimeColumn && /date|time|month|year|日期|时间|月份|年份/i.test(col)) {
                        return false
                      }
                      const uniqueValues = new Set(displayRows.map((row: any) => String(row[col] || '')).filter(Boolean))
                      return uniqueValues.size > 1 && uniqueValues.size <= Math.min(50, totalRows)
                    })
                    
                    // 格式化查询结果（简化版，隐藏计算过程）
                    // 只返回数据，不显示SQL和详细过程
                    const dataSummary: any = {
                      columns: result.columns,
                      rowCount: totalRows,
                      rows: displayRows,
                      isPartial: !requiresAllData && totalRows > 10
                    }
                    
                    // 添加数据特征提示，帮助智能体判断展示格式
                    dataSummary._dataFeatures = {
                      rowCount: totalRows,
                      columnCount: columns.length,
                      hasTimeColumn,
                      hasNumericColumn,
                      hasCategoryColumn,
                      // 建议的展示格式（仅供参考，智能体可以覆盖）
                      suggestedFormat: (() => {
                        // 单个数值结果 → 文本
                        if (totalRows === 1 && columns.length <= 2 && hasNumericColumn) {
                          return 'text'
                        }
                        // 时间序列数据 → 图表
                        if (hasTimeColumn && hasNumericColumn && totalRows >= 2 && totalRows <= 1000) {
                          return 'chart'
                        }
                        // 分类对比数据 → 图表
                        if (hasCategoryColumn && hasNumericColumn && totalRows >= 2 && totalRows <= 100) {
                          return 'chart'
                        }
                        // 大量数据或多字段 → 表格
                        if (totalRows > 1000 || columns.length >= 5) {
                          return 'table'
                        }
                        // 默认表格
                        return 'table'
                      })()
                    }
                    
                    toolResultContent = JSON.stringify(dataSummary, null, 2)
                    
                    // 添加数据特征分析提示（作为注释，帮助智能体理解）
                    const featureHint = `\n\n[数据特征分析]
- 数据行数: ${totalRows}
- 字段数: ${columns.length}
- 包含时间字段: ${hasTimeColumn ? '是' : '否'}
- 包含数值字段: ${hasNumericColumn ? '是' : '否'}
- 包含分类字段: ${hasCategoryColumn ? '是' : '否'}
- 建议展示格式: ${dataSummary._dataFeatures.suggestedFormat}（可根据用户意图调整）

请根据数据特征和用户意图，决定返回格式：
- 如果适合图表（时间序列、分类对比、少量聚合数据），返回包含 visualization 字段的响应
- 如果适合表格（原始数据、详细记录、大量数据），只返回查询结果，不包含 visualization 字段
- 如果适合文本（单个数值、简单统计），只返回文本描述，不包含 visualization 字段`
                    
                    toolResultContent += featureHint
                    
                    // 只在内部记录完成消息，不传递给LLM
                    if (isSQLTool) {
                      const completionMsg = this.getQueryCompletionMessage(toolResult, isDuplicateQuery, isResultSatisfied, sqlQueryCount)
                      if (completionMsg) {
                        // 只在workProcess中记录，不添加到消息内容
                        if (isResultSatisfied) {
                          context.workProcess.push('✅ 查询结果已满足用户需求')
                        }
                        if (isDuplicateQuery) {
                          context.workProcess.push('⚠️ 检测到重复查询，使用缓存结果')
                        }
                      }
                    }
                  } else {
                    toolResultContent = JSON.stringify(toolResult, null, 2)
                  }
                } else {
                  toolResultContent = JSON.stringify(toolResult, null, 2)
                }
              } else {
                toolResultContent = JSON.stringify(toolResult, null, 2)
              }

              // 添加工具结果到消息历史
              processedMessages.push({
                role: "tool",
                content: toolResultContent,
                tool_call_id: toolCall.id,
              })

              context.workProcess.push(`✅ **${toolCall.function.name}**: 执行成功`)
            } catch (error: any) {
              const errorMessage = error.message || "未知错误"
              consecutiveFailures++
              context.workProcess.push(`❌ **${toolCall.function.name}**: 执行失败 - ${errorMessage} (连续失败: ${consecutiveFailures}/${AgentExecutor.MAX_CONSECUTIVE_FAILURES})`)

              // 检查连续失败次数
              if (consecutiveFailures >= AgentExecutor.MAX_CONSECUTIVE_FAILURES) {
                context.workProcess.push(`⚠️ **连续失败 ${AgentExecutor.MAX_CONSECUTIVE_FAILURES} 次，停止执行**`)
                
                const stopMessage = `工具执行连续失败 ${AgentExecutor.MAX_CONSECUTIVE_FAILURES} 次，已停止执行。请检查：
1. 数据库连接是否正常
2. SQL 语句是否正确
3. 工具配置是否完整

最后错误: ${errorMessage}`
                
                processedMessages.push({
                  role: "tool",
                  content: stopMessage,
                  tool_call_id: toolCall.id,
                })
                
                // 强制退出循环
                break
              }

              // 记录详细错误日志
              console.error('[AgentExecutor] Tool execution error:', {
                toolName: toolCall.function.name,
                toolId: toolCall.id,
                arguments: toolCall.function.arguments,
                error: errorMessage,
                stack: error.stack,
                hasDatabaseConnection: !!context.databaseConnection,
                databaseType: context.databaseConnection?.type,
                databaseName: context.databaseConnection?.database,
              })

              // 分析错误类型，判断是否可恢复
              const isRecoverableError = this.isRecoverableError(errorMessage)
              const errorCategory = this.categorizeError(errorMessage)
              
              // 统计相同错误的出现次数
              const sameErrorCount = toolCalls.filter(tc => 
                tc.result && 
                typeof tc.result === 'object' && 
                tc.result.error && 
                tc.result.error.includes(errorCategory)
              ).length

              let suggestions = []
              let shouldRetry = false
              
              if (errorMessage.includes("未配置数据库连接") || errorMessage.includes("数据库连接配置不完整")) {
                // 系统级错误，不可恢复
                suggestions.push("这是系统配置问题，无法通过修改 SQL 解决")
                suggestions.push("请检查智能体是否配置了数据库连接")
                shouldRetry = false
              } else if (errorMessage.includes("连接失败") || errorMessage.includes("ECONNREFUSED") || errorMessage.includes("Access denied")) {
                // 数据库连接错误，不可恢复
                suggestions.push("这是数据库连接问题，无法通过修改 SQL 解决")
                suggestions.push("请检查数据库服务器是否运行，连接配置是否正确")
                shouldRetry = false
              } else if (errorMessage.includes("SQL 查询包含敏感字段")) {
                // 安全限制，不可恢复（但可以修正 SQL）
                suggestions.push("SQL 中包含密码相关字段，这是安全限制")
                suggestions.push("请修改 SQL，移除所有密码相关字段（password, pwd, passwd 等）")
                shouldRetry = sameErrorCount < 2 // 最多重试 2 次
              } else if (errorMessage.includes("SQL 验证失败") || errorMessage.includes("语法")) {
                // SQL 语法错误，可恢复
                suggestions.push("检查 SQL 语句语法是否正确")
                suggestions.push("确保只使用 SELECT 语句（不允许 INSERT、UPDATE、DELETE）")
                shouldRetry = sameErrorCount < 3 // 最多重试 3 次
              } else if (errorMessage.includes("不存在") || errorMessage.includes("doesn't exist")) {
                // 表或字段不存在，可恢复
                suggestions.push("检查表名和字段名是否正确（注意大小写）")
                suggestions.push("查看数据库结构信息，使用正确的表名和字段名")
                shouldRetry = sameErrorCount < 3 // 最多重试 3 次
              } else {
                // 其他错误，谨慎重试
                suggestions.push("检查 SQL 语句是否正确")
                suggestions.push("确认数据库连接是否正常")
                shouldRetry = sameErrorCount < 2 // 最多重试 2 次
              }

              // 添加详细的错误信息到消息历史，帮助 LLM 理解问题
              let errorContent = `工具执行失败。

错误信息: ${errorMessage}

错误类型: ${errorCategory}
${isRecoverableError ? '✅ 可恢复错误（可以通过修正 SQL 解决）' : '❌ 系统级错误（无法通过修改 SQL 解决）'}

可能的原因：
${suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}`

              if (shouldRetry && isRecoverableError) {
                errorContent += `

建议操作：
1. 仔细阅读错误信息，理解问题所在
2. 检查 SQL 语句和数据库结构
3. 修正 SQL 语句后，可以再次调用工具重试
4. 如果已经尝试多次仍然失败，请向用户说明情况并提供建议

⚠️ 注意：如果这是系统级错误（如数据库连接问题），请不要重试，直接向用户说明情况。`
              } else {
                errorContent += `

⚠️ 这是系统级错误，无法通过修改 SQL 解决。请直接向用户说明情况，不要重试。

建议：
1. 向用户说明这是系统配置或连接问题
2. 建议用户检查数据库连接配置
3. 不要尝试修改 SQL 或重试工具调用`
              }

              // 记录错误到工具调用历史
              toolCalls.push({
                toolName: toolCall.function.name,
                arguments: toolCall.function.arguments,
                result: {
                  success: false,
                  error: errorMessage,
                  errorCategory,
                  isRecoverable: isRecoverableError,
                  shouldRetry,
                },
              })

              currentMessages.push({
                role: "tool",
                content: errorContent,
                tool_call_id: toolCall.id,
              })
            }
          }

          // 检查是否应该继续循环
          if (consecutiveFailures >= AgentExecutor.MAX_CONSECUTIVE_FAILURES) {
            // 连续失败次数过多，强制退出
            break
          }

          // 检查是否已经执行了 SQL 查询，如果是，强制停止迭代
          const hasSuccessfulSQLQuery = toolCalls.some(tc => {
            const isSQL = tc.toolName.toLowerCase().includes('sql') || 
                         toolNameMap.get(tc.toolName)?.type === 'sql_query'
            return isSQL && tc.result && typeof tc.result === 'object' && tc.result.success
          })
          
          if (hasSuccessfulSQLQuery) {
            context.workProcess.push(`✅ **已执行 SQL 查询，停止迭代，生成最终回答**`)
            
            // 调用 LLM 生成最终回答（不传递工具，强制生成回答）
            const finalResponse = await AgentExecutor.callLLM(
              currentMessages,
              context.llmConnection,
              context.agent.systemMessage,
              [], // 不传递工具，强制生成回答
              context,
              iteration
            )
            
            const executionTime = Date.now() - startTime
            const executionSeconds = Math.floor(executionTime / 1000)
            context.workProcess.push(`✅ **Agent 执行完成** (${executionSeconds}秒)`)
            context.workProcess.push(`📊 **统计**: 迭代 ${iteration} 次，工具调用 ${totalToolCalls} 次，SQL 查询 ${sqlQueryCount} 次`)
            
            return {
              success: true,
              message: finalResponse.message.content || "未生成响应",
              toolCalls,
              workProcess: context.workProcess,
            }
          }

          // 继续循环，让 LLM 基于工具结果继续处理
          continue
        } else {
          // 没有工具调用，说明 LLM 已经生成最终回答
          const executionTime = Date.now() - startTime
          const executionSeconds = Math.floor(executionTime / 1000)
          context.workProcess.push(`✅ **Agent 执行完成** (${executionSeconds}秒)`)
          context.workProcess.push(`📊 **统计**: 迭代 ${iteration} 次，工具调用 ${totalToolCalls} 次，SQL 查询 ${sqlQueryCount} 次`)
          
          return {
            success: true,
            message: llmResponse.message.content || "未生成响应",
            toolCalls,
            workProcess: context.workProcess,
          }
        }
      }

      // 达到最大迭代次数或执行时间限制
      const executionTime = Date.now() - startTime
      const executionSeconds = Math.floor(executionTime / 1000)
      if (executionTime >= AgentExecutor.MAX_EXECUTION_TIME) {
        context.workProcess.push(`⚠️ **执行时间达到限制 (${executionSeconds}秒)，停止执行**`)
      } else {
        context.workProcess.push(`⚠️ **达到最大迭代次数 (${AgentExecutor.MAX_ITERATIONS})，停止执行**`)
      }
      context.workProcess.push(`📊 **统计**: 迭代 ${iteration} 次，工具调用 ${totalToolCalls} 次，SQL 查询 ${sqlQueryCount} 次，耗时 ${executionSeconds}秒`)
      
      return {
        success: false,
        message: processedMessages[processedMessages.length - 1]?.content || "执行超时",
        toolCalls,
        workProcess: context.workProcess,
        error: `达到最大迭代次数 (${iteration}/${AgentExecutor.MAX_ITERATIONS})，工具调用 ${totalToolCalls} 次`,
      }
    } catch (error: any) {
      context.workProcess.push(`❌ **Agent 执行错误**: ${error.message}`)
      
      return {
        success: false,
        message: error.message || "Agent 执行失败",
        toolCalls,
        workProcess: context.workProcess,
        error: error.message,
      }
    }
  }

  /**
   * 清理工具名称，确保符合 OpenAI Function Calling 命名规范
   * 规范：只能包含字母、数字、下划线和连字符 (^[a-zA-Z0-9_-]+$)
   * @param name 工具名称
   * @param toolId 工具ID，用作后备（当名称为空时）
   */
  private static sanitizeToolName(name: string, toolId?: string): string {
    // 如果名称为空，使用工具 ID 作为后备
    if (!name || name.trim() === '') {
      if (toolId) {
        // 清理 toolId，确保符合规范
        const sanitizedId = toolId
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .replace(/_{2,}/g, '_')
          .replace(/^_+|_+$/g, '')
          .substring(0, 60) // 留出 "tool_" 前缀的空间
        return `tool_${sanitizedId || 'unknown'}`
      }
      throw new Error('工具名称不能为空，且必须提供 toolId')
    }
    
    // 清理名称
    const sanitized = name
      .replace(/[^a-zA-Z0-9_-]/g, '_') // 将不符合规范的字符替换为下划线
      .replace(/_{2,}/g, '_') // 将多个连续的下划线合并为一个
      .replace(/^_+|_+$/g, '') // 移除开头和结尾的下划线
      .substring(0, 64) // OpenAI 限制函数名最长 64 字符
    
    // 如果清理后为空，使用工具 ID 作为后备
    if (!sanitized || sanitized.trim() === '') {
      if (toolId) {
        const sanitizedId = toolId
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .replace(/_{2,}/g, '_')
          .replace(/^_+|_+$/g, '')
          .substring(0, 60)
        return `tool_${sanitizedId || 'unknown'}`
      }
      throw new Error('工具名称清理后为空，且必须提供 toolId')
    }
    
    return sanitized
  }

  /**
   * 处理消息历史：如果历史太长，生成摘要
   */
  private static processMessageHistory(
    messages: Array<{ role: "system" | "user" | "assistant" | "tool"; content: string; tool_call_id?: string; tool_calls?: any[] }>,
    originalLength: number
  ): Array<{ role: "system" | "user" | "assistant" | "tool"; content: string; tool_call_id?: string; tool_calls?: any[] }> {
    const MAX_MESSAGES = 20 // 最大消息数量，超过则摘要
    
    if (messages.length <= MAX_MESSAGES) {
      return messages
    }
    
    // 保留系统消息和最近的对话
    const systemMessages = messages.filter(m => m.role === "system")
    const recentMessages = messages.slice(-MAX_MESSAGES + systemMessages.length)
    
    // 生成摘要
    const summaryMessage = {
      role: "system" as const,
      content: `[消息历史摘要] 已省略 ${originalLength - recentMessages.length - systemMessages.length} 条历史消息，保留最近 ${recentMessages.length - systemMessages.length} 条关键消息。`,
    }
    
    return [...systemMessages, summaryMessage, ...recentMessages.slice(systemMessages.length)]
  }

  /**
   * 生成默认工具描述
   */
  private static generateDefaultToolDescription(tool: AgentTool): string {
    switch (tool.type) {
      case "sql_query":
        const sqlConfig = tool.config as any
        if (sqlConfig?.sql) {
          return `执行SQL查询获取数据。适用于需要从数据库查询信息的场景。参数：sql（SQL查询语句，仅支持SELECT），limit（可选，返回结果数量限制）。此工具会执行SQL查询并返回查询结果，包括列名和行数据。`
        }
        return `执行SQL查询获取数据。适用于需要从数据库查询信息的场景。参数：sql（SQL查询语句，仅支持SELECT），limit（可选，返回结果数量限制）。此工具会执行SQL查询并返回查询结果，包括列名和行数据。必须使用此工具来实际执行查询，不要只提供SQL建议。`
      
      case "http_request":
        const httpConfig = tool.config as any
        const method = httpConfig?.method || "GET"
        const defaultUrl = httpConfig?.url || ""
        return `发送HTTP请求获取数据或执行操作。适用于需要调用外部API或服务的场景。参数：url（请求URL${defaultUrl ? `，默认: ${defaultUrl}` : ""}），method（HTTP方法，默认: ${method}），headers（可选，请求头），body（可选，请求体）。此工具会发送HTTP请求并返回响应数据。`
      
      case "code_execution":
        return `执行代码片段。适用于需要进行计算、数据处理或执行特定逻辑的场景。参数：code（要执行的代码），language（代码语言：python或javascript）。此工具会在安全环境中执行代码并返回执行结果。`
      
      default:
        return `${tool.name || tool.type}工具。用于执行特定操作或获取数据。请根据工具名称和配置判断其用途。`
    }
  }

  /**
   * 检查工具描述是否足够详细
   */
  private static isToolDescriptionDetailed(description: string | undefined | null): boolean {
    if (!description || description.trim().length === 0) {
      return false
    }
    // 如果描述太短（少于20个字符）或只是简单的类型名称，认为不够详细
    if (description.trim().length < 20) {
      return false
    }
    // 如果描述只是简单的"xxx工具"，认为不够详细
    if (description.trim().endsWith("工具") && description.trim().length < 30) {
      return false
    }
    return true
  }

  /**
   * 转换工具为 Function Calling 格式
   */
  private static convertToolsToFunctionCalling(tools: AgentTool[]): any[] {
    return tools
      .filter((tool) => tool.enabled)
      .map((tool) => {
        // 清理工具名称，确保符合 OpenAI 命名规范（传递 toolId 作为后备）
        const sanitizedName = this.sanitizeToolName(tool.name, tool.id)
        
        // 如果工具描述为空或不够详细，生成默认描述
        let description = tool.description
        if (!this.isToolDescriptionDetailed(description)) {
          description = this.generateDefaultToolDescription(tool)
        }
        
        const functionDef: any = {
          type: "function",
          function: {
            name: sanitizedName,
            description: description,
          },
        }

        // 根据工具类型生成参数定义
        switch (tool.type) {
          case "sql_query":
            functionDef.function.parameters = {
              type: "object",
              properties: {
                sql: {
                  type: "string",
                  description: "要执行的SQL查询语句（仅支持SELECT）",
                },
                limit: {
                  type: "number",
                  description: "返回结果数量限制（可选）",
                },
              },
              required: ["sql"],
            }
            break

          case "http_request":
            const httpConfig = tool.config as any
            functionDef.function.parameters = {
              type: "object",
              properties: {
                url: {
                  type: "string",
                  description: httpConfig.url ? `请求URL（默认: ${httpConfig.url}）` : "请求URL",
                },
                method: {
                  type: "string",
                  enum: ["GET", "POST", "PUT", "DELETE", "PATCH"],
                  description: `HTTP方法（默认: ${httpConfig.method || "GET"}）`,
                },
                headers: {
                  type: "object",
                  description: "HTTP请求头（可选）",
                },
                body: {
                  type: "string",
                  description: "请求体（可选）",
                },
              },
              required: ["url"],
            }
            break

          case "code_execution":
            functionDef.function.parameters = {
              type: "object",
              properties: {
                code: {
                  type: "string",
                  description: "要执行的代码",
                },
                language: {
                  type: "string",
                  enum: ["python", "javascript"],
                  description: "代码语言",
                },
              },
              required: ["code", "language"],
            }
            break

          default:
            // 自定义工具，尝试从配置中提取参数
            const customConfig = tool.config as any
            if (customConfig.parameters) {
              functionDef.function.parameters = {
                type: "object",
                properties: {},
                required: [],
              }
              for (const param of customConfig.parameters) {
                functionDef.function.parameters.properties[param.name] = {
                  type: param.type || "string",
                  description: param.description || param.name,
                }
                if (param.required) {
                  functionDef.function.parameters.required.push(param.name)
                }
              }
            } else {
              functionDef.function.parameters = {
                type: "object",
                properties: {
                  input: {
                    type: "string",
                    description: "工具输入",
                  },
                },
                required: ["input"],
              }
            }
        }

        return functionDef
      })
  }

  /**
   * 调用 LLM
   */
  private static async callLLM(
    messages: any[],
    llmConnection: any, // LLMConnection 类型
    systemMessage: string,
    tools: any[],
    context: AgentContext,
    iteration?: number // 当前迭代次数
  ): Promise<{
    message: any
    toolCalls?: any[]
  }> {
    // 准备模板变量上下文
    const templateContext: any = {
      userInput: messages[messages.length - 1]?.content || "",
      databaseName: context.databaseConnection?.database || "",
      databaseType: context.databaseConnection?.type || "MySQL",
    }

    // 格式化数据库 schema（如果有）
    if (context.databaseSchema && context.databaseSchema.length > 0) {
      const formattedSchema = formatDatabaseSchema(context.databaseSchema)
      templateContext.databaseSchema = formattedSchema
      templateContext.schemaText = formattedSchema
    }

    // 处理系统消息（支持模板变量）
    let processedSystemMessage = systemMessage || "你是一个智能助手，可以帮助用户完成各种任务。你可以使用工具来获取信息或执行操作。"
    
    // 如果系统消息包含模板变量，进行替换
    if (processedSystemMessage.includes("{{")) {
      processedSystemMessage = replaceTemplateVariables(processedSystemMessage, templateContext)
    }

    // 构建系统消息
    const systemMessages = [
      {
        role: "system" as const,
        content: processedSystemMessage,
      },
    ]

    // 如果有数据库连接，添加数据库信息
    if (context.databaseConnection) {
      const dbInfo = `\n\n# 数据库信息
- 数据库类型: ${context.databaseConnection.type || "MySQL"}
- 数据库名称: ${context.databaseConnection.database || ""}`

      // 如果有 schema，添加到系统消息
      if (templateContext.databaseSchema && templateContext.databaseSchema.trim().length > 0) {
        const schemaText = templateContext.databaseSchema.trim()
        // 检查 schema 是否包含实际内容（不只是警告信息）
        if (!schemaText.includes("未提供") && !schemaText.includes("没有表")) {
          systemMessages[0].content += dbInfo + `\n\n# 数据库结构\n${schemaText}\n\n## 🚨 重要：必须使用数据库结构中的表和字段\n\n- **只能使用上述数据库结构中存在的表和字段**\n- 不要假设字段存在，必须根据提供的数据库结构来生成 SQL\n- 字段名必须与数据库结构中的完全一致（注意大小写）\n- 如果数据库结构中没有相关信息，明确告知用户\n\n## 使用示例\n\n假设数据库结构中有表 \`users\`，包含字段 \`id\`, \`name\`, \`email\`：\n- ✅ 正确：\`SELECT id, name FROM users\`\n- ❌ 错误：\`SELECT user_id, username FROM users\`（字段名不存在）`
        } else {
          systemMessages[0].content += dbInfo + `\n\n⚠️ **警告：数据库结构信息未提供或为空**\n\n**影响**：\n- 无法准确生成 SQL 查询\n- 可能使用不存在的表名或字段名\n- 查询可能失败\n\n**建议**：\n- 请确保数据库连接配置正确\n- 检查数据库结构信息是否已加载\n- 如果问题持续，请检查数据库连接状态`
        }
      } else {
        systemMessages[0].content += dbInfo + `\n\n⚠️ **警告：数据库结构信息未提供**\n\n**影响**：\n- 无法准确生成 SQL 查询\n- 可能使用不存在的表名或字段名\n- 查询可能失败\n\n**建议**：\n- 请确保数据库连接配置正确\n- 检查数据库结构信息是否已加载\n- 如果问题持续，请检查数据库连接状态\n\n**注意**：在没有数据库结构信息的情况下，请谨慎生成查询，并明确告知用户可能的风险。`
      }
    }

    // 如果有工具，添加工具使用说明
    if (tools.length > 0) {
      systemMessages[0].content += `\n\n# 可用工具\n你可以使用以下工具：
${tools.map((t) => `- **${t.function.name}**: ${t.function.description}`).join("\n")}

## 🚨 重要：工具使用规则（必须遵守）

### 1. 必须使用工具执行查询
- **绝对不要**只提供 SQL 建议而不执行
- **必须**调用工具来实际执行 SQL 查询
- 用户需要的是**实际数据**，不是 SQL 示例

### 2. 工具调用流程
1. 分析用户需求，确定需要查询的数据
2. **立即调用工具**执行 SQL 查询（不要只提供 SQL 建议）
3. 根据数据库结构生成正确的 SQL 语句
4. **调用工具执行查询**（这是必须的步骤）
5. 分析工具返回的结果
6. **基于实际查询结果回答用户问题**

### 3. SQL 查询生成规则
- **必须使用数据库结构中存在的表和字段**
- 不要假设字段存在，必须根据提供的数据库结构来生成 SQL
- 如果数据库结构中没有相关信息，明确告知用户
- **🚨 绝对禁止查询密码相关字段**：
  - 不要查询任何包含 "password"、"pwd"、"passwd"、"pass"、"secret"、"token" 等关键词的字段
  - 不要查询中文密码字段（如"密码"、"口令"、"密钥"等）
  - 如果使用 SELECT *，系统会自动过滤密码字段，但建议明确指定需要的字段，避免 SELECT *
  - 如果 SQL 中包含密码字段，工具会拒绝执行并报错

### 4. 工具执行失败处理
- 如果工具执行失败，仔细阅读错误信息
- 分析错误原因（SQL 语法错误、表不存在、字段不存在等）
- 修正 SQL 后重新调用工具
- **不要**因为一次失败就放弃，应该尝试修正

### 5. 回答格式要求
- 工具执行成功后，**直接使用查询结果回答用户问题**
- 不要只说"可以这样查询"，而要**实际执行查询并给出结果**
- 例如：用户问"有多少销售人员"，应该调用工具查询后回答"我们共有 X 名销售人员"

## 示例对比

**❌ 错误做法**：
用户："我们有多少销售人员？"
回答："可以这样查询：SELECT COUNT(*) FROM users WHERE role = 'sales'"

**✅ 正确做法**：
用户："我们有多少销售人员？"
1. 调用工具：execute_sql_query({sql: "SELECT COUNT(*) as count FROM users WHERE role = 'sales'"})
2. 工具返回：{count: 15}
3. 回答："我们共有 15 名销售人员"
- SQL 语句必须符合数据库语法（${context.databaseConnection?.type || "MySQL"}）

### 4. 工具执行结果处理
- 工具执行成功后，会返回查询结果（包括列名、行数据等）
- 仔细分析结果数据，提取关键信息
- 基于实际数据回答用户问题，不要编造数据
- 如果结果为空，明确告知用户
- **注意**：系统会自动过滤结果中的密码字段，即使 SQL 中包含了密码字段，结果中也不会显示

### 5. 错误处理
- **如果工具执行失败，不要放弃！**
- 仔细阅读错误信息，分析失败原因
- 常见原因：
  - SQL 语法错误：检查 SQL 语句是否符合数据库语法
  - 表名或字段名不存在：检查数据库结构，使用正确的名称
  - 数据库连接问题：这通常是系统问题，可以告知用户
- **根据错误信息修正 SQL 后，可以再次调用工具**
- 如果多次尝试都失败，向用户说明情况并提供建议

### 5. 工具执行失败处理（智能判断）
- **首先判断错误类型**：
  - ✅ **可恢复错误**（可以通过修正 SQL 解决）：
    - SQL 语法错误
    - 表名或字段名不存在
    - SQL 包含敏感字段（可以移除后重试）
    - → 可以修正 SQL 后重试，但最多重试 2-3 次
  
  - ❌ **系统级错误**（无法通过修改 SQL 解决）：
    - 数据库连接配置不完整
    - 数据库连接失败
    - 数据库权限错误（Access denied）
    - → **不要重试**，直接向用户说明情况

- **重试策略**：
  - 对于可恢复错误，最多重试 2-3 次
  - 如果已经尝试多次仍然失败，停止重试，向用户说明情况
  - 对于系统级错误，**不要重试**，直接说明问题
  - **不要**因为一次失败就盲目重试，要分析错误类型

### 6. 错误处理示例

**场景 1：可恢复错误 - 表不存在**
1. 收到错误："表 'users' 不存在"
2. 分析：这是可恢复错误，可能是表名大小写问题
3. 检查数据库结构，找到正确的表名
4. 修正 SQL：使用正确的表名
5. **重新调用工具执行修正后的 SQL**（最多重试 3 次）
6. 如果 3 次后仍然失败，停止重试，向用户说明情况

**场景 2：可恢复错误 - SQL 语法错误**
1. 收到错误："SQL 语法错误：near 'FROM'"
2. 分析：这是可恢复错误，SQL 语句不完整
3. 修正 SQL：补全 SELECT 语句
4. **重新调用工具执行修正后的 SQL**（最多重试 3 次）

**场景 3：系统级错误 - 数据库连接失败**
1. 收到错误："Access denied for user 'root'@'localhost'"
2. 分析：这是系统级错误，无法通过修改 SQL 解决
3. **不要重试**，直接向用户说明：
   "数据库连接权限问题，无法执行查询。请检查数据库连接配置。"

### 7. 安全规则（必须严格遵守）
- **🚨 绝对禁止查询密码相关字段**
  - 不要在任何 SQL 查询中包含密码相关字段（password, pwd, passwd, secret, token, 密码, 口令等）
  - 如果用户要求查询密码，明确拒绝并说明这是安全限制
  - 系统会自动过滤查询结果中的密码字段，但最好在 SQL 生成时就避免查询这些字段
  - 如果 SQL 中包含密码字段，工具会拒绝执行并报错
- **所有用户都可以查询所有表**（已取消权限限制）
- 但必须遵守密码字段禁止规则

### 8. 何时应该停止迭代（智能判断）

**核心原则：智能判断是否需要继续查询**

1. **查询成功后的判断标准**：
   - ✅ **如果查询结果已经完整回答了用户问题**：应该停止迭代，生成最终回答
   - ✅ **如果查询失败（可恢复错误）**：可以修正 SQL 后重试，但最多重试 2-3 次
   - ⚠️ **如果需要关联其他表的数据**：可以继续查询，但要有明确目的（最多不超过 3 次查询）
   - ❌ **不要为了"优化"或"格式化"而重复查询相同的数据**
   - ❌ **不要执行相同或相似的查询**

2. **允许多次查询的情况**：
   - ✅ 第一次查询失败，需要修正 SQL 后重试
   - ✅ 需要先查询 schema 信息，再执行实际查询
   - ✅ 需要分步查询（先查基础数据，再查关联数据）
   - ✅ 需要关联多个表的数据（但要有明确目的）

3. **禁止的情况**：
   - ❌ **禁止重复查询**：如果查询结果相同，不要再次查询
   - ❌ **禁止为了优化而查询**：如果只是需要格式化，不要重新查询
   - ❌ **禁止无意义的多次查询**：如果已有结果可以回答用户问题，不要继续查询

**重要原则**：
- ✅ **智能判断**：根据查询结果和用户需求，智能判断是否需要继续查询
- ✅ **避免重复**：不要执行相同或相似的查询
- ✅ **及时停止**：如果查询结果已经满足用户需求，立即停止迭代并生成最终回答
- ⚠️ **合理多次查询**：只有在确实需要补充关键信息时，才考虑执行额外查询（最多不超过 3 次）

### 9. 重要提示
- **必须实际调用工具执行查询，不要只提供 SQL 示例**
- **工具执行失败时，智能判断是否需要重试**：
  - 可恢复错误（SQL 语法、表名错误等）：可以重试，但最多 2-3 次
  - 系统级错误（连接失败、权限问题等）：不要重试，直接说明问题
- **避免无限重试**：如果已经尝试多次仍然失败，停止重试，向用户说明情况
- **避免重复迭代**：如果查询结果已经满足需求，立即停止迭代，生成最终回答
- 工具调用是自动的，你只需要在需要时调用工具
- 工具执行结果会直接提供给你，你不需要手动处理
- 基于实际查询结果回答用户，确保答案准确可靠`

    } // 结束 if (tools.length > 0)

    // 添加数据展示格式区分说明
    systemMessages[0].content += `\n\n## 📊 数据展示格式区分（重要）

你必须准确理解用户要求的数据展示格式，并返回相应的格式：

### 1. 图表（Chart/Visualization）
- **关键词**：图表、chart、可视化、visualization、柱状图、折线图、饼图、面积图、散点图、雷达图、仪表盘、漏斗图、热力图等
- **要求**：必须返回 visualization 字段，包含图表类型和数据
- **格式**：
  \`\`\`json
  {
    "visualization": {
      "type": "bar|line|pie|area|scatter|radar|gauge|funnel|heatmap|...",
      "title": "图表标题",
      "data": [
        {"name": "类别1", "value": 100},
        {"name": "类别2", "value": 200}
      ]
    }
  }
  \`\`\`
- **注意**：即使查询结果为空，也要返回 visualization 字段（data 为空数组）

### 2. 表格（Table）
- **关键词**：表格、table、列表、list、数据表、以表格形式、用表格展示
- **要求**：**绝对不要**返回 visualization 字段，只返回查询结果
- **格式**：只返回 SQL 查询结果，不包含 visualization 字段
- **注意**：如果用户明确要求"表格"，即使数据适合图表，也不要返回 visualization 字段

### 3. 报表/报告（Report）
- **关键词**：报表、报告、report、分析报告、生成报表、创建报表、制作报表、生成报告、创建报告、制作报告
- **要求**：返回完整的分析报告，包含 aiReport 字段
- **格式**：
  \`\`\`json
  {
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
- **注意**：报表/报告是完整的分析文档，包含多个图表、数据摘要、分析结论等

### 判断规则（按优先级）

**第一步：检查用户明确要求**
1. **最高优先级**：如果用户明确要求"图表"或"可视化"，必须返回 visualization 字段
2. **最高优先级**：如果用户明确要求"表格"或"列表"，绝对不要返回 visualization 字段
3. **最高优先级**：如果用户要求"报表"或"报告"，返回 aiReport 字段

**第二步：如果用户没有明确要求，根据数据特征智能判断**

在收到工具执行结果后，你需要分析查询结果的数据特征，然后决定展示格式：

#### 📊 适合用图表展示的数据特征：
1. **时间序列数据**（有日期/时间字段）
   - 数据行数：1-1000 行
   - 字段：包含日期/时间字段 + 至少1个数值字段
   - 示例：销售趋势、月度统计、年度对比
   - **返回格式**：包含 visualization 字段，类型为 line 或 area

2. **分类对比数据**（类别+数值）
   - 数据行数：2-50 行（饼图），2-100 行（柱状图）
   - 字段：1个分类字段 + 至少1个数值字段
   - 示例：各产品销量、各地区收入、各状态订单数
   - **返回格式**：包含 visualization 字段，类型为 bar 或 pie

3. **聚合统计结果**（少量数据）
   - 数据行数：1-20 行
   - 字段：分类字段 + 聚合数值（COUNT、SUM、AVG等）
   - 示例：各分类统计、TOP N 排行
   - **返回格式**：包含 visualization 字段

4. **趋势分析数据**
   - 用户问题包含：趋势、变化、走势、对比、比较、分析等关键词
   - 数据行数：2-100 行
   - **返回格式**：包含 visualization 字段

#### 📋 适合用表格展示的数据特征：
1. **原始数据查询**（SELECT * FROM table）
   - 字段数：3个或更多
   - 数据行数：任意
   - 示例：查询所有员工、查询所有订单
   - **返回格式**：只返回查询结果，不包含 visualization 字段

2. **详细记录列表**
   - 数据行数：任意
   - 字段：包含多个文本字段（姓名、地址、备注等）
   - 示例：客户列表、员工列表、产品列表
   - **返回格式**：只返回查询结果，不包含 visualization 字段

3. **大量数据**（超过1000行）
   - 即使数据适合图表，如果行数超过1000，优先使用表格
   - **返回格式**：只返回查询结果，不包含 visualization 字段

4. **复杂数据结构**
   - 字段数：5个或更多
   - 包含大量文本字段
   - **返回格式**：只返回查询结果，不包含 visualization 字段

#### 📝 适合用文本展示的数据特征：
1. **单个数值结果**
   - 数据行数：1 行
   - 字段数：1-2 个字段
   - 示例：总销售额、总订单数、平均价格
   - **返回格式**：只返回文本描述，不包含 visualization 字段，也不强调表格

2. **空结果或错误**
   - 查询结果为空
   - **返回格式**：只返回文本说明，不包含 visualization 字段

3. **简单聚合结果**（单个统计值）
   - 数据行数：1 行
   - 字段：1个聚合字段（如 COUNT(*), SUM(amount)）
   - **返回格式**：只返回文本描述

#### 🔍 判断流程：
1. **收到工具执行结果后**，先分析数据特征：
   - 检查数据行数（rowCount）
   - 检查字段列表（columns）
   - 检查字段类型（是否有日期、数值、文本）
   - 检查用户问题意图（是否包含分析、对比、趋势等关键词）

2. **根据数据特征决定展示格式**：
   - 如果数据适合图表 → 返回包含 visualization 字段的响应
   - 如果数据适合表格 → 只返回查询结果，不包含 visualization 字段
   - 如果数据适合文本 → 只返回文本描述，不包含 visualization 字段

3. **在响应中明确说明**：
   - 如果返回图表，在文本中说明："已为您生成图表展示"
   - 如果返回表格，在文本中说明："查询结果如下"
   - 如果返回文本，直接给出数值和说明

### 常见错误示例（禁止）
- ❌ 用户要求"表格"，但返回了 visualization 字段
- ❌ 用户要求"图表"，但没有返回 visualization 字段
- ❌ 用户要求"报表"，但只返回了单个图表或表格
- ❌ 混淆"图表"和"表格"的概念

### 正确示例
- ✅ 用户："用图表展示销售趋势" → 返回包含 visualization 字段的响应
- ✅ 用户："以表格形式显示所有订单" → 只返回查询结果，不包含 visualization 字段
- ✅ 用户："生成销售报表" → 返回包含 aiReport 字段的完整报告
- ✅ 用户："查询用户列表" → 只返回查询结果，不包含 visualization 字段`

    // 根据迭代次数、工具执行结果、错误类型动态调整提示词
    AgentExecutor.enhanceSystemPromptDynamically(systemMessages[0], iteration, context, tools.length)

    // 构建 API URL
    const provider = llmConnection.provider || "openai"
    const model = llmConnection.model || "gpt-4o-mini"
    const baseUrl = llmConnection.baseUrl || (provider === "ollama" ? "http://localhost:11434/v1" : "https://api.openai.com/v1")
    let apiUrl = baseUrl.endsWith("/") ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`

    if (baseUrl.includes("cloudflare.com")) {
      apiUrl = `https://gateway.ai.cloudflare.com/v1/${provider}/${model}/chat/completions`
    }

    // 构建请求头
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    }

    // 获取 API Key
    const apiKey = this.getValidatedApiKey(llmConnection)

    if (baseUrl.includes("cloudflare.com")) {
      // Cloudflare AI Gateway 不需要 API key
    } else if (provider === "ollama") {
      if (apiKey && apiKey.trim() !== "" && apiKey !== "***") {
        headers["Authorization"] = `Bearer ${apiKey}`
      }
    } else if (provider === "anthropic") {
      headers["x-api-key"] = apiKey
      headers["anthropic-version"] = "2023-06-01"
    } else {
      headers["Authorization"] = `Bearer ${apiKey}`
    }

    const temperature = llmConnection.temperature || 0.3
    const maxTokens = llmConnection.maxTokens || 2000

    // 构建请求体
    const requestBody: any = {
      model,
      messages: [...systemMessages, ...messages],
      temperature,
      max_tokens: maxTokens,
    }

    // 如果有工具，添加到请求中
    if (tools.length > 0) {
      requestBody.tools = tools
      requestBody.tool_choice = "auto" // 让 LLM 自主选择工具
    }

    // 调用 LLM API
    const response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`LLM API 调用失败: ${response.status} - ${errorText}`)
    }

    const data = await response.json()

    // 解析响应（支持多种格式）
    const message = data.choices?.[0]?.message || data.message || data.content

    // 提取工具调用
    const toolCalls = message.tool_calls || message.toolCalls || []

    return {
      message: {
        role: "assistant",
        content: message.content || "",
        tool_calls: toolCalls,
      },
      toolCalls: toolCalls.map((tc: any) => ({
        id: tc.id || tc.tool_call_id,
        type: tc.type || "function",
        function: {
          name: tc.function?.name || tc.name,
          arguments: typeof tc.function?.arguments === "string" 
            ? JSON.parse(tc.function.arguments) 
            : tc.function?.arguments || tc.arguments,
        },
      })),
    }
  }

  /**
   * 执行工具
   */
  private static async executeTool(
    toolCall: { id: string; function: { name: string; arguments: any } },
    context: AgentContext,
    toolNameMap?: Map<string, AgentTool>
  ): Promise<any> {
    const sanitizedToolName = toolCall.function.name
    const args = toolCall.function.arguments

    // 调试日志：只在开发环境且启用调试时输出
    if (process.env.NODE_ENV === 'development' && process.env.DEBUG_AGENT === 'true') {
      console.log('[AgentExecutor] Looking for tool:', sanitizedToolName)
      if (toolNameMap) {
        console.log('[AgentExecutor] Available tools in map:', Array.from(toolNameMap.keys()))
      }
    }

    // 优先使用映射查找（更快且更可靠）
    let tool: AgentTool | undefined
    if (toolNameMap) {
      tool = toolNameMap.get(sanitizedToolName)
    }

    // 如果映射中没有，尝试直接匹配（向后兼容）
    if (!tool) {
      tool = context.agent.tools?.find((t: AgentTool) => 
        this.sanitizeToolName(t.name, t.id) === sanitizedToolName
      )
    }

    if (!tool) {
      // 增强错误信息：显示所有可用工具
      const availableTools = (context.agent.tools || [])
        .filter((t: AgentTool) => t.enabled)
        .map((t: AgentTool) => ({
          original: t.name || '(空)',
          sanitized: this.sanitizeToolName(t.name, t.id),
          id: t.id,
          type: t.type,
        }))
      
      const errorMessage = `工具 "${sanitizedToolName}" 未找到。

可用工具：
${availableTools.length > 0 
  ? availableTools.map(t => `  - ${t.sanitized} (原始名称: "${t.original}", ID: ${t.id}, 类型: ${t.type})`).join('\n')
  : '  (无可用工具)'}

请检查：
1. 工具名称是否正确
2. 工具是否已启用
3. 工具配置是否完整`

      console.error('[AgentExecutor] Tool not found:', {
        requested: sanitizedToolName,
        available: availableTools,
      })
      
      throw new Error(errorMessage)
    }

    if (!tool.enabled) {
      throw new Error(`工具 "${tool.name || tool.id}" 未启用`)
    }

    // 根据工具类型执行
    switch (tool.type) {
      case "sql_query":
        return await this.executeSQLTool(tool, args, context)

      case "http_request":
        return await this.executeHTTPTool(tool, args, context)

      case "code_execution":
        return await this.executeCodeTool(tool, args, context)

      default:
        throw new Error(`不支持的工具类型: ${tool.type}`)
    }
  }

  /**
   * 执行 SQL 工具
   */
  private static async executeSQLTool(
    tool: AgentTool,
    args: any,
    context: AgentContext
  ): Promise<any> {
    try {
      // 验证数据库连接
      if (!context.databaseConnection) {
        throw new Error("未配置数据库连接。请确保智能体已配置数据库连接。")
      }

      // 验证数据库连接对象的必需字段
      const conn = context.databaseConnection
      if (!conn.host || !conn.database || !conn.username || !conn.password) {
        throw new Error(`数据库连接配置不完整。缺少必需字段：${[
          !conn.host && 'host',
          !conn.database && 'database',
          !conn.username && 'username',
          !conn.password && 'password',
        ].filter(Boolean).join(', ')}`)
      }

      // 验证 SQL 参数
      let sql = args.sql
      if (!sql || typeof sql !== "string" || sql.trim() === '') {
        throw new Error("SQL 查询不能为空。请提供有效的 SQL 查询语句。")
      }

      // 清理 SQL（移除前后空白）
      sql = sql.trim()

      // 调试日志：只在开发环境且启用调试时输出
      if (process.env.NODE_ENV === 'development' && process.env.DEBUG_AGENT === 'true') {
        console.log('[AgentExecutor] Executing SQL:', {
          sql: sql.substring(0, 200),
          sqlLength: sql.length,
          database: conn.database,
          type: conn.type,
          host: conn.host,
          port: conn.port,
        })
      }

      // 验证 SQL（只允许 SELECT）
      const validation = SQLValidator.validate(sql, false)
      if (!validation.valid) {
        throw new Error(`SQL 验证失败: ${validation.error}`)
      }

      // 检测并拒绝包含敏感字段（密码）的 SQL
      const sensitiveCheck = detectSensitiveFieldsInSQL(sql)
      if (sensitiveCheck.hasSensitiveFields) {
        throw new Error(
          `SQL 查询包含敏感字段（密码相关），不允许查询：${sensitiveCheck.sensitiveFields.join(", ")}。` +
          `请修改 SQL 语句，移除所有密码相关字段（如 password, pwd, passwd 等）。`
        )
      }

      // 🔒 生产版：统一权限链路（表/行/列）
      // - 非管理员：必须通过 PermissionApplier（Deny by Default）
      // - 管理员：不做表/列阻断，但如果配置了 masked 列，可在结果阶段做脱敏
      let finalSQL = sql
      let permissionForMasking: any = null
      const connId = (context.databaseConnection as any)?.id
      const orgId = context.user?.organizationId
      const role = context.user?.role
      const shouldEnforce = role !== "admin"

      if (connId && orgId && context.user) {
        const permissionContext = {
          user: context.user,
          databaseConnectionId: connId,
          organizationId: orgId,
        }

        if (shouldEnforce) {
          const applied = await PermissionApplier.applyPermissions(sql, permissionContext)
          finalSQL = applied.modifiedSQL
          permissionForMasking = applied.permission

          const compiled = await PermissionApplier.compilePermissions(permissionContext)
          enforceColumnAccess({
            sql: finalSQL,
            schema: context.databaseSchema || [],
            policy: {
              tablePermissionMap: compiled.tablePermissionMap,
              columnPermissionMap: compiled.columnPermissionMap,
            },
          })
        } else {
          // 管理员：仅用于可选脱敏
          permissionForMasking = await PermissionApplier.getUserPermissions(permissionContext)
        }
      } else if (shouldEnforce) {
        // 非管理员但缺少权限上下文信息：安全起见拒绝
        throw new Error("权限上下文不完整，无法执行查询。请检查用户/组织/连接信息。")
      }

      // 应用 LIMIT（如果指定）
      if (args.limit && typeof args.limit === "number" && args.limit > 0) {
        if (!finalSQL.toUpperCase().includes("LIMIT")) {
          finalSQL += ` LIMIT ${args.limit}`
        }
      }

      // 执行 SQL（静默处理，减少日志）
      const startTime = Date.now()
      
      let result
      try {
        result = await SQLExecutor.executeQuery(
          context.databaseConnection,
          finalSQL,
          false // 不允许非 SELECT 操作
        )
      } catch (sqlError: any) {
        // 捕获 SQL 执行错误，提供更详细的错误信息
        console.error('[AgentExecutor] SQLExecutor.executeQuery failed:', {
          error: sqlError.message,
          stack: sqlError.stack,
          sql: finalSQL.substring(0, 200),
          database: conn.database,
          type: conn.type,
        })
        
        // 重新抛出，让外层 catch 处理
        throw sqlError
      }

      const executionTime = Date.now() - startTime
      // 调试日志：只在开发环境且启用调试时输出
      if (process.env.NODE_ENV === 'development' && process.env.DEBUG_AGENT === 'true') {
        console.log('[AgentExecutor] SQL query executed successfully:', {
          rowCount: result.rows.length,
          columnCount: result.columns.length,
          executionTime: result.executionTime || executionTime,
        })
      }

      // 过滤敏感字段（密码等）从结果中
      const filteredResult = filterSensitiveFieldsFromResult(result)
      
      // 记录被过滤的敏感字段
      const originalColumns = result.columns || []
      const filteredColumns = filteredResult.columns || originalColumns.filter((col: string) => 
        !isSensitiveField(col)
      )
      const removedColumns = originalColumns.filter((col: string) => 
        isSensitiveField(col)
      )
      
      if (removedColumns.length > 0) {
        // 静默处理敏感字段过滤（减少日志）
      }

      // 确保返回的 rows 是数组格式
      let filteredRows = filteredResult.rows
      if (!filteredRows && filteredResult && Array.isArray(filteredResult)) {
        filteredRows = filteredResult
      } else if (!filteredRows) {
        // 如果过滤结果没有 rows，手动过滤
        filteredRows = (result.rows || []).map((row: any) => {
          if (typeof row === 'object' && !Array.isArray(row)) {
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

      // 检测用户是否要求所有数据
      const userQuestion = context.messages?.[context.messages.length - 1]?.content || ""
      const lowerQuestion = userQuestion.toLowerCase()
      const requiresAllData = lowerQuestion.includes('所有') ||
                             lowerQuestion.includes('全部') ||
                             lowerQuestion.includes('all') ||
                             lowerQuestion.includes('列出所有') ||
                             lowerQuestion.includes('显示所有') ||
                             lowerQuestion.includes('list all') ||
                             lowerQuestion.includes('show all')
      
      // 如果用户要求所有数据，返回全部数据；否则限制为1000行（避免性能问题）
      const maxRows = requiresAllData ? undefined : 1000
      const returnedRows = maxRows 
        ? (Array.isArray(filteredRows) ? filteredRows : []).slice(0, maxRows)
        : (Array.isArray(filteredRows) ? filteredRows : [])

      const resultPayload = {
        columns: filteredColumns,
        rows: returnedRows,
        rowCount: filteredRows?.length || result.rows.length,
        executionTime: result.executionTime || executionTime,
        filteredFields: removedColumns.length > 0 ? removedColumns : undefined,
        // 透传映射信息，便于脱敏对齐（SQLExecutor 已提供）
        originalColumns: (result as any).originalColumns,
        columnNameMap: (result as any).columnNameMap,
      }

      const maskedPayload = applyMaskingToQueryResult(resultPayload, permissionForMasking)
      
      return {
        success: true,
        sql: finalSQL,
        result: maskedPayload,
      }
    } catch (error: any) {
      // 详细的错误日志
      const errorDetails = {
        error: error.message,
        stack: error.stack?.substring(0, 500), // 限制堆栈长度
        sql: args?.sql?.substring(0, 200),
        database: context.databaseConnection?.database,
        databaseType: context.databaseConnection?.type,
        toolId: tool.id,
        toolName: tool.name,
        hasDatabaseConnection: !!context.databaseConnection,
        connectionFields: context.databaseConnection ? {
          hasHost: !!context.databaseConnection.host,
          hasDatabase: !!context.databaseConnection.database,
          hasUsername: !!context.databaseConnection.username,
          hasPassword: !!context.databaseConnection.password,
        } : null,
      }
      
      console.error('[AgentExecutor] SQL tool execution failed:', errorDetails)

      // 提供更详细的错误信息
      let errorMessage = error.message || "SQL 执行失败"
      
      // 如果是数据库连接错误
      if (error.message?.includes("ECONNREFUSED") || 
          error.message?.includes("连接") || 
          error.message?.includes("connect") ||
          error.message?.includes("timeout")) {
        errorMessage = `数据库连接失败: ${error.message}。请检查：
1. 数据库服务器是否运行
2. 数据库连接配置是否正确（主机、端口、用户名、密码）
3. 网络连接是否正常`
      }
      // 如果是 SQL 语法错误
      else if (error.message?.includes("SQL syntax") || 
               error.message?.includes("语法") ||
               error.message?.includes("syntax error") ||
               error.message?.includes("You have an error in your SQL")) {
        errorMessage = `SQL 语法错误: ${error.message}。请检查 SQL 语句是否符合 ${context.databaseConnection?.type || 'MySQL'} 语法。`
      }
      // 如果是表或字段不存在
      else if (error.message?.includes("doesn't exist") || 
               error.message?.includes("不存在") ||
               error.message?.includes("Unknown column") ||
               error.message?.includes("Table") && error.message?.includes("doesn't exist")) {
        errorMessage = `数据库对象不存在: ${error.message}。请检查：
1. 表名是否正确（注意大小写）
2. 字段名是否正确（注意大小写）
3. 查看数据库结构，使用正确的表名和字段名`
      }
      // 如果是权限错误
      else if (error.message?.includes("Access denied") || 
               error.message?.includes("权限") ||
               error.message?.includes("permission")) {
        errorMessage = `数据库权限错误: ${error.message}。请检查数据库用户权限。`
      }
      // 其他错误
      else {
        errorMessage = `SQL 执行错误: ${error.message}`
      }

      throw new Error(errorMessage)
    }
  }

  /**
   * 标准化 SQL 用于比较（去除空白、大小写、注释等）
   */
  private static normalizeSQL(sql: string): string {
    if (!sql || typeof sql !== 'string') {
      return ''
    }
    
    // 转换为小写
    let normalized = sql.toLowerCase()
    
    // 移除注释
    normalized = normalized.replace(/--.*$/gm, '') // 单行注释
    normalized = normalized.replace(/\/\*[\s\S]*?\*\//g, '') // 多行注释
    
    // 标准化空白字符
    normalized = normalized.replace(/\s+/g, ' ').trim()
    
    // 移除多余的括号和空格
    normalized = normalized.replace(/\s*\(\s*/g, '(')
    normalized = normalized.replace(/\s*\)\s*/g, ')')
    normalized = normalized.replace(/\s*,\s*/g, ',')
    
    return normalized
  }

  /**
   * 计算两个 SQL 查询的相似度（0-1）
   */
  private static calculateSQLSimilarity(sql1: string, sql2: string): number {
    const normalized1 = AgentExecutor.normalizeSQL(sql1)
    const normalized2 = AgentExecutor.normalizeSQL(sql2)
    
    if (normalized1 === normalized2) {
      return 1.0
    }
    
    // 提取关键部分进行比较
    const extractKeyParts = (sql: string) => {
      const parts: string[] = []
      
      // 提取 SELECT 字段
      const selectMatch = sql.match(/select\s+(.+?)\s+from/i)
      if (selectMatch) {
        const fields = selectMatch[1].split(',').map(f => f.trim().replace(/\s+as\s+\w+/i, ''))
        parts.push(...fields)
      }
      
      // 提取 FROM 表名
      const fromMatch = sql.match(/from\s+(\w+)/i)
      if (fromMatch) {
        parts.push(`from:${fromMatch[1]}`)
      }
      
      // 提取 WHERE 条件
      const whereMatch = sql.match(/where\s+(.+?)(?:\s+order|\s+limit|$)/i)
      if (whereMatch) {
        parts.push(`where:${whereMatch[1]}`)
      }
      
      return parts.sort().join('|')
    }
    
    const parts1 = extractKeyParts(normalized1)
    const parts2 = extractKeyParts(normalized2)
    
    if (parts1 === parts2) {
      return 0.95 // 关键部分相同，认为高度相似
    }
    
    // 计算编辑距离相似度（简化版）
    const longer = parts1.length > parts2.length ? parts1 : parts2
    const shorter = parts1.length > parts2.length ? parts2 : parts1
    
    if (longer.length === 0) {
      return 1.0
    }
    
    // 计算共同部分
    const commonParts = shorter.split('|').filter(p => longer.includes(p))
    const similarity = commonParts.length / longer.split('|').length
    
    return similarity
  }

  /**
   * 判断查询结果是否满足用户需求
   */
  /**
   * 生成查询完成消息，智能判断是否需要继续查询
   */
  private static getQueryCompletionMessage(
    toolResult: any,
    isDuplicateQuery: boolean,
    isResultSatisfied: boolean,
    sqlQueryCount: number
  ): string {
    // 如果是重复查询，明确要求停止
    if (isDuplicateQuery) {
      return `\n\n⚠️ **重复查询警告**\n\n检测到相同或相似的查询，结果也相同。应该停止迭代，基于已有结果生成最终回答。\n\n**必须**：\n- ✅ 立即停止迭代\n- ✅ 基于已有结果生成最终回答\n- ❌ 不要再次执行相同或相似的查询`
    }

    // 如果查询结果已经满足用户需求，建议停止
    if (isResultSatisfied) {
      return `\n\n✅ **查询结果已经满足用户需求**\n\nSQL 查询已成功执行，结果已经满足用户需求。建议停止迭代，直接基于此结果生成最终回答。\n\n**建议**：\n- ✅ 如果结果已经完整回答了用户问题，应该停止迭代\n- ✅ 基于此查询结果生成最终回答\n- ⚠️ 只有在确实需要补充信息时，才考虑执行第二次查询（例如：需要关联其他表的数据）`
    }

    // 如果查询成功，但可能需要更多信息
    if (toolResult.success && toolResult.result) {
      // 如果已经执行了多次查询，建议停止
      if (sqlQueryCount >= 3) {
        return `\n\n⚠️ **查询次数较多，建议停止迭代**\n\nSQL 查询已成功执行（已执行 ${sqlQueryCount} 次查询）。建议基于已有结果生成最终回答。\n\n**建议**：\n- ✅ 如果已有结果可以回答用户问题，应该停止迭代\n- ✅ 基于已有查询结果生成最终回答\n- ⚠️ 只有在确实需要关键信息时，才考虑执行额外查询`
      }

      // 第一次或第二次查询成功，允许继续（如果需要）
      return `\n\n✅ **SQL 查询执行成功**\n\n查询已成功执行。请分析查询结果，判断是否需要继续查询。\n\n**判断标准**：\n- ✅ 如果查询结果已经完整回答了用户问题，应该停止迭代，生成最终回答\n- ✅ 如果需要关联其他表的数据或需要补充信息，可以继续查询（但最多不超过 3 次）\n- ❌ 不要为了"优化"或"格式化"而重复查询相同的数据\n- ❌ 不要执行相同或相似的查询\n\n**建议**：\n- 基于查询结果分析用户需求是否已满足\n- 如果已满足，立即停止迭代并生成最终回答\n- 如果确实需要更多信息，可以继续查询（但要有明确目的）`
    }

    return ''
  }

  private static isResultSatisfied(userQuestion: string, queryResult: any): boolean {
    if (!queryResult || !queryResult.rows || !Array.isArray(queryResult.rows)) {
      return false
    }
    
    const rowCount = queryResult.rowCount || queryResult.rows.length
    const question = userQuestion.toLowerCase()
    
    // 如果查询返回了数据，通常已经满足基本需求
    if (rowCount > 0) {
      // 检查是否是简单的查询请求（如"列出"、"查询"、"显示"等）
      const simpleQueryPatterns = [
        /列出|显示|查询|查看|获取|返回|所有|全部/i,
        /list|show|query|get|all|every/i,
      ]
      
      const isSimpleQuery = simpleQueryPatterns.some(pattern => pattern.test(question))
      
      if (isSimpleQuery) {
        // 简单查询，有数据就满足
        return true
      }
      
      // 检查是否有特定的数量要求
      const countPatterns = [
        /多少|几个|数量|总数|count|number|how many/i,
      ]
      
      const hasCountRequirement = countPatterns.some(pattern => pattern.test(question))
      
      if (hasCountRequirement && rowCount > 0) {
        // 有数量要求，返回了数据就满足
        return true
      }
    }
    
    // 默认返回 false，让 LLM 自己判断
    return false
  }

  /**
   * 生成详细的错误信息（包含错误类型、可能原因、修正建议）
   */
  private static generateDetailedError(
    errorMessage: string,
    toolCall: { id: string; function: { name: string; arguments: any } },
    context: AgentContext
  ): string {
    const isRecoverable = this.isRecoverableError(errorMessage)
    const sql = toolCall.function.arguments?.sql || ""
    
    let detailedError = `❌ **工具执行失败**\n\n`
    detailedError += `**错误信息**: ${errorMessage}\n\n`
    
    // 判断错误类型
    if (errorMessage.includes("Unknown column") || errorMessage.includes("不存在") || errorMessage.includes("does not exist")) {
      // 列不存在错误
      const columnMatch = errorMessage.match(/Unknown column ['"]([^'"]+)['"]/i) || 
                         errorMessage.match(/列 ['"]([^'"]+)['"] 不存在/i) ||
                         errorMessage.match(/does not exist: ['"]([^'"]+)['"]/i)
      const columnName = columnMatch ? columnMatch[1] : "未知列"
      
      detailedError += `**错误类型**: 列不存在\n\n`
      detailedError += `**问题分析**:\n`
      detailedError += `- SQL 查询中使用了不存在的列名 "${columnName}"\n`
      detailedError += `- 可能原因：列名拼写错误、列名大小写不匹配、表结构已更改\n\n`
      detailedError += `**修正建议**:\n`
      detailedError += `1. 检查数据库结构，确认正确的列名\n`
      detailedError += `2. 注意列名的大小写（某些数据库区分大小写）\n`
      detailedError += `3. 如果列名确实不存在，请使用数据库结构中的其他列，或明确告知用户\n\n`
      
      // 如果提供了数据库结构，尝试找到相似的列名
      if (context.databaseSchema && context.databaseSchema.length > 0) {
        const similarColumns: string[] = []
        context.databaseSchema.forEach((table: any) => {
          const columns = table.columns || []
          columns.forEach((col: any) => {
            const colName = col.name || col.columnName || col.COLUMN_NAME || ""
            if (colName.toLowerCase().includes(columnName.toLowerCase()) || 
                columnName.toLowerCase().includes(colName.toLowerCase())) {
              similarColumns.push(`${table.tableName || table.name || "未知表"}.${colName}`)
            }
          })
        })
        if (similarColumns.length > 0) {
          detailedError += `**可能的正确列名**: ${similarColumns.slice(0, 5).join(", ")}\n\n`
        }
      }
    } else if (errorMessage.includes("Unknown table") || errorMessage.includes("表不存在") || errorMessage.includes("Table") && errorMessage.includes("doesn't exist")) {
      // 表不存在错误
      const tableMatch = errorMessage.match(/Unknown table ['"]([^'"]+)['"]/i) || 
                        errorMessage.match(/表 ['"]([^'"]+)['"] 不存在/i) ||
                        errorMessage.match(/Table ['"]([^'"]+)['"] doesn't exist/i)
      const tableName = tableMatch ? tableMatch[1] : "未知表"
      
      detailedError += `**错误类型**: 表不存在\n\n`
      detailedError += `**问题分析**:\n`
      detailedError += `- SQL 查询中使用了不存在的表名 "${tableName}"\n`
      detailedError += `- 可能原因：表名拼写错误、表名大小写不匹配、表不存在\n\n`
      detailedError += `**修正建议**:\n`
      detailedError += `1. 检查数据库结构，确认正确的表名\n`
      detailedError += `2. 注意表名的大小写（某些数据库区分大小写）\n`
      detailedError += `3. 如果表名确实不存在，请使用数据库结构中的其他表，或明确告知用户\n\n`
      
      // 如果提供了数据库结构，列出可用的表
      if (context.databaseSchema && context.databaseSchema.length > 0) {
        const availableTables = context.databaseSchema.map((table: any) => 
          table.tableName || table.name || "未知表"
        ).filter(Boolean)
        if (availableTables.length > 0) {
          detailedError += `**可用的表**: ${availableTables.slice(0, 10).join(", ")}\n\n`
        }
      }
    } else if (errorMessage.includes("SQL syntax") || errorMessage.includes("语法错误") || errorMessage.includes("syntax error")) {
      // SQL 语法错误
      detailedError += `**错误类型**: SQL 语法错误\n\n`
      detailedError += `**问题分析**:\n`
      detailedError += `- SQL 语句存在语法错误\n`
      detailedError += `- 可能原因：SQL 语句不完整、关键字拼写错误、括号不匹配、引号未闭合\n\n`
      detailedError += `**修正建议**:\n`
      detailedError += `1. 检查 SQL 语句是否完整（SELECT、FROM、WHERE 等关键字是否正确）\n`
      detailedError += `2. 检查括号是否匹配\n`
      detailedError += `3. 检查字符串引号是否闭合\n`
      detailedError += `4. 检查数据库类型特定的语法（${context.databaseConnection?.type || "MySQL"}）\n\n`
      if (sql) {
        detailedError += `**有问题的 SQL**: \`${sql.substring(0, 200)}${sql.length > 200 ? "..." : ""}\`\n\n`
      }
    } else if (!isRecoverable) {
      // 系统级错误
      detailedError += `**错误类型**: 系统级错误（不可恢复）\n\n`
      detailedError += `**问题分析**:\n`
      detailedError += `- 这是系统级错误，无法通过修改 SQL 解决\n`
      detailedError += `- 可能原因：数据库连接失败、权限不足、数据库服务未启动\n\n`
      detailedError += `**修正建议**:\n`
      detailedError += `1. **不要重试**，直接向用户说明情况\n`
      detailedError += `2. 检查数据库连接配置是否正确\n`
      detailedError += `3. 检查数据库服务是否正在运行\n`
      detailedError += `4. 检查用户权限是否足够\n\n`
    } else {
      // 其他可恢复错误
      detailedError += `**错误类型**: 可恢复错误\n\n`
      detailedError += `**问题分析**:\n`
      detailedError += `- 可以通过修正 SQL 或配置来解决\n\n`
      detailedError += `**修正建议**:\n`
      detailedError += `1. 仔细阅读错误信息，分析失败原因\n`
      detailedError += `2. 根据错误信息修正 SQL 或配置\n`
      detailedError += `3. 可以重试，但最多重试 2-3 次\n`
      if (sql) {
        detailedError += `4. 检查 SQL: \`${sql.substring(0, 200)}${sql.length > 200 ? "..." : ""}\`\n\n`
      }
    }
    
    // 添加重试建议
    if (isRecoverable) {
      detailedError += `**重试策略**:\n`
      detailedError += `- ✅ 这是可恢复错误，可以修正 SQL 后重试（最多 2-3 次）\n`
      detailedError += `- 根据上述修正建议修改 SQL 后，可以再次调用工具\n`
    } else {
      detailedError += `**重试策略**:\n`
      detailedError += `- ❌ 这是系统级错误，**不要重试**\n`
      detailedError += `- 直接向用户说明情况，建议检查数据库连接配置\n`
    }
    
    return detailedError
  }

  /**
   * 动态增强系统提示词
   */
  private static enhanceSystemPromptDynamically(
    systemMessage: { content: string },
    iteration: number | undefined,
    context: AgentContext,
    toolCount: number
  ): void {
    if (!iteration) {
      // 第一次迭代：强调必须使用工具
      if (toolCount > 0) {
        systemMessage.content += `\n\n## 🚨 第一次迭代重要提示\n\n- **必须使用工具执行查询**，不要只提供 SQL 建议\n- 根据数据库结构生成正确的 SQL 语句\n- 立即调用工具执行查询\n- 基于实际查询结果回答用户问题`
      }
      return
    }

    // 根据迭代次数添加不同提示
    if (iteration >= AgentExecutor.MAX_ITERATIONS - 2) {
      // 接近最大迭代次数
      systemMessage.content += `\n\n⚠️ **警告**：当前迭代次数 ${iteration}/${AgentExecutor.MAX_ITERATIONS}，接近限制。\n\n**重要提示**：\n- 如果查询结果已经满足用户需求，应该立即停止迭代，生成最终回答\n- 不要重复查询或添加不必要的优化\n- 不要执行相同或相似的查询\n- 基于已有结果生成最终回答`
    } else if (iteration >= AgentExecutor.MAX_ITERATIONS / 2) {
      // 迭代次数过半
      systemMessage.content += `\n\n💡 **迭代进度提示**：当前迭代次数 ${iteration}/${AgentExecutor.MAX_ITERATIONS}。\n\n**建议**：\n- 如果查询结果已经满足用户需求，应该停止迭代\n- 避免重复查询相同的数据\n- 基于已有结果生成最终回答`
    }

    // 检查是否有工具执行失败的历史
    const hasFailedTools = context.workProcess.some(step => 
      step.includes("执行失败") || step.includes("错误")
    )
    
    if (hasFailedTools && iteration && iteration > 1) {
      systemMessage.content += `\n\n🔧 **错误处理提示**：\n\n- 如果之前的工具执行失败，仔细分析错误信息\n- 区分可恢复错误和系统级错误\n- 对于可恢复错误，可以修正 SQL 后重试（最多 2-3 次）\n- 对于系统级错误，不要重试，直接向用户说明情况`
    }

    // 检查是否有重复查询
    const hasDuplicateQueries = context.workProcess.some(step => 
      step.includes("重复查询") || step.includes("相似查询")
    )
    
    if (hasDuplicateQueries) {
      systemMessage.content += `\n\n⚠️ **重复查询警告**：\n\n- 检测到重复或相似的查询\n- 应该停止迭代，基于已有结果生成最终回答\n- 不要再次执行相同或相似的查询`
    }
  }

  /**
   * 判断错误是否可恢复（可以通过修正 SQL 解决）
   */
  private static isRecoverableError(errorMessage: string): boolean {
    const nonRecoverablePatterns = [
      /未配置数据库连接/i,
      /数据库连接配置不完整/i,
      /连接失败/i,
      /ECONNREFUSED/i,
      /Access denied/i,
      /权限错误/i,
      /permission denied/i,
    ]
    
    return !nonRecoverablePatterns.some(pattern => pattern.test(errorMessage))
  }

  /**
   * 分类错误类型
   */
  private static categorizeError(errorMessage: string): string {
    if (errorMessage.includes("未配置数据库连接") || errorMessage.includes("数据库连接配置不完整")) {
      return "数据库连接配置错误"
    } else if (errorMessage.includes("连接失败") || errorMessage.includes("ECONNREFUSED")) {
      return "数据库连接失败"
    } else if (errorMessage.includes("Access denied") || errorMessage.includes("权限")) {
      return "数据库权限错误"
    } else if (errorMessage.includes("SQL 查询包含敏感字段")) {
      return "安全限制（密码字段）"
    } else if (errorMessage.includes("SQL 验证失败") || errorMessage.includes("语法")) {
      return "SQL 语法错误"
    } else if (errorMessage.includes("不存在") || errorMessage.includes("doesn't exist")) {
      return "数据库对象不存在"
    } else {
      return "其他错误"
    }
  }

  /**
   * 执行 HTTP 工具
   */
  private static async executeHTTPTool(
    tool: AgentTool,
    args: any,
    context: AgentContext
  ): Promise<any> {
    const config = tool.config as any
    const method = args.method || config.method || "GET"
    const url = args.url || config.url

    if (!url) {
      throw new Error("URL 不能为空")
    }

    const headers = {
      ...(config.headers || {}),
      ...(args.headers || {}),
    }

    const body = args.body || config.body

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    const responseText = await response.text()

    return {
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: responseText,
    }
  }

  /**
   * 执行代码工具
   */
  private static async executeCodeTool(
    tool: AgentTool,
    args: any,
    context: AgentContext
  ): Promise<any> {
    // 代码执行需要沙箱环境，这里先返回占位符
    // 实际实现需要集成 PythonExecutor 或其他代码执行器
    return {
      success: false,
      error: "代码执行功能暂未实现，需要配置代码执行环境",
    }
  }

  /**
   * 获取验证后的 API Key
   */
  private static getValidatedApiKey(llmConnection: any): string {
    if (!llmConnection.apiKey || llmConnection.apiKey.trim() === "" || llmConnection.apiKey === "***") {
      throw new Error(`LLM 连接 "${llmConnection.name}" 的 API Key 未配置`)
    }
    return llmConnection.apiKey
  }
}
