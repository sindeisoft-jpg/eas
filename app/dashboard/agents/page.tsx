"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { storage } from "@/lib/storage"
import type { Agent } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Plus, Trash2, CheckCircle, XCircle, Star, Edit, Play, AlertCircle, Copy, FileText, ChevronDown } from "lucide-react"
import { showDangerConfirm, showSuccess, showError } from "@/lib/toast-utils"
import { EmptyState } from "@/components/ui/empty-state"
import dynamic from "next/dynamic"

// 懒加载智能体对话框
const AgentDialog = dynamic(
  () => import("@/components/agent-dialog").then((mod) => ({ default: mod.AgentDialog })),
  {
    ssr: false,
  }
)

export default function AgentsPage() {
  const { user } = useAuth()
  const [agents, setAgents] = useState<Agent[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingAgent, setEditingAgent] = useState<Agent | undefined>()
  const [error, setError] = useState<{ message: string; details?: string; hint?: string } | null>(null)

  useEffect(() => {
    loadAgents()
  }, [user])

  const loadAgents = async () => {
    try {
      setError(null)
      const allAgents = await storage.agents.getAll()
      setAgents(allAgents.filter((a) => a.organizationId === user?.organizationId))
    } catch (err: any) {
      console.error("Failed to load agents:", err)
      // 解析错误信息
      const errorDetails = err.details || err.message || "未知错误"
      // 检测表不存在的错误
      const isTableNotExist = 
        err.code === 'P2001' ||
        err.message?.includes("does not exist") ||
        err.message?.includes("doesn't exist") ||
        err.message?.includes("不存在") ||
        errorDetails?.includes("does not exist") ||
        errorDetails?.includes("doesn't exist")
      const errorHint = err.hint || (isTableNotExist ? "数据库表 'agents' 不存在，请运行 SQL 脚本创建表" : undefined)
      setError({
        message: err.message || "获取智能体列表失败",
        details: errorDetails,
        hint: errorHint,
      })
    }
  }

  const handleDelete = async (id: string) => {
    const agent = agents.find((a) => a.id === id)
    const confirmed = await showDangerConfirm(
      "删除智能体",
      `确定要删除智能体 "${agent?.name || "未知"}" 吗？此操作不可恢复。`,
      async () => {
        await storage.agents.remove(id)
        loadAgents()
      }
    )
  }

  const handleSetDefault = async (id: string) => {
    try {
      const allAgents = await storage.agents.getAll()
      for (const agent of allAgents) {
        if (agent.organizationId === user?.organizationId) {
          await storage.agents.save({
            ...agent,
            isDefault: agent.id === id,
          } as any)
        }
      }
      loadAgents()
    } catch (error) {
      console.error("Failed to set default:", error)
        showError({
          message: "设置失败",
          details: "无法设置默认智能体",
        })
    }
  }

  const handleCopy = async (agent: Agent) => {
    try {
      // 深拷贝智能体的所有属性
      const now = Date.now()
      const copiedTools = (agent.tools || []).map((tool, index) => ({
        ...tool,
        id: `tool_${now}_${index}`, // 为每个工具生成新的唯一 ID
      }))
      
      const copiedAgent: Agent = {
        ...agent,
        id: `agent_${now}`, // 生成新的临时 ID
        name: `${agent.name} - 副本`,
        isDefault: false, // 复制的智能体不设为默认
        createdBy: user?.id || agent.createdBy,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        // 深拷贝复杂对象
        tools: copiedTools,
        memory: JSON.parse(JSON.stringify(agent.memory || { type: "simple", enabled: true, maxHistory: 10, config: {} })),
        workflow: JSON.parse(JSON.stringify(agent.workflow || { nodes: [], edges: [] })),
        execution: JSON.parse(JSON.stringify(agent.execution || {
          timeout: 30,
          maxRetries: 3,
          retryDelay: 1,
          concurrency: 1,
          enableLogging: true,
        })),
      }
      
      await storage.agents.save(copiedAgent)
      loadAgents()
    } catch (error) {
      console.error("Failed to copy agent:", error)
        showError({
          message: "复制失败",
          details: "无法复制智能体",
        })
    }
  }

  const handleCreateReportAgent = async () => {
    try {
      // 获取可用的LLM连接
      const allLLMConnections = await storage.llmConnections.getAll()
      const activeLLMConnections = allLLMConnections.filter(
        (conn) => conn.organizationId === user?.organizationId && conn.status === "active"
      )

      if (activeLLMConnections.length === 0) {
        showError({
          message: "配置缺失",
          details: "请先配置至少一个激活的LLM连接",
          hint: "前往「模型管理」页面配置LLM连接",
        })
        return
      }

      // 获取可用的数据库连接
      const allDbConnections = await storage.dbConnections.getAll()
      const activeDbConnections = allDbConnections.filter(
        (conn) => conn.organizationId === user?.organizationId && conn.status !== "error"
      )

      // 使用第一个激活的LLM连接
      const llmConnectionId = activeLLMConnections[0].id
      // 使用第一个可用的数据库连接（如果有）
      const databaseConnectionId = activeDbConnections.length > 0 ? activeDbConnections[0].id : undefined

      // 通过 API 创建报告生成智能体（服务器端执行，避免 Prisma 被打包到客户端）
      await storage.agents.createReportAgent(llmConnectionId, databaseConnectionId)
      
      loadAgents()
      showSuccess("创建成功", "报告生成智能体已创建")
    } catch (error: any) {
      console.error("Failed to create report agent:", error)
      showError({
        message: "创建失败",
        details: error.message || "未知错误",
        hint: "请检查LLM连接和数据库连接配置是否正确",
      })
    }
  }

  const canManageAgents = user?.role === "admin" || user?.role === "analyst"

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2 tracking-tight">智能体管理</h1>
            <p className="text-sm text-muted-foreground">配置和管理AI智能体</p>
          </div>
          {canManageAgents && (
            <div className="flex gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="gap-2 h-10 px-5 rounded-lg font-medium border-border/50 hover:bg-muted/50 transition-all"
              >
                <FileText className="w-4 h-4" />
                快速创建
                <ChevronDown className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={handleCreateReportAgent}>
                <FileText className="w-4 h-4 mr-2" />
                报告生成智能体
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
              <Button
                onClick={() => {
                  setEditingAgent(undefined)
                  setDialogOpen(true)
                }}
                className="gap-2 h-10 px-5 rounded-lg font-medium shadow-sm hover:shadow-md transition-all duration-200"
              >
                <Plus className="w-4 h-4" />
                创建智能体
              </Button>
            </div>
          )}
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="font-semibold mb-2">{error.message}</div>
              {error.details && <div className="text-sm mb-2 text-muted-foreground">{error.details}</div>}
              {error.hint && (
                <div className="text-sm mt-2 p-3 bg-muted rounded-none">
                  <strong>解决方案：</strong> {error.hint}
                  {error.hint.includes("数据库表") && (
                    <div className="mt-2 text-xs">
                      <p>请执行以下 SQL 脚本创建表：</p>
                      <code className="block mt-1 p-2 bg-background rounded text-xs">
                        scripts/create-agents-table.sql
                      </code>
                    </div>
                  )}
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {agents.length === 0 ? (
          <EmptyState
            icon={Plus}
            title="还没有配置智能体"
            description="创建AI智能体以自动化您的业务流程"
            action={
              canManageAgents
                ? {
                    label: "创建第一个智能体",
                    onClick: () => {
                      setEditingAgent(undefined)
                      setDialogOpen(true)
                    },
                  }
                : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {agents.map((agent) => (
              <Card
                key={agent.id}
                className="p-6 relative hover:shadow-lg transition-all duration-200 rounded-lg border border-border/50 bg-card/50 backdrop-blur-sm group"
              >
                {agent.isDefault && (
                  <div className="absolute top-3 right-3">
                    <Star className="w-4 h-4 fill-yellow-500 text-yellow-500" />
                  </div>
                )}

                <div className="flex items-start gap-3 mb-4">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform shadow-md">
                    <Play className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate text-sm mb-0.5">{agent.name}</h3>
                    {agent.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{agent.description}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between py-1">
                    <span className="text-muted-foreground text-xs font-medium">工具数量</span>
                    <span className="text-sm font-medium">{agent.tools?.filter((t) => t.enabled).length || 0}</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-muted-foreground text-xs font-medium">记忆类型</span>
                    <span className="text-sm font-medium capitalize">{agent.memory?.type || "none"}</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-muted-foreground text-xs font-medium">超时时间</span>
                    <span className="text-sm font-medium">{agent.execution?.timeout || 30}秒</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-muted-foreground text-xs font-medium">状态</span>
                    <span className="flex items-center gap-1.5">
                      {agent.status === "active" ? (
                        <>
                          <CheckCircle className="w-3.5 h-3.5 text-success" />
                          <span className="text-sm text-success font-medium">运行中</span>
                        </>
                      ) : agent.status === "error" ? (
                        <>
                          <XCircle className="w-3.5 h-3.5 text-destructive" />
                          <span className="text-sm text-destructive font-medium">错误</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground font-medium">已停用</span>
                        </>
                      )}
                    </span>
                  </div>
                </div>

                {canManageAgents && (
                  <div className="flex gap-2 pt-4 border-t border-border/30">
                    {!agent.isDefault && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSetDefault(agent.id)}
                        className="flex-1 rounded-md border-border/50 hover:bg-muted/50 transition-all"
                      >
                        设为默认
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingAgent(agent)
                        setDialogOpen(true)
                      }}
                      className="flex-1 rounded-md border-border/50 hover:bg-muted/50 transition-all"
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      编辑
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopy(agent)}
                      className="rounded-md border-border/50 hover:bg-muted/50 transition-all"
                      title="复制智能体"
                      aria-label="复制智能体"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(agent.id)}
                      className="rounded-md border-border/50 text-destructive hover:bg-destructive/10 hover:border-destructive/20 transition-all"
                      aria-label="删除智能体"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}

                <div className="text-xs text-muted-foreground mt-4 pt-3 border-t border-border/50">
                  创建于 {new Date(agent.createdAt).toLocaleDateString("zh-CN")}
                </div>
              </Card>
            ))}
          </div>
        )}

        {!canManageAgents && agents.length > 0 && (
          <div className="mt-6 p-4 bg-warning/10 border border-warning/20 rounded-lg">
            <p className="text-sm text-warning-foreground">您没有权限管理智能体。请联系管理员。</p>
          </div>
        )}
      </div>

      <AgentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        agent={editingAgent}
        onSave={() => {
          loadAgents()
          setDialogOpen(false)
        }}
      />
    </div>
  )
}
