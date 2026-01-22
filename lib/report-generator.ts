/**
 * 报告生成器
 * 参考火山引擎智能分析Agent的报告生成能力
 * 支持文字块、AI分析和AI总结，组合生成分析报告
 */

import { PromptConfigService } from "./prompt-config-service"

import type { TaskPlan, AnalysisStep } from "./task-planner"
import type { QueryResult, DatabaseSchema } from "./types"
import { translateColumnName } from "./utils"

export interface ReportSection {
  id: string
  type: "text" | "ai_analysis" | "ai_summary" | "chart" | "table" | "metric"
  title: string
  content: any
  order: number
}

export interface AnalysisReport {
  id: string
  title: string
  goal: string
  sections: ReportSection[]
  summary: string
  keyFindings: string[]
  recommendations?: string[]
  generatedAt: string
  metadata: {
    totalSteps: number
    completedSteps: number
    executionTime: number
  }
}

export class ReportGenerator {
  /**
   * 生成分析报告
   */
  static async generateReport(
    plan: TaskPlan,
    stepResults: Map<string, any>
  ): Promise<AnalysisReport> {
    const reportId = `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    // 收集所有已完成步骤的结果
    const completedSteps = plan.steps.filter(s => s.status === "completed")
    
    // 生成报告章节
    const sections = this.generateSections(plan, completedSteps, stepResults)
    
    // 生成摘要
    const summary = this.generateSummary(plan, completedSteps, stepResults)
    
    // 提取关键发现
    const keyFindings = this.extractKeyFindings(completedSteps, stepResults)
    
    // 生成建议（可选）
    const recommendations = this.generateRecommendations(plan, completedSteps, stepResults)
    
    // 计算总执行时间
    const executionTime = completedSteps.reduce((total, step) => {
      return total + (step.executionTime || 0)
    }, 0)
    
    const report: AnalysisReport = {
      id: reportId,
      title: `分析报告: ${plan.goal}`,
      goal: plan.goal,
      sections,
      summary,
      keyFindings,
      recommendations,
      generatedAt: new Date().toISOString(),
      metadata: {
        totalSteps: plan.steps.length,
        completedSteps: completedSteps.length,
        executionTime,
      },
    }
    
    return report
  }

  /**
   * 生成报告章节
   */
  private static generateSections(
    plan: TaskPlan,
    completedSteps: AnalysisStep[],
    stepResults: Map<string, any>
  ): ReportSection[] {
    const sections: ReportSection[] = []
    let order = 0
    
    for (const step of completedSteps) {
      const result = stepResults.get(step.id) || step.result
      
      switch (step.type) {
        case "data_collection":
          sections.push({
            id: `section_${step.id}`,
            type: "text",
            title: step.title,
            content: this.formatDataCollectionResult(result),
            order: order++,
          })
          break
          
        case "sql_query":
          sections.push({
            id: `section_${step.id}`,
            type: "table",
            title: step.title,
            content: this.formatSQLQueryResult(result),
            order: order++,
          })
          break
          
        case "python_code":
          sections.push({
            id: `section_${step.id}`,
            type: "ai_analysis",
            title: step.title,
            content: this.formatPythonCodeResult(result),
            order: order++,
          })
          break
          
        case "visualization":
          sections.push({
            id: `section_${step.id}`,
            type: "chart",
            title: step.title,
            content: this.formatVisualizationResult(result),
            order: order++,
          })
          break
          
        case "attribution":
          sections.push({
            id: `section_${step.id}`,
            type: "ai_analysis",
            title: step.title,
            content: this.formatAttributionResult(result),
            order: order++,
          })
          break
          
        case "summary":
          // 总结步骤的结果本身就是报告的一部分
          if (result?.report) {
            sections.push({
              id: `section_${step.id}`,
              type: "ai_summary",
              title: step.title,
              content: result.report,
              order: order++,
            })
          }
          break
      }
    }
    
    return sections
  }

  /**
   * 格式化数据收集结果
   */
  private static formatDataCollectionResult(result: any): string {
    if (!result) {
      return "数据收集完成"
    }
    
    const parts: string[] = []
    
    if (result.tables && result.tables.length > 0) {
      parts.push(`**涉及表**: ${result.tables.join(", ")}`)
    }
    
    if (result.schema && result.schema.length > 0) {
      parts.push(`**表数量**: ${result.schema.length}`)
    }
    
    if (result.message) {
      parts.push(result.message)
    }
    
    return parts.join("\n\n")
  }

  /**
   * 格式化SQL查询结果
   */
  private static formatSQLQueryResult(result: any): any {
    if (!result || !result.columns) {
      return {
        message: "查询完成，但无数据返回",
      }
    }
    
    return {
      columns: result.columns,
      rows: result.rows || [],
      rowCount: result.rowCount || 0,
      executionTime: result.executionTime || 0,
    }
  }

  /**
   * 格式化Python代码结果
   */
  private static formatPythonCodeResult(result: any): string {
    if (!result) {
      return "Python分析完成"
    }
    
    const parts: string[] = []
    
    if (result.message) {
      parts.push(result.message)
    }
    
    if (result.analysis) {
      parts.push(`**分析结果**:\n${JSON.stringify(result.analysis, null, 2)}`)
    }
    
    return parts.join("\n\n")
  }

  /**
   * 格式化可视化结果
   */
  private static formatVisualizationResult(result: any): any {
    if (!result || !result.charts) {
      return {
        message: "图表生成完成",
      }
    }
    
    return {
      charts: result.charts,
      chartCount: result.charts.length,
    }
  }

  /**
   * 格式化归因分析结果
   */
  private static formatAttributionResult(result: any): string {
    if (!result) {
      return "归因分析完成"
    }
    
    const parts: string[] = []
    
    if (result.insights && Array.isArray(result.insights)) {
      parts.push("**关键发现**:")
      result.insights.forEach((insight: string, index: number) => {
        parts.push(`${index + 1}. ${insight}`)
      })
    }
    
    if (result.message) {
      parts.push(result.message)
    }
    
    return parts.join("\n\n")
  }

  /**
   * 生成摘要
   */
  private static generateSummary(
    plan: TaskPlan,
    completedSteps: AnalysisStep[],
    stepResults: Map<string, any>
  ): string {
    const parts: string[] = []
    
    parts.push(`本次分析围绕"${plan.goal}"展开，共执行了 ${completedSteps.length} 个分析步骤。`)
    
    // 总结每个步骤的关键结果
    for (const step of completedSteps) {
      const result = stepResults.get(step.id) || step.result
      
      if (step.type === "sql_query" && result?.rowCount !== undefined) {
        parts.push(`- ${step.title}: 查询到 ${result.rowCount} 条记录`)
      } else if (step.type === "visualization" && result?.charts) {
        parts.push(`- ${step.title}: 生成了 ${result.charts.length} 个图表`)
      } else {
        parts.push(`- ${step.title}: 已完成`)
      }
    }
    
    return parts.join("\n")
  }

  /**
   * 提取关键发现
   */
  private static extractKeyFindings(
    completedSteps: AnalysisStep[],
    stepResults: Map<string, any>
  ): string[] {
    const findings: string[] = []
    
    for (const step of completedSteps) {
      const result = stepResults.get(step.id) || step.result
      
      if (step.type === "sql_query" && result?.rows && result.rows.length > 0) {
        // 从查询结果中提取关键数据
        const firstRow = result.rows[0]
        if (firstRow) {
          const keyValue = Object.values(firstRow)[0]
          findings.push(`查询结果显示: ${keyValue}`)
        }
      }
      
      if (step.type === "attribution" && result?.insights) {
        findings.push(...result.insights)
      }
    }
    
    return findings.length > 0 ? findings : ["分析已完成，请查看详细报告"]
  }

  /**
   * 生成建议
   */
  private static generateRecommendations(
    plan: TaskPlan,
    completedSteps: AnalysisStep[],
    stepResults: Map<string, any>
  ): string[] {
    const recommendations: string[] = []
    
    // 基于分析结果生成建议
    // 这里可以集成LLM生成更智能的建议
    
    if (completedSteps.some(s => s.type === "sql_query")) {
      recommendations.push("建议定期更新数据，保持分析的时效性")
    }
    
    if (completedSteps.some(s => s.type === "attribution")) {
      recommendations.push("建议深入分析数据变化的原因，制定相应的应对策略")
    }
    
    return recommendations
  }

  /**
   * 格式化报告为Markdown
   */
  static formatAsMarkdown(report: AnalysisReport): string {
    const parts: string[] = []
    
    parts.push(`# ${report.title}\n`)
    parts.push(`**分析目标**: ${report.goal}\n`)
    parts.push(`**生成时间**: ${new Date(report.generatedAt).toLocaleString("zh-CN")}\n`)
    parts.push(`---\n`)
    
    // 摘要
    parts.push(`## 📊 执行摘要\n`)
    parts.push(report.summary)
    parts.push(`\n`)
    
    // 关键发现
    if (report.keyFindings.length > 0) {
      parts.push(`## 🔍 关键发现\n`)
      report.keyFindings.forEach((finding, index) => {
        parts.push(`${index + 1}. ${finding}`)
      })
      parts.push(`\n`)
    }
    
    // 详细章节
    parts.push(`## 📋 详细分析\n`)
    for (const section of report.sections.sort((a, b) => a.order - b.order)) {
      parts.push(`### ${section.title}\n`)
      
      switch (section.type) {
        case "text":
          parts.push(section.content)
          break
          
        case "table":
          const tableData = section.content as any
          if (tableData.columns && tableData.rows) {
            const translatedColumns = tableData.columns.map((col: string) => translateColumnName(col))
            parts.push(`| ${translatedColumns.join(" | ")} |`)
            parts.push(`| ${translatedColumns.map(() => "---").join(" | ")} |`)
            tableData.rows.slice(0, 10).forEach((row: any) => {
              const values = tableData.columns.map((col: string) => row[col] || "")
              parts.push(`| ${values.join(" | ")} |`)
            })
            if (tableData.rows.length > 10) {
              parts.push(`\n*（显示前10行，共 ${tableData.rowCount} 行）*`)
            }
          }
          break
          
        case "ai_analysis":
        case "ai_summary":
          parts.push(section.content)
          break
          
        case "chart":
          parts.push(`*图表数据已生成，共 ${section.content.chartCount || 0} 个图表*`)
          break
      }
      
      parts.push(`\n`)
    }
    
    // 建议
    if (report.recommendations && report.recommendations.length > 0) {
      parts.push(`## 💡 建议\n`)
      report.recommendations.forEach((rec, index) => {
        parts.push(`${index + 1}. ${rec}`)
      })
      parts.push(`\n`)
    }
    
    // 元数据
    parts.push(`---\n`)
    parts.push(`**执行统计**:\n`)
    parts.push(`- 总步骤数: ${report.metadata.totalSteps}`)
    parts.push(`- 完成步骤数: ${report.metadata.completedSteps}`)
    parts.push(`- 总执行时间: ${(report.metadata.executionTime / 1000).toFixed(2)} 秒`)
    
    return parts.join("\n")
  }

  /**
   * 格式化报告为JSON
   */
  static formatAsJSON(report: AnalysisReport): string {
    return JSON.stringify(report, null, 2)
  }

  /**
   * 使用LLM生成AI分析报告
   * 基于查询结果生成结构化的分析报告
   */
  static async generateReportWithLLM(
    queryResult: QueryResult,
    llmConnection: any,
    validatedApiKey: string,
    schema?: DatabaseSchema[],
    userQuestion?: string,
    sql?: string,
    isEntityReport?: boolean
  ): Promise<AnalysisReport> {
    if (!queryResult || !queryResult.rows || queryResult.rows.length === 0) {
      throw new Error("查询结果为空，无法生成报告")
    }

    // 准备数据摘要
    const dataSummary = this.prepareDataSummaryForLLM(queryResult, schema, sql)
    
    // 构建提示词
    const prompt = await this.buildReportPrompt(dataSummary, userQuestion, schema, isEntityReport)
    
    // 调用LLM生成报告
    const llmReport = await this.callLLMForReport(llmConnection, validatedApiKey, prompt)
    
    // 构建报告对象
    const reportId = `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const report: AnalysisReport = {
      id: reportId,
      title: llmReport.title || `数据分析报告: ${userQuestion || "查询结果分析"}`,
      goal: userQuestion || "分析查询结果",
      sections: llmReport.sections || [],
      summary: llmReport.summary || "报告生成完成",
      keyFindings: llmReport.keyFindings || [],
      recommendations: llmReport.recommendations || [],
      generatedAt: new Date().toISOString(),
      metadata: {
        totalSteps: 1,
        completedSteps: 1,
        executionTime: 0,
      },
    }
    
    return report
  }

  /**
   * 准备数据摘要用于LLM分析
   */
  private static prepareDataSummaryForLLM(
    queryResult: QueryResult,
    schema?: DatabaseSchema[],
    sql?: string
  ): string {
    const parts: string[] = []
    
    parts.push(`**查询结果概览**：`)
    parts.push(`- 数据行数：${queryResult.rows.length}`)
    parts.push(`- 列数：${queryResult.columns.length}`)
    parts.push(`- 列名：${queryResult.columns.join(", ")}`)
    
    if (sql) {
      parts.push(`\n**执行的SQL查询**：`)
      parts.push(`\`\`\`sql\n${sql}\n\`\`\``)
    }
    
    if (schema && schema.length > 0) {
      parts.push(`\n**相关数据表**：`)
      schema.forEach(s => {
        parts.push(`- ${s.tableName}: ${s.columns.map(c => c.name).join(", ")}`)
      })
    }
    
    // 添加数据样本（前5行和后5行，如果数据较多）
    parts.push(`\n**数据样本**：`)
    if (queryResult.rows.length <= 10) {
      parts.push(JSON.stringify(queryResult.rows, null, 2))
    } else {
      parts.push(`**前5行**：`)
      parts.push(JSON.stringify(queryResult.rows.slice(0, 5), null, 2))
      parts.push(`\n**后5行**：`)
      parts.push(JSON.stringify(queryResult.rows.slice(-5), null, 2))
      parts.push(`\n（共 ${queryResult.rows.length} 行，中间省略 ${queryResult.rows.length - 10} 行）`)
    }
    
    // 添加统计信息
    parts.push(`\n**数据统计**：`)
    queryResult.columns.forEach((col: string) => {
      const values = queryResult.rows.map((row: any) => row[col]).filter(v => v !== null && v !== undefined)
      if (values.length > 0) {
        const numericValues = values.filter(v => typeof v === 'number')
        if (numericValues.length > 0) {
          const sum = numericValues.reduce((a, b) => a + b, 0)
          const avg = sum / numericValues.length
          const max = Math.max(...numericValues)
          const min = Math.min(...numericValues)
          parts.push(`- ${col}: 总和=${sum.toFixed(2)}, 平均=${avg.toFixed(2)}, 最大=${max}, 最小=${min}`)
        } else {
          const uniqueValues = new Set(values)
          parts.push(`- ${col}: 唯一值数量=${uniqueValues.size}`)
        }
      }
    })
    
    return parts.join("\n")
  }

  /**
   * 构建报告生成提示词
   */
  private static async buildReportPrompt(
    dataSummary: string,
    userQuestion?: string,
    schema?: DatabaseSchema[],
    isEntityReport?: boolean
  ): Promise<string> {
    const schemaInfo = schema && schema.length > 0
      ? `\n**数据库结构信息**：\n${schema.map(s => `- ${s.tableName}: ${s.columns.map(c => c.name).join(", ")}`).join("\n")}`
      : ""

    // 从配置服务获取提示词
    let prompt = await PromptConfigService.getConfigWithVariables(
      "report_generation",
      "build_report_prompt",
      {
        userQuestion: userQuestion ? `**用户问题**：${userQuestion}\n` : "",
        dataSummary,
        schemaInfo,
      }
    )

    // 如果配置不存在，使用默认值（向后兼容）
    if (!prompt) {
      // 实体报告的专用提示词
      if (isEntityReport) {
        prompt = `你是一个专业的数据分析专家。请根据以下实体数据，生成一份详细的实体分析报告。

${userQuestion ? `**用户问题**：${userQuestion}\n` : ''}

${dataSummary}

${schemaInfo}

**任务要求**（实体报告专用）：

1. **实体基本信息**：总结实体的核心信息
   - 实体的主要属性（名称、ID、状态等）
   - 实体的关键特征
   - 实体的分类和标签

2. **关联数据概览**：总结与实体相关的所有数据
   - 关联记录的数量和类型
   - 关联数据的关键指标
   - 关联关系的强度和质量

3. **统计分析**：对实体进行全面的统计分析
   - 数值型字段的汇总统计（总和、平均值、最大值、最小值）
   - 时间序列趋势（如果有时间字段）
   - 分类统计和分布情况
   - 关键指标的变化趋势

4. **关键发现**：识别实体数据中的关键洞察
   - 实体的优势和特点
   - 潜在的问题和风险
   - 数据中的异常模式
   - 与其他实体的关联特征

5. **建议和行动**：基于实体分析结果提供建议
   - 针对实体特点的优化建议
   - 关联数据的改进方向
   - 下一步的行动建议

**输出格式**（JSON格式）：

\`\`\`json
{
  "title": "报告标题",
  "summary": "执行摘要（2-3段话，总结报告的核心内容）",
  "sections": [
    {
      "id": "section_1",
      "type": "ai_analysis",
      "title": "数据概览",
      "content": "详细的数据概览分析...",
      "order": 0
    },
    {
      "id": "section_2",
      "type": "ai_analysis",
      "title": "关键发现",
      "content": "关键发现的分析...",
      "order": 1
    },
    {
      "id": "section_3",
      "type": "ai_analysis",
      "title": "深度分析",
      "content": "深度分析内容...",
      "order": 2
    }
  ],
  "keyFindings": [
    "关键发现1",
    "关键发现2",
    "关键发现3"
  ],
  "recommendations": [
    "建议1",
    "建议2",
    "建议3"
  ]
}
\`\`\`

**注意事项**：
1. 报告内容要具体、有数据支撑
2. 使用Markdown格式编写内容，支持表格、列表等
3. 关键发现要突出重要信息
4. 建议要可操作、有针对性
5. 如果数据量很大，重点关注整体趋势和异常情况

请开始分析并生成报告：`
      } else {
        // 普通报告的提示词
        prompt = `你是一个专业的数据分析专家。请根据以下查询结果，生成一份详细的数据分析报告。

${userQuestion ? `**用户问题**：${userQuestion}\n` : ''}

${dataSummary}

${schemaInfo}

**任务要求**：

1. **数据概览**：总结数据的基本情况
   - 数据规模（行数、列数）
   - 数据范围和时间跨度（如果有时间字段）
   - 关键指标的基本统计

2. **关键发现**：识别数据中的关键洞察
   - 数据趋势（上升、下降、波动等）
   - 异常值或异常模式
   - 数据分布特征
   - 关键指标的变化

3. **深度分析**：对数据进行深入分析
   - 分析数据变化的原因（如果有时序数据）
   - 识别数据间的关联关系
   - 发现数据中的模式和规律

4. **建议和行动**：基于分析结果提供建议
   - 针对发现的问题提供解决方案
   - 提出优化建议
   - 建议下一步的分析方向

**输出格式**（JSON格式）：

\`\`\`json
{
  "title": "报告标题",
  "summary": "执行摘要（2-3段话，总结报告的核心内容）",
  "sections": [
    {
      "id": "section_1",
      "type": "ai_analysis",
      "title": "数据概览",
      "content": "详细的数据概览分析...",
      "order": 0
    },
    {
      "id": "section_2",
      "type": "ai_analysis",
      "title": "关键发现",
      "content": "关键发现的分析...",
      "order": 1
    },
    {
      "id": "section_3",
      "type": "ai_analysis",
      "title": "深度分析",
      "content": "深度分析内容...",
      "order": 2
    }
  ],
  "keyFindings": [
    "关键发现1",
    "关键发现2",
    "关键发现3"
  ],
  "recommendations": [
    "建议1",
    "建议2",
    "建议3"
  ]
}
\`\`\`

**注意事项**：
1. 报告内容要具体、有数据支撑
2. 使用Markdown格式编写内容，支持表格、列表等
3. 关键发现要突出重要信息
4. 建议要可操作、有针对性
5. 如果数据量很大，重点关注整体趋势和异常情况

请开始分析并生成报告：`
      }
    }

    return prompt
  }

  /**
   * 调用LLM生成报告
   */
  private static async callLLMForReport(
    llmConnection: any,
    validatedApiKey: string,
    prompt: string
  ): Promise<any> {
    // 构建API URL
    const provider = llmConnection.provider || "openai"
    const baseUrl = llmConnection.baseUrl || (provider === "ollama" ? "http://localhost:11434/v1" : "https://api.openai.com/v1")
    let apiUrl = baseUrl.endsWith("/") ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`
    
    if (baseUrl.includes("cloudflare.com")) {
      const model = llmConnection.model || "gpt-4o-mini"
      apiUrl = `https://gateway.ai.cloudflare.com/v1/${provider}/${model}/chat/completions`
    }

    const headers: HeadersInit = {
      "Content-Type": "application/json",
    }

    if (baseUrl.includes("cloudflare.com")) {
      // Cloudflare AI Gateway 不需要 API key
    } else if (provider === "ollama") {
      // Ollama 通常不需要 API Key，但如果提供了则使用
      if (validatedApiKey && validatedApiKey.trim() !== "" && validatedApiKey !== "***") {
        headers["Authorization"] = `Bearer ${validatedApiKey}`
      }
    } else if (provider === "anthropic") {
      headers["x-api-key"] = validatedApiKey
      headers["anthropic-version"] = "2023-06-01"
    } else {
      headers["Authorization"] = `Bearer ${validatedApiKey}`
    }

    const model = llmConnection.model || "gpt-4o-mini"
    const temperature = llmConnection.temperature || 0.7
    const maxTokens = llmConnection.maxTokens || 4000

    const response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: "system",
            content: (await PromptConfigService.getConfig("report_generation", "call_llm_for_report_system_message")) || "你是一个专业的数据分析专家，擅长生成详细、准确的数据分析报告。请仔细分析数据，识别关键洞察，并提供有价值的建议。",
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
      const errorText = await response.text()
      let errorMessage = `LLM API调用失败: ${response.status} - ${errorText}`
      let errorCode: number | undefined
      
      try {
        const errorJson = JSON.parse(errorText)
        errorCode = errorJson.error?.code || errorJson.code
        const rawMessage = errorJson.error?.message || errorJson.message || errorText
        
        // 针对 MiniMax 的错误代码提供友好的错误提示
        if (provider === "minimax") {
          if (errorCode === 1008 || rawMessage.toLowerCase().includes("insufficient balance")) {
            errorMessage = `❌ MiniMax 账户余额不足 (错误代码: ${errorCode || "1008"})\n\n您的 MiniMax 账户余额不足，无法生成报告。\n\n解决方案：\n1. 前往 MiniMax 控制台充值：https://platform.minimax.chat/\n2. 检查账户余额和套餐状态\n3. 确认 API Key 对应的账户是否有足够的余额`
          } else if (errorCode === 1001 || rawMessage.toLowerCase().includes("invalid api key")) {
            errorMessage = `❌ MiniMax API Key 无效 (错误代码: ${errorCode || "1001"})\n\nMiniMax API Key 无效或已过期。请前往 MiniMax 控制台检查并更新 API Key。`
          } else if (errorCode === 1002 || rawMessage.toLowerCase().includes("rate limit")) {
            errorMessage = `❌ MiniMax 请求频率超限 (错误代码: ${errorCode || "1002"})\n\nMiniMax API 请求频率超过限制。请稍后重试或升级套餐。`
          } else {
            errorMessage = `LLM API调用失败: ${response.status} - ${rawMessage}`
          }
        }
      } catch {
        // 如果解析失败，使用原始错误文本
      }
      
      throw new Error(errorMessage)
    }

    const data = await response.json()
    // 支持多种响应格式：OpenAI (choices), Anthropic (content), Ollama (message.content 或 response)
    const content = 
      data.choices?.[0]?.message?.content || 
      data.content || 
      data.message?.content ||
      data.response ||
      "{}"
    
    // 提取JSON
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error("无法从LLM响应中提取JSON")
    }

    try {
      return JSON.parse(jsonMatch[1] || jsonMatch[0])
    } catch (parseError) {
      throw new Error(`JSON解析失败: ${parseError}`)
    }
  }
}
