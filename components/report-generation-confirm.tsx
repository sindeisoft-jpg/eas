"use client"

import React from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { FileText, Sparkles, TrendingUp } from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface ReportGenerationConfirmProps {
  open: boolean
  userQuestion: string
  detectedReportType?: string
  onConfirm: () => void
  onCancel: () => void
}

const REPORT_TYPE_NAMES: Record<string, string> = {
  sales_trend: "销售趋势报告",
  sales_funnel: "销售漏斗分析",
  revenue_analysis: "收入分析报告",
  customer_analysis: "客户分析报告",
  product_analysis: "产品分析报告",
  custom: "自定义分析报告",
}

export function ReportGenerationConfirm({
  open,
  userQuestion,
  detectedReportType = "custom",
  onConfirm,
  onCancel,
}: ReportGenerationConfirmProps) {
  const reportTypeName = REPORT_TYPE_NAMES[detectedReportType] || "分析报告"

  return (
    <AlertDialog open={open} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent className="sm:max-w-[500px]">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <AlertDialogTitle className="text-lg">生成分析报告</AlertDialogTitle>
              <Badge variant="outline" className="mt-1">
                {reportTypeName}
              </Badge>
            </div>
          </div>
          <AlertDialogDescription className="pt-2 space-y-3">
            <div className="flex items-start gap-2">
              <FileText className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-foreground mb-1">您的需求：</p>
                <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded-md">
                  {userQuestion}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <TrendingUp className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-foreground mb-1">系统将为您：</p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>分析数据并生成SQL查询</li>
                  <li>执行查询获取结果</li>
                  <li>生成包含关键发现和建议的分析报告</li>
                </ul>
              </div>
            </div>
            <div className="pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground">
                报告生成可能需要几秒钟时间，请耐心等待...
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>取消</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-primary">
            确认生成
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
