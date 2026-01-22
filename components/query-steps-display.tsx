/**
 * 查询步骤展示组件
 * 参考专业BI系统的展示方式，清晰地展示查询过程的各个步骤
 */

import React, { useState } from "react"
import { CheckCircle2, Clock, Database, Code, TrendingUp, Sparkles, ChevronDown, ChevronUp } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible"

export interface QueryStep {
  id: string
  title: string
  status: "pending" | "in_progress" | "completed" | "failed"
  duration?: number // 耗时（毫秒）
  details?: {
    intent?: string
    businessTheme?: string
    queryMode?: string
    metrics?: string[]
    filters?: Array<{ field: string; operator: string; value: string }>
    sqlSteps?: string[]
    sql?: string
    summary?: string
    result?: any
  }
  timestamp?: string
}

interface QueryStepsDisplayProps {
  steps: QueryStep[]
  onRequery?: () => void
  onExportLog?: () => void
  compact?: boolean
}

export function QueryStepsDisplay({ 
  steps, 
  onRequery, 
  onExportLog,
  compact = false 
}: QueryStepsDisplayProps) {
  const formatDuration = (ms?: number): string => {
    if (!ms) return ""
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  const formatNumber = (value: any): string => {
    if (typeof value !== "number") return String(value)
    
    // 如果数字很大，转换为万、亿等单位
    if (value >= 100000000) {
      return `${(value / 100000000).toFixed(2)}亿`
    } else if (value >= 10000) {
      return `${(value / 10000).toFixed(2)}万`
    }
    
    return value.toLocaleString("zh-CN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
  }

  const getStepIcon = (step: QueryStep) => {
    switch (step.status) {
      case "completed":
        return <CheckCircle2 className="w-5 h-5 text-green-500" />
      case "in_progress":
        return <Clock className="w-5 h-5 text-blue-500 animate-spin" />
      case "failed":
        return <CheckCircle2 className="w-5 h-5 text-red-500" />
      default:
        return <Clock className="w-5 h-5 text-muted-foreground" />
    }
  }

  const getStepTitleIcon = (title: string) => {
    if (title.includes("意图") || title.includes("解析")) {
      return <Sparkles className="w-4 h-4 text-blue-500" />
    } else if (title.includes("SQL") || title.includes("生成")) {
      return <Code className="w-4 h-4 text-purple-500" />
    } else if (title.includes("查询") || title.includes("数据")) {
      return <Database className="w-4 h-4 text-green-500" />
    }
    return <TrendingUp className="w-4 h-4 text-muted-foreground" />
  }

  return (
    <div className="space-y-4">
      {steps.map((step, index) => (
        <Card 
          key={step.id} 
          className={`rounded-lg border border-border/50 bg-card shadow-lg ${
            step.status === "completed" ? "border-green-500/20" : ""
          }`}
        >
          <div className="p-4">
            {/* 步骤头部 */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                {getStepIcon(step)}
                <div className="flex items-center gap-2">
                  {getStepTitleIcon(step.title)}
                  <h3 className="font-semibold text-base text-foreground">
                    {step.title}
                  </h3>
                </div>
                {step.duration && (
                  <Badge variant="outline" className="text-xs">
                    耗时: {formatDuration(step.duration)}
                  </Badge>
                )}
              </div>
              {step.timestamp && (
                <span className="text-xs text-muted-foreground">
                  {new Date(step.timestamp).toLocaleTimeString("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </div>

            {/* 步骤详情 */}
            {step.details && (
              <div className="mt-4 space-y-3 pl-8">
                {/* 意图解析详情 - 可折叠 */}
                {step.details.intent && (
                  <IntentCollapsible 
                    stepId={step.id}
                    intent={step.details.intent}
                    businessTheme={step.details.businessTheme}
                    queryMode={step.details.queryMode}
                    metrics={step.details.metrics}
                    filters={step.details.filters}
                    onRequery={onRequery}
                  />
                )}

                {/* SQL生成详情 */}
                {step.details.sqlSteps && step.details.sqlSteps.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                      <span className="font-medium">SQL生成流程:</span>
                      {onExportLog && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={onExportLog}
                        >
                          导出日志
                        </Button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {step.details.sqlSteps.map((sqlStep, idx) => (
                        <Badge
                          key={idx}
                          variant="secondary"
                          className="text-xs cursor-default"
                        >
                          {sqlStep}
                        </Badge>
                      ))}
                    </div>
                    {step.details.sql && (
                      <div className="mt-3">
                        <div className="text-xs font-medium text-muted-foreground mb-1">
                          最终执行SQL:
                        </div>
                        <div className="bg-muted/50 rounded-md p-3 border border-border/50">
                          <code className="text-xs font-mono text-foreground break-all">
                            {step.details.sql}
                          </code>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 数据查询详情 */}
                {step.details.summary && (
                  <div className="space-y-3">
                    <div className="text-sm font-medium text-foreground">
                      总结:
                    </div>
                    <div className="text-base text-foreground leading-relaxed">
                      {step.details.summary}
                    </div>
                    {step.details.result && (
                      <div className="mt-4 p-4 bg-gradient-to-br from-primary/5 to-primary/10 rounded-lg border border-primary/20">
                        <div className="text-2xl font-bold text-foreground">
                          {formatNumber(step.details.result)}
                        </div>
                        {typeof step.details.result === "number" && step.details.result >= 10000 && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {step.details.result.toLocaleString("zh-CN")}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  )
}

/**
 * 用户意图可折叠组件
 * 默认折叠状态，用户可以点击展开查看详细信息
 */
interface IntentCollapsibleProps {
  stepId: string
  intent: string
  businessTheme?: string
  queryMode?: string
  metrics?: string[]
  filters?: Array<{ field: string; operator: string; value: string }>
  onRequery?: () => void
}

function IntentCollapsible({
  stepId,
  intent,
  businessTheme,
  queryMode,
  metrics,
  filters,
  onRequery,
}: IntentCollapsibleProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button
          className="w-full flex items-center justify-between py-1.5 px-0 text-left hover:opacity-80 transition-opacity cursor-pointer"
        >
          <div className="flex items-center gap-2 text-sm text-foreground font-medium">
            <span>用户意图</span>
          </div>
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 mt-2">
        <div className="text-sm text-foreground font-medium">
          {intent}
        </div>
        {businessTheme && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium">业务主题:</span>
            <Badge variant="secondary" className="text-xs">
              {businessTheme}
            </Badge>
          </div>
        )}
        {queryMode && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium">查询模式:</span>
            <Badge variant="secondary" className="text-xs">
              {queryMode}
            </Badge>
          </div>
        )}
        {metrics && metrics.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium">指标:</span>
            <div className="flex gap-1 flex-wrap">
              {metrics.map((metric, idx) => (
                <Badge key={idx} variant="outline" className="text-xs">
                  {metric}
                </Badge>
              ))}
            </div>
          </div>
        )}
        {filters && filters.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">
              筛选条件:
            </div>
            <div className="flex flex-wrap gap-2">
              {filters.map((filter, idx) => (
                <div
                  key={idx}
                  className="px-3 py-1.5 bg-muted/50 rounded-md border border-border/50 text-xs"
                >
                  <span className="font-medium text-foreground">
                    {filter.field}
                  </span>
                  <span className="text-muted-foreground mx-1">
                    {filter.operator}
                  </span>
                  <span className="text-foreground">{filter.value}</span>
                </div>
              ))}
            </div>
            {onRequery && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 h-7 text-xs"
                onClick={onRequery}
              >
                重新查询
              </Button>
            )}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
