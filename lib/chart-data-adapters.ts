/**
 * 图表数据适配器
 * 将通用数据格式转换为特定图表类型所需的数据格式
 */

import type { ChartConfig } from "./types"

/**
 * 适配数据为仪表盘格式
 */
export function adaptDataForGauge(data: Record<string, any>[]): { value: number; name: string } | null {
  if (!data || data.length === 0) return null
  
  // 如果数据是单个对象，提取数值
  if (data.length === 1) {
    const item = data[0]
    const keys = Object.keys(item)
    // 查找数值字段
    const valueKey = keys.find(key => typeof item[key] === 'number')
    if (valueKey) {
      const value = Number(item[valueKey])
      // 如果是百分比（0-1之间），转换为0-100
      const normalizedValue = value <= 1 && value >= 0 ? value * 100 : value
      return {
        value: normalizedValue,
        name: valueKey
      }
    }
  }
  
  // 如果数据是数组，取第一个数值
  const firstItem = data[0]
  const keys = Object.keys(firstItem)
  const valueKey = keys.find(key => typeof firstItem[key] === 'number')
  const nameKey = keys.find(key => typeof firstItem[key] === 'string')
  
  if (valueKey) {
    const value = Number(firstItem[valueKey])
    // 如果是百分比（0-1之间），转换为0-100
    const normalizedValue = value <= 1 && value >= 0 ? value * 100 : value
    return {
      value: normalizedValue,
      name: nameKey ? String(firstItem[nameKey]) : valueKey
    }
  }
  
  return null
}

/**
 * 适配数据为漏斗图格式
 */
export function adaptDataForFunnel(data: Record<string, any>[]): Array<{ name: string; value: number }> {
  if (!data || data.length === 0) return []
  
  return data.map(item => {
    const keys = Object.keys(item)
    const nameKey = keys.find(key => typeof item[key] === 'string') || keys[0]
    const valueKey = keys.find(key => typeof item[key] === 'number') || keys[1]
    
    return {
      name: String(item[nameKey] || ''),
      value: Number(item[valueKey] || 0)
    }
  })
}

/**
 * 适配数据为热力图格式
 */
export function adaptDataForHeatmap(
  data: Record<string, any>[],
  xAxis?: string,
  yAxis?: string,
  valueAxis?: string
): Array<[number, number, number]> {
  if (!data || data.length === 0) return []
  
  const keys = Object.keys(data[0])
  const xKey = xAxis || keys[0]
  const yKey = yAxis || (keys.length > 1 ? keys[1] : keys[0])
  const valueKey = valueAxis || keys.find(key => typeof data[0][key] === 'number') || keys[keys.length - 1]
  
  // 创建类别到索引的映射
  const xCategories = Array.from(new Set(data.map(item => String(item[xKey] || ''))))
  const yCategories = Array.from(new Set(data.map(item => String(item[yKey] || ''))))
  
  return data.map(item => {
    const xIndex = xCategories.indexOf(String(item[xKey] || ''))
    const yIndex = yCategories.indexOf(String(item[yKey] || ''))
    const value = Number(item[valueKey] || 0)
    
    return [xIndex, yIndex, value] as [number, number, number]
  })
}

/**
 * 适配数据为桑基图格式
 */
export function adaptDataForSankey(data: Record<string, any>[]): {
  nodes: Array<{ name: string }>
  links: Array<{ source: string; target: string; value: number }>
} {
  if (!data || data.length === 0) {
    return { nodes: [], links: [] }
  }
  
  const nodes = new Set<string>()
  const links: Array<{ source: string; target: string; value: number }> = []
  
  data.forEach(item => {
    const keys = Object.keys(item)
    if (keys.length >= 3) {
      const sourceKey = keys[0]
      const targetKey = keys[1]
      const valueKey = keys.find(key => typeof item[key] === 'number') || keys[2]
      
      const source = String(item[sourceKey] || '')
      const target = String(item[targetKey] || '')
      const value = Number(item[valueKey] || 0)
      
      if (source && target && value > 0) {
        nodes.add(source)
        nodes.add(target)
        links.push({ source, target, value })
      }
    }
  })
  
  return {
    nodes: Array.from(nodes).map(name => ({ name })),
    links
  }
}

/**
 * 适配数据为K线图格式
 */
export function adaptDataForCandlestick(
  data: Record<string, any>[],
  openKey?: string,
  closeKey?: string,
  lowKey?: string,
  highKey?: string
): Array<[number, number, number, number]> {
  if (!data || data.length === 0) return []
  
  const keys = Object.keys(data[0])
  const open = openKey || keys.find(k => k.toLowerCase().includes('open')) || keys[0]
  const close = closeKey || keys.find(k => k.toLowerCase().includes('close')) || keys[1]
  const low = lowKey || keys.find(k => k.toLowerCase().includes('low')) || keys[2]
  const high = highKey || keys.find(k => k.toLowerCase().includes('high')) || keys[3]
  
  return data.map(item => [
    Number(item[open] || 0),
    Number(item[close] || 0),
    Number(item[low] || 0),
    Number(item[high] || 0)
  ] as [number, number, number, number])
}

/**
 * 适配数据为箱线图格式
 */
export function adaptDataForBoxplot(data: Record<string, any>[]): Array<[number, number, number, number, number]> {
  if (!data || data.length === 0) return []
  
  // 箱线图需要：最小值、下四分位数、中位数、上四分位数、最大值
  // 如果数据包含这些字段，直接使用；否则计算
  const keys = Object.keys(data[0])
  
  // 尝试查找标准字段
  const minKey = keys.find(k => k.toLowerCase().includes('min'))
  const q1Key = keys.find(k => k.toLowerCase().includes('q1') || k.toLowerCase().includes('quartile1'))
  const medianKey = keys.find(k => k.toLowerCase().includes('median') || k.toLowerCase().includes('中位数'))
  const q3Key = keys.find(k => k.toLowerCase().includes('q3') || k.toLowerCase().includes('quartile3'))
  const maxKey = keys.find(k => k.toLowerCase().includes('max'))
  
  if (minKey && q1Key && medianKey && q3Key && maxKey) {
    return data.map(item => [
      Number(item[minKey] || 0),
      Number(item[q1Key] || 0),
      Number(item[medianKey] || 0),
      Number(item[q3Key] || 0),
      Number(item[maxKey] || 0)
    ] as [number, number, number, number, number])
  }
  
  // 如果没有标准字段，使用数值字段计算
  const numericKeys = keys.filter(k => typeof data[0][k] === 'number')
  if (numericKeys.length >= 5) {
    return data.map(item => [
      Number(item[numericKeys[0]] || 0),
      Number(item[numericKeys[1]] || 0),
      Number(item[numericKeys[2]] || 0),
      Number(item[numericKeys[3]] || 0),
      Number(item[numericKeys[4]] || 0)
    ] as [number, number, number, number, number])
  }
  
  return []
}

/**
 * 适配数据为树图格式
 */
export function adaptDataForTree(data: Record<string, any>[]): any {
  if (!data || data.length === 0) return null
  
  // 树图需要层级结构
  // 如果数据包含 parent/children 字段，直接使用
  // 否则根据第一个字段构建树结构
  const firstItem = data[0]
  const keys = Object.keys(firstItem)
  
  if (keys.includes('children') || keys.includes('parent')) {
    // 已有树结构
    return data[0]
  }
  
  // 构建简单树结构
  const nameKey = keys[0]
  const valueKey = keys.find(k => typeof firstItem[k] === 'number') || keys[1]
  
  return {
    name: String(firstItem[nameKey] || '根节点'),
    value: Number(firstItem[valueKey] || 0),
    children: data.slice(1).map(item => ({
      name: String(item[nameKey] || ''),
      value: Number(item[valueKey] || 0)
    }))
  }
}

/**
 * 根据图表类型适配数据
 */
export function adaptDataForChartType(
  chartType: ChartConfig["type"],
  data: Record<string, any>[],
  xAxis?: string,
  yAxis?: string | string[]
): any {
  // 先验证和清洗数据
  const { validateAndCleanChartData } = require('./data-validator')
  const validation = validateAndCleanChartData(data, {
    maxRows: 1000,
    removeNullRows: false,
    nullThreshold: 0.5
  })

  if (!validation.isValid) {
    console.warn('[ChartDataAdapter] Data validation failed:', validation.errors)
    return data // 返回原始数据，让上层处理
  }

  const cleanedData = validation.cleanedData

  switch (chartType) {
    case 'gauge':
      return adaptDataForGauge(cleanedData)
    case 'funnel':
      return adaptDataForFunnel(cleanedData)
    case 'heatmap':
      return adaptDataForHeatmap(cleanedData, xAxis, yAxis as string)
    case 'sankey':
      return adaptDataForSankey(cleanedData)
    case 'candlestick':
      return adaptDataForCandlestick(cleanedData)
    case 'boxplot':
      return adaptDataForBoxplot(cleanedData)
    case 'tree':
    case 'treemap':
    case 'sunburst':
      return adaptDataForTree(cleanedData)
    default:
      return cleanedData
  }
}
