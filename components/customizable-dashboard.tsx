"use client"

import * as React from "react"
import { useState, useCallback } from "react"
import GridLayout, { Layout } from "react-grid-layout"
import "react-grid-layout/css/styles.css"
// react-resizable CSS is included in react-grid-layout styles
// import "react-resizable/css/styles.css"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Plus, GripVertical, X, Settings, BarChart3, TrendingUp, Database, MessageSquare } from "lucide-react"
import { ChartRenderer } from "./chart-renderer"
import type { ChartConfig } from "@/lib/types"

interface DashboardWidget {
  id: string
  type: "chart" | "metric" | "table" | "custom"
  title: string
  config?: ChartConfig
  data?: any
  x: number
  y: number
  w: number
  h: number
}

interface CustomizableDashboardProps {
  widgets?: DashboardWidget[]
  onLayoutChange?: (layout: Layout[]) => void
  onWidgetAdd?: (widget: DashboardWidget) => void
  onWidgetRemove?: (widgetId: string) => void
  editable?: boolean
}

const defaultWidgets: DashboardWidget[] = [
  {
    id: "metric-1",
    type: "metric",
    title: "总查询数",
    data: { value: 1247, trend: "+12%" },
    x: 0,
    y: 0,
    w: 3,
    h: 2,
  },
  {
    id: "metric-2",
    type: "metric",
    title: "成功查询",
    data: { value: 1156, trend: "+8%" },
    x: 3,
    y: 0,
    w: 3,
    h: 2,
  },
  {
    id: "metric-3",
    type: "metric",
    title: "平均响应时间",
    data: { value: "234ms", trend: "-5%" },
    x: 6,
    y: 0,
    w: 3,
    h: 2,
  },
  {
    id: "metric-4",
    type: "metric",
    title: "活跃连接",
    data: { value: 5, trend: "0%" },
    x: 9,
    y: 0,
    w: 3,
    h: 2,
  },
]

export function CustomizableDashboard({
  widgets: initialWidgets,
  onLayoutChange,
  onWidgetAdd,
  onWidgetRemove,
  editable = true,
}: CustomizableDashboardProps) {
  const [widgets, setWidgets] = useState<DashboardWidget[]>(initialWidgets || defaultWidgets)
  const [isEditing, setIsEditing] = useState(false)

  const handleLayoutChange = useCallback(
    (layout: Layout[]) => {
      const updatedWidgets = widgets.map((widget) => {
        const layoutItem = layout.find((item) => item.i === widget.id)
        if (layoutItem) {
          return {
            ...widget,
            x: layoutItem.x,
            y: layoutItem.y,
            w: layoutItem.w,
            h: layoutItem.h,
          }
        }
        return widget
      })
      setWidgets(updatedWidgets)
      onLayoutChange?.(layout)
    },
    [widgets, onLayoutChange]
  )

  const handleAddWidget = (type: DashboardWidget["type"]) => {
    const newWidget: DashboardWidget = {
      id: `widget-${Date.now()}`,
      type,
      title: `新${type === "chart" ? "图表" : type === "metric" ? "指标" : "表格"}`,
      x: 0,
      y: Math.max(...widgets.map((w) => w.y + w.h), 0),
      w: type === "metric" ? 3 : 6,
      h: type === "metric" ? 2 : 4,
    }
    setWidgets([...widgets, newWidget])
    onWidgetAdd?.(newWidget)
  }

  const handleRemoveWidget = (widgetId: string) => {
    setWidgets(widgets.filter((w) => w.id !== widgetId))
    onWidgetRemove?.(widgetId)
  }

  const renderWidget = (widget: DashboardWidget) => {
    switch (widget.type) {
      case "metric":
        return (
          <Card className="h-full p-6 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-muted-foreground">{widget.title}</h3>
              {isEditing && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => handleRemoveWidget(widget.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div>
              <div className="text-3xl font-bold text-foreground mb-2">
                {widget.data?.value || "0"}
              </div>
              {widget.data?.trend && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <TrendingUp className="h-4 w-4" />
                  <span>{widget.data.trend}</span>
                </div>
              )}
            </div>
          </Card>
        )

      case "chart":
        return (
          <Card className="h-full p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium">{widget.title}</h3>
              {isEditing && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => handleRemoveWidget(widget.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            {widget.config && (
              <div className="h-[calc(100%-3rem)]">
                <ChartRenderer config={widget.config} />
              </div>
            )}
          </Card>
        )

      default:
        return (
          <Card className="h-full p-6 flex items-center justify-center">
            <div className="text-center">
              <p className="text-muted-foreground">{widget.title}</p>
              {isEditing && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-4"
                  onClick={() => handleRemoveWidget(widget.id)}
                >
                  删除
                </Button>
              )}
            </div>
          </Card>
        )
    }
  }

  const layout = widgets.map((widget) => ({
    i: widget.id,
    x: widget.x,
    y: widget.y,
    w: widget.w,
    h: widget.h,
  }))

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      {editable && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant={isEditing ? "default" : "outline"}
              size="sm"
              onClick={() => setIsEditing(!isEditing)}
            >
              <Settings className="h-4 w-4 mr-2" />
              {isEditing ? "完成编辑" : "编辑布局"}
            </Button>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-2" />
                添加组件
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleAddWidget("metric")}>
                <TrendingUp className="h-4 w-4 mr-2" />
                添加指标卡片
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAddWidget("chart")}>
                <BarChart3 className="h-4 w-4 mr-2" />
                添加图表
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAddWidget("table")}>
                <Database className="h-4 w-4 mr-2" />
                添加表格
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* 网格布局 */}
      <div className="relative">
        <GridLayout
          className="layout"
          layout={layout}
          cols={12}
          rowHeight={60}
          width={1200}
          isDraggable={isEditing && editable}
          isResizable={isEditing && editable}
          onLayoutChange={handleLayoutChange}
          draggableHandle=".drag-handle"
        >
          {widgets.map((widget) => (
            <div key={widget.id} className="relative">
              {isEditing && editable && (
                <div className="drag-handle absolute top-2 left-2 z-10 cursor-move p-1 bg-background/80 rounded">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              {renderWidget(widget)}
            </div>
          ))}
        </GridLayout>
      </div>
    </div>
  )
}
