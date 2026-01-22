"use client"

import React, { useMemo, useRef, useEffect, useState, memo } from "react"
import ReactECharts from "echarts-for-react"
import type { EChartsOption } from "echarts"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Download, AlertCircle } from "lucide-react"
import type { ChartConfig } from "@/lib/types"
import { 
  getBusinessThemeBase, 
  getChartTypeConfig, 
  BUSINESS_COLORS 
} from "@/lib/echarts-theme"
import { adaptDataForChartType } from "@/lib/chart-data-adapters"

interface EChartsRendererProps {
  config: ChartConfig
  className?: string
  isLoading?: boolean
  onChartClick?: (data: any, index: number) => void
}

// 数据采样函数：当数据量过大时进行采样
function sampleData(data: Record<string, any>[], maxSize: number = 500): Record<string, any>[] {
  if (data.length <= maxSize) {
    return data
  }
  
  // 均匀采样
  const step = Math.ceil(data.length / maxSize)
  return data.filter((_, index) => index % step === 0)
}

export const EChartsRenderer = memo(function EChartsRenderer({ 
  config, 
  className, 
  isLoading = false,
  onChartClick 
}: EChartsRendererProps) {
  const chartRef = useRef<ReactECharts>(null)
  const [error, setError] = useState<string | null>(null)
  const { type, title, xAxis, yAxis, data: rawData, colors = BUSINESS_COLORS.primary } = config
  
  // 数据采样：如果数据量过大，进行采样以提高性能
  const data = useMemo(() => {
    if (!rawData || rawData.length === 0) return rawData
    // 对于饼图和雷达图，不采样（通常数据量较小）
    if (type === 'pie' || type === 'radar') {
      return rawData
    }
    // 其他图表类型，如果超过500条数据，采样到500条
    return sampleData(rawData, 500)
  }, [rawData, type])

  // 数据验证
  useEffect(() => {
    if (!data || data.length === 0) {
      setError("数据为空，无法生成图表")
      return
    }
    
    if (!xAxis && type !== 'pie' && type !== 'radar') {
      setError("缺少X轴配置")
      return
    }
    
    if (!yAxis && type !== 'pie' && type !== 'radar') {
      setError("缺少Y轴配置")
      return
    }
    
    setError(null)
  }, [data, xAxis, yAxis, type])

  // 生成ECharts配置（带错误处理）
  const option = useMemo<EChartsOption | null>(() => {
    try {
      if (error) return null
    const baseConfig = getChartTypeConfig(type)
    const baseTheme = getBusinessThemeBase()

    // 准备数据
    const chartData = prepareChartData(data, xAxis, yAxis, type)

    // 根据图表类型生成配置
    switch (type) {
      case 'bar':
        return {
          ...baseTheme,
          ...baseConfig,
          title: {
            ...baseTheme.title,
            text: title,
          },
          xAxis: {
            ...baseTheme.xAxis,
            data: chartData.categories,
          },
          yAxis: baseTheme.yAxis,
          series: Array.isArray(yAxis) 
            ? yAxis.map((key, index) => ({
                name: String(key),
                type: 'bar',
                data: chartData.series[key] || [],
                itemStyle: {
                  color: colors[index % colors.length],
                  borderRadius: [8, 8, 0, 0],
                },
                emphasis: {
                  itemStyle: {
                    shadowBlur: 10,
                    shadowColor: `rgba(${hexToRgb(colors[index % colors.length])}, 0.5)`,
                  },
                },
              }))
            : [{
                name: String(yAxis),
                type: 'bar',
                data: chartData.series[String(yAxis)] || [],
                itemStyle: {
                  color: colors[0],
                  borderRadius: [8, 8, 0, 0],
                },
                emphasis: {
                  itemStyle: {
                    shadowBlur: 10,
                    shadowColor: `rgba(${hexToRgb(colors[0])}, 0.5)`,
                  },
                },
              }],
        }

      case 'bar-horizontal':
        return {
          ...baseTheme,
          ...baseConfig,
          title: {
            ...baseTheme.title,
            text: title,
          },
          xAxis: {
            ...baseTheme.xAxis,
            type: 'value',
          },
          yAxis: {
            ...baseTheme.yAxis,
            type: 'category',
            data: chartData.categories,
          },
          series: Array.isArray(yAxis)
            ? yAxis.map((key, index) => ({
                name: String(key),
                type: 'bar',
                data: chartData.series[key] || [],
                itemStyle: {
                  color: colors[index % colors.length],
                  borderRadius: [0, 8, 8, 0],
                },
              }))
            : [{
                name: String(yAxis),
                type: 'bar',
                data: chartData.series[String(yAxis)] || [],
                itemStyle: {
                  color: colors[0],
                  borderRadius: [0, 8, 8, 0],
                },
              }],
        }

      case 'bar-stacked':
        return {
          ...baseTheme,
          ...baseConfig,
          title: {
            ...baseTheme.title,
            text: title,
          },
          xAxis: {
            ...baseTheme.xAxis,
            data: chartData.categories,
          },
          yAxis: baseTheme.yAxis,
          series: Array.isArray(yAxis)
            ? yAxis.map((key, index) => ({
                name: String(key),
                type: 'bar',
                stack: 'total',
                data: chartData.series[key] || [],
                itemStyle: {
                  color: colors[index % colors.length],
                },
              }))
            : [{
                name: String(yAxis),
                type: 'bar',
                data: chartData.series[String(yAxis)] || [],
                itemStyle: {
                  color: colors[0],
                },
              }],
        }

      case 'line':
        return {
          ...baseTheme,
          ...baseConfig,
          title: {
            ...baseTheme.title,
            text: title,
          },
          xAxis: {
            ...baseTheme.xAxis,
            data: chartData.categories,
          },
          yAxis: baseTheme.yAxis,
          series: Array.isArray(yAxis)
            ? yAxis.map((key, index) => ({
                name: String(key),
                type: 'line',
                smooth: true,
                symbol: 'circle',
                symbolSize: 6,
                data: chartData.series[key] || [],
                lineStyle: {
                  width: 3,
                  color: colors[index % colors.length],
                },
                itemStyle: {
                  color: colors[index % colors.length],
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
              }))
            : [{
                name: String(yAxis),
                type: 'line',
                smooth: true,
                symbol: 'circle',
                symbolSize: 6,
                data: chartData.series[String(yAxis)] || [],
                lineStyle: {
                  width: 3,
                  color: colors[0],
                },
                itemStyle: {
                  color: colors[0],
                  borderWidth: 2,
                  borderColor: '#fff',
                },
                areaStyle: {
                  opacity: 0,
                },
              }],
        }

      case 'area':
        return {
          ...baseTheme,
          ...baseConfig,
          title: {
            ...baseTheme.title,
            text: title,
          },
          xAxis: {
            ...baseTheme.xAxis,
            data: chartData.categories,
          },
          yAxis: baseTheme.yAxis,
          series: Array.isArray(yAxis)
            ? yAxis.map((key, index) => ({
                name: String(key),
                type: 'line',
                smooth: true,
                symbol: 'circle',
                symbolSize: 6,
                data: chartData.series[key] || [],
                lineStyle: {
                  width: 3,
                  color: colors[index % colors.length],
                },
                itemStyle: {
                  color: colors[index % colors.length],
                },
                areaStyle: {
                  opacity: 0.4,
                  color: colors[index % colors.length],
                },
              }))
            : [{
                name: String(yAxis),
                type: 'line',
                smooth: true,
                symbol: 'circle',
                symbolSize: 6,
                data: chartData.series[String(yAxis)] || [],
                lineStyle: {
                  width: 3,
                  color: colors[0],
                },
                areaStyle: {
                  opacity: 0.4,
                  color: colors[0],
                },
              }],
        }

      case 'area-stacked':
        return {
          ...baseTheme,
          ...baseConfig,
          title: {
            ...baseTheme.title,
            text: title,
          },
          xAxis: {
            ...baseTheme.xAxis,
            data: chartData.categories,
          },
          yAxis: baseTheme.yAxis,
          series: Array.isArray(yAxis)
            ? yAxis.map((key, index) => ({
                name: String(key),
                type: 'line',
                smooth: true,
                stack: 'total',
                data: chartData.series[key] || [],
                lineStyle: {
                  width: 2,
                },
                areaStyle: {
                  opacity: 0.5,
                  color: colors[index % colors.length],
                },
              }))
            : [{
                name: String(yAxis),
                type: 'line',
                smooth: true,
                data: chartData.series[String(yAxis)] || [],
                areaStyle: {
                  opacity: 0.5,
                  color: colors[0],
                },
              }],
        }

      case 'pie':
        const pieData = preparePieData(data, xAxis, yAxis)
        return {
          ...baseTheme,
          ...getChartTypeConfig('pie'),
          title: {
            ...baseTheme.title,
            text: title,
          },
          series: [{
            type: 'pie',
            radius: ['40%', '70%'],
            center: ['35%', '50%'],
            data: pieData.map((item, index) => ({
              ...item,
              itemStyle: {
                color: colors[index % colors.length],
                borderRadius: 8,
                borderColor: 'hsl(var(--background))',
                borderWidth: 2,
              },
            })),
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
            label: {
              show: true,
              formatter: '{b}\n{d}%',
              fontSize: 12,
              fontWeight: 500,
            },
          }],
        }

      case 'scatter':
        return {
          ...baseTheme,
          ...baseConfig,
          title: {
            ...baseTheme.title,
            text: title,
          },
          xAxis: {
            ...baseTheme.xAxis,
            type: 'value',
          },
          yAxis: {
            ...baseTheme.yAxis,
            type: 'value',
          },
          series: [{
            type: 'scatter',
            data: data.map(item => [item[xAxis!], item[String(yAxis)]]) as [number, number][],
            symbolSize: (data: number[]) => Math.sqrt(data[1]) / 5,
            itemStyle: {
              color: colors[0],
              opacity: 0.6,
            },
          }],
        }

      case 'radar':
        const radarData = prepareRadarData(data, xAxis, yAxis, title)
        return {
          ...baseTheme,
          ...baseConfig,
          title: {
            ...baseTheme.title,
            text: title,
          },
          radar: {
            indicator: radarData.indicators,
            center: ['50%', '55%'],
            radius: '70%',
            axisName: {
              color: 'hsl(var(--muted-foreground))',
              fontSize: 12,
            },
            splitArea: {
              areaStyle: {
                color: ['rgba(59, 130, 246, 0.05)', 'rgba(59, 130, 246, 0.1)'],
              },
            },
            splitLine: {
              lineStyle: {
                color: 'hsl(var(--border))',
                opacity: 0.3,
              },
            },
          },
          series: [{
            type: 'radar',
            data: radarData.series,
            itemStyle: {
              color: colors[0],
            },
            areaStyle: {
              opacity: 0.3,
              color: colors[0],
            },
            lineStyle: {
              width: 2,
              color: colors[0],
            },
          }],
        }

      case 'composed':
        return {
          ...baseTheme,
          ...baseConfig,
          title: {
            ...baseTheme.title,
            text: title,
          },
          xAxis: {
            ...baseTheme.xAxis,
            data: chartData.categories,
          },
          yAxis: [
            {
              ...baseTheme.yAxis,
              type: 'value',
              name: Array.isArray(yAxis) ? yAxis[0] : String(yAxis),
            },
            {
              type: 'value',
              name: Array.isArray(yAxis) && yAxis.length > 1 ? yAxis[1] : String(yAxis),
              axisLine: {
                show: false,
              },
              axisLabel: {
                color: 'hsl(var(--muted-foreground))',
              },
            },
          ],
          series: Array.isArray(yAxis) && yAxis.length >= 2
            ? [
                {
                  name: String(yAxis[0]),
                  type: 'bar',
                  data: chartData.series[String(yAxis[0])] || [],
                  itemStyle: {
                    color: colors[0],
                    borderRadius: [8, 8, 0, 0],
                  },
                },
                {
                  name: String(yAxis[1]),
                  type: 'line',
                  yAxisIndex: 1,
                  smooth: true,
                  data: chartData.series[String(yAxis[1])] || [],
                  lineStyle: {
                    width: 3,
                    color: colors[1],
                  },
                  itemStyle: {
                    color: colors[1],
                  },
                },
              ]
            : [],
        }

      case 'gauge':
        const gaugeData = adaptDataForChartType('gauge', data, xAxis, yAxis)
        if (!gaugeData || !gaugeData.value) {
          // 如果数据不适合仪表盘，降级为其他图表类型
          console.warn("[EChartsRenderer] Gauge data format invalid, falling back to bar chart")
          return {
            ...baseTheme,
            ...getChartTypeConfig('bar'),
            title: {
              ...baseTheme.title,
              text: title,
            },
            xAxis: {
              ...baseTheme.xAxis,
              data: chartData.categories,
            },
            yAxis: baseTheme.yAxis,
            series: [{
              name: String(yAxis),
              type: 'bar',
              data: chartData.series[String(yAxis)] || [],
              itemStyle: {
                color: colors[0],
                borderRadius: [8, 8, 0, 0],
              },
            }],
          }
        }
        return {
          ...baseTheme,
          title: {
            ...baseTheme.title,
            text: title,
          },
          series: [{
            type: 'gauge',
            data: [gaugeData],
            center: ['50%', '60%'],
            radius: '75%',
            startAngle: 200,
            endAngle: -20,
            min: 0,
            max: 100,
            splitNumber: 10,
            axisLine: {
              lineStyle: {
                width: 6,
                color: [[1, colors[0]]]
              }
            },
            pointer: {
              itemStyle: {
                color: 'auto'
              }
            },
            axisTick: {
              distance: -30,
              length: 8,
              lineStyle: {
                color: '#fff',
                width: 2
              }
            },
            splitLine: {
              distance: -30,
              length: 14,
              lineStyle: {
                color: '#fff',
                width: 4
              }
            },
            axisLabel: {
              color: 'hsl(var(--muted-foreground))',
              distance: -40,
              fontSize: 12
            },
            detail: {
              valueAnimation: true,
              formatter: '{value}%',
              color: 'auto',
              fontSize: 20,
              fontWeight: 600
            },
            title: {
              offsetCenter: [0, '-30%'],
              fontSize: 14,
              color: 'hsl(var(--muted-foreground))'
            }
          }]
        }

      case 'funnel':
        const funnelData = adaptDataForChartType('funnel', data, xAxis, yAxis)
        return {
          ...baseTheme,
          title: {
            ...baseTheme.title,
            text: title,
          },
          tooltip: {
            ...baseTheme.tooltip,
            trigger: 'item',
            formatter: '{b}: {c} ({d}%)',
          },
          series: [{
            type: 'funnel',
            left: '10%',
            top: 60,
            bottom: 60,
            width: '80%',
            min: 0,
            max: Math.max(...funnelData.map((d: any) => d.value)),
            minSize: '0%',
            maxSize: '100%',
            sort: 'descending',
            gap: 2,
            label: {
              show: true,
              position: 'inside',
              formatter: '{b}: {c}',
              fontSize: 12,
              fontWeight: 500,
            },
            labelLine: {
              length: 10,
              lineStyle: {
                width: 1,
                type: 'solid'
              }
            },
            itemStyle: {
              borderColor: '#fff',
              borderWidth: 1
            },
            emphasis: {
              label: {
                fontSize: 14,
                fontWeight: 600
              }
            },
            data: funnelData.map((item: any, index: number) => ({
              ...item,
              itemStyle: {
                color: colors[index % colors.length]
              }
            }))
          }]
        }

      case 'heatmap':
        const heatmapData = adaptDataForChartType('heatmap', data, xAxis, yAxis as string)
        const xCategories = Array.from(new Set(data.map(item => String(item[xAxis || Object.keys(data[0])[0]] || ''))))
        const yCategories = Array.from(new Set(data.map(item => {
          const keys = Object.keys(item)
          const yKey = yAxis as string || (keys.length > 1 ? keys[1] : keys[0])
          return String(item[yKey] || '')
        })))
        
        return {
          ...baseTheme,
          title: {
            ...baseTheme.title,
            text: title,
          },
          tooltip: {
            ...baseTheme.tooltip,
            position: 'top',
            formatter: (params: any) => {
              return `${xCategories[params.data[0]]} - ${yCategories[params.data[1]]}<br/>值: ${params.data[2]}`
            }
          },
          grid: {
            height: '50%',
            top: '10%'
          },
          xAxis: {
            type: 'category',
            data: xCategories,
            splitArea: {
              show: true
            },
            axisLabel: {
              color: 'hsl(var(--muted-foreground))',
              fontSize: 12
            }
          },
          yAxis: {
            type: 'category',
            data: yCategories,
            splitArea: {
              show: true
            },
            axisLabel: {
              color: 'hsl(var(--muted-foreground))',
              fontSize: 12
            }
          },
          visualMap: {
            min: Math.min(...heatmapData.map((d: any) => d[2])),
            max: Math.max(...heatmapData.map((d: any) => d[2])),
            calculable: true,
            orient: 'horizontal',
            left: 'center',
            bottom: '5%',
            inRange: {
              color: [colors[0], colors[1]]
            }
          },
          series: [{
            name: '热力图',
            type: 'heatmap',
            data: heatmapData,
            label: {
              show: true,
              fontSize: 10
            },
            emphasis: {
              itemStyle: {
                shadowBlur: 10,
                shadowColor: 'rgba(0, 0, 0, 0.5)'
              }
            }
          }]
        }

      case 'sankey':
        const sankeyData = adaptDataForChartType('sankey', data, xAxis, yAxis as string)
        return {
          ...baseTheme,
          title: {
            ...baseTheme.title,
            text: title,
          },
          tooltip: {
            ...baseTheme.tooltip,
            trigger: 'item',
            triggerOn: 'mousemove'
          },
          series: [{
            type: 'sankey',
            data: sankeyData.nodes,
            links: sankeyData.links,
            emphasis: {
              focus: 'adjacency'
            },
            lineStyle: {
              color: 'gradient',
              curveness: 0.5
            },
            label: {
              fontSize: 12,
              color: 'hsl(var(--foreground))'
            },
            itemStyle: {
              borderWidth: 1,
              borderColor: '#aaa'
            }
          }]
        }

      case 'candlestick':
        const candlestickData = adaptDataForChartType('candlestick', data, xAxis, yAxis as string)
        return {
          ...baseTheme,
          title: {
            ...baseTheme.title,
            text: title,
          },
          xAxis: {
            ...baseTheme.xAxis,
            data: chartData.categories,
            scale: true,
            boundaryGap: false,
          },
          yAxis: {
            ...baseTheme.yAxis,
            scale: true,
            splitArea: {
              show: true
            }
          },
          series: [{
            type: 'candlestick',
            data: candlestickData,
            itemStyle: {
              color: colors[0],
              color0: colors[1],
              borderColor: colors[0],
              borderColor0: colors[1]
            }
          }]
        }

      case 'boxplot':
        const boxplotData = adaptDataForChartType('boxplot', data, xAxis, yAxis as string)
        return {
          ...baseTheme,
          title: {
            ...baseTheme.title,
            text: title,
          },
          xAxis: {
            ...baseTheme.xAxis,
            data: chartData.categories,
            boundaryGap: true,
            nameGap: 30,
            splitArea: {
              show: false
            },
            splitLine: {
              show: false
            }
          },
          yAxis: {
            ...baseTheme.yAxis,
            type: 'value',
            name: '数值',
            splitArea: {
              show: true
            }
          },
          series: [{
            name: 'boxplot',
            type: 'boxplot',
            data: boxplotData,
            itemStyle: {
              color: colors[0],
              borderColor: colors[1]
            },
            emphasis: {
              focus: 'series'
            }
          }]
        }

      case 'tree':
      case 'treemap':
      case 'sunburst':
        const treeData = adaptDataForChartType('tree', data, xAxis, yAxis as string)
        if (type === 'tree') {
          return {
            ...baseTheme,
            title: {
              ...baseTheme.title,
              text: title,
            },
            tooltip: {
              ...baseTheme.tooltip,
              trigger: 'item',
              triggerOn: 'mousemove'
            },
            series: [{
              type: 'tree',
              data: [treeData],
              top: '5%',
              left: '7%',
              bottom: '5%',
              right: '20%',
              symbolSize: 7,
              label: {
                position: 'left',
                verticalAlign: 'middle',
                align: 'right',
                fontSize: 12
              },
              leaves: {
                label: {
                  position: 'right',
                  verticalAlign: 'middle',
                  align: 'left'
                }
              },
              emphasis: {
                focus: 'descendant'
              },
              expandAndCollapse: true,
              animationDuration: 550,
              animationDurationUpdate: 750
            }]
          }
        } else if (type === 'treemap') {
          return {
            ...baseTheme,
            title: {
              ...baseTheme.title,
              text: title,
            },
            tooltip: {
              ...baseTheme.tooltip,
              trigger: 'item',
              formatter: '{b}: {c}'
            },
            series: [{
              type: 'treemap',
              data: [treeData],
              roam: false,
              nodeClick: false,
              breadcrumb: {
                show: false
              },
              label: {
                show: true,
                formatter: '{b}',
                fontSize: 12
              },
              upperLabel: {
                show: true,
                height: 30
              },
              itemStyle: {
                borderColor: '#fff'
              },
              emphasis: {
                itemStyle: {
                  shadowBlur: 10,
                  shadowColor: 'rgba(0, 0, 0, 0.5)'
                }
              }
            }]
          }
        } else { // sunburst
          return {
            ...baseTheme,
            title: {
              ...baseTheme.title,
              text: title,
            },
            tooltip: {
              ...baseTheme.tooltip,
              trigger: 'item',
              formatter: '{b}: {c}'
            },
            series: [{
              type: 'sunburst',
              data: [treeData],
              radius: [0, '90%'],
              itemStyle: {
                borderRadius: 8,
                borderWidth: 2
              },
              label: {
                show: true,
                fontSize: 12
              }
            }]
          }
        }

      case 'graph':
        // 关系图需要节点和边的数据
        const graphNodes = data.map((item, index) => {
          const keys = Object.keys(item)
          return {
            id: String(item[keys[0]] || index),
            name: String(item[keys[0]] || `节点${index}`),
            value: Number(item[keys.find(k => typeof item[k] === 'number')] || 1),
            category: 0
          }
        })
        const graphLinks = data.length > 1 ? data.slice(1).map((item, index) => {
          const keys = Object.keys(item)
          return {
            source: String(data[0][Object.keys(data[0])[0]] || 0),
            target: String(item[keys[0]] || index + 1),
            value: Number(item[keys.find(k => typeof item[k] === 'number')] || 1)
          }
        }) : []
        
        return {
          ...baseTheme,
          title: {
            ...baseTheme.title,
            text: title,
          },
          tooltip: {
            ...baseTheme.tooltip,
            trigger: 'item'
          },
          series: [{
            type: 'graph',
            layout: 'force',
            data: graphNodes,
            links: graphLinks,
            categories: [{ name: '节点' }],
            roam: true,
            label: {
              show: true,
              position: 'right',
              formatter: '{b}',
              fontSize: 12
            },
            labelLayout: {
              hideOverlap: true
            },
            scaleLimit: {
              min: 0.4,
              max: 2
            },
            lineStyle: {
              color: 'source',
              curveness: 0.3
            },
            emphasis: {
              focus: 'adjacency',
              lineStyle: {
                width: 10
              }
            }
          }]
        }

      case 'parallel':
        // 平行坐标需要多个数值字段
        const parallelData = data.map(item => {
          const keys = Object.keys(item)
          const numericKeys = keys.filter(k => typeof item[k] === 'number')
          return numericKeys.map(k => item[k])
        })
        const parallelDimensions = data.length > 0 
          ? Object.keys(data[0]).filter(k => typeof data[0][k] === 'number')
          : []
        
        return {
          ...baseTheme,
          title: {
            ...baseTheme.title,
            text: title,
          },
          parallelAxis: parallelDimensions.map((dim, index) => ({
            dim: index,
            name: dim,
            type: 'value',
            nameLocation: 'start',
            nameGap: 20,
            nameTextStyle: {
              fontSize: 12,
              color: 'hsl(var(--muted-foreground))'
            }
          })),
          series: [{
            type: 'parallel',
            data: parallelData,
            lineStyle: {
              width: 2,
              opacity: 0.5
            },
            emphasis: {
              lineStyle: {
                width: 4,
                opacity: 1
              }
            }
          }]
        }

      case 'map':
        // 地图需要地理数据
        return {
          ...baseTheme,
          title: {
            ...baseTheme.title,
            text: title,
          },
          tooltip: {
            ...baseTheme.tooltip,
            trigger: 'item'
          },
          visualMap: {
            min: Math.min(...data.map(item => {
              const keys = Object.keys(item)
              const valueKey = keys.find(k => typeof item[k] === 'number')
              return valueKey ? Number(item[valueKey] || 0) : 0
            })),
            max: Math.max(...data.map(item => {
              const keys = Object.keys(item)
              const valueKey = keys.find(k => typeof item[k] === 'number')
              return valueKey ? Number(item[valueKey] || 0) : 0
            })),
            left: 'left',
            top: 'bottom',
            text: ['高', '低'],
            calculable: true,
            inRange: {
              color: [colors[0], colors[1]]
            }
          },
          series: [{
            type: 'map',
            map: 'china', // 默认使用中国地图，可以根据数据调整
            roam: true,
            label: {
              show: true,
              fontSize: 12
            },
            data: data.map(item => {
              const keys = Object.keys(item)
              const nameKey = keys.find(k => typeof item[k] === 'string') || keys[0]
              const valueKey = keys.find(k => typeof item[k] === 'number') || keys[1]
              return {
                name: String(item[nameKey] || ''),
                value: Number(item[valueKey] || 0)
              }
            })
          }]
        }

      default:
        return {
          ...baseTheme,
          title: {
            ...baseTheme.title,
            text: title,
          },
        }
    }
    } catch (err) {
      console.error("[EChartsRenderer] Error generating option:", err)
      setError("生成图表配置时发生错误")
      return null
    }
  }, [type, title, xAxis, yAxis, data, colors, error])

  // 处理图表点击事件
  const onEvents = useMemo(() => {
    if (!onChartClick) return {}
    
    return {
      click: (params: any) => {
        if (params.data && onChartClick) {
          onChartClick(params.data, params.dataIndex)
        }
      },
    }
  }, [onChartClick])

  // 导出图表为图片
  const handleExport = () => {
    if (chartRef.current) {
      const chartInstance = chartRef.current.getEchartsInstance()
      const url = chartInstance.getDataURL({
        type: 'png',
        pixelRatio: 2,
        backgroundColor: '#fff',
      })
      
      const link = document.createElement('a')
      link.download = `${title || 'chart'}.png`
      link.href = url
      link.click()
    }
  }

  // 错误状态
  if (error || !option) {
    return (
      <Card className={`p-6 ${className} bg-card border border-border/50`}>
        <div className="h-[450px] flex flex-col items-center justify-center gap-2">
          <AlertCircle className="w-8 h-8 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">
            {error || "无法生成图表"}
          </div>
        </div>
      </Card>
    )
  }

  if (isLoading || !data || data.length === 0) {
    return (
      <Card className={`p-6 ${className} bg-card border border-border/50`}>
        <div className="h-[450px] flex items-center justify-center">
          <div className="text-muted-foreground">图表数据加载中...</div>
        </div>
      </Card>
    )
  }

  return (
    <Card className={`p-6 ${className} bg-card border border-border/50 shadow-sm`}>
      <div className="mb-4 pb-3 border-b border-border/30">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground tracking-tight">
            {title}
          </h3>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              className="h-8 gap-1.5 rounded-md"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="text-xs">导出</span>
            </Button>
          </div>
        </div>
      </div>
      <div className="relative">
        <ReactECharts
          ref={chartRef}
          option={option}
          style={{ height: '450px', width: '100%' }}
          opts={{ renderer: 'svg', locale: 'ZH' }}
          onEvents={onEvents}
          notMerge={true}
          lazyUpdate={true}
          onChartReady={(chart) => {
            // 图表加载完成回调
            try {
              chart.resize()
            } catch (err) {
              console.warn("[EChartsRenderer] Error resizing chart:", err)
            }
          }}
        />
      </div>
    </Card>
  )
}, (prevProps, nextProps) => {
  // 自定义比较函数，优化重渲染
  return (
    prevProps.config.type === nextProps.config.type &&
    prevProps.config.title === nextProps.config.title &&
    prevProps.config.xAxis === nextProps.config.xAxis &&
    JSON.stringify(prevProps.config.yAxis) === JSON.stringify(nextProps.config.yAxis) &&
    JSON.stringify(prevProps.config.data) === JSON.stringify(nextProps.config.data) &&
    prevProps.isLoading === nextProps.isLoading &&
    prevProps.className === nextProps.className
  )
})

/**
 * 准备图表数据
 */
function prepareChartData(
  data: Record<string, any>[],
  xAxis?: string,
  yAxis?: string | string[],
  type?: string
) {
  if (!data || data.length === 0) {
    return { categories: [], series: {} }
  }

  const categories = xAxis 
    ? data.map(item => String(item[xAxis] || ''))
    : data.map((_, index) => String(index))

  const series: Record<string, any[]> = {}
  
  if (Array.isArray(yAxis)) {
    yAxis.forEach(key => {
      series[String(key)] = data.map(item => item[String(key)] || 0)
    })
  } else if (yAxis) {
    series[String(yAxis)] = data.map(item => item[String(yAxis)] || 0)
  } else {
    // 如果没有指定yAxis，使用第一个数值字段
    const firstItem = data[0]
    const keys = Object.keys(firstItem)
    const numericKey = keys.find(key => typeof firstItem[key] === 'number')
    if (numericKey) {
      series[numericKey] = data.map(item => item[numericKey] || 0)
    }
  }

  return { categories, series }
}

/**
 * 准备饼图数据
 */
function preparePieData(
  data: Record<string, any>[],
  xAxis?: string,
  yAxis?: string | string[]
) {
  const nameKey = xAxis || Object.keys(data[0] || {})[0]
  const valueKey = Array.isArray(yAxis) ? yAxis[0] : (yAxis || Object.keys(data[0] || {})[1])

  return data.map(item => ({
    name: String(item[nameKey] || ''),
    value: Number(item[valueKey] || 0),
  }))
}

/**
 * 准备雷达图数据
 */
function prepareRadarData(
  data: Record<string, any>[],
  xAxis?: string,
  yAxis?: string | string[],
  chartTitle?: string
) {
  const firstItem = data[0]
  const keys = Object.keys(firstItem)
  
  const nameKey = xAxis || keys[0]
  const valueKeys = Array.isArray(yAxis) ? yAxis : (yAxis ? [yAxis] : keys.slice(1))

  const indicators = valueKeys.map(key => ({
    name: String(key),
    max: Math.max(...data.map(item => Number(item[String(key)] || 0))),
  }))

  const seriesData = data.map(item => ({
    name: String(item[nameKey] || ''),
    value: valueKeys.map(key => Number(item[String(key)] || 0)),
  }))

  return {
    indicators,
    series: [{
      name: chartTitle || '数据',
      data: seriesData,
    }],
  }
}

/**
 * 将十六进制颜色转换为RGB
 */
function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
    : '59, 130, 246'
}
