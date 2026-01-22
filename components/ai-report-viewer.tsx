"use client"

import React, { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { 
  FileText, 
  Download, 
  Lightbulb, 
  TrendingUp, 
  AlertCircle,
  CheckCircle2,
  BarChart3,
  Table as TableIcon,
  FileDown,
  X,
  Share2,
  Maximize2,
  Minimize2
} from "lucide-react"
import type { AnalysisReport, ReportSection } from "@/lib/report-generator"
import { ChartRenderer } from "./chart-renderer"
import type { ChartConfig } from "@/lib/types"

/**
 * 简单的Markdown渲染（仅支持基本格式）
 */
function renderMarkdown(content: string): React.ReactNode {
  if (!content) return null
  
  // 分割为段落
  const paragraphs = content.split(/\n\n+/)
  
  return (
    <div className="space-y-3">
      {paragraphs.map((para, index) => {
        // 处理标题
        if (para.match(/^### /)) {
          const text = para.replace(/^### /, '')
          return <h3 key={index} className="text-lg font-semibold mt-4 mb-2">{text}</h3>
        }
        if (para.match(/^## /)) {
          const text = para.replace(/^## /, '')
          return <h2 key={index} className="text-xl font-semibold mt-6 mb-3">{text}</h2>
        }
        if (para.match(/^# /)) {
          const text = para.replace(/^# /, '')
          return <h1 key={index} className="text-2xl font-bold mt-8 mb-4">{text}</h1>
        }
        
        // 处理列表
        if (para.match(/^[\-\*] /) || para.match(/^\d+\. /)) {
          const items = para.split(/\n/).filter(line => line.trim())
          return (
            <ul key={index} className="list-disc ml-6 space-y-1">
              {items.map((item, itemIndex) => {
                const text = item.replace(/^[\-\*] /, '').replace(/^\d+\. /, '')
                const processedText = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                return (
                  <li key={itemIndex} dangerouslySetInnerHTML={{ __html: processedText }} />
                )
              })}
            </ul>
          )
        }
        
        // 处理普通段落
        const processedText = para
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\n/g, '<br/>')
        
        return (
          <p key={index} dangerouslySetInnerHTML={{ __html: processedText }} />
        )
      })}
    </div>
  )
}

interface AIReportViewerProps {
  report: AnalysisReport
  onClose?: () => void
  onExport?: (format: "markdown" | "json" | "pdf") => void
  onShare?: () => void
  modal?: boolean // 是否以弹窗模式显示
  open?: boolean // 弹窗是否打开
  onOpenChange?: (open: boolean) => void // 弹窗状态变化回调
}

export function AIReportViewer({ 
  report, 
  onClose, 
  onExport,
  onShare,
  modal = false,
  open: controlledOpen,
  onOpenChange
}: AIReportViewerProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [internalOpen, setInternalOpen] = useState(true)
  
  // 使用受控或非受控模式
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen
  
  const handleOpenChange = (open: boolean) => {
    if (onOpenChange) {
      onOpenChange(open)
    } else {
      setInternalOpen(open)
    }
    if (!open && onClose) {
      onClose()
    }
  }

  const toggleSection = (sectionId: string) => {
    const newExpanded = new Set(expandedSections)
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId)
    } else {
      newExpanded.add(sectionId)
    }
    setExpandedSections(newExpanded)
  }

  const handleExport = (format: "markdown" | "json" | "pdf") => {
    if (onExport) {
      onExport(format)
    } else {
      // 默认导出逻辑
      if (format === "markdown") {
        const markdown = formatReportAsMarkdown(report)
        downloadFile(markdown, `${report.title}.md`, "text/markdown")
      } else if (format === "json") {
        const json = JSON.stringify(report, null, 2)
        downloadFile(json, `${report.title}.json`, "application/json")
      } else if (format === "pdf") {
        // PDF导出需要特殊处理，这里先提示
        alert("PDF导出功能需要额外配置，当前支持Markdown和JSON导出")
      }
    }
  }

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const renderSection = (section: ReportSection) => {
    const isExpanded = expandedSections.has(section.id)

    return (
      <Card key={section.id} className="p-4 mb-4">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => toggleSection(section.id)}
        >
          <div className="flex items-center gap-2">
            {getSectionIcon(section.type)}
            <h3 className="text-lg font-semibold">{section.title}</h3>
          </div>
          <Button variant="ghost" size="sm">
            {isExpanded ? "收起" : "展开"}
          </Button>
        </div>

        {isExpanded && (
          <div className="mt-4">
            {renderSectionContent(section)}
          </div>
        )}
      </Card>
    )
  }

  const renderSectionContent = (section: ReportSection) => {
    switch (section.type) {
      case "text":
        return (
          <div className="prose max-w-none">
            {renderMarkdown(String(section.content))}
          </div>
        )

      case "ai_analysis":
      case "ai_summary":
        return (
          <div className="prose max-w-none">
            {renderMarkdown(String(section.content))}
          </div>
        )

      case "chart":
        const chartData = section.content as any
        if (chartData.charts && Array.isArray(chartData.charts)) {
          return (
            <div className="space-y-4">
              {chartData.charts.map((chart: any, index: number) => (
                <div key={index} className="border rounded-lg p-4">
                  <ChartRenderer config={chart.config || chart} />
                </div>
              ))}
            </div>
          )
        }
        return <div className="text-muted-foreground">图表数据加载中...</div>

      case "table":
        const tableData = section.content as any
        if (tableData.columns && tableData.rows) {
          return (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border">
                <thead>
                  <tr className="bg-muted">
                    {tableData.columns.map((col: string) => (
                      <th key={col} className="border p-2 text-left">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableData.rows.slice(0, 20).map((row: any, rowIndex: number) => (
                    <tr key={rowIndex}>
                      {tableData.columns.map((col: string) => (
                        <td key={col} className="border p-2">
                          {row[col] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {tableData.rows.length > 20 && (
                <p className="text-sm text-muted-foreground mt-2">
                  显示前20行，共 {tableData.rows.length} 行
                </p>
              )}
            </div>
          )
        }
        return <div className="text-muted-foreground">表格数据为空</div>

      case "metric":
        return (
          <div className="text-2xl font-bold">
            {String(section.content)}
          </div>
        )

      default:
        return <div className="text-muted-foreground">{String(section.content)}</div>
    }
  }

  const getSectionIcon = (type: ReportSection["type"]) => {
    switch (type) {
      case "chart":
        return <BarChart3 className="w-5 h-5 text-blue-500" />
      case "table":
        return <TableIcon className="w-5 h-5 text-green-500" />
      case "ai_analysis":
        return <TrendingUp className="w-5 h-5 text-purple-500" />
      case "ai_summary":
        return <FileText className="w-5 h-5 text-orange-500" />
      default:
        return <FileText className="w-5 h-5 text-gray-500" />
    }
  }

  const reportContent = (
    <div className={`w-full ${modal ? 'h-full' : 'h-full'} flex flex-col`}>
      {/* 报告头部 */}
      <Card className="p-6 mb-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h1 className="text-2xl font-bold mb-2">{report.title}</h1>
            <p className="text-muted-foreground mb-4">{report.goal}</p>
            <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
              <span>生成时间：{new Date(report.generatedAt).toLocaleString("zh-CN")}</span>
              <span>执行步骤：{report.metadata.completedSteps}/{report.metadata.totalSteps}</span>
              <span>执行时间：{(report.metadata.executionTime / 1000).toFixed(2)}秒</span>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {onShare && (
              <Button variant="outline" size="sm" onClick={onShare}>
                <Share2 className="w-4 h-4 mr-2" />
                分享
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => handleExport("markdown")}>
              <FileDown className="w-4 h-4 mr-2" />
              导出 Markdown
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport("json")}>
              <Download className="w-4 h-4 mr-2" />
              导出 JSON
            </Button>
            {modal && (
              <Button variant="outline" size="sm" onClick={() => setIsFullscreen(!isFullscreen)}>
                {isFullscreen ? (
                  <>
                    <Minimize2 className="w-4 h-4 mr-2" />
                    退出全屏
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-4 h-4 mr-2" />
                    全屏
                  </>
                )}
              </Button>
            )}
            {onClose && (
              <Button variant="outline" size="sm" onClick={onClose}>
                <X className="w-4 h-4 mr-2" />
                关闭
              </Button>
            )}
          </div>
        </div>
      </Card>

      <ScrollArea className="flex-1">
        <div className="space-y-4">
          {/* 执行摘要 */}
          {report.summary && (
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-5 h-5 text-blue-500" />
                <h2 className="text-xl font-semibold">执行摘要</h2>
              </div>
              <div className="prose max-w-none">
                {renderMarkdown(report.summary)}
              </div>
            </Card>
          )}

          {/* 关键发现 */}
          {report.keyFindings && report.keyFindings.length > 0 && (
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Lightbulb className="w-5 h-5 text-yellow-500" />
                <h2 className="text-xl font-semibold">关键发现</h2>
              </div>
              <ul className="space-y-2">
                {report.keyFindings.map((finding, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>{finding}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Separator />

          {/* 详细章节 */}
          <div>
            <h2 className="text-xl font-semibold mb-4">详细分析</h2>
            {report.sections
              .sort((a, b) => a.order - b.order)
              .map(section => renderSection(section))}
          </div>

          {/* 建议 */}
          {report.recommendations && report.recommendations.length > 0 && (
            <>
              <Separator />
              <Card className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <AlertCircle className="w-5 h-5 text-orange-500" />
                  <h2 className="text-xl font-semibold">建议</h2>
                </div>
                <ul className="space-y-2">
                  {report.recommendations.map((rec, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <Badge variant="outline" className="mt-0.5">
                        {index + 1}
                      </Badge>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  )

  // 如果是弹窗模式，使用Dialog包裹
  if (modal) {
    return (
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent 
          className={`${isFullscreen ? 'max-w-[95vw] max-h-[95vh]' : 'max-w-[90vw] max-h-[85vh]'} w-full p-0 overflow-hidden`}
        >
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <DialogTitle className="text-xl">{report.title}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden px-6 pb-6">
            <ScrollArea className="h-[calc(95vh-120px)]">
              {reportContent}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // 非弹窗模式，直接返回内容
  return reportContent
}

/**
 * 格式化报告为Markdown
 */
function formatReportAsMarkdown(report: AnalysisReport): string {
  const parts: string[] = []
  
  parts.push(`# ${report.title}\n`)
  parts.push(`**分析目标**: ${report.goal}\n`)
  parts.push(`**生成时间**: ${new Date(report.generatedAt).toLocaleString("zh-CN")}\n`)
  parts.push(`---\n`)
  
  // 执行摘要
  if (report.summary) {
    parts.push(`## 📊 执行摘要\n`)
    parts.push(report.summary)
    parts.push(`\n`)
  }
  
  // 关键发现
  if (report.keyFindings.length > 0) {
    parts.push(`## 🔍 关键发现\n`)
    report.keyFindings.forEach((finding, index) => {
      parts.push(`${index + 1}. ${finding}`)
    })
    parts.push(`\n`)
  }
  
  // 详细章节
  parts.push(`## 📋 详细分析\n`)
  for (const section of report.sections.sort((a, b) => a.order - b.order)) {
    parts.push(`### ${section.title}\n`)
    
    if (typeof section.content === "string") {
      parts.push(section.content)
    } else {
      parts.push(JSON.stringify(section.content, null, 2))
    }
    
    parts.push(`\n`)
  }
  
  // 建议
  if (report.recommendations && report.recommendations.length > 0) {
    parts.push(`## 💡 建议\n`)
    report.recommendations.forEach((rec, index) => {
      parts.push(`${index + 1}. ${rec}`)
    })
    parts.push(`\n`)
  }
  
  return parts.join("\n")
}
