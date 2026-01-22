/**
 * 数字格式化工具
 * 将大数字转换为更易读的格式（万、亿等）
 */

export function formatNumber(value: any, options?: {
  showOriginal?: boolean
  precision?: number
}): string {
  if (value === null || value === undefined) return "-"
  
  const num = typeof value === "number" ? value : parseFloat(String(value))
  
  if (isNaN(num)) return String(value)
  
  const { showOriginal = false, precision = 2 } = options || {}
  
  // 处理负数
  const isNegative = num < 0
  const absNum = Math.abs(num)
  
  let formatted: string
  let unit = ""
  
  if (absNum >= 100000000) {
    // 亿
    formatted = (absNum / 100000000).toFixed(precision)
    unit = "亿"
  } else if (absNum >= 10000) {
    // 万
    formatted = (absNum / 10000).toFixed(precision)
    unit = "万"
  } else if (absNum >= 1000) {
    // 千
    formatted = (absNum / 1000).toFixed(precision)
    unit = "千"
  } else {
    // 小于1000，直接显示
    formatted = absNum.toFixed(precision === 2 && absNum % 1 === 0 ? 0 : precision)
  }
  
  // 移除末尾的0
  formatted = formatted.replace(/\.?0+$/, "")
  
  const result = `${isNegative ? "-" : ""}${formatted}${unit}`
  
  if (showOriginal && absNum >= 10000) {
    return `${result}（${num.toLocaleString("zh-CN")}）`
  }
  
  return result
}

/**
 * 格式化查询结果，生成总结性文字
 */
export function formatQuerySummary(
  queryResult: any,
  userQuestion: string
): string {
  if (!queryResult || !queryResult.rows || queryResult.rows.length === 0) {
    return "查询完成，但未返回数据。"
  }
  
  const rowCount = queryResult.rowCount || queryResult.rows.length
  const columns = queryResult.columns || []
  
  // 如果只有一行一列，生成简洁的总结
  if (rowCount === 1 && columns.length === 1) {
    const value = queryResult.rows[0][columns[0]]
    const formattedValue = formatNumber(value, { showOriginal: true })
    
    // 尝试从问题中提取指标名称
    const metricMatch = userQuestion.match(/(.+?)(?:是|为|有多少|多少)/)
    const metric = metricMatch ? metricMatch[1].trim() : columns[0]
    
    return `${metric}为${formattedValue}。`
  }
  
  // 如果是聚合查询（COUNT, SUM等），生成总结
  if (columns.length === 2 && rowCount === 1) {
    const firstCol = columns[0]
    const secondCol = columns[1]
    const firstValue = queryResult.rows[0][firstCol]
    const secondValue = queryResult.rows[0][secondCol]
    
    // 检查是否是聚合结果
    if (typeof secondValue === "number") {
      const formattedValue = formatNumber(secondValue, { showOriginal: true })
      return `${firstValue}的${secondCol}为${formattedValue}。`
    }
  }
  
  // 默认总结
  return `查询完成，共返回 ${rowCount} 条结果。`
}

/**
 * 从workProcess数组中解析步骤信息
 */
export function parseWorkProcess(workProcess: string[]): Array<{
  title: string
  status: "completed" | "in_progress" | "failed"
  duration?: number
  details?: any
}> {
  const steps: Array<{
    title: string
    status: "completed" | "in_progress" | "failed"
    duration?: number
    details?: any
  }> = []
  
  let currentStep: any = null
  
  for (const line of workProcess) {
    // 匹配步骤标题（如 "🔍 **步骤 1: 分析用户意图**"）
    const stepMatch = line.match(/(?:🔍|💬|📊|🔄|🤖|⚙️|✅|❌)\s*\*\*(.+?)\*\*/)
    if (stepMatch) {
      // 保存上一个步骤
      if (currentStep) {
        steps.push(currentStep)
      }
      
      // 创建新步骤
      const title = stepMatch[1].replace(/^步骤\s*\d+:\s*/, "")
      currentStep = {
        title,
        status: line.includes("✅") ? "completed" : 
                line.includes("❌") ? "failed" : 
                line.includes("🔄") ? "in_progress" : "completed",
        details: {},
      }
      
      // 提取耗时（如果有）
      const durationMatch = line.match(/耗时[：:]\s*(\d+)(ms|s)/)
      if (durationMatch) {
        const value = parseInt(durationMatch[1])
        currentStep.duration = durationMatch[2] === "s" ? value * 1000 : value
      }
    } else if (currentStep) {
      // 解析步骤详情
      // 提取表数量、字段数量等信息
      const tableMatch = line.match(/(\d+)\s*个表/)
      if (tableMatch) {
        currentStep.details.tableCount = parseInt(tableMatch[1])
      }
      
      const fieldMatch = line.match(/(\d+)\s*个字段/)
      if (fieldMatch) {
        currentStep.details.fieldCount = parseInt(fieldMatch[1])
      }
    }
  }
  
  // 添加最后一个步骤
  if (currentStep) {
    steps.push(currentStep)
  }
  
  return steps
}
