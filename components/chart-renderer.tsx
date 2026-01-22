"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import type { ChartConfig } from "@/lib/types"
import { translateColumnName } from "@/lib/utils"
import { ChartSkeleton } from "./chart-skeleton"
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ComposedChart,
  Brush,
} from "recharts"
import { Button } from "./ui/button"
import { Filter, Download, ZoomIn, Settings } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog"
import { Label } from "./ui/label"
import { Input } from "./ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { Switch } from "./ui/switch"
import { Checkbox } from "./ui/checkbox"

interface ChartRendererProps {
  config: ChartConfig
  className?: string
  isLoading?: boolean
  onChartClick?: (data: any, index: number) => void
}

// 现代化渐变色彩方案 - 对标大厂设计
const COLORS = [
  "url(#gradientBlue)",
  "url(#gradientPurple)", 
  "url(#gradientPink)",
  "url(#gradientOrange)",
  "url(#gradientGreen)",
  "url(#gradientCyan)",
  "url(#gradientRed)",
]

const SOLID_COLORS = [
  "#3b82f6", // 蓝色
  "#8b5cf6", // 紫色
  "#ec4899", // 粉色
  "#f59e0b", // 橙色
  "#10b981", // 绿色
  "#06b6d4", // 青色
  "#ef4444", // 红色
]

export function ChartRenderer({ config, className, isLoading = false, onChartClick }: ChartRendererProps) {
  const [filteredData, setFilteredData] = useState<any[] | null>(null)
  const [isFiltered, setIsFiltered] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const { type: initialType, title, xAxis: initialXAxis, yAxis: initialYAxis, data, colors = SOLID_COLORS } = config
  
  // 图表设置状态
  const [chartType, setChartType] = useState(initialType)
  const [xAxisField, setXAxisField] = useState(initialXAxis)
  const [yAxisFields, setYAxisFields] = useState<string[]>(
    Array.isArray(initialYAxis) ? initialYAxis : initialYAxis ? [initialYAxis] : []
  )
  const [showLegend, setShowLegend] = useState(true)
  const [showGrid, setShowGrid] = useState(true)
  
  const [isDataReady, setIsDataReady] = useState(false)
  const [animationDelay, setAnimationDelay] = useState(0)
  
  // 获取数据中的所有字段
  const availableFields = data.length > 0 ? Object.keys(data[0]) : []
  
  // 图表类型选项
  const chartTypeOptions: { value: ChartConfig["type"]; label: string }[] = [
    { value: "bar", label: "柱状图" },
    { value: "line", label: "折线图" },
    { value: "area", label: "面积图" },
    { value: "pie", label: "饼图" },
    { value: "scatter", label: "散点图" },
    { value: "radar", label: "雷达图" },
    { value: "bar-horizontal", label: "横向柱状图" },
    { value: "bar-stacked", label: "堆叠柱状图" },
    { value: "area-stacked", label: "堆叠面积图" },
    { value: "composed", label: "组合图" },
    { value: "table", label: "表格" },
  ]

  // 重置筛选
  const handleResetFilter = () => {
    setFilteredData(null)
    setIsFiltered(false)
  }

  // 导出图表为图片
  const handleExportChart = () => {
    try {
      // 查找图表容器
      const chartCard = document.querySelector(`[data-chart-id="${title}"]`)
      if (!chartCard) {
        console.error('[ChartRenderer] Chart card not found')
        return
      }

      // 查找 SVG 元素
      const svgElement = chartCard.querySelector('svg')
      if (!svgElement) {
        console.error('[ChartRenderer] SVG element not found')
        return
      }

      // 克隆 SVG 元素以避免修改原始元素
      const clonedSvg = svgElement.cloneNode(true) as SVGElement
      
      // 获取 SVG 的尺寸
      const svgRect = svgElement.getBoundingClientRect()
      const svgWidth = svgRect.width || 800
      const svgHeight = svgRect.height || 450

      // 设置 SVG 属性
      clonedSvg.setAttribute('width', String(svgWidth))
      clonedSvg.setAttribute('height', String(svgHeight))
      clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

      // 将 SVG 转换为 Data URL
      const svgData = new XMLSerializer().serializeToString(clonedSvg)
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(svgBlob)

      // 创建临时图片来转换为 PNG
      const img = new Image()
      img.onload = () => {
        // 创建 Canvas
        const canvas = document.createElement('canvas')
        canvas.width = svgWidth
        canvas.height = svgHeight
        const ctx = canvas.getContext('2d')
        
        if (!ctx) {
          console.error('[ChartRenderer] Failed to get canvas context')
          URL.revokeObjectURL(url)
          return
        }

        // 填充白色背景
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        // 绘制图片
        ctx.drawImage(img, 0, 0)

        // 转换为 PNG 并下载
        canvas.toBlob((blob) => {
          if (blob) {
            const downloadUrl = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.download = `${title || 'chart'}.png`
            link.href = downloadUrl
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            URL.revokeObjectURL(downloadUrl)
          }
          URL.revokeObjectURL(url)
        }, 'image/png')
      }

      img.onerror = () => {
        console.error('[ChartRenderer] Failed to load SVG as image')
        URL.revokeObjectURL(url)
      }

      img.src = url
    } catch (error) {
      console.error('[ChartRenderer] Error exporting chart:', error)
    }
  }

  // 检测数据是否已加载
  useEffect(() => {
    if (!isLoading && data && data.length > 0) {
      // 延迟一点时间显示数据，让骨架屏动画更自然
      const timer = setTimeout(() => {
        setIsDataReady(true)
        setAnimationDelay(200) // 设置初始动画延迟
      }, 300)
      return () => clearTimeout(timer)
    } else {
      setIsDataReady(false)
      setAnimationDelay(0)
    }
  }, [isLoading, data])

  // 定义渐变定义
  const GradientDefinitions = () => (
    <defs>
      <linearGradient id="gradientBlue" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
        <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.8} />
      </linearGradient>
      <linearGradient id="gradientPurple" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={1} />
        <stop offset="100%" stopColor="#6d28d9" stopOpacity={0.8} />
      </linearGradient>
      <linearGradient id="gradientPink" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ec4899" stopOpacity={1} />
        <stop offset="100%" stopColor="#be185d" stopOpacity={0.8} />
      </linearGradient>
      <linearGradient id="gradientOrange" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#f59e0b" stopOpacity={1} />
        <stop offset="100%" stopColor="#d97706" stopOpacity={0.8} />
      </linearGradient>
      <linearGradient id="gradientGreen" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#10b981" stopOpacity={1} />
        <stop offset="100%" stopColor="#059669" stopOpacity={0.8} />
      </linearGradient>
      <linearGradient id="gradientCyan" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#06b6d4" stopOpacity={1} />
        <stop offset="100%" stopColor="#0891b2" stopOpacity={0.8} />
      </linearGradient>
      <linearGradient id="gradientRed" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ef4444" stopOpacity={1} />
        <stop offset="100%" stopColor="#dc2626" stopOpacity={0.8} />
      </linearGradient>
    </defs>
  )

  // 处理Y轴字段选择
  const handleYAxisToggle = (field: string) => {
    setYAxisFields(prev => {
      if (prev.includes(field)) {
        // 如果取消选择，至少保留一个字段
        if (prev.length > 1) {
          return prev.filter(f => f !== field)
        }
        return prev
      } else {
        return [...prev, field]
      }
    })
  }
  
  // 应用设置
  const handleApplySettings = () => {
    // 设置已经通过状态更新，直接关闭对话框
    setIsSettingsOpen(false)
  }
  
  // 重置设置
  const handleResetSettings = () => {
    setChartType(initialType)
    setXAxisField(initialXAxis)
    setYAxisFields(Array.isArray(initialYAxis) ? initialYAxis : initialYAxis ? [initialYAxis] : [])
    setShowLegend(true)
    setShowGrid(true)
  }
  
  // 使用当前设置的值
  const currentType = chartType
  const currentXAxis = xAxisField
  const currentYAxis = yAxisFields.length === 1 ? yAxisFields[0] : yAxisFields
  
  const renderChart = () => {
    const chartData = filteredData || data
    switch (currentType) {
      case "bar":
        return (
          <ResponsiveContainer width="100%" height={450}>
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <GradientDefinitions />
              {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />}
              <XAxis 
                dataKey={currentXAxis} 
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                axisLine={{ stroke: "hsl(var(--border))" }}
              />
              <YAxis 
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                axisLine={{ stroke: "hsl(var(--border))" }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                  padding: "12px",
                }}
                cursor={{ fill: "rgba(59, 130, 246, 0.1)" }}
              />
              {showLegend && (
                <Legend 
                  wrapperStyle={{ paddingTop: "20px" }}
                  iconType="rect"
                />
              )}
              {Array.isArray(currentYAxis) ? (
                currentYAxis.map((key, index) => (
                  <Bar 
                    key={key} 
                    dataKey={String(key)} 
                    fill={colors[index % colors.length]}
                    radius={[8, 8, 0, 0]}
                    animationDuration={1000}
                    animationBegin={animationDelay + index * 100}
                    isAnimationActive={true}
                    onClick={(data, index) => onChartClick?.(data, index)}
                    style={{ cursor: onChartClick ? 'pointer' : 'default' }}
                  />
                ))
              ) : (
                <Bar 
                  dataKey={String(currentYAxis)} 
                  fill={colors[0]}
                  radius={[8, 8, 0, 0]}
                  animationDuration={1000}
                  animationBegin={animationDelay}
                  isAnimationActive={true}
                  onClick={(data, index) => onChartClick?.(data, index)}
                  style={{ cursor: onChartClick ? 'pointer' : 'default' }}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        )

      case "line":
        return (
          <ResponsiveContainer width="100%" height={450}>
            <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <GradientDefinitions />
              {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />}
              <XAxis 
                dataKey={currentXAxis}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                axisLine={{ stroke: "hsl(var(--border))" }}
              />
              <YAxis 
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                axisLine={{ stroke: "hsl(var(--border))" }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                  padding: "12px",
                }}
                cursor={{ stroke: colors[0], strokeWidth: 2, strokeDasharray: "5 5" }}
              />
              <Legend 
                wrapperStyle={{ paddingTop: "20px" }}
                iconType="line"
              />
              {Array.isArray(currentYAxis) ? (
                currentYAxis.map((key, index) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={String(key)}
                    stroke={colors[index % colors.length]}
                    strokeWidth={3}
                    dot={{ fill: colors[index % colors.length], r: 4 }}
                    activeDot={{ r: 6, stroke: colors[index % colors.length], strokeWidth: 2 }}
                    animationDuration={1200}
                    animationBegin={animationDelay + index * 150}
                    isAnimationActive={true}
                  />
                ))
              ) : (
                <Line 
                  type="monotone" 
                  dataKey={String(currentYAxis)} 
                  stroke={colors[0]} 
                  strokeWidth={3}
                  dot={{ fill: colors[0], r: 4 }}
                  activeDot={{ r: 6, stroke: colors[0], strokeWidth: 2 }}
                  animationDuration={1200}
                  animationBegin={animationDelay}
                  isAnimationActive={true}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )

      case "area":
        return (
          <ResponsiveContainer width="100%" height={450}>
            <AreaChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <GradientDefinitions />
              {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />}
              <XAxis 
                dataKey={currentXAxis}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                axisLine={{ stroke: "hsl(var(--border))" }}
              />
              <YAxis 
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                axisLine={{ stroke: "hsl(var(--border))" }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                  padding: "12px",
                }}
                cursor={{ stroke: colors[0], strokeWidth: 2, strokeDasharray: "5 5" }}
              />
              <Legend 
                wrapperStyle={{ paddingTop: "20px" }}
                iconType="square"
              />
              {Array.isArray(currentYAxis) ? (
                currentYAxis.map((key, index) => (
                  <Area
                    key={key}
                    type="monotone"
                    dataKey={String(key)}
                    stroke={colors[index % colors.length]}
                    fill={colors[index % colors.length]}
                    fillOpacity={0.4}
                    strokeWidth={2}
                    animationDuration={1200}
                    animationBegin={animationDelay + index * 150}
                    isAnimationActive={true}
                  />
                ))
              ) : (
                <Area 
                  type="monotone" 
                  dataKey={String(currentYAxis)} 
                  stroke={colors[0]} 
                  fill={colors[0]} 
                  fillOpacity={0.4}
                  strokeWidth={2}
                  animationDuration={1200}
                  animationBegin={animationDelay}
                  isAnimationActive={true}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        )

      case "pie":
        const pieData = data.map((item, index) => ({
          name: item[Object.keys(item)[0]],
          value: item[Object.keys(item)[1]],
          fill: colors[index % colors.length],
        }))

        return (
          <ResponsiveContainer width="100%" height={450}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderPieLabel}
                outerRadius={150}
                innerRadius={60}
                paddingAngle={2}
                dataKey="value"
                animationDuration={1200}
                animationBegin={animationDelay}
                isAnimationActive={true}
              >
                {pieData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.fill}
                    stroke="hsl(var(--background))"
                    strokeWidth={2}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                  padding: "12px",
                }}
              />
              <Legend 
                wrapperStyle={{ paddingTop: "20px" }}
                iconType="circle"
              />
            </PieChart>
          </ResponsiveContainer>
        )

      case "bar-horizontal":
        return (
          <ResponsiveContainer width="100%" height={450}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <GradientDefinitions />
              {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />}
              <XAxis 
                type="number"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                axisLine={{ stroke: "hsl(var(--border))" }}
              />
              <YAxis 
                dataKey={currentXAxis} 
                type="category" 
                width={120}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                axisLine={{ stroke: "hsl(var(--border))" }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                  padding: "12px",
                }}
                cursor={{ fill: "rgba(59, 130, 246, 0.1)" }}
              />
              <Legend 
                wrapperStyle={{ paddingTop: "20px" }}
                iconType="rect"
              />
              {Array.isArray(currentYAxis) ? (
                currentYAxis.map((key, index) => (
                  <Bar 
                    key={key} 
                    dataKey={String(key)} 
                    fill={colors[index % colors.length]}
                    radius={[0, 8, 8, 0]}
                    animationDuration={1000}
                    animationBegin={animationDelay + index * 100}
                    isAnimationActive={true}
                  />
                ))
              ) : (
                <Bar 
                  dataKey={String(currentYAxis)} 
                  fill={colors[0]}
                  radius={[0, 8, 8, 0]}
                  animationDuration={1000}
                  animationBegin={animationDelay}
                  isAnimationActive={true}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        )

      case "bar-stacked":
        return (
          <ResponsiveContainer width="100%" height={450}>
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <GradientDefinitions />
              {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />}
              <XAxis 
                dataKey={currentXAxis}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                axisLine={{ stroke: "hsl(var(--border))" }}
              />
              <YAxis 
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                axisLine={{ stroke: "hsl(var(--border))" }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                  padding: "12px",
                }}
                cursor={{ fill: "rgba(59, 130, 246, 0.1)" }}
              />
              <Legend 
                wrapperStyle={{ paddingTop: "20px" }}
                iconType="rect"
              />
              {Array.isArray(currentYAxis) ? (
                currentYAxis.map((key, index) => (
                  <Bar 
                    key={key} 
                    dataKey={String(key)} 
                    stackId="a" 
                    fill={colors[index % colors.length]}
                    radius={index === (Array.isArray(currentYAxis) ? currentYAxis.length - 1 : 0) ? [8, 8, 0, 0] : [0, 0, 0, 0]}
                    animationDuration={1000}
                    animationBegin={animationDelay + index * 80}
                    isAnimationActive={true}
                  />
                ))
              ) : (
                <Bar 
                  dataKey={String(currentYAxis)} 
                  fill={colors[0]}
                  radius={[8, 8, 0, 0]}
                  animationDuration={1000}
                  animationBegin={animationDelay}
                  isAnimationActive={true}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        )

      case "area-stacked":
        return (
          <ResponsiveContainer width="100%" height={450}>
            <AreaChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <GradientDefinitions />
              {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />}
              <XAxis 
                dataKey={currentXAxis}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                axisLine={{ stroke: "hsl(var(--border))" }}
              />
              <YAxis 
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                axisLine={{ stroke: "hsl(var(--border))" }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                  padding: "12px",
                }}
                cursor={{ stroke: colors[0], strokeWidth: 2, strokeDasharray: "5 5" }}
              />
              <Legend 
                wrapperStyle={{ paddingTop: "20px" }}
                iconType="square"
              />
              {Array.isArray(currentYAxis) ? (
                currentYAxis.map((key, index) => (
                  <Area
                    key={key}
                    type="monotone"
                    dataKey={String(key)}
                    stackId="1"
                    stroke={colors[index % colors.length]}
                    fill={colors[index % colors.length]}
                    fillOpacity={0.5}
                    strokeWidth={2}
                    animationDuration={1200}
                    animationBegin={animationDelay + index * 120}
                    isAnimationActive={true}
                  />
                ))
              ) : (
                <Area 
                  type="monotone" 
                  dataKey={String(currentYAxis)} 
                  stroke={colors[0]} 
                  fill={colors[0]} 
                  fillOpacity={0.5}
                  strokeWidth={2}
                  animationDuration={1200}
                  animationBegin={animationDelay}
                  isAnimationActive={true}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        )

      case "scatter":
        return (
          <ResponsiveContainer width="100%" height={450}>
            <ScatterChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <GradientDefinitions />
              {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />}
              <XAxis 
                type="number" 
                dataKey={currentXAxis} 
                name={String(currentXAxis)}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                axisLine={{ stroke: "hsl(var(--border))" }}
              />
              <YAxis 
                type="number" 
                dataKey={String(Array.isArray(currentYAxis) ? currentYAxis[0] : currentYAxis)} 
                name={String(Array.isArray(currentYAxis) ? currentYAxis[0] : currentYAxis)}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                axisLine={{ stroke: "hsl(var(--border))" }}
              />
              <Tooltip
                cursor={{ strokeDasharray: "3 3", stroke: colors[0], strokeWidth: 1 }}
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                  padding: "12px",
                }}
              />
              <Legend 
                wrapperStyle={{ paddingTop: "20px" }}
                iconType="circle"
              />
              {Array.isArray(currentYAxis) ? (
                currentYAxis.map((key, index) => (
                  <Scatter 
                    key={key} 
                    name={String(key)} 
                    dataKey={String(key)} 
                    fill={colors[index % colors.length]}
                    animationDuration={1000}
                    animationBegin={animationDelay + index * 100}
                    isAnimationActive={true}
                  />
                ))
              ) : (
                <Scatter 
                  name={String(currentYAxis)} 
                  dataKey={String(currentYAxis)} 
                  fill={colors[0]}
                  animationDuration={1000}
                  animationBegin={animationDelay}
                  isAnimationActive={true}
                />
              )}
            </ScatterChart>
          </ResponsiveContainer>
        )

      case "radar":
        const radarData = data.map((item) => {
          const result: any = { name: item[currentXAxis || Object.keys(item)[0]] }
          const yKeys = Array.isArray(currentYAxis) ? currentYAxis : [currentYAxis]
          yKeys.forEach((key) => {
            result[String(key)] = item[String(key)]
          })
          return result
        })

        return (
          <ResponsiveContainer width="100%" height={450}>
            <RadarChart data={radarData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <PolarGrid 
                stroke="hsl(var(--border))" 
                strokeOpacity={0.3}
              />
              <PolarAngleAxis 
                dataKey="name" 
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              />
              <PolarRadiusAxis 
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                angle={90}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                  padding: "12px",
                }}
              />
              <Legend 
                wrapperStyle={{ paddingTop: "20px" }}
                iconType="circle"
              />
              {Array.isArray(currentYAxis) ? (
                currentYAxis.map((key, index) => (
                  <Radar
                    key={key}
                    name={String(key)}
                    dataKey={String(key)}
                    stroke={colors[index % colors.length]}
                    fill={colors[index % colors.length]}
                    fillOpacity={0.3}
                    strokeWidth={2}
                    animationDuration={1200}
                    animationBegin={animationDelay + index * 150}
                    isAnimationActive={true}
                  />
                ))
              ) : (
                <Radar 
                  name={String(currentYAxis)} 
                  dataKey={String(currentYAxis)} 
                  stroke={colors[0]} 
                  fill={colors[0]} 
                  fillOpacity={0.3}
                  strokeWidth={2}
                  animationDuration={1200}
                  animationBegin={animationDelay}
                  isAnimationActive={true}
                />
              )}
            </RadarChart>
          </ResponsiveContainer>
        )

      case "composed":
        return (
          <ResponsiveContainer width="100%" height={450}>
            <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <GradientDefinitions />
              {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />}
              <XAxis 
                dataKey={currentXAxis}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                axisLine={{ stroke: "hsl(var(--border))" }}
              />
              <YAxis 
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                axisLine={{ stroke: "hsl(var(--border))" }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                  padding: "12px",
                }}
                cursor={{ fill: "rgba(59, 130, 246, 0.1)" }}
              />
              <Legend 
                wrapperStyle={{ paddingTop: "20px" }}
              />
                          {Array.isArray(currentYAxis) ? (
                            <>
                              {currentYAxis.slice(0, Math.ceil(currentYAxis.length / 2)).map((key, index) => (
                                <Bar 
                                  key={key} 
                                  dataKey={String(key)} 
                                  fill={colors[index % colors.length]}
                                  radius={[8, 8, 0, 0]}
                                  animationDuration={1000}
                                  animationBegin={animationDelay + index * 100}
                                  isAnimationActive={true}
                                />
                              ))}
                              {currentYAxis.slice(Math.ceil(currentYAxis.length / 2)).map((key, index) => (
                                <Line
                                  key={key}
                                  type="monotone"
                                  dataKey={String(key)}
                                  stroke={colors[(index + Math.ceil(currentYAxis.length / 2)) % colors.length]}
                                  strokeWidth={3}
                                  dot={{ fill: colors[(index + Math.ceil(currentYAxis.length / 2)) % colors.length], r: 4 }}
                                  activeDot={{ r: 6 }}
                                  animationDuration={1200}
                                  animationBegin={animationDelay + (index + Math.ceil(currentYAxis.length / 2)) * 100}
                                  isAnimationActive={true}
                                />
                              ))}
                            </>
                          ) : (
                            <>
                              <Bar 
                                dataKey={String(currentYAxis)} 
                                fill={colors[0]}
                                radius={[8, 8, 0, 0]}
                                animationDuration={1000}
                                animationBegin={animationDelay}
                                isAnimationActive={true}
                              />
                              <Line 
                                type="monotone" 
                                dataKey={String(currentYAxis)} 
                                stroke={colors[1]} 
                                strokeWidth={3}
                                dot={{ fill: colors[1], r: 4 }}
                                activeDot={{ r: 6 }}
                                animationDuration={1200}
                                animationBegin={animationDelay + 200}
                                isAnimationActive={true}
                              />
                            </>
                          )}
            </ComposedChart>
          </ResponsiveContainer>
        )

      case "table":
        const tableColumns = Object.keys(chartData[0] || {})
        return (
          <div className="overflow-x-auto rounded-xl border border-border/50 shadow-xl bg-background/50 backdrop-blur-sm">
            <div className="relative">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gradient-to-r from-primary/15 via-primary/10 to-primary/5 border-b-2 border-primary/30">
                    {tableColumns.map((key, idx) => (
                      <th 
                        key={key} 
                        className={`text-left p-5 font-bold text-foreground tracking-wide ${
                          idx === 0 ? "rounded-tl-xl pl-6" : ""
                        } ${
                          idx === tableColumns.length - 1 ? "rounded-tr-xl pr-6" : ""
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-1.5 h-5 bg-gradient-to-b from-primary to-primary/60 rounded-full shadow-sm"></div>
                          <span className="text-sm font-semibold">{translateColumnName(key)}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {chartData.map((row, index) => (
                    <tr 
                      key={index} 
                      className={`group border-b border-border/20 transition-all duration-300 ease-in-out ${
                        index % 2 === 0 
                          ? "bg-background/50 hover:bg-gradient-to-r hover:from-primary/5 hover:to-transparent" 
                          : "bg-muted/20 hover:bg-gradient-to-r hover:from-primary/8 hover:to-transparent"
                      }`}
                    >
                      {tableColumns.map((col, i) => {
                        const value = (row as any)?.[col]
                        const displayValue = value === null || value === undefined ? "-" : value
                        return (
                        <td 
                          key={i} 
                          className={`p-5 text-foreground transition-all duration-200 ${
                            i === 0 ? "pl-6" : ""
                          } ${
                            i === tableColumns.length - 1 ? "pr-6" : ""
                          }`}
                        >
                          <div className="flex items-center">
                            {typeof displayValue === "number" ? (
                              <span className="font-semibold text-foreground tracking-tight text-base">
                                {displayValue.toLocaleString('zh-CN')}
                              </span>
                            ) : (
                              <span className="text-foreground/90 font-medium">{String(displayValue)}</span>
                            )}
                          </div>
                        </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* 底部装饰 */}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary/20 to-transparent"></div>
            </div>
          </div>
        )

      default:
        return <p className="text-center text-muted">Unsupported chart type</p>
    }
  }

  // 如果正在加载或数据未准备好，显示骨架屏
  if (isLoading || !isDataReady || !data || data.length === 0) {
    return <ChartSkeleton type={currentType} className={className} />
  }

  return (
    <Card className={`p-6 ${className} bg-card border border-border/50 shadow-sm`} data-chart-id={title}>
      <div className="mb-4 pb-3 border-b border-border/30">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground tracking-tight">
            {title}
          </h3>
          <div className="flex items-center gap-2">
            {isFiltered && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetFilter}
                className="h-8 rounded-md text-xs"
              >
                重置筛选
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsSettingsOpen(true)}
              className="h-8 gap-1.5 rounded-md"
              title="图表设置"
            >
              <Settings className="h-3.5 w-3.5" />
              <span className="text-xs">设置</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-md">
                  <Filter className="h-3.5 w-3.5" />
                  <span className="text-xs">操作</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-lg">
                <DropdownMenuItem onClick={handleExportChart} className="rounded-md">
                  <Download className="h-4 w-4 mr-2" />
                  导出为图片
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
      <div className="relative">
        {renderChart()}
      </div>

      {/* 设置对话框 */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>图表设置</DialogTitle>
            <DialogDescription>
              自定义图表显示选项和样式
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="chart-title">图表标题</Label>
              <Input
                id="chart-title"
                value={title}
                readOnly
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                标题由系统自动生成
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="chart-type">图表类型</Label>
              <Select value={chartType} onValueChange={(value) => setChartType(value as ChartConfig["type"])}>
                <SelectTrigger id="chart-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {chartTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="x-axis">X轴字段</Label>
              <Select 
                value={xAxisField || ""} 
                onValueChange={(value) => setXAxisField(value)}
              >
                <SelectTrigger id="x-axis">
                  <SelectValue placeholder="选择X轴字段" />
                </SelectTrigger>
                <SelectContent>
                  {availableFields.map((field) => (
                    <SelectItem key={field} value={field}>
                      {field}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Y轴字段（可多选）</Label>
              <div className="space-y-2 border rounded-md p-3 max-h-48 overflow-y-auto">
                {availableFields.map((field) => (
                  <div key={field} className="flex items-center space-x-2">
                    <Checkbox
                      id={`y-axis-${field}`}
                      checked={yAxisFields.includes(field)}
                      onCheckedChange={() => handleYAxisToggle(field)}
                      disabled={yAxisFields.length === 1 && yAxisFields.includes(field)}
                    />
                    <Label
                      htmlFor={`y-axis-${field}`}
                      className="text-sm font-normal cursor-pointer flex-1"
                    >
                      {field}
                    </Label>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                至少选择一个Y轴字段
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="data-count">数据条数</Label>
              <Input
                id="data-count"
                value={`${data.length} 条`}
                readOnly
                className="bg-muted"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>显示图例</Label>
                <p className="text-xs text-muted-foreground">
                  在图表下方显示数据系列图例
                </p>
              </div>
              <Switch checked={showLegend} onCheckedChange={setShowLegend} />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>显示网格</Label>
                <p className="text-xs text-muted-foreground">
                  在图表中显示网格线
                </p>
              </div>
              <Switch checked={showGrid} onCheckedChange={setShowGrid} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleResetSettings}>
              重置
            </Button>
            <Button onClick={handleApplySettings}>
              应用
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function renderPieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) {
  const RADIAN = Math.PI / 180
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  const percentage = (percent * 100).toFixed(1)

  // 只显示大于5%的标签，避免拥挤
  if (percent < 0.05) return null

  return (
    <g>
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor={x > cx ? "start" : "end"}
        dominantBaseline="central"
        fontSize="13"
        fontWeight="700"
        stroke="rgba(0, 0, 0, 0.3)"
        strokeWidth="0.5"
        paintOrder="stroke fill"
      >
        {`${percentage}%`}
      </text>
    </g>
  )
}
