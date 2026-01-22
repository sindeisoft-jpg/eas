"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { storage } from "@/lib/storage"
import { Card } from "@/components/ui/card"
import { MessageSquare, Database, FileText, TrendingUp, BarChart3, Clock } from "lucide-react"
import type { ChatSession, SavedReport, DatabaseConnection } from "@/lib/types"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import dynamic from "next/dynamic"

// 懒加载可自定义仪表板组件
const CustomizableDashboard = dynamic(
  () => import("@/components/customizable-dashboard").then((mod) => ({ default: mod.CustomizableDashboard })),
  {
    loading: () => (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    ),
    ssr: false,
  }
)

export default function AnalyticsPage() {
  const { user } = useAuth()
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [reports, setReports] = useState<SavedReport[]>([])
  const [connections, setConnections] = useState<DatabaseConnection[]>([])

  useEffect(() => {
    if (user) {
      const loadData = async () => {
        try {
          const allSessions = await storage.chatSessions.getAll()
          const userSessions = allSessions.filter((s) => s.organizationId === user.organizationId)
          setSessions(userSessions)

          // 添加错误处理，避免报表加载失败影响其他数据
          try {
            const allReports = await storage.reports.getAll()
            const userReports = Array.isArray(allReports) 
              ? allReports.filter((r) => r.organizationId === user.organizationId)
              : []
            setReports(userReports)
          } catch (reportError) {
            console.warn("Failed to load reports:", reportError)
            setReports([]) // 设置为空数组，避免显示错误
          }

          const allConnections = await storage.dbConnections.getAll()
          const userConnections = allConnections.filter((c) => c.organizationId === user.organizationId)
          setConnections(userConnections)
        } catch (error) {
          console.error("Failed to load analytics data:", error)
        }
      }
      loadData()
    }
  }, [user])

  const totalMessages = sessions.reduce((sum, session) => sum + session.messages.length, 0)
  const queriesWithResults = sessions.reduce(
    (sum, session) => sum + session.messages.filter((m) => m.metadata?.queryResult).length,
    0,
  )

  const recentSessions = sessions.slice(-5).reverse()

  const stats = [
    {
      label: "查询总数",
      value: totalMessages,
      icon: MessageSquare,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      label: "成功查询",
      value: queriesWithResults,
      icon: TrendingUp,
      color: "text-success",
      bgColor: "bg-success/10",
    },
    {
      label: "已保存报表",
      value: reports.length,
      icon: FileText,
      color: "text-accent",
      bgColor: "bg-accent/10",
    },
    {
      label: "数据库连接",
      value: connections.length,
      icon: Database,
      color: "text-info",
      bgColor: "bg-info/10",
    },
  ]

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2 tracking-tight">数据分析</h1>
          <p className="text-sm text-muted-foreground">查看您的数据分析活动概览</p>
        </div>

        <Tabs defaultValue="dashboard" className="space-y-4">
          <TabsList>
            <TabsTrigger value="dashboard">仪表板</TabsTrigger>
            <TabsTrigger value="overview">概览</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-4">
            <CustomizableDashboard editable={true} />
          </TabsContent>

          <TabsContent value="overview" className="space-y-4">

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map((stat) => (
            <Card key={stat.label} className="p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 rounded-lg ${stat.bgColor} flex items-center justify-center`}>
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
              </div>
              <div className="text-2xl font-bold text-foreground mb-1">{stat.value}</div>
              <div className="text-xs text-muted-foreground font-medium">{stat.label}</div>
            </Card>
          ))}
        </div>

        {/* Recent Activity */}
        <Card className="p-6">
          <div className="flex items-center gap-2.5 mb-5">
            <Clock className="w-4 h-4 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">最近的对话会话</h2>
          </div>

          {recentSessions.length === 0 ? (
            <div className="text-center py-12">
              <BarChart3 className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">暂无对话会话。开始提问以查看活动记录。</p>
            </div>
          ) : (
            <div className="space-y-4">
              {recentSessions.map((session) => {
                const connection = connections.find((c) => c.id === session.databaseConnectionId)
                const queriesCount = session.messages.filter((m) => m.role === "user").length

                return (
                  <div
                    key={session.id}
                    className="flex items-start gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <MessageSquare className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-foreground mb-1 truncate">{session.title}</h3>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span>{queriesCount} 次查询</span>
                        <span>•</span>
                        <span>{connection?.name || "未知数据库"}</span>
                        <span>•</span>
                        <span>{new Date(session.updatedAt).toLocaleDateString("zh-CN")}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Database Usage */}
        <Card className="p-6 mt-6">
          <div className="flex items-center gap-2.5 mb-5">
            <Database className="w-4 h-4 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">数据库连接</h2>
          </div>

          {connections.length === 0 ? (
            <div className="text-center py-12">
              <Database className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">暂未配置数据库连接。</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {connections.map((conn) => {
                const sessionsCount = sessions.filter((s) => s.databaseConnectionId === conn.id).length
                const reportsCount = reports.filter((r) => r.databaseConnectionId === conn.id).length

                return (
                  <div key={conn.id} className="p-4 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Database className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-medium text-foreground">{conn.name}</h3>
                        <p className="text-xs text-muted uppercase">{conn.type}</p>
                      </div>
                    </div>
                    <div className="flex gap-4 text-sm text-muted-foreground">
                      <span>{sessionsCount} 个会话</span>
                      <span>•</span>
                      <span>{reportsCount} 个报表</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
