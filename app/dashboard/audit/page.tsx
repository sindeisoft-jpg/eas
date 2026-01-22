"use client"

import { useState, useEffect } from "react"
import { storage } from "@/lib/storage"
import type { AuditLog } from "@/lib/types"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Search, FileText, Shield, AlertCircle, CheckCircle, XCircle } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [filterAction, setFilterAction] = useState("all")
  const [filterStatus, setFilterStatus] = useState("all")

  useEffect(() => {
    loadLogs()
  }, [])

  const loadLogs = async () => {
    const allLogs = await storage.auditLogs.getAll()
    setLogs(allLogs)
  }

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.details.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.sql && log.sql.toLowerCase().includes(searchQuery.toLowerCase()))
    const matchesAction = filterAction === "all" || log.action === filterAction
    const matchesStatus = filterStatus === "all" || log.status === filterStatus
    return matchesSearch && matchesAction && matchesStatus
  })

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle className="w-4 h-4 text-success" />
      case "failed":
        return <XCircle className="w-4 h-4 text-destructive" />
      case "blocked":
        return <AlertCircle className="w-4 h-4 text-warning" />
      default:
        return <FileText className="w-4 h-4" />
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return <Badge variant="default">成功</Badge>
      case "failed":
        return <Badge variant="destructive">失败</Badge>
      case "blocked":
        return <Badge variant="secondary">已拦截</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getActionBadge = (action: string) => {
    const colors: Record<string, string> = {
      query: "bg-muted text-muted-foreground",
      create: "bg-success/10 text-success",
      update: "bg-warning/10 text-warning",
      delete: "bg-destructive/10 text-destructive border-destructive/20",
      login: "bg-primary/10 text-primary border-primary/20",
      export: "bg-accent/10 text-accent border-accent/20",
    }
    return <Badge className={`${colors[action] || "bg-muted text-muted-foreground"} rounded-md text-xs border`}>{action}</Badge>
  }

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2 tracking-tight">审计日志</h1>
            <p className="text-sm text-muted-foreground">查看所有系统操作和数据访问记录</p>
          </div>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <Badge variant="outline" className="px-4 py-2 rounded-lg">
              共 {logs.length} 条记录
            </Badge>
          </div>
        </div>

        <Card className="p-6 mb-8 rounded-lg border border-border/50 bg-card/50 backdrop-blur-sm shadow-sm">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="搜索用户、操作或SQL..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-11 h-10 rounded-lg border border-border/50 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all bg-card"
              />
            </div>
            <Select value={filterAction} onValueChange={setFilterAction}>
              <SelectTrigger className="w-40 h-10 rounded-lg border border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-lg">
                <SelectItem value="all">所有操作</SelectItem>
                <SelectItem value="query">查询</SelectItem>
                <SelectItem value="create">创建</SelectItem>
                <SelectItem value="update">更新</SelectItem>
                <SelectItem value="delete">删除</SelectItem>
                <SelectItem value="login">登录</SelectItem>
                <SelectItem value="export">导出</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40 h-10 rounded-lg border border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-lg">
                <SelectItem value="all">所有状态</SelectItem>
                <SelectItem value="success">成功</SelectItem>
                <SelectItem value="failed">失败</SelectItem>
                <SelectItem value="blocked">已拦截</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>

        <Card className="p-6 rounded-none border-border/50 bg-background/50 backdrop-blur-sm shadow-xl">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-20 h-20 rounded-none bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <FileText className="w-10 h-10 text-primary" />
              </div>
              <h3 className="text-2xl font-semibold text-foreground mb-3">暂无审计日志</h3>
              <p className="text-muted-foreground text-base">系统操作将自动记录在此处</p>
            </div>
          ) : (
            <ScrollArea className="h-[600px]">
              <div className="space-y-3 pr-4">
                {filteredLogs.map((log) => (
                  <Card key={log.id} className="p-5 hover:shadow-md transition-all duration-200 rounded-lg border border-border/50 bg-card/30 group">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 mt-1">{getStatusIcon(log.status)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-foreground">{log.userName}</span>
                            {getActionBadge(log.action)}
                            {getStatusBadge(log.status)}
                            <span className="text-xs text-muted">
                              {new Date(log.timestamp).toLocaleString("zh-CN")}
                            </span>
                          </div>
                        </div>
                        <p className="text-sm text-foreground mb-2">{log.details}</p>
                        {log.sql && (
                          <div className="bg-muted/30 border border-border/50 p-3 rounded-lg mt-2">
                            <code className="text-xs text-muted-foreground break-all font-mono">{log.sql}</code>
                          </div>
                        )}
                        {log.errorMessage && (
                          <div className="bg-destructive/10 border border-destructive/20 p-3 rounded-lg mt-2">
                            <p className="text-xs text-destructive">{log.errorMessage}</p>
                          </div>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted">
                          {log.resourceType && (
                            <span>
                              资源类型：<span className="text-foreground">{log.resourceType}</span>
                            </span>
                          )}
                          {log.ipAddress && (
                            <span>
                              IP：<span className="text-foreground">{log.ipAddress}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </Card>
      </div>
    </div>
  )
}
