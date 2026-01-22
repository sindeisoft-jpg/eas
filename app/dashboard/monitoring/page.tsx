"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Activity,
  AlertTriangle,
  Clock,
  Database,
  TrendingUp,
  Zap,
  AlertCircle,
  CheckCircle,
  XCircle,
} from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

export default function MonitoringPage() {
  const [metrics, setMetrics] = useState({
    totalQueries: 1247,
    avgQueryTime: 234,
    slowQueries: 12,
    failedQueries: 8,
    activeConnections: 5,
    cacheHitRate: 78.5,
  })

  const [alerts, setAlerts] = useState([
    {
      id: "1",
      type: "warning",
      title: "慢查询警告",
      message: "检测到3个查询执行时间超过10秒",
      timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    },
    {
      id: "2",
      type: "info",
      title: "缓存命中率下降",
      message: "缓存命中率从85%降至78%",
      timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    },
  ])

  const queryTrendData = [
    { time: "00:00", queries: 45, avgTime: 180 },
    { time: "04:00", queries: 23, avgTime: 210 },
    { time: "08:00", queries: 89, avgTime: 245 },
    { time: "12:00", queries: 156, avgTime: 198 },
    { time: "16:00", queries: 134, avgTime: 267 },
    { time: "20:00", queries: 98, avgTime: 223 },
  ]

  const performanceData = [
    { db: "Sales DB", avgTime: 234, queries: 456 },
    { db: "Analytics DB", avgTime: 189, queries: 321 },
    { db: "User DB", avgTime: 156, queries: 289 },
    { db: "Product DB", avgTime: 301, queries: 181 },
  ]

  const getAlertIcon = (type: string) => {
    switch (type) {
      case "error":
        return <XCircle className="w-4 h-4 text-destructive" />
      case "warning":
        return <AlertTriangle className="w-4 h-4 text-warning" />
      case "info":
        return <AlertCircle className="w-4 h-4 text-primary" />
      default:
        return <CheckCircle className="w-4 h-4 text-success" />
    }
  }

  const getAlertBadge = (type: string) => {
    switch (type) {
      case "error":
        return <Badge variant="destructive" className="text-xs">错误</Badge>
      case "warning":
        return <Badge className="bg-warning/10 text-warning border-warning/20 text-xs">警告</Badge>
      case "info":
        return <Badge variant="default" className="text-xs">信息</Badge>
      default:
        return <Badge variant="secondary" className="text-xs">正常</Badge>
    }
  }

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2 tracking-tight">系统监控</h1>
            <p className="text-sm text-muted-foreground">实时监控系统性能和运行状态</p>
          </div>
          <Badge variant="outline" className="px-4 py-2 gap-2">
            <Activity className="w-4 h-4" />
            系统运行正常
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Database className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">总查询数</p>
                  <p className="text-xl font-bold text-foreground">{metrics.totalQueries}</p>
                </div>
              </div>
              <TrendingUp className="w-4 h-4 text-success" />
            </div>
            <p className="text-xs text-muted-foreground">过去24小时</p>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">平均响应时间</p>
                  <p className="text-xl font-bold text-foreground">{metrics.avgQueryTime}ms</p>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">性能良好</p>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-warning" />
                </div>
                <div>
                  <p className="text-sm text-muted">慢查询</p>
                  <p className="text-2xl font-bold text-foreground">{metrics.slowQueries}</p>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted">超过10秒的查询</p>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <XCircle className="w-5 h-5 text-destructive" />
                </div>
                <div>
                  <p className="text-sm text-muted">失败查询</p>
                  <p className="text-2xl font-bold text-foreground">{metrics.failedQueries}</p>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted">错误率：0.6%</p>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">活跃连接</p>
                  <p className="text-xl font-bold text-foreground">{metrics.activeConnections}</p>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">最大10个连接</p>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">缓存命中率</p>
                  <p className="text-xl font-bold text-foreground">{metrics.cacheHitRate}%</p>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">性能优化良好</p>
          </Card>
        </div>

        <Tabs defaultValue="performance" className="space-y-6">
          <TabsList>
            <TabsTrigger value="performance">性能趋势</TabsTrigger>
            <TabsTrigger value="databases">数据库性能</TabsTrigger>
            <TabsTrigger value="alerts">告警记录</TabsTrigger>
          </TabsList>

          <TabsContent value="performance">
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-5">查询量和响应时间趋势</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={queryTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="queries"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    name="查询数"
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="avgTime"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    name="平均响应时间(ms)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </TabsContent>

          <TabsContent value="databases">
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-5">各数据库性能对比</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={performanceData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="db" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Bar yAxisId="left" dataKey="queries" fill="#3b82f6" name="查询数" />
                  <Bar yAxisId="right" dataKey="avgTime" fill="#8b5cf6" name="平均响应时间(ms)" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </TabsContent>

          <TabsContent value="alerts">
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-5">告警记录</h3>
              {alerts.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="w-16 h-16 text-success mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">系统运行正常</h3>
                  <p className="text-sm text-muted-foreground">暂无告警信息</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {alerts.map((alert) => (
                    <Card key={alert.id} className="p-4 rounded-lg">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-0.5">{getAlertIcon(alert.type)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <h4 className="text-sm font-semibold text-foreground mb-1">{alert.title}</h4>
                              <p className="text-xs text-muted-foreground leading-relaxed">{alert.message}</p>
                            </div>
                            {getAlertBadge(alert.type)}
                          </div>
                          <p className="text-xs text-muted-foreground/70">{new Date(alert.timestamp).toLocaleString("zh-CN")}</p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
