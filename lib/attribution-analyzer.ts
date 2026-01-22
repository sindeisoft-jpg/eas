/**
 * 归因分析器
 * 参考火山引擎智能分析Agent的归因分析能力
 * 分析数据变化的原因和影响因素，识别转折点
 */

import type { QueryResult } from "./types"
import type { DatabaseSchema } from "./types"
import { PromptConfigService } from "./prompt-config-service"

export interface AttributionInsight {
  type: "trend_change" | "spike" | "drop" | "correlation" | "anomaly"
  description: string
  timePoint?: string | number
  magnitude?: number // 变化幅度
  factors?: string[] // 可能的影响因素
  confidence: number // 置信度 0-1
}

export interface AttributionAnalysis {
  insights: AttributionInsight[]
  summary: string
  recommendations?: string[]
  dataPoints: {
    time: string | number
    value: number
    label?: string
  }[]
  turningPoints: {
    time: string | number
    value: number
    change: number
    description: string
  }[]
}

export class AttributionAnalyzer {
  /**
   * 执行归因分析
   * 分析数据变化的原因，识别转折点
   */
  static async analyze(
    data: QueryResult | any[],
    options?: {
      timeColumn?: string
      valueColumn?: string
      groupBy?: string
    }
  ): Promise<AttributionAnalysis> {
    // 转换数据格式
    const dataPoints = this.extractDataPoints(data, options)
    
    // 识别转折点
    const turningPoints = this.identifyTurningPoints(dataPoints)
    
    // 生成洞察
    const insights = this.generateInsights(dataPoints, turningPoints)
    
    // 生成摘要
    const summary = this.generateSummary(insights, turningPoints)
    
    // 生成建议
    const recommendations = this.generateRecommendations(insights)
    
    return {
      insights,
      summary,
      recommendations,
      dataPoints,
      turningPoints,
    }
  }

  /**
   * 提取数据点
   */
  private static extractDataPoints(
    data: QueryResult | any[],
    options?: {
      timeColumn?: string
      valueColumn?: string
      groupBy?: string
    }
  ): AttributionAnalysis["dataPoints"] {
    let rows: any[] = []
    
    if (Array.isArray(data)) {
      rows = data
    } else if (data && typeof data === "object" && "rows" in data) {
      rows = (data as QueryResult).rows
    } else {
      return []
    }
    
    if (rows.length === 0) {
      return []
    }
    
    // 自动识别时间列和数值列
    const timeColumn = options?.timeColumn || this.detectTimeColumn(rows[0])
    const valueColumn = options?.valueColumn || this.detectValueColumn(rows[0])
    
    if (!timeColumn || !valueColumn) {
      return []
    }
    
    return rows
      .map(row => {
        const time = row[timeColumn]
        const value = parseFloat(row[valueColumn]) || 0
        
        return {
          time,
          value,
          label: row[options?.groupBy] || undefined,
        }
      })
      .filter(dp => dp.value !== null && dp.value !== undefined)
      .sort((a, b) => {
        // 按时间排序
        if (typeof a.time === "string" && typeof b.time === "string") {
          return a.time.localeCompare(b.time)
        }
        return (a.time as number) - (b.time as number)
      })
  }

  /**
   * 自动检测时间列
   */
  private static detectTimeColumn(row: any): string | undefined {
    const timeKeywords = ["time", "date", "日期", "时间", "week", "周", "month", "月", "year", "年"]
    
    for (const key of Object.keys(row)) {
      const keyLower = key.toLowerCase()
      if (timeKeywords.some(kw => keyLower.includes(kw))) {
        return key
      }
    }
    
    // 如果没有找到，尝试第一个字符串列
    for (const key of Object.keys(row)) {
      if (typeof row[key] === "string") {
        return key
      }
    }
    
    return undefined
  }

  /**
   * 自动检测数值列
   */
  private static detectValueColumn(row: any): string | undefined {
    const valueKeywords = ["value", "count", "数量", "数值", "sum", "total", "总数", "amount", "金额"]
    
    for (const key of Object.keys(row)) {
      const keyLower = key.toLowerCase()
      if (valueKeywords.some(kw => keyLower.includes(kw))) {
        return key
      }
    }
    
    // 如果没有找到，尝试第一个数值列
    for (const key of Object.keys(row)) {
      if (typeof row[key] === "number") {
        return key
      }
    }
    
    return undefined
  }

  /**
   * 识别转折点
   */
  private static identifyTurningPoints(
    dataPoints: AttributionAnalysis["dataPoints"]
  ): AttributionAnalysis["turningPoints"] {
    if (dataPoints.length < 3) {
      return []
    }
    
    const turningPoints: AttributionAnalysis["turningPoints"] = []
    
    for (let i = 1; i < dataPoints.length - 1; i++) {
      const prev = dataPoints[i - 1]
      const curr = dataPoints[i]
      const next = dataPoints[i + 1]
      
      // 计算变化率
      const prevChange = curr.value - prev.value
      const nextChange = next.value - curr.value
      
      // 识别转折点：变化方向改变
      if (
        (prevChange > 0 && nextChange < 0) || // 从上升转为下降
        (prevChange < 0 && nextChange > 0)     // 从下降转为上升
      ) {
        const change = Math.abs(prevChange) + Math.abs(nextChange)
        const description = prevChange > 0 && nextChange < 0
          ? "数据达到峰值后开始下降"
          : "数据达到谷底后开始上升"
        
        turningPoints.push({
          time: curr.time,
          value: curr.value,
          change,
          description,
        })
      }
      
      // 识别异常波动：变化幅度超过阈值
      const avgChange = Math.abs(prevChange + nextChange) / 2
      const threshold = this.calculateThreshold(dataPoints)
      
      if (Math.abs(prevChange) > threshold * 2 || Math.abs(nextChange) > threshold * 2) {
        // 检查是否已经添加过这个转折点
        const exists = turningPoints.some(tp => tp.time === curr.time)
        if (!exists) {
          turningPoints.push({
            time: curr.time,
            value: curr.value,
            change: Math.max(Math.abs(prevChange), Math.abs(nextChange)),
            description: "检测到异常波动",
          })
        }
      }
    }
    
    return turningPoints
  }

  /**
   * 计算变化阈值
   */
  private static calculateThreshold(dataPoints: AttributionAnalysis["dataPoints"]): number {
    if (dataPoints.length < 2) {
      return 0
    }
    
    const changes: number[] = []
    for (let i = 1; i < dataPoints.length; i++) {
      changes.push(Math.abs(dataPoints[i].value - dataPoints[i - 1].value))
    }
    
    // 使用中位数作为阈值
    changes.sort((a, b) => a - b)
    const median = changes[Math.floor(changes.length / 2)]
    
    return median * 1.5 // 1.5倍中位数作为阈值
  }

  /**
   * 生成洞察
   */
  private static generateInsights(
    dataPoints: AttributionAnalysis["dataPoints"],
    turningPoints: AttributionAnalysis["turningPoints"]
  ): AttributionInsight[] {
    const insights: AttributionInsight[] = []
    
    if (dataPoints.length === 0) {
      return insights
    }
    
    // 分析整体趋势
    const firstValue = dataPoints[0].value
    const lastValue = dataPoints[dataPoints.length - 1].value
    const overallChange = lastValue - firstValue
    const changePercentage = (overallChange / Math.abs(firstValue)) * 100
    
    if (Math.abs(changePercentage) > 10) {
      insights.push({
        type: overallChange > 0 ? "spike" : "drop",
        description: `整体${overallChange > 0 ? "上升" : "下降"} ${Math.abs(changePercentage).toFixed(1)}%`,
        magnitude: Math.abs(changePercentage),
        confidence: 0.8,
      })
    }
    
    // 分析转折点
    for (const tp of turningPoints) {
      insights.push({
        type: "trend_change",
        description: tp.description,
        timePoint: tp.time,
        magnitude: tp.change,
        confidence: 0.7,
      })
    }
    
    // 识别异常值
    const values = dataPoints.map(dp => dp.value)
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length
    const stdDev = Math.sqrt(variance)
    
    for (const dp of dataPoints) {
      if (Math.abs(dp.value - mean) > stdDev * 2) {
        insights.push({
          type: "anomaly",
          description: `在 ${dp.time} 检测到异常值: ${dp.value}`,
          timePoint: dp.time,
          magnitude: Math.abs(dp.value - mean),
          confidence: 0.6,
        })
      }
    }
    
    return insights
  }

  /**
   * 生成摘要
   */
  private static generateSummary(
    insights: AttributionInsight[],
    turningPoints: AttributionAnalysis["turningPoints"]
  ): string {
    const parts: string[] = []
    
    parts.push(`共识别到 ${insights.length} 个关键洞察。`)
    
    if (turningPoints.length > 0) {
      parts.push(`发现 ${turningPoints.length} 个数据转折点，`)
      const latestTurningPoint = turningPoints[turningPoints.length - 1]
      parts.push(`最近的转折点出现在 ${latestTurningPoint.time}，${latestTurningPoint.description}。`)
    }
    
    const trendInsights = insights.filter(i => i.type === "spike" || i.type === "drop")
    if (trendInsights.length > 0) {
      const trend = trendInsights[0]
      parts.push(`整体趋势：${trend.description}。`)
    }
    
    return parts.join(" ")
  }

  /**
   * 生成建议
   */
  private static generateRecommendations(insights: AttributionInsight[]): string[] {
    const recommendations: string[] = []
    
    const turningPoints = insights.filter(i => i.type === "trend_change")
    if (turningPoints.length > 0) {
      recommendations.push("建议深入分析转折点的原因，识别导致变化的关键因素")
    }
    
    const anomalies = insights.filter(i => i.type === "anomaly")
    if (anomalies.length > 0) {
      recommendations.push("建议检查异常值是否由数据质量问题或特殊事件导致")
    }
    
    const spikes = insights.filter(i => i.type === "spike")
    if (spikes.length > 0) {
      recommendations.push("建议分析数据上升的原因，并评估是否可以持续")
    }
    
    const drops = insights.filter(i => i.type === "drop")
    if (drops.length > 0) {
      recommendations.push("建议分析数据下降的原因，并制定应对策略")
    }
    
    return recommendations.length > 0 
      ? recommendations 
      : ["建议持续监控数据变化，及时识别异常情况"]
  }

  /**
   * 使用LLM进行智能归因分析
   * 分析数据变化的原因，识别影响因素
   */
  static async analyzeWithLLM(
    data: QueryResult | any[],
    llmConnection: any,
    validatedApiKey: string,
    schema?: DatabaseSchema[],
    userQuestion?: string,
    options?: {
      timeColumn?: string
      valueColumn?: string
      groupBy?: string
    }
  ): Promise<AttributionAnalysis> {
    // 先执行基础分析
    const baseAnalysis = await this.analyze(data, options)
    
    // 如果没有转折点或洞察，不需要LLM分析
    if (baseAnalysis.turningPoints.length === 0 && baseAnalysis.insights.length === 0) {
      return baseAnalysis
    }

    // 如果没有LLM连接或API Key，返回基础分析
    if (!llmConnection || !validatedApiKey) {
      return baseAnalysis
    }

    try {
      // 准备数据摘要
      const dataSummary = this.prepareDataSummary(baseAnalysis, data, options)
      
      // 构建提示词
      const prompt = await this.buildAttributionPrompt(
        baseAnalysis,
        dataSummary,
        schema,
        userQuestion
      )

      // 调用LLM进行归因分析（API Key将在调用时验证）
      const llmAnalysis = await this.callLLMForAttribution(llmConnection, prompt)
      
      // 合并LLM分析结果和基础分析
      return this.mergeAnalysisResults(baseAnalysis, llmAnalysis)
    } catch (error: any) {
      console.warn("[AttributionAnalyzer] LLM analysis failed, using base analysis:", error.message)
      // 如果LLM分析失败，返回基础分析
      return baseAnalysis
    }
  }

  /**
   * 准备数据摘要用于LLM分析
   */
  private static prepareDataSummary(
    analysis: AttributionAnalysis,
    data: QueryResult | any[],
    options?: {
      timeColumn?: string
      valueColumn?: string
      groupBy?: string
    }
  ): string {
    const parts: string[] = []
    
    parts.push(`**数据概览**：`)
    parts.push(`- 数据点数量：${analysis.dataPoints.length}`)
    if (analysis.dataPoints.length > 0) {
      const firstPoint = analysis.dataPoints[0]
      const lastPoint = analysis.dataPoints[analysis.dataPoints.length - 1]
      parts.push(`- 时间范围：${firstPoint.time} 至 ${lastPoint.time}`)
      parts.push(`- 数值范围：${Math.min(...analysis.dataPoints.map(dp => dp.value))} 至 ${Math.max(...analysis.dataPoints.map(dp => dp.value))}`)
    }
    
    parts.push(`\n**转折点**：`)
    if (analysis.turningPoints.length > 0) {
      analysis.turningPoints.forEach((tp, index) => {
        parts.push(`${index + 1}. ${tp.time}: ${tp.description}，变化幅度 ${tp.change.toFixed(2)}`)
      })
    } else {
      parts.push(`未发现明显的转折点`)
    }
    
    parts.push(`\n**关键洞察**：`)
    if (analysis.insights.length > 0) {
      analysis.insights.forEach((insight, index) => {
        parts.push(`${index + 1}. [${insight.type}] ${insight.description}`)
        if (insight.magnitude) {
          parts.push(`   变化幅度：${insight.magnitude.toFixed(2)}，置信度：${(insight.confidence * 100).toFixed(0)}%`)
        }
      })
    } else {
      parts.push(`未发现关键洞察`)
    }
    
    // 添加数据样本（最近5个数据点）
    if (analysis.dataPoints.length > 0) {
      parts.push(`\n**数据样本（最近5个数据点）**：`)
      const recentPoints = analysis.dataPoints.slice(-5)
      recentPoints.forEach((dp, index) => {
        parts.push(`${index + 1}. 时间：${dp.time}，数值：${dp.value}${dp.label ? `，标签：${dp.label}` : ''}`)
      })
    }
    
    return parts.join("\n")
  }

  /**
   * 构建归因分析提示词
   */
  private static async buildAttributionPrompt(
    analysis: AttributionAnalysis,
    dataSummary: string,
    schema?: DatabaseSchema[],
    userQuestion?: string
  ): Promise<string> {
    const schemaInfo = schema && schema.length > 0
      ? `\n**数据库结构信息**：\n${schema.map(s => `- ${s.tableName}: ${s.columns.map(c => c.name).join(", ")}`).join("\n")}`
      : ""

    // 从配置服务获取提示词
    let prompt = await PromptConfigService.getConfigWithVariables(
      "attribution_analysis",
      "build_attribution_prompt",
      {
        userQuestion: userQuestion ? `**用户问题**：${userQuestion}\n` : "",
        dataSummary,
        schemaInfo,
      }
    )

    // 如果配置不存在，使用默认值（向后兼容）
    if (!prompt) {
      prompt = `你是一个数据分析专家，擅长进行归因分析。请根据以下数据变化信息，分析数据变化的原因和影响因素。

${userQuestion ? `**用户问题**：${userQuestion}\n` : ''}

${dataSummary}

${schemaInfo}

**任务要求**：

1. **分析转折点原因**：对于识别出的转折点，分析可能导致数据变化的原因
   - 考虑业务因素（如营销活动、产品发布、市场变化等）
   - 考虑时间因素（如季节性、节假日、周期性等）
   - 考虑数据质量因素（如数据异常、统计口径变化等）

2. **识别影响因素**：为每个转折点或异常变化识别可能的影响因素
   - 列出3-5个最可能的影响因素
   - 评估每个因素的置信度（0-1）
   - 说明为什么这些因素可能导致数据变化

3. **生成归因报告**：生成详细的归因分析报告
   - 总结数据变化的整体原因
   - 解释转折点出现的可能原因
   - 提供可验证的假设

**输出格式**（JSON格式）：

\`\`\`json
{
  "summary": "数据变化原因的整体总结（2-3句话）",
  "factors": [
    {
      "factor": "影响因素名称",
      "description": "该因素如何影响数据变化",
      "confidence": 0.8,
      "relatedTimePoint": "关联的转折点时间（如果有）"
    }
  ],
  "attributionInsights": [
    {
      "type": "trend_change|spike|drop|correlation|anomaly",
      "description": "详细的归因分析描述",
      "timePoint": "时间点（如果有）",
      "factors": ["影响因素1", "影响因素2"],
      "confidence": 0.8
    }
  ],
  "recommendations": [
    "建议1：如何验证归因假设",
    "建议2：如何应对数据变化"
  ]
}
\`\`\`

请开始分析并返回JSON格式的结果：`
    }

    return prompt
  }

  /**
   * 调用LLM进行归因分析
   */
  private static async callLLMForAttribution(
    llmConnection: any,
    prompt: string,
    validatedApiKey?: string
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

    // 使用传入的已验证API Key，如果没有则使用连接中的
    const apiKey = validatedApiKey || llmConnection.apiKey

    if (baseUrl.includes("cloudflare.com")) {
      // Cloudflare AI Gateway 不需要 API key
    } else if (provider === "ollama") {
      // Ollama 通常不需要 API Key，但如果提供了则使用
      if (apiKey && apiKey.trim() !== "" && apiKey !== "***") {
        headers["Authorization"] = `Bearer ${apiKey}`
      }
    } else if (provider === "anthropic") {
      if (!apiKey || apiKey.trim() === "" || apiKey === "***") {
        throw new Error("LLM API Key not available")
      }
      headers["x-api-key"] = apiKey
      headers["anthropic-version"] = "2023-06-01"
    } else {
      if (!apiKey || apiKey.trim() === "" || apiKey === "***") {
        throw new Error("LLM API Key not available")
      }
      headers["Authorization"] = `Bearer ${apiKey}`
    }

    const model = llmConnection.model || "gpt-4o-mini"
    const temperature = llmConnection.temperature || 0.7
    const maxTokens = llmConnection.maxTokens || 2000

    const response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: "system",
            content: (await PromptConfigService.getConfig("attribution_analysis", "call_llm_for_attribution_system_message")) || "你是一个专业的数据分析专家，擅长进行归因分析。请仔细分析数据变化，识别影响因素，并生成详细的归因报告。",
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
            errorMessage = `❌ MiniMax 账户余额不足 (错误代码: ${errorCode || "1008"})\n\n您的 MiniMax 账户余额不足，无法完成归因分析。\n\n解决方案：\n1. 前往 MiniMax 控制台充值：https://platform.minimax.chat/\n2. 检查账户余额和套餐状态\n3. 确认 API Key 对应的账户是否有足够的余额`
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

  /**
   * 合并基础分析和LLM分析结果
   */
  private static mergeAnalysisResults(
    baseAnalysis: AttributionAnalysis,
    llmAnalysis: any
  ): AttributionAnalysis {
    // 更新摘要
    const summary = llmAnalysis.summary || baseAnalysis.summary
    
    // 增强洞察，添加LLM识别的因素
    const enhancedInsights = baseAnalysis.insights.map(insight => {
      // 查找LLM分析中对应的洞察
      const llmInsight = llmAnalysis.attributionInsights?.find((li: any) => 
        li.type === insight.type && 
        (li.timePoint === insight.timePoint || (!li.timePoint && !insight.timePoint))
      )
      
      if (llmInsight) {
        return {
          ...insight,
          description: llmInsight.description || insight.description,
          factors: llmInsight.factors || insight.factors,
          confidence: Math.max(insight.confidence, llmInsight.confidence || 0.5),
        }
      }
      
      return insight
    })
    
    // 添加LLM新识别的洞察
    if (llmAnalysis.attributionInsights) {
      for (const llmInsight of llmAnalysis.attributionInsights) {
        const exists = enhancedInsights.some(insight => 
          insight.type === llmInsight.type && 
          insight.timePoint === llmInsight.timePoint
        )
        if (!exists) {
          enhancedInsights.push({
            type: llmInsight.type,
            description: llmInsight.description,
            timePoint: llmInsight.timePoint,
            magnitude: llmInsight.magnitude,
            factors: llmInsight.factors,
            confidence: llmInsight.confidence || 0.5,
          })
        }
      }
    }
    
    // 更新建议
    const recommendations = [
      ...baseAnalysis.recommendations || [],
      ...(llmAnalysis.recommendations || []),
    ]

    return {
      ...baseAnalysis,
      insights: enhancedInsights,
      summary,
      recommendations: [...new Set(recommendations)], // 去重
    }
  }
}
