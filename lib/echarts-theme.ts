/**
 * ECharts商务风格主题配置
 * 提供专业、优雅、符合商务风格的图表主题
 */

import type { EChartsOption } from 'echarts'

/**
 * 商务风格配色方案
 */
export const BUSINESS_COLORS = {
  primary: ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444'],
  gradients: {
    blue: {
      type: 'linear' as const,
      x: 0,
      y: 0,
      x2: 0,
      y2: 1,
      colorStops: [
        { offset: 0, color: '#3b82f6' },
        { offset: 1, color: '#1d4ed8' },
      ],
    },
    purple: {
      type: 'linear' as const,
      x: 0,
      y: 0,
      x2: 0,
      y2: 1,
      colorStops: [
        { offset: 0, color: '#8b5cf6' },
        { offset: 1, color: '#6d28d9' },
      ],
    },
    pink: {
      type: 'linear' as const,
      x: 0,
      y: 0,
      x2: 0,
      y2: 1,
      colorStops: [
        { offset: 0, color: '#ec4899' },
        { offset: 1, color: '#be185d' },
      ],
    },
    orange: {
      type: 'linear' as const,
      x: 0,
      y: 0,
      x2: 0,
      y2: 1,
      colorStops: [
        { offset: 0, color: '#f59e0b' },
        { offset: 1, color: '#d97706' },
      ],
    },
    green: {
      type: 'linear' as const,
      x: 0,
      y: 0,
      x2: 0,
      y2: 1,
      colorStops: [
        { offset: 0, color: '#10b981' },
        { offset: 1, color: '#059669' },
      ],
    },
    cyan: {
      type: 'linear' as const,
      x: 0,
      y: 0,
      x2: 0,
      y2: 1,
      colorStops: [
        { offset: 0, color: '#06b6d4' },
        { offset: 1, color: '#0891b2' },
      ],
    },
  },
}

/**
 * 获取商务风格的基础配置
 */
export function getBusinessThemeBase(): Partial<EChartsOption> {
  return {
    // 颜色配置
    color: BUSINESS_COLORS.primary,
    
    // 标题样式
    title: {
      textStyle: {
        fontSize: 18,
        fontWeight: 600,
        color: 'hsl(var(--foreground))',
      },
      left: 'center',
      top: 10,
    },
    
    // 图例样式
    legend: {
      top: 40,
      textStyle: {
        fontSize: 12,
        color: 'hsl(var(--muted-foreground))',
      },
      itemGap: 20,
    },
    
    // 网格配置
    grid: {
      left: '10%',
      right: '10%',
      top: '20%',
      bottom: '15%',
      containLabel: true,
    },
    
    // 工具提示配置
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'hsl(var(--popover))',
      borderColor: 'hsl(var(--border))',
      borderWidth: 1,
      textStyle: {
        color: 'hsl(var(--foreground))',
        fontSize: 12,
      },
      axisPointer: {
        type: 'shadow',
        shadowStyle: {
          color: 'rgba(59, 130, 246, 0.1)',
        },
      },
      padding: [12, 16],
      extraCssText: 'box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); border-radius: 8px;',
    },
    
    // 坐标轴通用配置
    xAxis: {
      type: 'category',
      axisLine: {
        lineStyle: {
          color: 'hsl(var(--border))',
          width: 1,
        },
      },
      axisTick: {
        show: false,
      },
      axisLabel: {
        color: 'hsl(var(--muted-foreground))',
        fontSize: 12,
      },
      splitLine: {
        show: false,
      },
    },
    
    yAxis: {
      type: 'value',
      axisLine: {
        show: false,
      },
      axisTick: {
        show: false,
      },
      axisLabel: {
        color: 'hsl(var(--muted-foreground))',
        fontSize: 12,
      },
      splitLine: {
        lineStyle: {
          color: 'hsl(var(--border))',
          opacity: 0.3,
          type: 'dashed',
        },
      },
    },
    
    // 动画配置
    animation: true,
    animationDuration: 1000,
    animationEasing: 'cubicOut',
    animationDelay: (idx: number) => idx * 100,
  }
}

/**
 * 获取柱状图专用配置
 */
export function getBarChartConfig(): Partial<EChartsOption> {
  return {
    ...getBusinessThemeBase(),
    series: [{
      type: 'bar',
      barWidth: '60%',
      itemStyle: {
        borderRadius: [8, 8, 0, 0],
      },
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowColor: 'rgba(59, 130, 246, 0.5)',
        },
      },
    }],
  }
}

/**
 * 获取折线图专用配置
 */
export function getLineChartConfig(): Partial<EChartsOption> {
  return {
    ...getBusinessThemeBase(),
    series: [{
      type: 'line',
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      lineStyle: {
        width: 3,
      },
      itemStyle: {
        borderWidth: 2,
        borderColor: '#fff',
      },
      areaStyle: {
        opacity: 0,
      },
      emphasis: {
        focus: 'series',
        lineStyle: {
          width: 4,
        },
      },
    }],
  }
}

/**
 * 获取面积图专用配置
 */
export function getAreaChartConfig(): Partial<EChartsOption> {
  return {
    ...getBusinessThemeBase(),
    series: [{
      type: 'line',
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      lineStyle: {
        width: 3,
      },
      areaStyle: {
        opacity: 0.4,
      },
      emphasis: {
        focus: 'series',
      },
    }],
  }
}

/**
 * 获取饼图专用配置
 */
export function getPieChartConfig(): Partial<EChartsOption> {
  return {
    ...getBusinessThemeBase(),
    tooltip: {
      trigger: 'item',
      backgroundColor: 'hsl(var(--popover))',
      borderColor: 'hsl(var(--border))',
      borderWidth: 1,
      textStyle: {
        color: 'hsl(var(--foreground))',
        fontSize: 12,
      },
      formatter: '{b}: {c} ({d}%)',
      padding: [12, 16],
      extraCssText: 'box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); border-radius: 8px;',
    },
    legend: {
      orient: 'vertical',
      right: 10,
      top: 'middle',
    },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['35%', '50%'],
      avoidLabelOverlap: true,
      itemStyle: {
        borderRadius: 8,
        borderColor: 'hsl(var(--background))',
        borderWidth: 2,
      },
      label: {
        show: true,
        formatter: '{b}\n{d}%',
        fontSize: 12,
        fontWeight: 500,
      },
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowOffsetX: 0,
          shadowColor: 'rgba(0, 0, 0, 0.5)',
        },
        label: {
          fontSize: 14,
          fontWeight: 600,
        },
      },
    }],
  }
}

/**
 * 根据图表类型获取专用配置
 */
export function getChartTypeConfig(type: string): Partial<EChartsOption> {
  switch (type) {
    case 'bar':
    case 'bar-horizontal':
    case 'bar-stacked':
      return getBarChartConfig()
    case 'line':
      return getLineChartConfig()
    case 'area':
    case 'area-stacked':
      return getAreaChartConfig()
    case 'pie':
      return getPieChartConfig()
    default:
      return getBusinessThemeBase()
  }
}
