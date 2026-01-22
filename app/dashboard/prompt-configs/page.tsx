"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Loader2, Edit, FileText, RefreshCw, Sparkles } from "lucide-react"
import { apiClient } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
import { PromptConfigEditor } from "@/components/prompt-config-editor"
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
import { useToast } from "@/hooks/use-toast"

const CATEGORIES = [
  { id: "sql_generation", name: "SQL生成", description: "SQL查询生成相关的提示词" },
  { id: "report_generation", name: "报告生成", description: "数据分析报告生成相关的提示词" },
  { id: "feature_list", name: "功能列表", description: "功能列表生成相关的提示词" },
  { id: "attribution_analysis", name: "归因分析", description: "数据归因分析相关的提示词" },
  { id: "column_translation", name: "列名翻译", description: "列名翻译相关的提示词" },
  { id: "conversation", name: "对话响应", description: "对话响应相关的提示词" },
  { id: "report_agent", name: "报告智能体", description: "报告智能体系统提示词" },
]

export default function PromptConfigsPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [configs, setConfigs] = useState<Record<string, any[]>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [editingConfig, setEditingConfig] = useState<any | null>(null)
  const [activeCategory, setActiveCategory] = useState("sql_generation")
  const [isInitializing, setIsInitializing] = useState(false)
  const [hasInitialized, setHasInitialized] = useState(false)
  const [isOptimizing, setIsOptimizing] = useState(false)

  useEffect(() => {
    if (user?.role !== "admin") {
      setIsLoading(false)
      return
    }
    loadConfigs()
  }, [user])

  // 自动初始化：如果配置为空，自动初始化
  useEffect(() => {
    if (user?.role === "admin" && !isLoading && Object.keys(configs).length === 0 && !hasInitialized && !isInitializing) {
      handleAutoInit()
    }
  }, [configs, isLoading, user, hasInitialized, isInitializing])

  const loadConfigs = async (showError = true) => {
    try {
      setIsLoading(true)
      console.log("[PromptConfigs] Loading configs...")
      
      const data = await apiClient.getPromptConfigs()
      console.log("[PromptConfigs] API response:", data)
      
      // 验证数据格式
      if (!data || typeof data !== 'object') {
        throw new Error("API返回的数据格式不正确: " + JSON.stringify(data))
      }
      
      if (!Array.isArray(data.configs)) {
        console.error("[PromptConfigs] Invalid data format:", data)
        // 尝试从不同的字段获取数据
        if (data.config && Array.isArray(data.config)) {
          console.log("[PromptConfigs] Found configs in 'config' field, using it")
          data.configs = data.config
        } else {
          throw new Error("API返回的configs不是数组格式。实际返回: " + JSON.stringify(data).substring(0, 200))
        }
      }
      
      const grouped: Record<string, any[]> = {}

      for (const config of data.configs) {
        if (!config) {
          console.warn("[PromptConfigs] Null config item, skipping")
          continue
        }
        
        // 更宽松的验证：只要有id或name就接受
        if (!config.category && !config.name) {
          console.warn("[PromptConfigs] Invalid config item (missing category and name):", config)
          continue
        }
        
        // 如果没有category，尝试从name推断或使用默认值
        const category = config.category || "other"
        if (!grouped[category]) {
          grouped[category] = []
        }
        grouped[category].push(config)
      }

      const totalCount = Object.values(grouped).reduce((sum, arr) => sum + arr.length, 0)
      console.log("[PromptConfigs] Grouped configs:", {
        categories: Object.keys(grouped),
        counts: Object.keys(grouped).map(k => ({ category: k, count: grouped[k].length })),
        total: totalCount
      })
      
      setConfigs(grouped)
      
      if (totalCount === 0 && showError) {
        console.warn("[PromptConfigs] No configs loaded, database may be empty")
      }
    } catch (error: any) {
      console.error("[PromptConfigs] Failed to load configs:", error)
      console.error("[PromptConfigs] Error details:", {
        message: error.message,
        stack: error.stack,
        status: error.status,
        statusText: error.statusText,
        details: error.details,
        hint: error.hint,
      })
      
      if (showError) {
        const errorMessage = error.message || "无法加载提示词配置"
        const errorDetails = error.details || error.hint || ""
        const fullMessage = errorDetails ? `${errorMessage}\n详情: ${errorDetails}` : errorMessage
        
        toast({
          title: "加载失败",
          description: fullMessage,
          variant: "destructive",
        })
      }
      
      // 即使加载失败，也设置空数据，避免页面卡住
      setConfigs({})
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async (data: {
    description?: string
    content: string
    variables?: string[]
    isActive?: boolean
  }) => {
    if (!editingConfig?.id) {
      toast({
        title: "保存失败",
        description: "配置ID不存在",
        variant: "destructive",
      })
      return
    }

    try {
      console.log("[PromptConfigs] Saving config:", { id: editingConfig.id, data })
      await apiClient.updatePromptConfig(editingConfig.id, data)
      console.log("[PromptConfigs] Config saved successfully")
      toast({
        title: "更新成功",
        description: "提示词配置已更新并保存到数据库",
      })
      setEditingConfig(null)
      await loadConfigs()
    } catch (error: any) {
      console.error("[PromptConfigs] Save failed:", error)
      console.error("[PromptConfigs] Error details:", {
        message: error.message,
        status: error.status,
        details: error.details,
      })
      
      const errorMessage = error.message || "无法保存提示词配置"
      const errorDetails = error.details || ""
      
      toast({
        title: "保存失败",
        description: errorDetails ? `${errorMessage}\n${errorDetails}` : errorMessage,
        variant: "destructive",
      })
      throw error
    }
  }

  const handleAutoInit = async () => {
    if (hasInitialized || isInitializing) return

    setIsInitializing(true)
    setHasInitialized(true)
    try {
      console.log("[PromptConfigs] Starting auto initialization...")
      const result = await apiClient.initPromptConfigs()
      console.log("[PromptConfigs] Init result:", result)
      
      if (result.created && result.created > 0) {
        toast({
          title: "自动初始化完成",
          description: `已创建 ${result.created} 个默认配置项，现在可以开始编辑了`,
        })
        await loadConfigs()
      } else if (result.count && result.count > 0) {
        // 配置已存在，直接加载（不显示提示，静默加载）
        console.log(`[PromptConfigs] Configs already exist (${result.count}), loading...`)
        await loadConfigs()
      } else {
        // 初始化失败或没有创建任何配置
        console.warn("[PromptConfigs] Init result:", result)
        // 仍然尝试加载，可能配置已经存在
        await loadConfigs()
      }
    } catch (error: any) {
      console.error("[PromptConfigs] Auto init failed:", error)
      console.error("[PromptConfigs] Error details:", {
        message: error.message,
        stack: error.stack,
        status: error.status,
      })
      
      const errorMessage = error.message || "无法自动初始化配置"
      const errorDetails = error.details || error.hint || ""
      
      toast({
        title: "初始化失败",
        description: errorDetails ? `${errorMessage}\n${errorDetails}` : errorMessage,
        variant: "destructive",
      })
      
      // 即使初始化失败，也尝试加载现有配置
      await loadConfigs()
    } finally {
      setIsInitializing(false)
    }
  }

  const handleOptimize = async () => {
    if (isOptimizing) return

    // 确认对话框
    const confirmed = window.confirm(
      "确定要使用AI优化所有提示词吗？\n\n" +
      "优化将：\n" +
      "1. 精简冗余内容，减少Token使用量\n" +
      "2. 优化结构，提升响应速度\n" +
      "3. 保留所有核心功能和规则\n\n" +
      "优化后的提示词将自动保存，版本号会增加。"
    )

    if (!confirmed) return

    setIsOptimizing(true)
    try {
      console.log("[PromptConfigs] Starting optimization...")
      toast({
        title: "开始优化",
        description: "正在使用AI优化所有提示词，请稍候...",
      })

      const result = await apiClient.optimizePromptConfigs()
      console.log("[PromptConfigs] Optimization result:", result)

      // 重新加载配置
      await loadConfigs()

      if (result.optimized > 0) {
        const avgReduction = result.details
          ? result.details
              .filter((d) => d.status === "优化成功")
              .reduce((sum, d) => {
                const reduction = ((d.originalLength - d.optimizedLength) / d.originalLength) * 100
                return sum + reduction
              }, 0) / result.optimized
          : 0

        toast({
          title: "优化完成",
          description: `成功优化 ${result.optimized}/${result.total} 个提示词，平均减少 ${avgReduction.toFixed(1)}% 的Token使用量`,
        })

        // 如果有失败的，显示详细信息
        if (result.failed > 0 && result.errors && result.errors.length > 0) {
          console.warn("[PromptConfigs] Some optimizations failed:", result.errors)
          setTimeout(() => {
            toast({
              title: "部分优化失败",
              description: `${result.failed} 个提示词优化失败，请查看控制台了解详情`,
              variant: "destructive",
            })
          }, 2000)
        }
      } else {
        toast({
          title: "优化失败",
          description: result.errors?.[0] || "未能优化任何提示词",
          variant: "destructive",
        })
      }
    } catch (error: any) {
      console.error("[PromptConfigs] Optimization failed:", error)
      const errorMessage = error.message || "优化提示词失败"
      const errorDetails = error.details || ""

      toast({
        title: "优化失败",
        description: errorDetails ? `${errorMessage}\n${errorDetails}` : errorMessage,
        variant: "destructive",
        duration: 10000,
      })
    } finally {
      setIsOptimizing(false)
    }
  }

  const handleManualInit = async () => {
    setIsInitializing(true)
    setHasInitialized(true) // 标记为已尝试初始化，避免重复
    
    try {
      console.log("[PromptConfigs] Manual initialization starting...")
      toast({
        title: "正在初始化",
        description: "正在创建默认配置项，请稍候...",
      })
      
      const result = await apiClient.initPromptConfigs(true) // force=true 强制重新初始化
      console.log("[PromptConfigs] Manual init result:", result)
      
      // 无论结果如何，都重新加载数据
      await loadConfigs()
      
      if (result.created && result.created > 0) {
        toast({
          title: "初始化成功",
          description: `已创建 ${result.created} 个默认配置项，现在可以开始编辑了`,
        })
      } else if (result.count && result.count > 0) {
        toast({
          title: "配置已存在",
          description: `数据库中已有 ${result.count} 个配置项，已重新加载`,
        })
      } else if (result.skipped && result.skipped > 0) {
        toast({
          title: "初始化完成",
          description: `已跳过 ${result.skipped} 个已存在的配置项`,
        })
      } else {
        toast({
          title: "初始化完成",
          description: result.message || "初始化操作已完成，请检查数据是否已加载",
        })
      }
      
      // 如果初始化成功但数据仍然为空，显示提示
      setTimeout(async () => {
        const currentConfigs = await apiClient.getPromptConfigs().catch(() => ({ configs: [] }))
        if (!currentConfigs.configs || currentConfigs.configs.length === 0) {
          toast({
            title: "数据未加载",
            description: "初始化可能已成功，但数据未正确加载。请刷新页面或检查控制台错误。",
            variant: "destructive",
          })
        }
      }, 1000)
    } catch (error: any) {
      console.error("[PromptConfigs] Manual init failed:", error)
      console.error("[PromptConfigs] Error details:", {
        message: error.message,
        stack: error.stack,
        status: error.status,
        details: error.details,
        hint: error.hint,
      })
      
      const errorMessage = error.message || "无法初始化配置"
      const errorDetails = error.details || error.hint || ""
      const errorCode = error.code || ""
      
      // 构建详细的错误消息
      let fullMessage = errorMessage
      if (errorDetails) {
        fullMessage += `\n\n详情: ${errorDetails}`
      }
      if (errorCode) {
        fullMessage += `\n错误代码: ${errorCode}`
      }
      
      // 根据错误代码提供特定建议
      let suggestion = ""
      if (errorCode === "P2021" || errorMessage.includes("表不存在")) {
        suggestion = "\n\n建议: 请先创建数据库表，运行: node scripts/create-tables.js"
      } else if (errorCode === "P1001" || errorMessage.includes("无法连接")) {
        suggestion = "\n\n建议: 请检查 MySQL 服务是否运行，以及 DATABASE_URL 配置是否正确"
      }
      
      toast({
        title: "初始化失败",
        description: fullMessage + suggestion,
        variant: "destructive",
        duration: 10000, // 显示10秒，让用户有时间阅读
      })
      
      // 即使初始化失败，也尝试加载现有数据
      try {
        await loadConfigs()
      } catch (loadError) {
        console.error("[PromptConfigs] Failed to load configs after init error:", loadError)
      }
    } finally {
      setIsInitializing(false)
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    )
  }

  if (user?.role !== "admin") {
    return (
      <div className="p-6 overflow-y-auto h-full">
        <div className="max-w-4xl mx-auto">
          <Card className="p-8 text-center">
            <h2 className="text-xl font-semibold mb-2">无权限</h2>
            <p className="text-muted">只有管理员可以访问提示词配置</p>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">提示词配置</h1>
            <p className="text-muted mt-1">管理系统中的AI提示词配置，所有配置已从数据库加载，可直接编辑和更新</p>
          </div>
          <div className="flex items-center gap-2">
            {isInitializing && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>正在初始化配置...</span>
              </div>
            )}
            {editingConfig && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>正在编辑: {editingConfig.name}</span>
              </div>
            )}
            {!isInitializing && Object.keys(configs).length === 0 && (
              <Button
                variant="default"
                onClick={handleManualInit}
                disabled={isInitializing}
                className="min-w-[140px]"
              >
                {isInitializing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    初始化中...
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4 mr-2" />
                    初始化配置
                  </>
                )}
              </Button>
            )}
            {!isLoading && Object.keys(configs).length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleManualInit}
                disabled={isInitializing}
                className="min-w-[120px]"
                title="重新初始化将恢复所有提示词为默认值（优化后的版本）"
              >
                {isInitializing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    重置中...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    重置为默认
                  </>
                )}
              </Button>
            )}
            {!isLoading && Object.keys(configs).length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadConfigs(true)}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    加载中...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    刷新数据
                  </>
                )}
              </Button>
            )}
            {!isLoading && Object.keys(configs).length > 0 && (
              <Button
                variant="default"
                size="sm"
                onClick={handleOptimize}
                disabled={isOptimizing || isInitializing}
                className="min-w-[140px]"
                title="使用系统配置的大模型自动优化所有提示词，减少Token使用量并提升响应速度"
              >
                {isOptimizing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    优化中...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    AI优化提示词
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {editingConfig && (
          <PromptConfigEditor
            config={editingConfig}
            onSave={handleSave}
            onCancel={() => setEditingConfig(null)}
          />
        )}

        <Tabs value={activeCategory} onValueChange={setActiveCategory}>
          <TabsList className="grid w-full grid-cols-7">
            {CATEGORIES.map((category) => (
              <TabsTrigger key={category.id} value={category.id}>
                {category.name}
              </TabsTrigger>
            ))}
          </TabsList>

          {CATEGORIES.map((category) => (
            <TabsContent key={category.id} value={category.id} className="space-y-4">
              <Card className="p-6">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold">{category.name}</h3>
                  <p className="text-sm text-muted-foreground">{category.description}</p>
                </div>

                {configs[category.id] && configs[category.id].length > 0 ? (
                  <div className="space-y-3">
                    {configs[category.id].map((config) => (
                      <Card key={config.id} className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-semibold">{config.name}</h4>
                              {config.isActive ? (
                                <Badge variant="default">启用</Badge>
                              ) : (
                                <Badge variant="secondary">禁用</Badge>
                              )}
                              <Badge variant="outline">v{config.version}</Badge>
                            </div>
                            {config.description && (
                              <p className="text-sm text-muted-foreground mb-2">
                                {config.description}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-2">
                              {config.variables && config.variables.length > 0 && (
                                <>
                                  <span className="text-xs text-muted-foreground">变量:</span>
                                  {config.variables.map((variable: string) => (
                                    <Badge key={variable} variant="secondary" className="text-xs">
                                      {"{{" + variable + "}}"}
                                    </Badge>
                                  ))}
                                </>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                              内容长度: {config.content.length} 字符
                            </p>
                          </div>
                          <div className="flex gap-2 ml-4">
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => {
                                console.log("[PromptConfigs] Opening editor for config:", config.id, config.name)
                                setEditingConfig(config)
                              }}
                            >
                              <Edit className="w-4 h-4 mr-2" />
                              编辑
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p className="font-medium mb-2">该分类下暂无配置</p>
                    {isInitializing ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <p className="text-sm">正在初始化配置...</p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-sm">如果这是首次使用，请点击"手动初始化"按钮创建默认配置</p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleManualInit}
                          disabled={isInitializing}
                        >
                          {isInitializing ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              初始化中...
                            </>
                          ) : (
                            <>
                              <FileText className="w-4 h-4 mr-2" />
                              立即初始化
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            </TabsContent>
          ))}
        </Tabs>

      </div>
    </div>
  )
}
