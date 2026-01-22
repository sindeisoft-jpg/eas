"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Filter, X } from "lucide-react"
import { ChartRenderer } from "./chart-renderer"
import { DataTable, createColumnsFromQueryResult } from "./data-table"
import type { ChartConfig, QueryResult } from "@/lib/types"

interface ChartDrilldownProps {
  chartConfig: ChartConfig
  originalData: QueryResult
  onBack: () => void
}

export function ChartDrilldown({ chartConfig, originalData, onBack }: ChartDrilldownProps) {
  const [drilldownData, setDrilldownData] = useState<QueryResult | null>(null)
  const [drilldownLevel, setDrilldownLevel] = useState<string[]>([])
  const [selectedFilters, setSelectedFilters] = useState<Record<string, any>>({})

  // 处理图表点击事件（需要在ChartRenderer中触发）
  const handleChartClick = (data: any, index: number) => {
    // 根据点击的数据点进行钻取
    if (!data || !chartConfig.data) return
    
    // 获取点击的数据项
    const clickedItem = Array.isArray(chartConfig.data) 
      ? chartConfig.data[index] 
      : chartConfig.data
    
    if (!clickedItem) return
    
    // 根据图表类型处理钻取
    if (chartConfig.type === "bar" || chartConfig.type === "bar-horizontal") {
      const category = clickedItem[chartConfig.xAxis]
      if (category) {
        // 过滤原始数据
        const filtered = originalData.rows?.filter((row: any) => {
          return String(row[chartConfig.xAxis]) === String(category)
        }) || []
        
        setDrilldownData({
          ...originalData,
          rows: filtered,
        })
        setDrilldownLevel([...drilldownLevel, String(category)])
      }
    } else if (chartConfig.type === "pie") {
      // 饼图钻取：根据点击的扇形过滤数据
      const pieData = chartConfig.data.map((item: any, idx: number) => ({
        name: item[Object.keys(item)[0]],
        value: item[Object.keys(item)[1]],
        originalIndex: idx,
      }))
      
      if (pieData[index]) {
        const selectedName = pieData[index].name
        const filtered = originalData.rows?.filter((row: any) => {
          const firstKey = Object.keys(row)[0]
          return String(row[firstKey]) === String(selectedName)
        }) || []
        
        setDrilldownData({
          ...originalData,
          rows: filtered,
        })
        setDrilldownLevel([...drilldownLevel, String(selectedName)])
      }
    }
  }

  const handleFilterChange = (key: string, value: any) => {
    setSelectedFilters({
      ...selectedFilters,
      [key]: value,
    })
    
    // 应用筛选
    applyFilters({
      ...selectedFilters,
      [key]: value,
    })
  }

  const applyFilters = (filters: Record<string, any>) => {
    let filtered = originalData.rows || []
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== "") {
        filtered = filtered.filter((row: any) => {
          if (typeof value === "string") {
            return String(row[key]).toLowerCase().includes(String(value).toLowerCase())
          }
          return row[key] === value
        })
      }
    })
    
    setDrilldownData({
      ...originalData,
      rows: filtered,
    })
  }

  const clearFilter = (key: string) => {
    const newFilters = { ...selectedFilters }
    delete newFilters[key]
    setSelectedFilters(newFilters)
    applyFilters(newFilters)
  }

  const goBackLevel = () => {
    if (drilldownLevel.length > 0) {
      const newLevel = drilldownLevel.slice(0, -1)
      setDrilldownLevel(newLevel)
      
      if (newLevel.length === 0) {
        setDrilldownData(null)
      } else {
        // 重新应用筛选
        applyFilters(selectedFilters)
      }
    } else {
      onBack()
    }
  }

  const currentData = drilldownData || originalData

  return (
    <div className="space-y-4">
      {/* 面包屑导航 */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button
          variant="ghost"
          size="sm"
          onClick={goBackLevel}
          className="h-8"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          {drilldownLevel.length > 0 ? "返回上一级" : "返回"}
        </Button>
        {drilldownLevel.length > 0 && (
          <>
            <span>/</span>
            {drilldownLevel.map((level, index) => (
              <span key={index}>
                {index > 0 && <span className="mx-1">/</span>}
                <span className="text-foreground font-medium">{level}</span>
              </span>
            ))}
          </>
        )}
      </div>

      {/* 筛选器 */}
      {Object.keys(selectedFilters).length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">筛选条件：</span>
            {Object.entries(selectedFilters).map(([key, value]) => (
              <div
                key={key}
                className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-lg text-sm"
              >
                <span className="font-medium">{key}:</span>
                <span>{String(value)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0 hover:bg-destructive/10"
                  onClick={() => clearFilter(key)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 图表 */}
      <Card className="p-6">
        <ChartRenderer
          config={{
            ...chartConfig,
            data: currentData.rows || [],
          }}
          onChartClick={handleChartClick}
        />
      </Card>

      {/* 详细数据表格 */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">详细数据</h3>
        <DataTable
          columns={createColumnsFromQueryResult(currentData)}
          data={currentData.rows || []}
          defaultPageSize={10}
        />
      </Card>
    </div>
  )
}
