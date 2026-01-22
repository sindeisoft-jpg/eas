/**
 * 数据验证和清洗工具
 * 处理NULL值、数据类型转换、空数据检测、大数据量处理
 */

import type { QueryResult } from './types'

export interface DataValidationResult {
  isValid: boolean
  cleanedData: any[]
  warnings: string[]
  errors: string[]
}

/**
 * 验证和清洗图表数据
 */
export function validateAndCleanChartData(
  data: any[],
  config?: {
    maxRows?: number
    removeNullRows?: boolean
    nullThreshold?: number // NULL值比例阈值（0-1）
  }
): DataValidationResult {
  const {
    maxRows = 1000,
    removeNullRows = false,
    nullThreshold = 0.5
  } = config || {}

  const warnings: string[] = []
  const errors: string[] = []

  if (!data || !Array.isArray(data)) {
    return {
      isValid: false,
      cleanedData: [],
      warnings,
      errors: ['数据不是数组格式']
    }
  }

  if (data.length === 0) {
    return {
      isValid: false,
      cleanedData: [],
      warnings,
      errors: ['数据为空']
    }
  }

  let cleanedData = [...data]

  // 处理NULL值
  if (removeNullRows) {
    const originalLength = cleanedData.length
    cleanedData = cleanedData.filter(row => {
      if (!row || typeof row !== 'object') return false
      
      // 计算NULL值比例
      const values = Object.values(row)
      const nullCount = values.filter(v => v === null || v === undefined).length
      const nullRatio = values.length > 0 ? nullCount / values.length : 1
      
      return nullRatio < nullThreshold
    })
    
    if (cleanedData.length < originalLength) {
      warnings.push(`移除了 ${originalLength - cleanedData.length} 行NULL值过多的数据`)
    }
  }

  // 处理特殊值（NaN, Infinity）
  cleanedData = cleanedData.map(row => {
    const cleanedRow: any = {}
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === 'number') {
        if (isNaN(value)) {
          cleanedRow[key] = 0
        } else if (!isFinite(value)) {
          cleanedRow[key] = value > 0 ? Number.MAX_SAFE_INTEGER : Number.MIN_SAFE_INTEGER
        } else {
          cleanedRow[key] = value
        }
      } else {
        cleanedRow[key] = value
      }
    }
    return cleanedRow
  })

  // 数据量控制（智能采样）
  if (cleanedData.length > maxRows) {
    const sampled = smartSampleData(cleanedData, maxRows)
    warnings.push(`数据量过大（${cleanedData.length}行），已采样到 ${maxRows} 行`)
    cleanedData = sampled
  }

  // 验证数据格式
  if (cleanedData.length > 0) {
    const firstRow = cleanedData[0]
    if (!firstRow || typeof firstRow !== 'object') {
      errors.push('数据格式错误：第一行不是对象格式')
      return {
        isValid: false,
        cleanedData: [],
        warnings,
        errors
      }
    }

    const keys = Object.keys(firstRow)
    if (keys.length < 2) {
      warnings.push('数据列数少于2列，可能不适合生成图表')
    }
  }

  return {
    isValid: cleanedData.length > 0,
    cleanedData,
    warnings,
    errors
  }
}

/**
 * 智能采样数据（保留首尾，中间均匀采样）
 */
function smartSampleData(data: any[], maxSize: number): any[] {
  if (data.length <= maxSize) {
    return data
  }

  const sampled: any[] = []
  const headSize = Math.floor(maxSize * 0.1) // 保留前10%
  const tailSize = Math.floor(maxSize * 0.1) // 保留后10%
  const middleSize = maxSize - headSize - tailSize

  // 添加前N行
  sampled.push(...data.slice(0, headSize))

  // 中间均匀采样
  if (middleSize > 0) {
    const step = Math.floor((data.length - headSize - tailSize) / middleSize)
    for (let i = headSize; i < data.length - tailSize; i += step) {
      if (sampled.length < maxSize - tailSize) {
        sampled.push(data[i])
      }
    }
  }

  // 添加后N行
  sampled.push(...data.slice(-tailSize))

  return sampled
}

/**
 * 验证查询结果
 */
export function validateQueryResult(queryResult: QueryResult | null): {
  isValid: boolean
  isEmpty: boolean
  warnings: string[]
  errors: string[]
} {
  const warnings: string[] = []
  const errors: string[] = []

  if (!queryResult) {
    return {
      isValid: false,
      isEmpty: true,
      warnings,
      errors: ['查询结果为空']
    }
  }

  if (!queryResult.rows || !Array.isArray(queryResult.rows)) {
    return {
      isValid: false,
      isEmpty: true,
      warnings,
      errors: ['查询结果格式错误：rows不是数组']
    }
  }

  if (queryResult.rows.length === 0) {
    return {
      isValid: false,
      isEmpty: true,
      warnings,
      errors: ['查询结果为空：没有返回任何数据']
    }
  }

  if (!queryResult.columns || !Array.isArray(queryResult.columns) || queryResult.columns.length === 0) {
    return {
      isValid: false,
      isEmpty: false,
      warnings,
      errors: ['查询结果格式错误：缺少列信息']
    }
  }

  if (queryResult.columns.length < 2) {
    warnings.push('查询结果只有1列，可能不适合生成图表')
  }

  // 检查数据量
  if (queryResult.rows.length > 1000) {
    warnings.push(`查询结果数据量较大（${queryResult.rows.length}行），将进行采样处理`)
  }

  // 检查NULL值比例
  const nullCounts = queryResult.columns.map(col => {
    return queryResult.rows.filter(row => row[col] === null || row[col] === undefined).length
  })
  const nullRatios = nullCounts.map(count => count / queryResult.rows.length)
  const highNullRatio = nullRatios.some(ratio => ratio > 0.5)
  if (highNullRatio) {
    warnings.push('部分列NULL值比例较高（>50%），可能影响图表显示')
  }

  return {
    isValid: true,
    isEmpty: false,
    warnings,
    errors
  }
}
