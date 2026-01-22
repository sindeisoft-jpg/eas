/**
 * LLM响应JSON解析器
 * 支持多种JSON格式，容错解析，字段名映射
 */

export interface ParsedLLMResponse {
  json: any | null
  visualization: any | null
  explanation?: string
  sql?: string
  reasoning?: string
  error: string | null
  hasJson: boolean
}

/**
 * 解析LLM响应，支持多种格式
 */
export function parseLLMResponse(content: string): ParsedLLMResponse {
  if (!content || typeof content !== 'string') {
    return {
      json: null,
      visualization: null,
      error: '内容为空',
      hasJson: false
    }
  }

  // 策略1: 尝试匹配 ```json ... ``` 代码块格式
  const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/
  const blockMatch = content.match(jsonBlockRegex)
  
  if (blockMatch) {
    try {
      const parsed = JSON.parse(blockMatch[1])
      return {
        json: parsed,
        visualization: parsed.visualization || null,
        explanation: parsed.explanation,
        sql: parsed.sql,
        reasoning: parsed.reasoning,
        error: null,
        hasJson: true
      }
    } catch (e: any) {
      // 解析失败，尝试修复常见JSON错误
      const fixed = tryFixJSON(blockMatch[1])
      if (fixed) {
        try {
          const parsed = JSON.parse(fixed)
          return {
            json: parsed,
            visualization: parsed.visualization || null,
            explanation: parsed.explanation,
            sql: parsed.sql,
            reasoning: parsed.reasoning,
            error: null,
            hasJson: true
          }
        } catch {
          // 修复后仍然失败
        }
      }
    }
  }

  // 策略2: 尝试直接解析整个内容为JSON对象
  const trimmedContent = content.trim()
  if (trimmedContent.startsWith('{') && trimmedContent.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmedContent)
      return {
        json: parsed,
        visualization: parsed.visualization || null,
        explanation: parsed.explanation,
        sql: parsed.sql,
        reasoning: parsed.reasoning,
        error: null,
        hasJson: true
      }
    } catch (e: any) {
      // 尝试修复JSON
      const fixed = tryFixJSON(trimmedContent)
      if (fixed) {
        try {
          const parsed = JSON.parse(fixed)
          return {
            json: parsed,
            visualization: parsed.visualization || null,
            explanation: parsed.explanation,
            sql: parsed.sql,
            reasoning: parsed.reasoning,
            error: null,
            hasJson: true
          }
        } catch {
          // 修复失败
        }
      }
    }
  }

  // 策略3: 尝试从混合格式中提取JSON片段
  // 检测包含visualization字段的JSON对象
  const visualizationMatch = content.match(/\{\s*"visualization"\s*:\s*\{[\s\S]*?\}\s*\}/s) ||
                              content.match(/\{\s*"explanation"\s*:[\s\S]*?"visualization"\s*:\s*\{[\s\S]*?\}[\s\S]*?\}/s)
  
  if (visualizationMatch) {
    try {
      const jsonStr = visualizationMatch[0]
      const fixed = tryFixJSON(jsonStr)
      const parsed = JSON.parse(fixed || jsonStr)
      return {
        json: parsed,
        visualization: parsed.visualization || null,
        explanation: parsed.explanation,
        sql: parsed.sql,
        reasoning: parsed.reasoning,
        error: null,
        hasJson: true
      }
    } catch {
      // 继续尝试其他策略
    }
  }

  // 策略4: 尝试提取嵌套的JSON对象（容错解析）
  // 查找最外层的JSON对象
  let braceCount = 0
  let startIndex = -1
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '{') {
      if (startIndex === -1) startIndex = i
      braceCount++
    } else if (content[i] === '}') {
      braceCount--
      if (braceCount === 0 && startIndex !== -1) {
        try {
          const jsonStr = content.substring(startIndex, i + 1)
          const fixed = tryFixJSON(jsonStr)
          const parsed = JSON.parse(fixed || jsonStr)
          if (parsed.explanation || parsed.sql || parsed.visualization) {
            return {
              json: parsed,
              visualization: parsed.visualization || null,
              explanation: parsed.explanation,
              sql: parsed.sql,
              reasoning: parsed.reasoning,
              error: null,
              hasJson: true
            }
          }
        } catch {
          // 继续
        }
        startIndex = -1
      }
    }
  }

  return {
    json: null,
    visualization: null,
    error: '无法解析JSON格式',
    hasJson: false
  }
}

/**
 * 尝试修复常见的JSON格式错误
 */
function tryFixJSON(jsonStr: string): string | null {
  try {
    // 尝试直接解析，如果成功则不需要修复
    JSON.parse(jsonStr)
    return jsonStr
  } catch {
    // 需要修复
  }

  let fixed = jsonStr

  // 修复1: 移除尾随逗号
  fixed = fixed.replace(/,(\s*[}\]])/g, '$1')

  // 修复2: 修复单引号为双引号（仅在键名和字符串值中）
  fixed = fixed.replace(/'/g, '"')

  // 修复3: 修复未转义的控制字符
  fixed = fixed.replace(/\n/g, '\\n')
  fixed = fixed.replace(/\r/g, '\\r')
  fixed = fixed.replace(/\t/g, '\\t')

  // 修复4: 修复缺少引号的键名
  fixed = fixed.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":')

  // 验证修复后的JSON是否有效
  try {
    JSON.parse(fixed)
    return fixed
  } catch {
    return null
  }
}
