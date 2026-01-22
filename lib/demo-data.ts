// Chart type inference utilities
// Note: All query results come from real database queries, no fake data is generated

export function inferChartType(queryResult: any, question: string) {
  if (!queryResult || !queryResult.columns || !queryResult.rows || queryResult.rows.length === 0) {
    return null
  }

  const lowerQuestion = (question || "").toLowerCase()
  const { columns, rows } = queryResult

  // 确保至少有2列才能生成图表
  if (columns.length < 2) {
    return null
  }

  // Pie chart for distribution/percentage queries
  if (
    lowerQuestion.includes("distribution") ||
    lowerQuestion.includes("breakdown") ||
    lowerQuestion.includes("percentage") ||
    lowerQuestion.includes("share") ||
    lowerQuestion.includes("占比") ||
    lowerQuestion.includes("比例") ||
    lowerQuestion.includes("来自") ||
    lowerQuestion.includes("地区") ||
    lowerQuestion.includes("地域") ||
    lowerQuestion.includes("区域") ||
    lowerQuestion.includes("国家") ||
    lowerQuestion.includes("城市") ||
    lowerQuestion.includes("省份") ||
    lowerQuestion.includes("来源") ||
    lowerQuestion.includes("分布")
  ) {
    // 检查列名是否包含地区相关的关键词
    const hasRegionColumn = columns.some((col: string) => 
      col.toLowerCase().includes("地区") ||
      col.toLowerCase().includes("地域") ||
      col.toLowerCase().includes("区域") ||
      col.toLowerCase().includes("国家") ||
      col.toLowerCase().includes("城市") ||
      col.toLowerCase().includes("省份") ||
      col.toLowerCase().includes("country") ||
      col.toLowerCase().includes("region") ||
      col.toLowerCase().includes("city") ||
      col.toLowerCase().includes("province") ||
      col.toLowerCase().includes("state")
    )
    
    // 如果问题或列名包含地区相关关键词，使用饼图
    if (hasRegionColumn || 
        lowerQuestion.includes("来自") ||
        lowerQuestion.includes("地区") ||
        lowerQuestion.includes("分布")) {
      return {
        type: "pie" as const,
        title: "Distribution",
        data: rows,
        colors: ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#ef4444"],
      }
    }
  }

  // Line chart for time series
  // 检查列名是否包含时间相关关键词
  const hasTimeColumn = columns.some((col: string) => 
    col.toLowerCase().includes("month") || 
    col.toLowerCase().includes("date") || 
    col.toLowerCase().includes("time") ||
    col.toLowerCase().includes("日期") ||
    col.toLowerCase().includes("时间") ||
    col.toLowerCase().includes("月份") ||
    col.toLowerCase().includes("年") ||
    col.toLowerCase().includes("月") ||
    col.toLowerCase().includes("季度") ||
    col.toLowerCase().includes("周")
  )
  
  // 检查问题中是否包含时间序列关键词
  const hasTimeIntent = lowerQuestion.includes("按月") ||
                       lowerQuestion.includes("按年") ||
                       lowerQuestion.includes("按季度") ||
                       lowerQuestion.includes("按周") ||
                       lowerQuestion.includes("分别") ||
                       lowerQuestion.includes("各") ||
                       lowerQuestion.includes("每月") ||
                       lowerQuestion.includes("每年") ||
                       lowerQuestion.includes("趋势") ||
                       lowerQuestion.includes("变化") ||
                       lowerQuestion.includes("走势") ||
                       lowerQuestion.includes("monthly") ||
                       lowerQuestion.includes("yearly") ||
                       lowerQuestion.includes("trend")
  
  if (hasTimeColumn || hasTimeIntent) {
    const yAxisCols = columns.slice(1).filter(col => col)
    if (yAxisCols.length > 0) {
      return {
        type: "line" as const,
        title: "Trend Over Time",
        xAxis: columns[0],
        yAxis: yAxisCols.length === 1 ? yAxisCols[0] : yAxisCols,
        data: rows,
        colors: ["#3b82f6", "#8b5cf6"],
      }
    }
  }

  // Bar chart as default
  const yAxisCols = columns.slice(1).filter(col => col)
  if (yAxisCols.length > 0) {
    return {
      type: "bar" as const,
      title: "Results",
      xAxis: columns[0],
      yAxis: yAxisCols.length === 1 ? yAxisCols[0] : yAxisCols,
      data: rows,
      colors: ["#3b82f6", "#8b5cf6"],
    }
  }

  return null
}
