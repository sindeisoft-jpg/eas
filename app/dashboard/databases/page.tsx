"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { storage } from "@/lib/storage"
import type { DatabaseConnection } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Plus, Database, CheckCircle2, XCircle, Trash2, Eye, EyeOff } from "lucide-react"
import { showDangerConfirm, showSuccess, showError } from "@/lib/toast-utils"
import { EmptyState } from "@/components/ui/empty-state"
import dynamic from "next/dynamic"

// 懒加载数据库连接对话框
const DatabaseConnectionDialog = dynamic(
  () => import("@/components/database-connection-dialog").then((mod) => ({ default: mod.DatabaseConnectionDialog })),
  {
    ssr: false,
  }
)

export default function DatabasesPage() {
  const { user } = useAuth()
  const [connections, setConnections] = useState<DatabaseConnection[]>([])
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingConnection, setEditingConnection] = useState<DatabaseConnection | undefined>()
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({})

  useEffect(() => {
    loadConnections()
  }, [user])

  const loadConnections = async () => {
    try {
      const allConnections = await storage.dbConnections.getAll()
      const userConnections = allConnections.filter((conn) => conn.organizationId === user?.organizationId)
      setConnections(userConnections)
    } catch (error) {
      console.error("Failed to load connections:", error)
    }
  }

  const handleDelete = async (id: string) => {
    const connection = connections.find((c) => c.id === id)
    const confirmed = await showDangerConfirm(
      "删除数据库连接",
      `确定要删除数据库连接 "${connection?.name || "未知"}" 吗？此操作不可恢复。`,
      async () => {
        await storage.dbConnections.remove(id)
        loadConnections()
      }
    )
  }

  const handleEdit = (connection: DatabaseConnection) => {
    setEditingConnection(connection)
    setIsDialogOpen(true)
  }

  const handleDialogClose = () => {
    setIsDialogOpen(false)
    setEditingConnection(undefined)
    loadConnections()
  }

  const togglePasswordVisibility = (id: string) => {
    setShowPasswords((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2 tracking-tight">数据库连接</h1>
            <p className="text-sm text-muted-foreground">管理您的数据库连接以进行AI查询</p>
          </div>
          <Button 
            onClick={() => setIsDialogOpen(true)} 
            className="gap-2 h-10 px-5 rounded-lg font-medium shadow-sm hover:shadow-md transition-all duration-200"
          >
            <Plus className="w-4 h-4" />
            添加连接
          </Button>
        </div>

        {connections.length === 0 ? (
          <EmptyState
            icon={Database}
            title="暂无数据库连接"
            description="开始添加您的第一个数据库连接以进行AI查询"
            action={{
              label: "添加第一个数据库",
              onClick: () => setIsDialogOpen(true),
            }}
          />
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {connections.map((connection) => (
              <Card key={connection.id} className="p-6 hover:shadow-lg transition-all duration-200 rounded-lg border border-border/50 bg-card/50 backdrop-blur-sm group">
                <div className="flex items-start justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 transition-colors">
                      <Database className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground text-sm mb-0.5">{connection.name}</h3>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{connection.type}</p>
                    </div>
                  </div>
                  <div
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                      connection.status === "connected"
                        ? "bg-success/10 text-success"
                        : connection.status === "error"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {connection.status === "connected" ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5" />
                    )}
                    {connection.status === "connected" ? "已连接" : connection.status === "error" ? "错误" : "未连接"}
                  </div>
                </div>

                <div className="space-y-2.5 mb-5">
                  <div className="flex justify-between items-center py-1">
                    <span className="text-muted-foreground text-xs font-medium">主机</span>
                    <span className="text-foreground font-mono text-xs bg-muted/50 px-2 py-0.5 rounded-md">{connection.host}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-muted-foreground text-xs font-medium">端口</span>
                    <span className="text-foreground font-mono text-xs bg-muted/50 px-2 py-0.5 rounded-md">{connection.port}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-muted-foreground text-xs font-medium">数据库</span>
                    <span className="text-foreground font-mono text-xs bg-muted/50 px-2 py-0.5 rounded-md">{connection.database}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-muted-foreground text-xs font-medium">用户名</span>
                    <span className="text-foreground font-mono text-xs bg-muted/50 px-2 py-0.5 rounded-md">{connection.username}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-muted-foreground text-xs font-medium">密码</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-foreground font-mono text-xs bg-muted/50 px-2 py-0.5 rounded-md">
                        {showPasswords[connection.id] ? connection.password : "••••••••"}
                      </span>
                      <button
                        onClick={() => togglePasswordVisibility(connection.id)}
                        className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted/50"
                        aria-label={showPasswords[connection.id] ? "隐藏密码" : "显示密码"}
                      >
                        {showPasswords[connection.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  {connection.metadata?.tables && (
                    <div className="pt-3 mt-3 border-t border-border/50">
                      <span className="text-muted-foreground text-xs font-medium">数据表: </span>
                      <span className="text-foreground text-xs font-semibold">{connection.metadata.tables.length} 个可用</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 pt-4 border-t border-border/30">
                  <Button 
                    onClick={() => handleEdit(connection)} 
                    variant="outline" 
                    size="sm" 
                    className="flex-1 rounded-md border-border/50 hover:bg-muted/50 transition-all"
                  >
                    编辑
                  </Button>
                  <Button
                    onClick={() => handleDelete(connection.id)}
                    variant="outline"
                    size="sm"
                    className="rounded-md border-border/50 text-destructive hover:bg-destructive/10 hover:border-destructive/20 transition-all"
                    aria-label="删除连接"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        <DatabaseConnectionDialog
          open={isDialogOpen}
          onClose={handleDialogClose}
          connection={editingConnection}
          organizationId={user ? user.organizationId : ""}
          userId={user ? user.id : ""}
        />
      </div>
    </div>
  )
}
