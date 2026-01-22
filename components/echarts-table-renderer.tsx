"use client"

import React, { useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Download, ChevronLeft, ChevronRight, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import type { ChartConfig } from "@/lib/types"

interface EChartsTableRendererProps {
  config: ChartConfig
  className?: string
  isLoading?: boolean
}

export function EChartsTableRenderer({ 
  config, 
  className, 
  isLoading = false 
}: EChartsTableRendererProps) {
  const { title, data } = config
  const [currentPage, setCurrentPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState("")
  const [pageSize] = useState(20)

  // 获取列名
  const columns = useMemo(() => {
    if (!data || data.length === 0) return []
    return Object.keys(data[0])
  }, [data])

  // 过滤和分页数据
  const filteredData = useMemo(() => {
    if (!data) return []
    
    let filtered = data
    
    // 搜索过滤
    if (searchTerm.trim()) {
      const lowerSearch = searchTerm.toLowerCase()
      filtered = data.filter(row => {
        return columns.some(col => {
          const value = String(row[col] || '').toLowerCase()
          return value.includes(lowerSearch)
        })
      })
    }
    
    return filtered
  }, [data, searchTerm, columns])

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    const end = start + pageSize
    return filteredData.slice(start, end)
  }, [filteredData, currentPage, pageSize])

  const totalPages = Math.ceil(filteredData.length / pageSize)

  // 导出为CSV
  const handleExport = () => {
    if (!data || data.length === 0) return

    const headers = columns.join(',')
    const rows = data.map(row => 
      columns.map(col => {
        const value = row[col]
        // 处理包含逗号的值
        if (typeof value === 'string' && value.includes(',')) {
          return `"${value}"`
        }
        return value ?? ''
      }).join(',')
    ).join('\n')

    const csv = `${headers}\n${rows}`
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${title || 'table'}.csv`
    link.click()
  }

  // 格式化单元格值
  const formatCellValue = (value: any): string => {
    if (value === null || value === undefined) return '-'
    if (typeof value === 'boolean') return value ? '是' : '否'
    if (typeof value === 'number') {
      // 如果是大数字，添加千分位
      if (value >= 1000) {
        return value.toLocaleString('zh-CN')
      }
      return String(value)
    }
    return String(value)
  }

  if (isLoading || !data || data.length === 0) {
    return (
      <Card className={`p-6 ${className} bg-card border border-border/50`}>
        <div className="h-[400px] flex items-center justify-center">
          <div className="text-muted-foreground">表格数据加载中...</div>
        </div>
      </Card>
    )
  }

  return (
    <Card className={`p-6 ${className} bg-card border border-border/50 shadow-sm`}>
      {/* 表头 */}
      <div className="mb-4 pb-3 border-b border-border/30">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground tracking-tight">
            {title || '数据表格'}
          </h3>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            className="h-8 gap-1.5 rounded-md"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="text-xs">导出CSV</span>
          </Button>
        </div>
        
        {/* 搜索框 */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="搜索表格内容..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setCurrentPage(1) // 重置到第一页
            }}
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* 表格 */}
      <div className="overflow-x-auto rounded-lg border border-border/50 bg-background">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gradient-to-r from-primary/15 via-primary/10 to-primary/5 border-b-2 border-primary/30">
              {columns.map((col, idx) => (
                <th 
                  key={col} 
                  className={`text-left p-4 font-semibold text-foreground tracking-wide whitespace-nowrap ${
                    idx === 0 ? "pl-6" : ""
                  } ${
                    idx === columns.length - 1 ? "pr-6" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-4 bg-gradient-to-b from-primary to-primary/60 rounded-full"></div>
                    <span className="text-sm font-semibold">{col}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="p-8 text-center text-muted-foreground">
                  {searchTerm ? '未找到匹配的数据' : '暂无数据'}
                </td>
              </tr>
            ) : (
              paginatedData.map((row, rowIdx) => (
                <tr 
                  key={rowIdx}
                  className={`border-b border-border/30 transition-colors duration-150 ${
                    rowIdx % 2 === 0 
                      ? "bg-background hover:bg-primary/5" 
                      : "bg-muted/30 hover:bg-primary/10"
                  }`}
                >
                  {columns.map((col, colIdx) => (
                    <td 
                      key={col}
                      className={`p-4 text-foreground/90 ${
                        colIdx === 0 ? "pl-6 font-medium" : ""
                      } ${
                        colIdx === columns.length - 1 ? "pr-6" : ""
                      }`}
                    >
                      <div className="max-w-xs truncate" title={formatCellValue(row[col])}>
                        {formatCellValue(row[col])}
                      </div>
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 分页控件 */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            显示 {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, filteredData.length)} 条，
            共 {filteredData.length} 条
            {searchTerm && `（已过滤 ${data.length - filteredData.length} 条）`}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-sm text-foreground">
              第 {currentPage} / {totalPages} 页
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
