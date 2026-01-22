/**
 * Visualization生成和验证工具
 * 当LLM未返回visualization字段时，自动生成
 */

import type { QueryResult, ChartConfig } from './types'
import { inferChartTypeFromJSON, createChartConfig } from './chart-type-inferrer'
import type { JSONDataStructure } from './json-data-detector'

/**
 * 确保visualization字段存在，如果不存在则自动生成
 */
export function ensureVisualization(
  json: any,
  queryResult: QueryResult | null,
  userQuestion?: string
): any {
  // 如果已经有visualization字段，验证并修复格式
  if (json.visualization) {
    return {
      ...json,
      visualization: validateAndFixVisualization(json.visualization, queryResult)
    }
  }

  // 如果没有visualization字段，自动生成
  if (queryResult && queryResult.rows && queryResult.rows.length > 0) {
    const generated = generateVisualizationFromQueryResult(queryResult, userQuestion)
    return {
      ...json,
      visualization: generated
    }
  }

  return json
}

/**
 * 验证并修复visualization格式
 */
export function validateAndFixVisualization(
  visualization: any,
  queryResult: QueryResult | null
): any {
  if (!visualization || typeof visualization !== 'object') {
    // 如果visualization无效，尝试从查询结果生成
    if (queryResult) {
      return generateVisualizationFromQueryResult(queryResult)
    }
    return null
  }

  const fixed: any = { ...visualization }

  // 确保有type字段
  if (!fixed.type && !fixed.chartType && !fixed.chart_type) {
    fixed.type = 'bar' // 默认柱状图
  } else if (fixed.chart_type && !fixed.type) {
    fixed.type = normalizeChartType(fixed.chart_type)
    delete fixed.chart_type
  } else if (fixed.chartType && !fixed.type) {
    fixed.type = normalizeChartType(fixed.chartType)
    delete fixed.chartType
  }

  // 确保有title字段
  if (!fixed.title) {
    fixed.title = '数据图表'
  }

  // 如果有data字段，验证格式
  if (fixed.data) {
    if (!Array.isArray(fixed.data)) {
      fixed.data = []
    }
  } else if (queryResult && queryResult.rows) {
    // 如果没有data字段，从查询结果生成
    fixed.data = queryResult.rows
  }

  // 如果有chart_config，提取配置
  if (fixed.chart_config) {
    const config = fixed.chart_config
    if (config.chart_type && !fixed.type) {
      fixed.type = normalizeChartType(config.chart_type)
    }
    if (config.title && !fixed.title) {
      fixed.title = config.title
    }
    if (config.x_axis || config.xAxis) {
      fixed.xAxis = config.x_axis || config.xAxis
    }
    if (config.y_axis || config.yAxis) {
      fixed.yAxis = config.y_axis || config.yAxis
    }
  }

  return fixed
}

/**
 * 从查询结果自动生成visualization配置
 */
export function generateVisualizationFromQueryResult(
  queryResult: QueryResult,
  userQuestion?: string
): any {
  if (!queryResult || !queryResult.rows || queryResult.rows.length === 0) {
    return null
  }

  // 构建JSON数据结构
  const jsonData: JSONDataStructure = {
    isArray: true,
    isObject: false,
    data: queryResult.rows,
    rawJson: queryResult.rows
  }

  // 使用图表类型推断器
  const chartConfig = inferChartTypeFromJSON(jsonData, userQuestion)

  if (!chartConfig) {
    return null
  }

  // 转换为visualization格式
  return {
    type: chartConfig.type,
    title: chartConfig.title,
    xAxis: chartConfig.xAxis,
    yAxis: chartConfig.yAxis,
    data: chartConfig.data
  }
}

/**
 * 规范化图表类型名称
 */
function normalizeChartType(type: string): ChartConfig["type"] {
  const typeMap: Record<string, ChartConfig["type"]> = {
    'bar': 'bar',
    'column': 'bar',
    '柱状图': 'bar',
    '柱图': 'bar',
    'line': 'line',
    '折线图': 'line',
    '折图': 'line',
    'pie': 'pie',
    '饼图': 'pie',
    'area': 'area',
    '面积图': 'area',
    'scatter': 'scatter',
    '散点图': 'scatter',
    'radar': 'radar',
    '雷达图': 'radar',
    'table': 'table',
    '表格': 'table',
    'bar-horizontal': 'bar-horizontal',
    '横向柱状图': 'bar-horizontal',
    'bar-stacked': 'bar-stacked',
    '堆叠柱状图': 'bar-stacked',
    'area-stacked': 'area-stacked',
    '堆叠面积图': 'area-stacked',
    'composed': 'composed',
    '组合图': 'composed'
  }

  const normalized = type.toLowerCase().trim()
  return typeMap[normalized] || 'bar'
}
