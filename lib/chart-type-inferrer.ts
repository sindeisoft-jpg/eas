/**
 * 图表类型推断器
 * 根据JSON数据结构智能推断最合适的图表类型
 */

import type { ChartConfig } from "./types"
import type { JSONDataStructure } from "./json-data-detector"

/**
 * 从JSON数据推断图表类型
 */
export function inferChartTypeFromJSON(
  jsonData: JSONDataStructure,
  userQuestion?: string,
  preferredType?: 'chart' | 'table' | null
): ChartConfig | null {
  if (!jsonData || !jsonData.data || jsonData.data.length === 0) {
    return null
  }

  // 0. 最高优先级：如果通过命令明确指定了表格类型，直接返回表格
  if (preferredType === 'table') {
    const tableConfig = createChartConfig(jsonData, 'table', userQuestion)
    if (tableConfig) {
      console.log('[ChartTypeInferrer] Forced table type due to preferredType === table')
      return tableConfig
    }
  }
  
  // 1. 优先检测用户明确要求表格还是图表
  const lowerQuestion = (userQuestion || '').toLowerCase()
  const hasTableKeywords = lowerQuestion.includes('表格') || 
                          lowerQuestion.includes('table') ||
                          lowerQuestion.includes('列表') ||
                          lowerQuestion.includes('list') ||
                          lowerQuestion.includes('数据表')
  const hasChartKeywords = lowerQuestion.includes('图表') || 
                          lowerQuestion.includes('chart') ||
                          lowerQuestion.includes('图') ||
                          lowerQuestion.includes('可视化') ||
                          lowerQuestion.includes('visualization') ||
                          lowerQuestion.includes('柱状图') ||
                          lowerQuestion.includes('折线图') ||
                          lowerQuestion.includes('饼图')
  
  // 如果用户明确要求表格，优先返回表格类型
  if (hasTableKeywords && !hasChartKeywords) {
    const chartConfig = createChartConfig(jsonData, 'table', userQuestion)
    if (chartConfig) return chartConfig
  }
  
  // 如果用户明确要求图表，排除表格类型
  if (hasChartKeywords && !hasTableKeywords) {
    // 继续后续的图表类型推断
  }

  // 2. 优先使用JSON中明确指定的类型（但命令和关键词优先级更高）
  if (jsonData.metadata?.type) {
    const chartType = normalizeChartType(jsonData.metadata.type)
    if (chartType) {
      // 如果用户通过命令或关键词要求表格但JSON指定了图表类型，优先遵循用户要求
      if ((preferredType === 'table' || (hasTableKeywords && !hasChartKeywords)) && chartType !== 'table') {
        const tableConfig = createChartConfig(jsonData, 'table', userQuestion)
        if (tableConfig) return tableConfig
      }
      return createChartConfig(jsonData, chartType, userQuestion)
    }
  }

  // 2. 分析数据结构特征
  const firstItem = jsonData.data[0]
  if (!firstItem || typeof firstItem !== 'object') {
    return null
  }

  const keys = Object.keys(firstItem)
  if (keys.length < 2) {
    return null
  }

  // 3. 检测字段类型
  const fieldTypes = analyzeFieldTypes(jsonData.data, keys)
  
  // 4. 根据字段类型和用户问题推断
  let inferredType = inferTypeFromFields(fieldTypes, keys, userQuestion)
  
  // 5. 如果用户通过命令或关键词明确要求表格，覆盖推断结果
  if (preferredType === 'table' || (hasTableKeywords && !hasChartKeywords && !preferredType)) {
    inferredType = 'table'
  }
  
  // 6. 生成图表配置
  return createChartConfig(jsonData, inferredType, userQuestion)
}

/**
 * 规范化图表类型名称
 */
function normalizeChartType(type: string): ChartConfig["type"] | null {
  const typeMap: Record<string, ChartConfig["type"]> = {
    // 基础类型
    'bar': 'bar', 'column': 'bar', '柱状图': 'bar', '柱图': 'bar',
    'line': 'line', '折线图': 'line', '折图': 'line',
    'pie': 'pie', '饼图': 'pie',
    'area': 'area', '面积图': 'area',
    'scatter': 'scatter', '散点图': 'scatter',
    'radar': 'radar', '雷达图': 'radar',
    'table': 'table', '表格': 'table',
    
    // 高级类型
    'bar-horizontal': 'bar-horizontal', '横向柱状图': 'bar-horizontal', '横向柱图': 'bar-horizontal',
    'bar-stacked': 'bar-stacked', '堆叠柱状图': 'bar-stacked', '堆叠柱图': 'bar-stacked',
    'area-stacked': 'area-stacked', '堆叠面积图': 'area-stacked', '堆叠面积': 'area-stacked',
    'composed': 'composed', '组合图': 'composed', '混合图': 'composed',
    
    // 特殊类型
    'gauge': 'gauge', '仪表盘': 'gauge', '仪表': 'gauge',
    'funnel': 'funnel', '漏斗图': 'funnel', '漏斗': 'funnel',
    'heatmap': 'heatmap', '热力图': 'heatmap', '热图': 'heatmap',
    'tree': 'tree', '树图': 'tree',
    'treemap': 'treemap', '矩形树图': 'treemap', '树状图': 'treemap',
    'sunburst': 'sunburst', '旭日图': 'sunburst', '太阳图': 'sunburst',
    'graph': 'graph', '关系图': 'graph', '网络图': 'graph',
    'parallel': 'parallel', '平行坐标': 'parallel', '平行图': 'parallel',
    'sankey': 'sankey', '桑基图': 'sankey', '桑基': 'sankey',
    'boxplot': 'boxplot', '箱线图': 'boxplot', '箱图': 'boxplot',
    'candlestick': 'candlestick', 'K线图': 'candlestick', 'K线': 'candlestick', '蜡烛图': 'candlestick',
    'map': 'map', '地图': 'map',
  }

  const normalized = type.toLowerCase().trim()
  return typeMap[normalized] || null
}

/**
 * 分析字段类型
 */
interface FieldType {
  name: string
  isTime: boolean
  isNumeric: boolean
  isCategory: boolean
  isPercentage: boolean
  isBoolean: boolean
}

function analyzeFieldTypes(data: any[], keys: string[]): FieldType[] {
  return keys.map(key => {
    const values = data.map(item => item[key]).filter(v => v !== null && v !== undefined)
    const sampleValues = values.slice(0, 20) // 增加样本数量以提高准确性
    
    // 检测时间字段（增强检测）
    const isTime = sampleValues.some(v => {
      if (typeof v !== 'string') {
        // 检查是否是Date对象
        if (v instanceof Date) return true
        // 检查是否是时间戳（毫秒或秒）
        if (typeof v === 'number' && v > 1000000000 && v < 9999999999999) return true
        return false
      }
      // 检测多种日期格式
      return /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(v) ||
             /^\d{4}-\d{2}/.test(v) ||
             /^\d{4}\/\d{2}\/\d{2}/.test(v) ||
             /^\d{2}\/\d{2}\/\d{4}/.test(v) ||
             /month|date|time|year|quarter|week|day|created_at|updated_at|timestamp/i.test(key)
    })

    // 检测数值字段（增强检测）
    const numericValues = sampleValues.filter(v => typeof v === 'number' && isFinite(v))
    const isNumeric = numericValues.length > 0 && numericValues.length / sampleValues.length > 0.7

    // 检测百分比字段（增强检测）
    const isPercentage = /percent|percentage|占比|比例|rate|ratio|pct/i.test(key) ||
                        sampleValues.some(v => {
                          if (typeof v === 'number') {
                            // 检查是否在0-1之间（可能是小数形式的百分比）
                            if (v >= 0 && v <= 1 && numericValues.length > 0) {
                              // 检查是否所有值都在0-1之间
                              const allInRange = numericValues.every(n => n >= 0 && n <= 1)
                              return allInRange && numericValues.length / sampleValues.length > 0.7
                            }
                            return false
                          }
                          if (typeof v === 'string') {
                            return v.includes('%') || /^\d+\.?\d*%$/.test(v.trim())
                          }
                          return false
                        })

    // 检测布尔字段
    const isBoolean = sampleValues.every(v => typeof v === 'boolean') ||
                     (sampleValues.length > 0 && 
                      sampleValues.every(v => v === true || v === false || v === 0 || v === 1 || v === 'true' || v === 'false'))

    // 检测分类字段（增强检测）
    const uniqueValues = new Set(sampleValues.map(v => String(v)))
    const isCategory = !isTime && !isNumeric && !isBoolean && 
                      (typeof sampleValues[0] === 'string' || 
                       (typeof sampleValues[0] === 'number' && uniqueValues.size < 20 && uniqueValues.size < sampleValues.length * 0.8))

    return {
      name: key,
      isTime,
      isNumeric,
      isCategory,
      isPercentage,
      isBoolean,
    }
  })
}

/**
 * 根据字段类型推断图表类型
 */
function inferTypeFromFields(
  fieldTypes: FieldType[],
  keys: string[],
  userQuestion?: string
): ChartConfig["type"] {
  const lowerQuestion = (userQuestion || '').toLowerCase()

  // 检测时间序列数据
  const timeField = fieldTypes.find(f => f.isTime)
  if (timeField) {
    // 如果有百分比字段，使用面积图
    if (fieldTypes.some(f => f.isPercentage)) {
      return 'area'
    }
    // 如果有趋势关键词，使用折线图
    if (lowerQuestion.includes('趋势') || 
        lowerQuestion.includes('变化') || 
        lowerQuestion.includes('走势') ||
        lowerQuestion.includes('trend') ||
        lowerQuestion.includes('change')) {
      return 'line'
    }
    // 默认使用折线图
    return 'line'
  }

  // 检测占比分布数据
  const percentageField = fieldTypes.find(f => f.isPercentage)
  const hasDistributionKeywords = lowerQuestion.includes('分布') ||
                                  lowerQuestion.includes('占比') ||
                                  lowerQuestion.includes('比例') ||
                                  lowerQuestion.includes('占比') ||
                                  lowerQuestion.includes('distribution') ||
                                  lowerQuestion.includes('share')
  
  if (percentageField || hasDistributionKeywords) {
    // 如果数据项少于20个，使用饼图
    if (keys.length === 2) {
      return 'pie'
    }
  }

  // 检测分类对比数据
  const categoryFields = fieldTypes.filter(f => f.isCategory)
  const numericFields = fieldTypes.filter(f => f.isNumeric)
  
  if (categoryFields.length > 0 && numericFields.length > 0) {
    // 如果只有一个数值字段，使用柱状图
    if (numericFields.length === 1) {
      return 'bar'
    }
    // 如果有多个数值字段，使用堆叠柱状图
    if (numericFields.length > 1) {
      return 'bar-stacked'
    }
  }

  // 根据字段数量推断
  if (keys.length === 2) {
    // 2个字段：柱状图或折线图
    if (fieldTypes[1].isNumeric) {
      return 'bar'
    }
  } else if (keys.length === 3) {
    // 3个字段：多系列柱状图
    return 'bar'
  } else if (keys.length > 3) {
    // 多个字段：组合图
    return 'composed'
  }

  // 默认使用柱状图
  return 'bar'
}

/**
 * 创建图表配置
 */
export function createChartConfig(
  jsonData: JSONDataStructure,
  chartType: ChartConfig["type"],
  userQuestion?: string
): ChartConfig {
  const firstItem = jsonData.data[0]
  const keys = Object.keys(firstItem)

  // 确定X轴和Y轴
  let xAxis: string | undefined
  let yAxis: string | string[] | undefined

  // 如果JSON中指定了轴配置，使用指定的
  if (jsonData.metadata?.xAxis) {
    xAxis = jsonData.metadata.xAxis
  }
  if (jsonData.metadata?.yAxis) {
    yAxis = jsonData.metadata.yAxis
  }

  // 如果没有指定，自动推断
  if (!xAxis || !yAxis) {
    const fieldTypes = analyzeFieldTypes(jsonData.data, keys)
    
    // 找到时间字段或分类字段作为X轴
    const timeField = fieldTypes.find(f => f.isTime)
    const categoryField = fieldTypes.find(f => f.isCategory && !f.isTime)
    
    xAxis = timeField?.name || categoryField?.name || keys[0]

    // 找到数值字段作为Y轴
    const numericFields = fieldTypes.filter(f => f.isNumeric)
    if (numericFields.length > 0) {
      yAxis = numericFields.length === 1 
        ? numericFields[0].name 
        : numericFields.map(f => f.name)
    } else {
      // 如果没有数值字段，使用第二个字段
      yAxis = keys[1]
    }
  }

  // 生成标题
  const title = jsonData.metadata?.title || 
                generateTitleFromData(jsonData, chartType, userQuestion)

  // 商务风格配色
  const colors = [
    "#3b82f6", // 蓝色
    "#8b5cf6", // 紫色
    "#ec4899", // 粉色
    "#f59e0b", // 橙色
    "#10b981", // 绿色
    "#06b6d4", // 青色
    "#ef4444", // 红色
  ]

  return {
    type: chartType,
    title,
    xAxis,
    yAxis,
    data: jsonData.data,
    colors,
  }
}

/**
 * 从数据生成标题
 */
function generateTitleFromData(
  jsonData: JSONDataStructure,
  chartType: ChartConfig["type"],
  userQuestion?: string
): string {
  if (userQuestion) {
    // 从用户问题中提取关键词作为标题
    const keywords = extractKeywords(userQuestion)
    if (keywords.length > 0) {
      return keywords.join(' ') + ' 数据可视化'
    }
  }

  // 根据图表类型生成默认标题
  const typeNames: Record<ChartConfig["type"], string> = {
    'bar': '柱状图',
    'line': '折线图',
    'pie': '饼图',
    'area': '面积图',
    'scatter': '散点图',
    'radar': '雷达图',
    'table': '数据表',
    'bar-horizontal': '横向柱状图',
    'bar-stacked': '堆叠柱状图',
    'area-stacked': '堆叠面积图',
    'composed': '组合图',
  }

  return typeNames[chartType] || '数据图表'
}

/**
 * 从用户问题中提取关键词
 */
function extractKeywords(question: string): string[] {
  const keywords: string[] = []
  
  // 常见业务关键词
  const businessKeywords = [
    '销售', '收入', '客户', '产品', '订单', '业绩',
    '趋势', '分析', '统计', '汇总', '对比',
    'sales', 'revenue', 'customer', 'product', 'order',
    'trend', 'analysis', 'statistics',
  ]

  const lowerQuestion = question.toLowerCase()
  for (const keyword of businessKeywords) {
    if (lowerQuestion.includes(keyword.toLowerCase())) {
      keywords.push(keyword)
    }
  }

  return keywords.slice(0, 3) // 最多返回3个关键词
}
