"use client"

import React from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  FileText,
  Eye,
  Download,
  Share2,
  Save,
  TrendingUp,
  Lightbulb,
  BarChart3,
} from "lucide-react"
import type { AnalysisReport } from "@/lib/report-generator"
import { formatNumber } from "@/lib/number-formatter"

interface ReportPreviewCardProps {
  report: AnalysisReport
  onViewFull: () => void
  onExport?: (format: "pdf" | "markdown" | "json") => void
  onShare?: () => void
  onSave?: () => void
}

export function ReportPreviewCard({
  report,
  onViewFull,
  onExport,
  onShare,
  onSave,
}: ReportPreviewCardProps) {
  // 提取关键指标（从关键发现中提取数字）
  const extractMetrics = () => {
    const metrics: Array<{ label: string; value: string }> = []
    
    if (report.keyFindings && report.keyFindings.length > 0) {
      // 尝试从关键发现中提取数字
      report.keyFindings.slice(0, 3).forEach((finding, index) => {
        const numberMatch = finding.match(/([\d,]+\.?\d*)/)
        if (numberMatch) {
          metrics.push({
            label: finding.substring(0, 20) + (finding.length > 20 ? "..." : ""),
            value: numberMatch[1],
          })
        }
      })
    }
    
    // 如果没有提取到指标，使用默认值
    if (metrics.length === 0) {
      metrics.push(
        { label: "章节数", value: String(report.sections.length) },
        { label: "关键发现", value: String(report.keyFindings?.length || 0) },
        { label: "执行时间", value: `${(report.metadata.executionTime / 1000).toFixed(1)}s` }
      )
    }
    
    return metrics.slice(0, 4)
  }

  const metrics = extractMetrics()

  return (
    <Card className="p-4 bg-gradient-to-br from-primary/5 via-primary/3 to-background border border-primary/20 rounded-lg shadow-sm hover:shadow-md transition-shadow">
      {/* 头部 */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="w-4 h-4 text-primary" />
            </div>
            <h3 className="text-base font-semibold text-foreground line-clamp-1">
              {report.title}
            </h3>
          </div>
          {report.goal && (
            <p className="text-sm text-muted-foreground line-clamp-1 ml-10">
              {report.goal}
            </p>
          )}
        </div>
        <Badge variant="outline" className="ml-2">
          {report.sections.length} 章节
        </Badge>
      </div>

      {/* 摘要 */}
      {report.summary && (
        <div className="mb-4 ml-10">
          <p className="text-sm text-foreground/90 line-clamp-2 leading-relaxed">
            {report.summary}
          </p>
        </div>
      )}

      {/* 关键指标 */}
      {metrics.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 ml-10">
          {metrics.map((metric, index) => (
            <div
              key={index}
              className="p-2 bg-background/50 rounded-md border border-border/50"
            >
              <div className="text-xs text-muted-foreground mb-1 line-clamp-1">
                {metric.label}
              </div>
              <div className="text-sm font-semibold text-foreground">
                {formatNumber(parseFloat(metric.value.replace(/,/g, "")) || 0)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 关键发现预览 */}
      {report.keyFindings && report.keyFindings.length > 0 && (
        <div className="mb-4 ml-10">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="w-4 h-4 text-yellow-500" />
            <span className="text-xs font-medium text-foreground">关键发现</span>
          </div>
          <ul className="space-y-1">
            {report.keyFindings.slice(0, 2).map((finding, index) => (
              <li key={index} className="text-xs text-muted-foreground flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span className="line-clamp-1">{finding}</span>
              </li>
            ))}
            {report.keyFindings.length > 2 && (
              <li className="text-xs text-muted-foreground ml-4">
                还有 {report.keyFindings.length - 2} 个发现...
              </li>
            )}
          </ul>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center gap-2 ml-10 flex-wrap">
        <Button
          size="sm"
          onClick={onViewFull}
          className="h-8 px-3 text-xs bg-primary hover:bg-primary/90"
        >
          <Eye className="w-3 h-3 mr-1.5" />
          查看完整报表
        </Button>
        {onExport && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onExport("markdown")}
            className="h-8 px-3 text-xs"
          >
            <Download className="w-3 h-3 mr-1.5" />
            导出
          </Button>
        )}
        {onShare && (
          <Button
            size="sm"
            variant="outline"
            onClick={onShare}
            className="h-8 px-3 text-xs"
          >
            <Share2 className="w-3 h-3 mr-1.5" />
            分享
          </Button>
        )}
        {onSave && (
          <Button
            size="sm"
            variant="outline"
            onClick={onSave}
            className="h-8 px-3 text-xs"
          >
            <Save className="w-3 h-3 mr-1.5" />
            保存
          </Button>
        )}
      </div>

      {/* 底部信息 */}
      <div className="mt-3 pt-3 border-t border-border/30 flex items-center justify-between text-xs text-muted-foreground ml-10">
        <span>
          生成时间：{new Date(report.generatedAt).toLocaleString("zh-CN", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <div className="flex items-center gap-2">
          <BarChart3 className="w-3 h-3" />
          <span>{report.metadata.completedSteps}/{report.metadata.totalSteps} 步骤</span>
        </div>
      </div>
    </Card>
  )
}
