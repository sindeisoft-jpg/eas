/**
 * 字段名映射工具
 * 处理字段名不一致问题（xAxis vs x_axis vs x轴等）
 */

/**
 * 字段名映射表
 */
const FIELD_NAME_MAP: Record<string, string[]> = {
  'xAxis': ['x_axis', 'xAxis', 'x-axis', 'x轴', 'x', 'category', 'name', 'label'],
  'yAxis': ['y_axis', 'yAxis', 'y-axis', 'y轴', 'y', 'value', 'count', 'amount', 'sum', 'total'],
  'chartType': ['chart_type', 'chartType', 'type', '图表类型', 'chart_type'],
  'title': ['title', 'name', '名称', '标题'],
  'data': ['data', 'values', 'rows', 'items', '数据']
}

/**
 * 查找匹配的列名
 * 支持多种匹配策略：精确匹配、忽略大小写、包含匹配、相似度匹配
 */
export function findMatchingColumn(
  target: string,
  columns: string[],
  options: {
    exact?: boolean
    caseSensitive?: boolean
    fuzzy?: boolean
  } = {}
): string | null {
  if (!target || !columns || columns.length === 0) {
    return null
  }

  const { exact = false, caseSensitive = false, fuzzy = true } = options
  const targetLower = target.toLowerCase().trim()
  const targetNormalized = normalizeFieldName(target)

  // 策略1: 精确匹配
  if (exact) {
    const exactMatch = columns.find(col => 
      caseSensitive ? col === target : col.toLowerCase() === targetLower
    )
    if (exactMatch) return exactMatch
  }

  // 策略2: 忽略大小写匹配
  const caseInsensitiveMatch = columns.find(col => 
    col.toLowerCase() === targetLower
  )
  if (caseInsensitiveMatch) return caseInsensitiveMatch

  // 策略3: 包含匹配（target包含在column中，或column包含在target中）
  const containsMatch = columns.find(col => {
    const colLower = col.toLowerCase()
    return colLower.includes(targetLower) || targetLower.includes(colLower)
  })
  if (containsMatch) return containsMatch

  // 策略4: 字段名映射匹配（检查映射表中的同义词）
  const mappedVariants = getFieldNameVariants(target)
  for (const variant of mappedVariants) {
    const variantMatch = columns.find(col => 
      col.toLowerCase() === variant.toLowerCase()
    )
    if (variantMatch) return variantMatch
  }

  // 策略5: 相似度匹配（Levenshtein距离）
  if (fuzzy) {
    const similarityMatch = findSimilarColumn(target, columns)
    if (similarityMatch && similarityMatch.similarity > 0.7) {
      return similarityMatch.column
    }
  }

  return null
}

/**
 * 获取字段名的所有变体（从映射表）
 */
function getFieldNameVariants(fieldName: string): string[] {
  const normalized = normalizeFieldName(fieldName)
  const variants: string[] = [fieldName]
  
  // 查找映射表中的变体
  for (const [key, values] of Object.entries(FIELD_NAME_MAP)) {
    if (values.includes(normalized) || values.some(v => v.toLowerCase() === normalized.toLowerCase())) {
      variants.push(...values)
      break
    }
  }
  
  return [...new Set(variants)]
}

/**
 * 规范化字段名（移除特殊字符，统一格式）
 */
function normalizeFieldName(fieldName: string): string {
  return fieldName
    .toLowerCase()
    .replace(/[_\s-]/g, '')
    .trim()
}

/**
 * 使用Levenshtein距离查找相似的列名
 */
function findSimilarColumn(
  target: string,
  columns: string[]
): { column: string; similarity: number } | null {
  let bestMatch: { column: string; similarity: number } | null = null
  const targetLower = target.toLowerCase()

  for (const col of columns) {
    const similarity = calculateSimilarity(targetLower, col.toLowerCase())
    if (!bestMatch || similarity > bestMatch.similarity) {
      bestMatch = { column: col, similarity }
    }
  }

  return bestMatch
}

/**
 * 计算两个字符串的相似度（0-1）
 * 使用Levenshtein距离
 */
function calculateSimilarity(str1: string, str2: string): number {
  const maxLength = Math.max(str1.length, str2.length)
  if (maxLength === 0) return 1

  const distance = levenshteinDistance(str1, str2)
  return 1 - distance / maxLength
}

/**
 * 计算Levenshtein距离
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = []

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // 替换
          matrix[i][j - 1] + 1,     // 插入
          matrix[i - 1][j] + 1      // 删除
        )
      }
    }
  }

  return matrix[str2.length][str1.length]
}

/**
 * 映射visualization字段，确保字段名与查询结果列名匹配
 */
export function mapVisualizationFields(
  visualization: any,
  columns: string[]
): any {
  if (!visualization || !columns || columns.length === 0) {
    return visualization
  }

  const mapped = { ...visualization }

  // 映射xAxis
  if (visualization.xAxis || visualization.x_axis) {
    const xAxisValue = visualization.xAxis || visualization.x_axis
    const matchedXAxis = findMatchingColumn(xAxisValue, columns, { fuzzy: true })
    if (matchedXAxis) {
      mapped.xAxis = matchedXAxis
      delete mapped.x_axis
    } else if (columns.length > 0) {
      // 如果找不到匹配，使用第一列作为默认值
      mapped.xAxis = columns[0]
    }
  } else if (columns.length > 0) {
    // 如果没有指定xAxis，使用第一列
    mapped.xAxis = columns[0]
  }

  // 映射yAxis（可能是数组）
  if (visualization.yAxis || visualization.y_axis) {
    const yAxisValue = visualization.yAxis || visualization.y_axis
    if (Array.isArray(yAxisValue)) {
      const matchedYAxis = yAxisValue
        .map((y: string) => findMatchingColumn(y, columns, { fuzzy: true }) || y)
        .filter((y: string) => columns.includes(y))
      if (matchedYAxis.length > 0) {
        mapped.yAxis = matchedYAxis
        delete mapped.y_axis
      } else if (columns.length > 1) {
        // 如果找不到匹配，使用第二列作为默认值
        mapped.yAxis = columns[1]
      }
    } else {
      const matchedYAxis = findMatchingColumn(yAxisValue, columns, { fuzzy: true })
      if (matchedYAxis) {
        mapped.yAxis = matchedYAxis
        delete mapped.y_axis
      } else if (columns.length > 1) {
        // 如果找不到匹配，使用第二列作为默认值
        mapped.yAxis = columns[1]
      }
    }
  } else if (columns.length > 1) {
    // 如果没有指定yAxis，使用第二列
    mapped.yAxis = columns[1]
  }

  // 映射chartType/chart_type
  if (visualization.chart_type && !visualization.chartType) {
    mapped.chartType = visualization.chart_type
    delete mapped.chart_type
  }

  return mapped
}
