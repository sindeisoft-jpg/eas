/**
 * 命令解析器
 * 解析用户输入中的命令（如 /报表、/图表、/表格），支持命令在开头或末尾
 * 支持所有 ECharts 图表类型的命令（如 /柱状图、/饼图、/折线图等）
 */

import type { ChartConfig } from "./types"

export interface CommandParseResult {
  command: 'report' | 'chart' | 'table' | null
  chartType?: ChartConfig["type"] | null  // 具体图表类型（如果指定）
  question: string
  originalInput: string
}

/**
 * 图表类型命令映射表
 * 将命令字符串映射到 ECharts 图表类型
 */
const CHART_TYPE_COMMANDS: Record<string, ChartConfig["type"]> = {
  // 基础类型
  '柱状图': 'bar', 'bar': 'bar', 'bar-chart': 'bar', '柱图': 'bar',
  '折线图': 'line', 'line': 'line', 'line-chart': 'line', '折图': 'line',
  '饼图': 'pie', 'pie': 'pie', 'pie-chart': 'pie',
  '面积图': 'area', 'area': 'area', 'area-chart': 'area',
  '散点图': 'scatter', 'scatter': 'scatter', 'scatter-chart': 'scatter',
  '雷达图': 'radar', 'radar': 'radar', 'radar-chart': 'radar',
  
  // 高级类型
  '横向柱状图': 'bar-horizontal', 'bar-horizontal': 'bar-horizontal', '横向柱图': 'bar-horizontal',
  '堆叠柱状图': 'bar-stacked', 'bar-stacked': 'bar-stacked', '堆叠柱图': 'bar-stacked',
  '堆叠面积图': 'area-stacked', 'area-stacked': 'area-stacked', '堆叠面积': 'area-stacked',
  '组合图': 'composed', 'composed': 'composed', '混合图': 'composed',
  
  // 特殊类型
  '仪表盘': 'gauge', 'gauge': 'gauge', '仪表': 'gauge',
  '漏斗图': 'funnel', 'funnel': 'funnel', '漏斗': 'funnel',
  '热力图': 'heatmap', 'heatmap': 'heatmap', '热图': 'heatmap',
  '树图': 'tree', 'tree': 'tree',
  '矩形树图': 'treemap', 'treemap': 'treemap', '树状图': 'treemap',
  '旭日图': 'sunburst', 'sunburst': 'sunburst', '太阳图': 'sunburst',
  '关系图': 'graph', 'graph': 'graph', '网络图': 'graph',
  '平行坐标': 'parallel', 'parallel': 'parallel', '平行图': 'parallel',
  '桑基图': 'sankey', 'sankey': 'sankey', '桑基': 'sankey',
  '箱线图': 'boxplot', 'boxplot': 'boxplot', '箱图': 'boxplot',
  'K线图': 'candlestick', 'candlestick': 'candlestick', 'K线': 'candlestick', '蜡烛图': 'candlestick',
  '地图': 'map', 'map': 'map',
}

/**
 * 解析用户输入中的命令
 * 支持的命令格式：
 * - 前缀格式：/报表 问题内容、/图表 问题内容、/表格 问题内容
 * - 后缀格式：问题内容 /报表、问题内容 /图表、问题内容 /表格
 * - 支持中英文命令
 */
export function parseCommand(input: string): CommandParseResult {
  if (!input || typeof input !== 'string') {
    return {
      command: null,
      question: input || '',
      originalInput: input || ''
    }
  }

  const trimmedInput = input.trim()
  
  // 首先尝试匹配具体图表类型命令（优先级最高）
  for (const [commandStr, chartType] of Object.entries(CHART_TYPE_COMMANDS)) {
    // 前缀格式：@柱状图 问题内容 或 /柱状图 问题内容（向后兼容）
    const prefixPattern = new RegExp(`^[@/]${commandStr}\\s+(.+)$`, 'i')
    const prefixMatch = trimmedInput.match(prefixPattern)
    if (prefixMatch && prefixMatch[1]) {
      return {
        command: 'chart',
        chartType: chartType,
        question: prefixMatch[1].trim(),
        originalInput: input
      }
    }
    
    // 后缀格式：问题内容 @柱状图 或 问题内容 /柱状图（向后兼容）
    const suffixPattern = new RegExp(`^(.+)\\s+[@/]${commandStr}$`, 'i')
    const suffixMatch = trimmedInput.match(suffixPattern)
    if (suffixMatch && suffixMatch[1]) {
      return {
        command: 'chart',
        chartType: chartType,
        question: suffixMatch[1].trim(),
        originalInput: input
      }
    }
  }
  
  // 然后匹配通用命令（报表、报告、图表、表格）
  const commandPatterns = [
    // 报表命令 - 前缀格式（支持 @ 和 /，向后兼容）
    { pattern: /^[@/]报表\s+(.+)$/i, command: 'report' as const, chartType: null as const },
    { pattern: /^[@/]report\s+(.+)$/i, command: 'report' as const, chartType: null as const },
    // 报表命令 - 后缀格式
    { pattern: /^(.+)\s+[@/]报表$/i, command: 'report' as const, chartType: null as const },
    { pattern: /^(.+)\s+[@/]report$/i, command: 'report' as const, chartType: null as const },
    
    // 报告命令 - 前缀格式（新增）
    { pattern: /^[@/]报告\s+(.+)$/i, command: 'report' as const, chartType: null as const },
    // 报告命令 - 后缀格式
    { pattern: /^(.+)\s+[@/]报告$/i, command: 'report' as const, chartType: null as const },
    
    // 图表命令 - 前缀格式（通用，不指定具体类型）
    { pattern: /^[@/]图表\s+(.+)$/i, command: 'chart' as const, chartType: null as const },
    { pattern: /^[@/]chart\s+(.+)$/i, command: 'chart' as const, chartType: null as const },
    // 图表命令 - 后缀格式
    { pattern: /^(.+)\s+[@/]图表$/i, command: 'chart' as const, chartType: null as const },
    { pattern: /^(.+)\s+[@/]chart$/i, command: 'chart' as const, chartType: null as const },
    
    // 表格命令 - 前缀格式
    { pattern: /^[@/]表格\s+(.+)$/i, command: 'table' as const, chartType: null as const },
    { pattern: /^[@/]table\s+(.+)$/i, command: 'table' as const, chartType: null as const },
    // 表格命令 - 后缀格式
    { pattern: /^(.+)\s+[@/]表格$/i, command: 'table' as const, chartType: null as const },
    { pattern: /^(.+)\s+[@/]table$/i, command: 'table' as const, chartType: null as const },
  ]
  
  // 尝试匹配通用命令
  for (const { pattern, command, chartType } of commandPatterns) {
    const match = trimmedInput.match(pattern)
    if (match && match[1]) {
      return {
        command,
        chartType: chartType,
        question: match[1].trim(),
        originalInput: input
      }
    }
  }
  
  // 检测实体报告模式：xxx的报告（如果没有匹配到命令）
  const entityReportPattern = /^(.+?)(?:的)?报告$/i
  const entityReportMatch = trimmedInput.match(entityReportPattern)
  if (entityReportMatch && entityReportMatch[1]) {
    return {
      command: 'report',
      chartType: null,
      question: trimmedInput, // 保留完整的问题，包括"的报告"
      originalInput: input
    }
  }
  
  // 如果没有匹配到命令，返回原始输入
  return {
    command: null,
    chartType: null,
    question: trimmedInput,
    originalInput: input
  }
}

/**
 * 获取图表类型命令列表（用于帮助文档）
 */
export function getAvailableChartTypeCommands(): Array<{ command: string; type: ChartConfig["type"]; description: string }> {
  return [
    { command: '@柱状图', type: 'bar', description: '柱状图' },
    { command: '@折线图', type: 'line', description: '折线图' },
    { command: '@饼图', type: 'pie', description: '饼图' },
    { command: '@面积图', type: 'area', description: '面积图' },
    { command: '@散点图', type: 'scatter', description: '散点图' },
    { command: '@雷达图', type: 'radar', description: '雷达图' },
    { command: '@横向柱状图', type: 'bar-horizontal', description: '横向柱状图' },
    { command: '@堆叠柱状图', type: 'bar-stacked', description: '堆叠柱状图' },
    { command: '@堆叠面积图', type: 'area-stacked', description: '堆叠面积图' },
    { command: '@组合图', type: 'composed', description: '组合图' },
    { command: '@仪表盘', type: 'gauge', description: '仪表盘' },
    { command: '@漏斗图', type: 'funnel', description: '漏斗图' },
    { command: '@热力图', type: 'heatmap', description: '热力图' },
    { command: '@树图', type: 'tree', description: '树图' },
    { command: '@矩形树图', type: 'treemap', description: '矩形树图' },
    { command: '@旭日图', type: 'sunburst', description: '旭日图' },
    { command: '@关系图', type: 'graph', description: '关系图' },
    { command: '@平行坐标', type: 'parallel', description: '平行坐标' },
    { command: '@桑基图', type: 'sankey', description: '桑基图' },
    { command: '@箱线图', type: 'boxplot', description: '箱线图' },
    { command: '@K线图', type: 'candlestick', description: 'K线图' },
    { command: '@地图', type: 'map', description: '地图' },
  ]
}

/**
 * 检查输入是否包含命令
 */
export function hasCommand(input: string): boolean {
  const result = parseCommand(input)
  return result.command !== null
}

/**
 * 获取命令类型（如果存在）
 */
export function getCommandType(input: string): 'report' | 'chart' | 'table' | null {
  const result = parseCommand(input)
  return result.command
}
