/**
 * 意图分析器
 * 分析用户提问，确定数据采集策略和SQL生成需求
 */

export interface IntentAnalysis {
  intent: "list_all" | "filter" | "aggregate" | "join" | "top_n" | "search" | "statistics" | "unknown"
  requiresFullData: boolean // 是否需要完整数据
  requiresSamples: boolean // 是否需要样本数据
  requiresStats: boolean // 是否需要统计信息
  targetTables: string[] // 目标表
  keyPhrases: string[] // 关键短语
  suggestedLimit?: number // 建议的LIMIT数量
  shouldGenerateReport?: boolean // 是否需要生成报表
  reportType?: "sales_trend" | "sales_funnel" | "revenue_analysis" | "customer_analysis" | "product_analysis" | "custom" // 报表类型
  complexity?: "low" | "medium" | "high" // 查询复杂度
  displayFormat?: "chart" | "table" | "report" | null // 数据展示格式：图表、表格、报表
}

export class IntentAnalyzer {
  /**
   * 分析用户提问的意图
   */
  static analyze(question: string, availableTables: string[]): IntentAnalysis {
    const lowerQuestion = question.toLowerCase()
    const analysis: IntentAnalysis = {
      intent: "unknown",
      requiresFullData: false,
      requiresSamples: false,
      requiresStats: false,
      targetTables: [],
      keyPhrases: [],
    }

    // 提取关键短语
    const phrases = this.extractKeyPhrases(lowerQuestion)
    analysis.keyPhrases = phrases

    // 识别意图
    if (this.matchesPattern(lowerQuestion, ["所有", "全部", "列出", "显示", "查询所有", "all", "list all", "show all"])) {
      analysis.intent = "list_all"
      analysis.requiresFullData = true
      analysis.requiresSamples = false
    } else if (
      this.matchesPattern(lowerQuestion, [
        "最好",
        "最多",
        "最少",
        "最高",
        "最低",
        "最大",
        "最小",
        "前",
        "top",
        "best",
        "most",
        "least",
        "highest",
        "lowest",
        "largest",
        "smallest",
      ])
    ) {
      analysis.intent = "top_n"
      analysis.requiresFullData = false
      analysis.requiresStats = true
      analysis.requiresSamples = true
      // 提取数字
      const numberMatch = lowerQuestion.match(/(\d+)/)
      if (numberMatch) {
        analysis.suggestedLimit = parseInt(numberMatch[1])
      } else {
        analysis.suggestedLimit = 10 // 默认前10
      }
    } else if (
      this.matchesPattern(lowerQuestion, [
        "统计",
        "汇总",
        "分组",
        "每个",
        "按",
        "count",
        "sum",
        "avg",
        "average",
        "total",
        "group by",
        "统计",
        "汇总",
      ])
    ) {
      analysis.intent = "aggregate"
      analysis.requiresFullData = true
      analysis.requiresStats = true
    } else if (
      this.matchesPattern(lowerQuestion, [
        "包含",
        "匹配",
        "查找",
        "搜索",
        "where",
        "like",
        "contains",
        "search",
        "find",
      ])
    ) {
      analysis.intent = "filter"
      analysis.requiresFullData = false
      analysis.requiresSamples = true
    } else if (
      this.matchesPattern(lowerQuestion, [
        "关联",
        "连接",
        "join",
        "关联",
        "关系",
        "related",
        "connect",
      ])
    ) {
      analysis.intent = "join"
      analysis.requiresFullData = false
      analysis.requiresSamples = true
      analysis.requiresStats = false
    } else if (
      this.matchesPattern(lowerQuestion, [
        "数量",
        "总数",
        "有多少",
        "count",
        "number",
        "how many",
        "total",
      ])
    ) {
      analysis.intent = "statistics"
      analysis.requiresFullData = false
      analysis.requiresStats = true
    } else {
      // 默认情况：需要样本数据来理解结构
      analysis.intent = "unknown"
      analysis.requiresSamples = true
    }

    // 识别目标表
    analysis.targetTables = this.identifyTargetTables(lowerQuestion, availableTables)

    // 检测数据展示格式（图表、表格、报表）
    analysis.displayFormat = this.detectDisplayFormat(lowerQuestion)

    // 检测是否需要生成报表
    const reportDetection = this.detectReportGeneration(lowerQuestion, analysis)
    analysis.shouldGenerateReport = reportDetection.shouldGenerate
    analysis.reportType = reportDetection.reportType
    analysis.complexity = reportDetection.complexity

    return analysis
  }

  /**
   * 提取关键短语
   */
  private static extractKeyPhrases(question: string): string[] {
    const phrases: string[] = []
    const commonPhrases = [
      "所有",
      "全部",
      "最好",
      "最多",
      "统计",
      "汇总",
      "包含",
      "关联",
      "最新",
      "最旧",
      "前",
      "后",
      "数量",
      "总数",
    ]

    for (const phrase of commonPhrases) {
      if (question.includes(phrase)) {
        phrases.push(phrase)
      }
    }

    return phrases
  }

  /**
   * 检查问题是否匹配模式
   */
  private static matchesPattern(question: string, patterns: string[]): boolean {
    return patterns.some((pattern) => question.includes(pattern))
  }

  /**
   * 识别目标表
   */
  private static identifyTargetTables(question: string, availableTables: string[]): string[] {
    const tables: string[] = []

    for (const table of availableTables) {
      const tableLower = table.toLowerCase()
      // 检查问题中是否包含表名（单数或复数形式）
      if (
        question.includes(tableLower) ||
        question.includes(tableLower + "s") ||
        question.includes(tableLower.slice(0, -1)) // 去掉复数s
      ) {
        tables.push(table)
      }
    }

    // 如果没有找到明确的表，返回所有表（让AI决定）
    if (tables.length === 0) {
      return availableTables
    }

    return tables
  }

  /**
   * 生成数据采集策略描述
   */
  static describeStrategy(analysis: IntentAnalysis): string {
    const parts: string[] = []

    parts.push(`**意图分析**：${this.getIntentName(analysis.intent)}`)

    if (analysis.requiresFullData) {
      parts.push("**数据需求**：需要获取完整数据（全表扫描）")
    } else if (analysis.requiresStats) {
      parts.push("**数据需求**：需要统计信息来优化查询")
    } else if (analysis.requiresSamples) {
      parts.push("**数据需求**：需要样本数据来理解数据结构")
    }

    if (analysis.targetTables.length > 0) {
      parts.push(`**目标表**：${analysis.targetTables.join(", ")}`)
    }

    if (analysis.suggestedLimit) {
      parts.push(`**建议限制**：返回前 ${analysis.suggestedLimit} 条记录`)
    }

    return parts.join("\n")
  }

  /**
   * 获取意图名称
   */
  private static getIntentName(intent: IntentAnalysis["intent"]): string {
    const names: Record<IntentAnalysis["intent"], string> = {
      list_all: "列出所有数据",
      filter: "过滤查询",
      aggregate: "聚合统计",
      join: "多表关联",
      top_n: "Top N 查询",
      search: "搜索查询",
      statistics: "统计查询",
      unknown: "未知意图",
    }
    return names[intent]
  }

  /**
   * 检测是否需要生成报表
   */
  private static detectReportGeneration(
    question: string,
    analysis: IntentAnalysis
  ): {
    shouldGenerate: boolean
    reportType?: IntentAnalysis["reportType"]
    complexity?: IntentAnalysis["complexity"]
  } {
    // 报表生成关键词
    const REPORT_KEYWORDS = [
      '报表', '报告', '分析报告', '生成报表', '创建报表',
      '销售报表', '数据报表', '业务报表', '统计报表',
      '给我看', '帮我分析', '总结一下', '分析一下',
      '生成报告', '创建报告', '制作报表', '生成一个报告',
      '制作报告', '创建分析报告'
    ]
    
    // 检测实体报告模式：xxx的报告
    const entityReportPattern = /^(.+?)(?:的)?报告$/i
    const entityReportMatch = question.match(entityReportPattern)
    if (entityReportMatch && entityReportMatch[1]) {
      return {
        shouldGenerate: true,
        reportType: 'entity',
        complexity: 'high'
      }
    }

    // 显式命令检测
    const hasExplicitCommand = REPORT_KEYWORDS.some(keyword => question.includes(keyword))
    
    if (hasExplicitCommand) {
      // 检测报表类型
      const reportType = this.detectReportType(question)
      return {
        shouldGenerate: true,
        reportType,
        complexity: 'high'
      }
    }

    // 检查意图类型和复杂度
    const isComplexQuery = 
      analysis.intent === 'aggregate' || 
      analysis.intent === 'join' ||
      (analysis.intent === 'statistics' && question.length > 30)

    if (isComplexQuery && question.length > 50) {
      return {
        shouldGenerate: true,
        reportType: 'custom',
        complexity: 'high'
      }
    }

    // 检查是否包含分析关键词
    const analysisKeywords = [
      '分析', '趋势', '对比', '总结', '洞察', '发现',
      '分析', '趋势', '对比', '总结', '洞察', '发现',
      '分析', '趋势', '对比', '总结', '洞察', '发现'
    ]
    
    const hasAnalysisKeywords = analysisKeywords.some(keyword => question.includes(keyword))
    if (hasAnalysisKeywords && question.length > 40) {
      return {
        shouldGenerate: true,
        reportType: 'custom',
        complexity: 'medium'
      }
    }

    return {
      shouldGenerate: false
    }
  }

  /**
   * 检测数据展示格式（图表、表格、报表）
   */
  private static detectDisplayFormat(question: string): IntentAnalysis["displayFormat"] {
    const lowerQuestion = question.toLowerCase()
    
    // 检测图表关键词（优先级最高，因为用户可能同时提到多个概念）
    const chartKeywords = [
      '图表', 'chart', '可视化', 'visualization', 
      '柱状图', '折线图', '饼图', '面积图', '散点图', '雷达图', 
      '仪表盘', '漏斗图', '热力图', '树图', '矩形树图', '旭日图',
      '用图表', '生成图表', '创建图表', '制作图表', '画图表', '绘制图表',
      '展示图表', '显示图表', '图表展示', '图表显示', '以图表形式',
      'bar chart', 'line chart', 'pie chart', 'area chart', 'scatter chart'
    ]
    const hasChartIntent = chartKeywords.some(keyword => lowerQuestion.includes(keyword))
    
    // 检测表格关键词
    const tableKeywords = [
      '表格', 'table', '列表', 'list', '数据表',
      '以表格形式', '用表格展示', '用表格显示', '表格形式', 
      '表格展示', '表格显示', '列表形式', '以列表形式',
      '数据表格', '表格数据'
    ]
    const hasTableIntent = tableKeywords.some(keyword => lowerQuestion.includes(keyword))
    
    // 检测报表/报告关键词
    const reportKeywords = [
      '报表', '报告', 'report', '分析报告', '生成报表', '创建报表', '制作报表',
      '生成报告', '创建报告', '制作报告', '业务报表', '数据报表', '统计报表',
      '分析报告', '完整报告', '详细报告'
    ]
    const hasReportIntent = reportKeywords.some(keyword => lowerQuestion.includes(keyword))
    
    // 优先级判断：报表 > 图表 > 表格
    // 如果用户明确要求报表，即使也提到图表，也返回 report
    if (hasReportIntent) {
      return 'report'
    }
    
    // 如果用户明确要求图表，返回 chart
    if (hasChartIntent && !hasTableIntent) {
      return 'chart'
    }
    
    // 如果用户明确要求表格，返回 table
    if (hasTableIntent && !hasChartIntent) {
      return 'table'
    }
    
    // 如果同时提到图表和表格，优先返回图表（因为表格是默认格式）
    if (hasChartIntent && hasTableIntent) {
      return 'chart'
    }
    
    // 如果没有明确要求，返回 null，让系统智能判断
    return null
  }

  /**
   * 检测报表类型
   */
  private static detectReportType(question: string): IntentAnalysis["reportType"] {
    const lowerQuestion = question.toLowerCase()
    
    if (lowerQuestion.includes('销售趋势') || lowerQuestion.includes('销售趋势') || lowerQuestion.includes('sales trend')) {
      return 'sales_trend'
    }
    if (lowerQuestion.includes('销售漏斗') || lowerQuestion.includes('销售漏斗') || lowerQuestion.includes('sales funnel')) {
      return 'sales_funnel'
    }
    if (lowerQuestion.includes('收入') || lowerQuestion.includes('revenue')) {
      return 'revenue_analysis'
    }
    if (lowerQuestion.includes('客户') || lowerQuestion.includes('customer')) {
      return 'customer_analysis'
    }
    if (lowerQuestion.includes('产品') || lowerQuestion.includes('product')) {
      return 'product_analysis'
    }
    
    return 'custom'
  }

  /**
   * 检查是否需要生成报表（公共方法）
   */
  static shouldGenerateReport(userQuestion: string, intent?: IntentAnalysis): boolean {
    if (intent?.shouldGenerateReport !== undefined) {
      return intent.shouldGenerateReport
    }
    
    const lowerQuestion = userQuestion.toLowerCase()
    const REPORT_KEYWORDS = [
      '报表', '报告', '分析报告', '生成报表',
      '销售报表', '数据报表', '业务报表',
      '给我看', '帮我分析', '总结一下'
    ]
    
    // 检查显式命令
    if (REPORT_KEYWORDS.some(keyword => lowerQuestion.includes(keyword))) {
      return true
    }
    
    // 检查意图类型
    if (intent && (intent.intent === 'complex_query' || intent.complexity === 'high')) {
      return true
    }
    
    // 检查问题长度和复杂度
    if (userQuestion.length > 50) {
      const analysisKeywords = ['分析', '趋势', '对比', '总结', '洞察']
      if (analysisKeywords.some(keyword => lowerQuestion.includes(keyword))) {
        return true
      }
    }
    
    return false
  }
}

