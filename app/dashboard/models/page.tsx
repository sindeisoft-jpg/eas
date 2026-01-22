"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { storage } from "@/lib/storage"
import type { LLMConnection } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Plus, Trash2, CheckCircle, XCircle, Star } from "lucide-react"
import { LLMConnectionDialog } from "@/components/llm-connection-dialog"
import { showDangerConfirm, showSuccess, showError } from "@/lib/toast-utils"
import { EmptyState } from "@/components/ui/empty-state"

export default function ModelsPage() {
  const { user } = useAuth()
  const [connections, setConnections] = useState<LLMConnection[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingConnection, setEditingConnection] = useState<LLMConnection | undefined>()

  useEffect(() => {
    loadConnections()
  }, [user])

  const loadConnections = async () => {
    try {
      const allConnections = await storage.llmConnections.getAll()
      setConnections(allConnections.filter((c) => c.organizationId === user?.organizationId))
    } catch (error) {
      console.error("Failed to load connections:", error)
    }
  }

  const handleDelete = async (id: string) => {
    const connection = connections.find((c) => c.id === id)
    const confirmed = await showDangerConfirm(
      "删除模型连接",
      `确定要删除模型连接 "${connection?.name || "未知"}" 吗？此操作不可恢复。`,
      async () => {
        await storage.llmConnections.remove(id)
        loadConnections()
      }
    )
  }

  const handleSetDefault = async (id: string) => {
    try {
      const allConnections = await storage.llmConnections.getAll()
      for (const conn of allConnections) {
        if (conn.organizationId === user?.organizationId) {
          await storage.llmConnections.save({
            ...conn,
            isDefault: conn.id === id,
          } as any)
        }
      }
      loadConnections()
    } catch (error) {
      console.error("Failed to set default:", error)
        showError({
          message: "设置失败",
          details: "无法设置默认模型",
        })
    }
  }

  const getProviderName = (provider: string) => {
    const names: Record<string, string> = {
      // 国际模型
      openai: "OpenAI",
      anthropic: "Anthropic (Claude)",
      google: "Google (Gemini)",
      xai: "xAI (Grok)",
      cohere: "Cohere",
      mistral: "Mistral AI",
      groq: "Groq",
      "azure-openai": "Azure OpenAI",
      together: "Together AI",
      perplexity: "Perplexity",
      replicate: "Replicate",
      huggingface: "Hugging Face",
      // 国产模型
      deepseek: "DeepSeek",
      qwen: "通义千问",
      baidu: "文心一言",
      hunyuan: "腾讯混元",
      zhipu: "智谱AI",
      moonshot: "Kimi",
      yi: "零一万物",
      minimax: "MiniMax",
      doubao: "豆包",
      baichuan: "百川智能",
      stepfun: "阶跃星辰",
      mianbi: "面壁智能",
      langboat: "澜舟科技",
      xverse: "元象科技",
      // 本地模型
      ollama: "Ollama (本地)",
    }
    return names[provider] || provider
  }

  const getProviderColor = (provider: string) => {
    const colors: Record<string, string> = {
      openai: "bg-green-500",
      anthropic: "bg-purple-500",
      google: "bg-blue-500",
      xai: "bg-gray-800",
      cohere: "bg-pink-500",
      mistral: "bg-orange-500",
      groq: "bg-yellow-600",
      "azure-openai": "bg-blue-400",
      together: "bg-indigo-400",
      perplexity: "bg-amber-500",
      replicate: "bg-violet-400",
      huggingface: "bg-yellow-400",
      deepseek: "bg-blue-600",
      qwen: "bg-violet-500",
      baidu: "bg-blue-700",
      hunyuan: "bg-indigo-500",
      zhipu: "bg-cyan-600",
      moonshot: "bg-slate-700",
      yi: "bg-teal-500",
      minimax: "bg-rose-500",
      doubao: "bg-emerald-600",
      baichuan: "bg-orange-400",
      stepfun: "bg-purple-400",
      mianbi: "bg-pink-400",
      langboat: "bg-cyan-400",
      xverse: "bg-green-400",
      ollama: "bg-sky-600",
    }
    return colors[provider] || "bg-gray-500"
  }

  const canManageConnections = user?.role === "admin"

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2 tracking-tight">模型管理</h1>
            <p className="text-sm text-muted-foreground">配置和管理AI模型连接</p>
          </div>
          {canManageConnections && (
            <Button
              onClick={() => {
                setEditingConnection(undefined)
                setDialogOpen(true)
              }}
              className="gap-2 h-10 px-5 rounded-lg font-medium shadow-sm hover:shadow-md transition-all duration-200"
            >
              <Plus className="w-4 h-4" />
              添加模型
            </Button>
          )}
        </div>

        {connections.length === 0 ? (
          <EmptyState
            icon={Plus}
            title="还没有配置模型"
            description="添加AI模型连接以开始使用智能对话功能"
            action={
              canManageConnections
                ? {
                    label: "添加第一个模型",
                    onClick: () => {
                      setEditingConnection(undefined)
                      setDialogOpen(true)
                    },
                  }
                : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {connections.map((connection) => (
              <Card key={connection.id} className="p-6 relative hover:shadow-lg transition-all duration-200 rounded-lg border border-border/50 bg-card/50 backdrop-blur-sm group">
                {connection.isDefault && (
                  <div className="absolute top-3 right-3">
                    <Star className="w-4 h-4 fill-yellow-500 text-yellow-500" />
                  </div>
                )}

                <div className="flex items-start gap-3 mb-4">
                  <div
                    className={`w-12 h-12 rounded-lg ${getProviderColor(connection.provider)} flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform shadow-md`}
                  >
                    <span className="text-white font-semibold text-sm">{connection.provider.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate text-sm mb-0.5">{connection.name}</h3>
                    <p className="text-xs text-muted-foreground">{getProviderName(connection.provider)}</p>
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between py-1">
                    <span className="text-muted-foreground text-xs font-medium">模型</span>
                    <span className="font-mono text-xs bg-muted/50 px-2 py-0.5 rounded-md">{connection.model}</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-muted-foreground text-xs font-medium">温度</span>
                    <span className="text-sm font-medium">{connection.temperature}</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-muted-foreground text-xs font-medium">最大Token</span>
                    <span className="text-sm font-medium">{connection.maxTokens}</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-muted-foreground text-xs font-medium">状态</span>
                    <span className="flex items-center gap-1.5">
                      {connection.status === "active" ? (
                        <>
                          <CheckCircle className="w-3.5 h-3.5 text-success" />
                          <span className="text-sm text-success font-medium">正常</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3.5 h-3.5 text-destructive" />
                          <span className="text-sm text-destructive font-medium">异常</span>
                        </>
                      )}
                    </span>
                  </div>
                  {connection.baseUrl && (
                    <div className="text-xs text-muted-foreground pt-2 mt-2 border-t border-border/30">
                      <span className="font-medium">自定义端点: </span>
                      <span className="font-mono truncate block bg-muted/50 px-2 py-0.5 rounded-md mt-1">{connection.baseUrl}</span>
                    </div>
                  )}
                </div>

                {canManageConnections && (
                  <div className="flex gap-2 pt-4 border-t border-border/30">
                    {!connection.isDefault && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSetDefault(connection.id)}
                        className="flex-1 rounded-md border-border/50 hover:bg-muted/50 transition-all"
                      >
                        设为默认
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingConnection(connection)
                        setDialogOpen(true)
                      }}
                      className="flex-1 rounded-md border-border/50 hover:bg-muted/50 transition-all"
                    >
                      编辑
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(connection.id)}
                      className="rounded-md border-border/50 text-destructive hover:bg-destructive/10 hover:border-destructive/20 transition-all"
                      aria-label="删除模型"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}

                <div className="text-xs text-muted-foreground mt-4 pt-3 border-t border-border/30">
                  创建于 {new Date(connection.createdAt).toLocaleDateString("zh-CN")}
                </div>
              </Card>
            ))}
          </div>
        )}

        {!canManageConnections && connections.length > 0 && (
          <div className="mt-6 p-4 bg-warning/10 border border-warning/20 rounded-lg">
            <p className="text-sm text-warning-foreground">您没有权限管理模型连接。请联系管理员。</p>
          </div>
        )}
      </div>

      <LLMConnectionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        connection={editingConnection}
        onSave={() => {
          loadConnections()
          setDialogOpen(false)
        }}
      />
    </div>
  )
}
