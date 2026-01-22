"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { QueryResult, ChartConfig } from "@/lib/types"
import { ChartRenderer } from "./chart-renderer"
import { BarChart3, LineChartIcon, PieChartIcon, TrendingUp, Table, Circle, Activity, Layers, BarChartHorizontal, AreaChart as AreaChartIcon } from "lucide-react"

interface ChartDialogProps {
  open: boolean
  onClose: () => void
  queryResult: QueryResult
  initialQuestion?: string
}

// 清理 JSON 内容，只保留纯文本
function cleanJsonContent(content: string | undefined): string {
  if (!content) return "Query Results"
  
  // 移除所有 ```json ... ``` 代码块
  let cleaned = content.replace(/```json\s*([\s\S]*?)\s*```/g, '')
  
  // 如果整个内容是 JSON 对象，尝试提取 explanation 或返回空
  const trimmed = cleaned.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed)
      // 如果是包含 explanation、sql、reasoning 的 JSON，返回空字符串
      if (parsed.explanation || parsed.sql || parsed.reasoning || parsed.visualization) {
        return "Query Results"
      }
    } catch {
      // 解析失败，继续
    }
  }
  
  // 清理多余的空行和空白
  cleaned = cleaned.trim()
  return cleaned || "Query Results"
}

export function ChartDialog({ open, onClose, queryResult, initialQuestion }: ChartDialogProps) {
  const [chartType, setChartType] = useState<ChartConfig["type"]>("bar")
  const [xAxis, setXAxis] = useState<string>(queryResult.columns?.[0] || "")
  const [yAxis, setYAxis] = useState<string>(queryResult.columns?.[1] || queryResult.columns?.[0] || "")
  
  // 当 queryResult 变化时，更新轴选择
  useEffect(() => {
    if (queryResult.columns && queryResult.columns.length > 0) {
      console.log('[ChartDialog] Columns available:', queryResult.columns)
      if (!xAxis || !queryResult.columns.includes(xAxis)) {
        const newXAxis = queryResult.columns[0]
        console.log('[ChartDialog] Setting X轴 to:', newXAxis)
        setXAxis(newXAxis)
      }
      if (!yAxis || !queryResult.columns.includes(yAxis)) {
        const newYAxis = queryResult.columns.length > 1 ? queryResult.columns[1] : queryResult.columns[0]
        console.log('[ChartDialog] Setting Y轴 to:', newYAxis)
        setYAxis(newYAxis)
      }
    }
  }, [queryResult.columns])
  
  // 调试：打印当前状态
  useEffect(() => {
    console.log('[ChartDialog] Current state:', {
      xAxis,
      yAxis,
      columns: queryResult.columns,
      columnsLength: queryResult.columns?.length || 0
    })
  }, [xAxis, yAxis, queryResult.columns])
  
  // 清理 initialQuestion，移除所有 JSON 内容
  const cleanedTitle = cleanJsonContent(initialQuestion)

  const chartConfig: ChartConfig = {
    type: chartType,
    title: cleanedTitle,
    xAxis,
    yAxis,
    data: queryResult.rows,
    colors: ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981"],
  }

  const chartTypes = [
    { value: "bar", label: "柱状图", icon: BarChart3 },
    { value: "bar-horizontal", label: "横向柱状图", icon: BarChartHorizontal },
    { value: "bar-stacked", label: "堆叠柱状图", icon: Layers },
    { value: "line", label: "折线图", icon: LineChartIcon },
    { value: "area", label: "面积图", icon: TrendingUp },
    { value: "area-stacked", label: "堆叠面积图", icon: AreaChartIcon },
    { value: "pie", label: "饼图", icon: PieChartIcon },
    { value: "scatter", label: "散点图", icon: Circle },
    { value: "radar", label: "雷达图", icon: Activity },
    { value: "composed", label: "组合图", icon: TrendingUp },
    { value: "table", label: "数据表", icon: Table },
  ]

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto" style={{ maxWidth: '800px', width: 'calc(100% - 2rem)' }}>
        <DialogHeader>
          <DialogTitle>数据可视化</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Chart type selector */}
          <div className="flex gap-2 flex-wrap">
            {chartTypes.map((type) => (
              <Button
                key={type.value}
                variant={chartType === type.value ? "default" : "outline"}
                size="sm"
                onClick={() => setChartType(type.value as ChartConfig["type"])}
                className="gap-2"
              >
                <type.icon className="w-4 h-4" />
                {type.label}
              </Button>
            ))}
          </div>

          {/* Axis selectors (not for pie/table/radar) */}
          {chartType !== "pie" && chartType !== "table" && chartType !== "radar" && queryResult.columns && queryResult.columns.length > 0 && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">X轴</label>
                <Select 
                  value={xAxis || queryResult.columns[0] || ""} 
                  onValueChange={(value) => {
                    console.log('[ChartDialog] X轴选择:', value)
                    setXAxis(value)
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="选择X轴字段" />
                  </SelectTrigger>
                  <SelectContent className="z-[101]" position="popper">
                    {queryResult.columns.map((col) => (
                      <SelectItem key={col} value={col}>
                        {col}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Y轴</label>
                <Select 
                  value={yAxis || (queryResult.columns.length > 1 ? queryResult.columns[1] : queryResult.columns[0]) || ""} 
                  onValueChange={(value) => {
                    console.log('[ChartDialog] Y轴选择:', value)
                    setYAxis(value)
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="选择Y轴字段" />
                  </SelectTrigger>
                  <SelectContent className="z-[101]" position="popper">
                    {queryResult.columns.map((col) => (
                      <SelectItem key={col} value={col}>
                        {col}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}


          {/* Chart preview */}
          <ChartRenderer config={chartConfig} />

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button variant="outline" onClick={onClose}>
              关闭
            </Button>
            <Button onClick={() => alert("图表导出功能即将推出！")}>导出图表</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
