/**
 * JSON数据检测器
 * 检测消息中的JSON数据，支持多种格式，提取可图表化的数据
 */

export interface JSONDataStructure {
  isArray: boolean
  isObject: boolean
  data: any[]
  metadata?: {
    type?: string
    title?: string
    xAxis?: string
    yAxis?: string | string[]
    chartData?: string // 数据字段名（如 chartData, data, values等）
  }
  rawJson?: any // 原始JSON对象
}

/**
 * 检测消息中的JSON数据
 * 支持多种格式，包括LLM返回的包含visualization字段的JSON
 */
export function detectJSONData(content: string): JSONDataStructure | null {
  console.log("[JSONDetector] Detecting JSON data in content", {
    contentLength: content?.length || 0,
    contentPreview: content?.substring(0, 200) || "empty"
  })
  if (!content || typeof content !== 'string') {
    return null
  }

  try {
    // 方法1: 检测 ```json ... ``` 代码块格式
    const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/
    const blockMatch = content.match(jsonBlockRegex)
    
    if (blockMatch) {
      try {
        const parsed = JSON.parse(blockMatch[1])
        return analyzeJSONStructure(parsed)
      } catch {
        // 解析失败，继续尝试其他方法
      }
    }

    // 方法2: 检测纯JSON对象 { ... }
    const objectMatch = content.match(/\{[\s\S]*\}/)
    if (objectMatch) {
      try {
        const parsed = JSON.parse(objectMatch[0])
        // 排除已知的工具调用格式（explanation, sql, reasoning等）
        if (!parsed.explanation && !parsed.sql && !parsed.reasoning) {
          const result = analyzeJSONStructure(parsed)
          if (result) return result
        }
      } catch {
        // 解析失败，继续
      }
    }

    // 方法3: 检测纯JSON数组 [ ... ]
    // 匹配数组格式，包括多行格式
    const arrayPatterns = [
      /\[\s*\{[\s\S]*?\}\s*\]/s,  // 单行或多行数组
      /\[\s*\{[\s\S]*\}\s*\]/m,   // 多行数组（更宽松）
    ]
    
    for (const pattern of arrayPatterns) {
      const arrayMatch = content.match(pattern)
      if (arrayMatch) {
        try {
          const parsed = JSON.parse(arrayMatch[0])
          if (Array.isArray(parsed) && parsed.length > 0) {
            const result = analyzeJSONStructure(parsed)
            if (result) return result
          }
        } catch {
          // 解析失败，继续尝试下一个模式
        }
      }
    }

    // 方法4: 检测混合格式中的JSON片段
    // 尝试提取可能的JSON对象或数组
    const mixedMatches = [
      // 检测包含 visualization 字段的JSON对象（LLM返回的图表数据格式）
      content.match(/\{\s*"visualization"\s*:\s*\{[\s\S]*?\}\s*\}/s),
      content.match(/\{\s*"explanation"\s*:[\s\S]*?"visualization"\s*:\s*\{[\s\S]*?\}[\s\S]*?\}/s),
      content.match(/\{\s*"data"\s*:\s*\[[\s\S]*?\]\s*\}/s),
      content.match(/\{\s*"chartData"\s*:\s*\[[\s\S]*?\]\s*\}/s),
      content.match(/\{\s*"values"\s*:\s*\[[\s\S]*?\]\s*\}/s),
      content.match(/\{\s*"series"\s*:\s*\[[\s\S]*?\]\s*\}/s),
      // 检测"数据（前10行）:"或类似前缀后的JSON数组
      content.match(/(?:数据|结果|rows?|data)[:：]\s*(\[[\s\S]*?\])/i),
      // 检测"数据（全部 X 行）:"后的JSON数组
      content.match(/(?:数据|结果|rows?|data)（.*?）[:：]\s*(\[[\s\S]*?\])/i),
      // 更宽松的匹配：检测任何包含JSON数组的模式
      content.match(/(?:^|\n)\s*(\[[\s\S]*?\])\s*(?:\n|$)/),
    ]

    for (const match of mixedMatches) {
      if (match) {
        try {
          // 如果匹配组存在，使用匹配组；否则使用整个匹配
          const jsonStr = match[1] || match[0]
          const parsed = JSON.parse(jsonStr)
          const result = analyzeJSONStructure(parsed)
          if (result) return result
        } catch {
          // 继续尝试下一个
        }
      }
    }

    return null
  } catch (error) {
    console.warn("[JSONDataDetector] Error detecting JSON:", error)
    return null
  }
}

/**
 * 分析JSON数据结构
 */
function analyzeJSONStructure(parsed: any): JSONDataStructure | null {
  if (!parsed) return null

  // 如果是数组格式
  if (Array.isArray(parsed)) {
    // 检查数组元素是否为对象
    if (parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
      return {
        isArray: true,
        isObject: false,
        data: parsed,
        rawJson: parsed,
      }
    }
    return null
  }

  // 如果是对象格式
  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    // 检查是否包含数据字段
    const dataFields = ['data', 'chartData', 'values', 'series', 'items', 'results']
    
    for (const field of dataFields) {
      if (parsed[field] && Array.isArray(parsed[field]) && parsed[field].length > 0) {
        return {
          isArray: false,
          isObject: true,
          data: parsed[field],
          metadata: {
            type: parsed.type || parsed.chartType,
            title: parsed.title || parsed.name,
            xAxis: parsed.xAxis || parsed.x,
            yAxis: parsed.yAxis || parsed.y,
            chartData: field,
          },
          rawJson: parsed,
        }
      }
    }

    // 如果对象本身包含多个字段，且都是基本类型，可能是单个数据点
    // 这种情况下不适合直接生成图表，返回null
    const keys = Object.keys(parsed)
    if (keys.length >= 2) {
      // 检查是否所有值都是基本类型（可能是数据行）
      const allPrimitive = keys.every(key => {
        const value = parsed[key]
        return typeof value === 'string' || 
               typeof value === 'number' || 
               typeof value === 'boolean' ||
               value === null
      })
      
      if (allPrimitive) {
        // 单个对象，包装成数组
        return {
          isArray: false,
          isObject: true,
          data: [parsed],
          rawJson: parsed,
        }
      }
    }
  }

  return null
}

/**
 * 检查JSON数据是否适合生成图表
 */
export function isChartableJSON(jsonData: JSONDataStructure | null): boolean {
  if (!jsonData) return false
  
  // 数据必须存在且非空
  if (!jsonData.data || jsonData.data.length === 0) {
    return false
  }

  // 数组格式：至少需要2个字段
  if (jsonData.isArray) {
    const firstItem = jsonData.data[0]
    if (typeof firstItem === 'object' && firstItem !== null) {
      const keys = Object.keys(firstItem)
      return keys.length >= 2
    }
    return false
  }

  // 对象格式：数据数组中的元素至少需要2个字段
  if (jsonData.isObject && jsonData.data.length > 0) {
    const firstItem = jsonData.data[0]
    if (typeof firstItem === 'object' && firstItem !== null) {
      const keys = Object.keys(firstItem)
      return keys.length >= 2
    }
  }

  return false
}

/**
 * 从消息内容中提取所有可能的JSON数据
 */
export function extractAllJSONData(content: string): JSONDataStructure[] {
  const results: JSONDataStructure[] = []
  
  if (!content || typeof content !== 'string') {
    return results
  }
  
  try {
    // 检测所有JSON代码块
    const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/g
    let match
    while ((match = jsonBlockRegex.exec(content)) !== null) {
      try {
        const parsed = JSON.parse(match[1])
        
        // 特殊处理：如果包含 visualization 字段，优先提取
        if (parsed.visualization && parsed.visualization.data) {
          const visualizationData = parsed.visualization.data
          if (Array.isArray(visualizationData) && visualizationData.length > 0) {
            console.log("[JSONDetector] Found visualization in JSON block", {
              type: parsed.visualization.type,
              dataLength: visualizationData.length
            })
            results.push({
              isArray: true,
              isObject: false,
              data: visualizationData,
              metadata: {
                type: parsed.visualization.type,
                title: parsed.visualization.title,
                xAxis: parsed.visualization.xAxis,
                yAxis: parsed.visualization.yAxis,
              },
              rawJson: parsed.visualization
            })
            continue
          }
        }
        
        // 排除已知的工具调用格式（但已处理visualization的情况除外）
        if (parsed.explanation || parsed.sql || parsed.reasoning) {
          continue
        }
        
        const structure = analyzeJSONStructure(parsed)
        if (structure && isChartableJSON(structure)) {
          results.push(structure)
        }
      } catch {
        // 忽略解析失败
      }
    }

    // 如果没找到代码块，尝试检测其他格式
    if (results.length === 0) {
      const detected = detectJSONData(content)
      if (detected && isChartableJSON(detected)) {
        results.push(detected)
      }
    }
  } catch (error) {
    console.warn("[JSONDataDetector] Error extracting JSON data:", error)
  }

  return results
}
