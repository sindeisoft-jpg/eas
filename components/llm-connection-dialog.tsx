"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { useAuth } from "@/lib/auth-context"
import { storage } from "@/lib/storage"
import type { LLMConnection, LLMProvider } from "@/lib/types"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { CheckCircle2, XCircle, Loader2 } from "lucide-react"

interface LLMConnectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  connection?: LLMConnection
  onSave: () => void
}

export function LLMConnectionDialog({ open, onOpenChange, connection, onSave }: LLMConnectionDialogProps) {
  const { user } = useAuth()
  const [formData, setFormData] = useState({
    name: "",
    provider: "openai" as LLMProvider,
    apiKey: "",
    baseUrl: "",
    model: "",
    temperature: 0.7,
    maxTokens: 2000,
  })
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [ollamaModelInfo, setOllamaModelInfo] = useState<Array<{ name: string; size?: number; modifiedAt?: string }>>([])
  const [isLoadingOllamaModels, setIsLoadingOllamaModels] = useState(false)
  const [ollamaModelsError, setOllamaModelsError] = useState<string | null>(null)
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (connection) {
      // 如果apiKey是"***"（占位符），设置为空字符串，让用户重新输入
      const apiKeyValue = connection.apiKey === "***" ? "" : connection.apiKey
      setFormData({
        name: connection.name,
        provider: connection.provider,
        apiKey: apiKeyValue,
        baseUrl: connection.baseUrl || providerBaseUrls[connection.provider as LLMProvider] || "",
        model: connection.model,
        temperature: connection.temperature,
        maxTokens: connection.maxTokens,
      })
      
      // 如果是 Ollama 连接，加载模型列表
      if (connection.provider === "ollama") {
        const baseUrl = connection.baseUrl || providerBaseUrls.ollama
        loadOllamaModels(baseUrl)
      }
    } else {
      setFormData({
        name: "",
        provider: "openai",
        apiKey: "",
        baseUrl: providerBaseUrls.openai, // 默认使用 OpenAI 的端点
        model: "",
        temperature: 0.7,
        maxTokens: 2000,
      })
    }
    // 重置测试结果
    setTestResult(null)
  }, [connection, open])

  // 加载 Ollama 模型列表的函数
  const loadOllamaModels = async (baseUrl: string) => {
    setIsLoadingOllamaModels(true)
    setOllamaModelsError(null)
    try {
      const { apiClient } = await import("@/lib/api-client")
      const result = await apiClient.getOllamaModels(baseUrl)
      if (result.success) {
        setOllamaModels(result.models || [])
        // 如果有模型详细信息，保存它
        if (result.modelInfo && Array.isArray(result.modelInfo)) {
          setOllamaModelInfo(result.modelInfo)
        } else {
          // 如果没有详细信息，创建基本结构
          setOllamaModelInfo((result.models || []).map((name: string) => ({ name })))
        }
        if (result.models.length === 0) {
          setOllamaModelsError("未找到任何模型。请先使用 `ollama pull <model>` 下载模型。")
        }
      } else {
        setOllamaModelsError(result.message || "获取模型列表失败")
        setOllamaModels([])
        setOllamaModelInfo([])
      }
    } catch (error: any) {
      console.error("Failed to fetch Ollama models:", error)
      setOllamaModelsError(error.message || "获取模型列表失败")
      setOllamaModels([])
      setOllamaModelInfo([])
    } finally {
      setIsLoadingOllamaModels(false)
    }
  }

  const handleTestConnection = async () => {
    if (!formData.provider || !formData.model) {
      setTestResult({
        success: false,
        message: "请先填写模型提供商和模型名称",
      })
      return
    }

    // 如果 API Key 是 "***" 或空，且是编辑模式，需要从后端获取真实的 API Key
    let apiKeyToUse = formData.apiKey
    if ((!apiKeyToUse || apiKeyToUse === "***") && connection?.id) {
      try {
        // 从后端获取真实的 API Key（用于测试）
        const { apiClient } = await import("@/lib/api-client")
        const testResult = await apiClient.testLLMConnectionWithId(connection.id, {
          provider: formData.provider,
          model: formData.model,
          baseUrl: formData.baseUrl || undefined,
        })
        setTestResult(testResult)
        setIsTesting(false)
        return
      } catch (error: any) {
        console.error("Test connection error:", error)
        setTestResult({
          success: false,
          message: error.message || "测试连接失败",
        })
        setIsTesting(false)
        return
      }
    }

    if (!apiKeyToUse || apiKeyToUse === "***") {
      setTestResult({
        success: false,
        message: "请先填写 API Key",
      })
      return
    }

    setIsTesting(true)
    setTestResult(null)

    try {
      const { apiClient } = await import("@/lib/api-client")
      const result = await apiClient.testLLMConnection({
        provider: formData.provider,
        model: formData.model,
        apiKey: apiKeyToUse,
        baseUrl: formData.baseUrl || undefined,
      })

      setTestResult(result)
    } catch (error: any) {
      console.error("Test connection error:", error)
      setTestResult({
        success: false,
        message: error.message || "测试连接失败",
      })
    } finally {
      setIsTesting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // 如果是编辑模式且apiKey为空，不发送apiKey字段（让后端保留原有值）
    // 如果是新建模式或apiKey有值，必须发送apiKey
    const newConnection: any = {
      id: connection?.id || `llm_${Date.now()}`,
      name: formData.name,
      provider: formData.provider,
      baseUrl: formData.baseUrl || undefined,
      model: formData.model,
      temperature: formData.temperature,
      maxTokens: formData.maxTokens,
      organizationId: user!.organizationId,
      createdBy: user!.id,
      createdAt: connection?.createdAt || new Date().toISOString(),
      status: "active",
      isDefault: connection?.isDefault || false,
    }
    
    // 只有在新建模式或用户明确输入了apiKey时才包含apiKey
    if (!connection?.id) {
      // 新建模式：必须提供apiKey
      if (!formData.apiKey || formData.apiKey.trim() === "") {
        alert("请填写API密钥")
        return
      }
      newConnection.apiKey = formData.apiKey
    } else {
      // 编辑模式：只有用户输入了新值才发送
      if (formData.apiKey && formData.apiKey.trim() !== "") {
        newConnection.apiKey = formData.apiKey
      }
      // 如果apiKey为空，不包含apiKey字段，后端会保留原有值
    }

    try {
      await storage.llmConnections.save(newConnection)
      onSave()
    } catch (error) {
      console.error("Failed to save LLM connection:", error)
    }
  }

  // 各提供商的默认 API 端点
  const providerBaseUrls: Record<LLMProvider, string> = {
    openai: "https://api.openai.com/v1",
    anthropic: "https://api.anthropic.com/v1",
    google: "https://generativelanguage.googleapis.com/v1beta",
    xai: "https://api.x.ai/v1",
    cohere: "https://api.cohere.ai/v1",
    mistral: "https://api.mistral.ai/v1",
    groq: "https://api.groq.com/openai/v1",
    deepseek: "https://api.deepseek.com/v1",
    baidu: "https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop",
    qwen: "https://dashscope.aliyuncs.com/api/v1",
    hunyuan: "https://hunyuan.tencentcloudapi.com/v1",
    zhipu: "https://open.bigmodel.cn/api/paas/v4",
    moonshot: "https://api.moonshot.cn/v1",
    yi: "https://api.01.ai/v1",
    minimax: "https://api.minimax.chat/v1",
    doubao: "https://ark.cn-beijing.volces.com/api/v3",
    ollama: "http://localhost:11434/v1",
    // 国际模型
    "azure-openai": "https://your-resource.openai.azure.com",
    together: "https://api.together.xyz/v1",
    perplexity: "https://api.perplexity.ai",
    replicate: "https://api.replicate.com/v1",
    huggingface: "https://api-inference.huggingface.co",
    // 国产模型
    baichuan: "https://api.baichuan-ai.com/v1",
    stepfun: "https://api.stepfun.com/v1",
    mianbi: "https://api.mianbi.com/v1",
    langboat: "https://api.langboat.com/v1",
    xverse: "https://api.xverse.cn/v1",
  }

  const providerModels: Record<LLMProvider, string[]> = {
    openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo"],
    anthropic: [
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
      "claude-3-opus-20240229",
      "claude-3-sonnet-20240229",
      "claude-3-haiku-20240307",
    ],
    google: ["gemini-2.0-flash-exp", "gemini-1.5-pro", "gemini-1.5-flash", "gemini-1.0-pro"],
    xai: ["grok-beta", "grok-vision-beta"],
    cohere: ["command-r-plus", "command-r", "command", "command-light"],
    mistral: ["mistral-large-latest", "mistral-medium-latest", "mistral-small-latest", "codestral-latest"],
    groq: [
      "llama-3.3-70b-versatile",
      "llama-3.1-70b-versatile",
      "llama-3.1-8b-instant",
      "mixtral-8x7b-32768",
      "gemma-7b-it",
    ],

    // 国产模型
    deepseek: ["deepseek-chat", "deepseek-coder", "deepseek-reasoner"],
    baidu: ["ernie-4.0-turbo", "ernie-3.5-turbo", "ernie-speed", "ernie-lite"],
    qwen: ["qwen-max", "qwen-plus", "qwen-turbo", "qwen-long", "qwen-vl-plus", "qwen-coder-plus"],
    hunyuan: ["hunyuan-pro", "hunyuan-standard", "hunyuan-lite"],
    zhipu: ["glm-4-plus", "glm-4-air", "glm-4-flash", "glm-4v"],
    moonshot: ["moonshot-v1-128k", "moonshot-v1-32k", "moonshot-v1-8k"],
    yi: ["yi-large", "yi-medium", "yi-spark", "yi-large-turbo"],
    minimax: ["abab6.5-chat", "abab6-chat", "abab5.5-chat"],
    doubao: ["doubao-pro-128k", "doubao-pro-32k", "doubao-lite-128k"],
    // Ollama 模型列表将从服务器动态获取，这里保留空数组作为占位
    ollama: [],
    // 国际模型
    "azure-openai": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo"],
    together: [
      "meta-llama/Llama-3-70b-chat-hf",
      "meta-llama/Llama-3-8b-chat-hf",
      "mistralai/Mixtral-8x7B-Instruct-v0.1",
      "Qwen/Qwen2.5-72B-Instruct",
    ],
    perplexity: ["llama-3.1-sonar-large-128k-online", "llama-3.1-sonar-small-128k-online", "sonar"],
    replicate: ["meta/llama-2-70b-chat", "mistralai/mixtral-8x7b-instruct-v0.1"],
    huggingface: ["meta-llama/Llama-2-70b-chat-hf", "mistralai/Mistral-7B-Instruct-v0.2"],
    // 国产模型
    baichuan: ["Baichuan2-Turbo", "Baichuan2-53B", "Baichuan2-13B"],
    stepfun: ["Step-1-8B", "Step-1-32B", "Step-1-128B"],
    mianbi: ["mianbi-chat", "mianbi-code"],
    langboat: ["langboat-chat", "langboat-code"],
    xverse: ["XVERSE-13B-Chat", "XVERSE-65B-Chat"],
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]" style={{ maxWidth: '680px', width: 'calc(100% - 2rem)' }}>
        <DialogHeader>
          <DialogTitle>{connection ? "编辑模型连接" : "添加模型连接"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4 overflow-y-auto max-h-[calc(90vh-12rem)] pr-2">
            <div>
              <Label htmlFor="name">连接名称</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="例如：主要OpenAI模型"
                required
              />
            </div>

            <div>
              <Label htmlFor="provider">模型提供商</Label>
              <Select
                value={formData.provider}
                onValueChange={async (value: LLMProvider) => {
                  // 自动设置该提供商的默认 API 端点
                  const defaultBaseUrl = providerBaseUrls[value]
                  setFormData({
                    ...formData,
                    provider: value,
                    model: "",
                    baseUrl: defaultBaseUrl, // 自动设置默认 URL
                  })

                  // 如果选择的是 Ollama，动态获取模型列表
                  if (value === "ollama") {
                    setIsLoadingOllamaModels(true)
                    setOllamaModelsError(null)
                    try {
                      const { apiClient } = await import("@/lib/api-client")
                      const result = await apiClient.getOllamaModels(defaultBaseUrl)
                      if (result.success) {
                        setOllamaModels(result.models)
                        if (result.models.length === 0) {
                          setOllamaModelsError("未找到任何模型。请先使用 `ollama pull <model>` 下载模型。")
                        }
                      } else {
                        setOllamaModelsError(result.message || "获取模型列表失败")
                        setOllamaModels([])
                      }
                    } catch (error: any) {
                      console.error("Failed to fetch Ollama models:", error)
                      setOllamaModelsError(error.message || "获取模型列表失败")
                      setOllamaModels([])
                    } finally {
                      setIsLoadingOllamaModels(false)
                    }
                  } else {
                    // 清除 Ollama 相关状态
                    setOllamaModels([])
                    setOllamaModelInfo([])
                    setOllamaModelsError(null)
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[101]">
                  {/* 国际模型 */}
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted">国际模型</div>
                  <SelectItem value="openai">OpenAI (GPT-4, GPT-3.5)</SelectItem>
                  <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                  <SelectItem value="google">Google (Gemini)</SelectItem>
                  <SelectItem value="xai">xAI (Grok)</SelectItem>
                  <SelectItem value="cohere">Cohere (Command)</SelectItem>
                  <SelectItem value="mistral">Mistral AI</SelectItem>
                  <SelectItem value="groq">Groq (快速推理)</SelectItem>
                  <SelectItem value="azure-openai">Azure OpenAI</SelectItem>
                  <SelectItem value="together">Together AI</SelectItem>
                  <SelectItem value="perplexity">Perplexity</SelectItem>
                  <SelectItem value="replicate">Replicate</SelectItem>
                  <SelectItem value="huggingface">Hugging Face</SelectItem>

                  {/* 国产模型 */}
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted border-t mt-2 pt-2">国产模型</div>
                  <SelectItem value="deepseek">DeepSeek (深度求索)</SelectItem>
                  <SelectItem value="qwen">阿里云通义千问</SelectItem>
                  <SelectItem value="baidu">百度文心一言</SelectItem>
                  <SelectItem value="hunyuan">腾讯混元</SelectItem>
                  <SelectItem value="zhipu">智谱AI (ChatGLM)</SelectItem>
                  <SelectItem value="moonshot">月之暗面 (Kimi)</SelectItem>
                  <SelectItem value="yi">零一万物 (Yi)</SelectItem>
                  <SelectItem value="minimax">MiniMax</SelectItem>
                  <SelectItem value="doubao">字节豆包</SelectItem>
                  <SelectItem value="baichuan">百川智能 (Baichuan)</SelectItem>
                  <SelectItem value="stepfun">阶跃星辰 (StepFun)</SelectItem>
                  <SelectItem value="mianbi">面壁智能</SelectItem>
                  <SelectItem value="langboat">澜舟科技 (Langboat)</SelectItem>
                  <SelectItem value="xverse">元象科技 (XVERSE)</SelectItem>

                  {/* 本地模型 */}
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted border-t mt-2 pt-2">本地模型</div>
                  <SelectItem value="ollama">Ollama (本地部署)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="model">模型</Label>
              <Select value={formData.model} onValueChange={(value) => setFormData({ ...formData, model: value })}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择模型" />
                </SelectTrigger>
                <SelectContent className="z-[101]">
                  {formData.provider === "ollama" ? (
                    isLoadingOllamaModels ? (
                      <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                        <Loader2 className="w-4 h-4 animate-spin inline-block mr-2" />
                        正在加载模型列表...
                      </div>
                    ) : ollamaModelsError ? (
                      <div className="px-2 py-4 text-sm text-red-600 dark:text-red-400">
                        {ollamaModelsError}
                      </div>
                    ) : ollamaModels.length === 0 ? (
                      <div className="px-2 py-4 text-sm text-muted-foreground">
                        未找到模型。请先使用 <code>ollama pull &lt;model&gt;</code> 下载模型。
                      </div>
                    ) : (
                      ollamaModels.map((model) => {
                        const modelInfo = ollamaModelInfo.find((m) => m.name === model)
                        const sizeStr = modelInfo?.size
                          ? modelInfo.size >= 1024 * 1024 * 1024
                            ? `${(modelInfo.size / (1024 * 1024 * 1024)).toFixed(2)} GB`
                            : modelInfo.size >= 1024 * 1024
                            ? `${(modelInfo.size / (1024 * 1024)).toFixed(2)} MB`
                            : `${(modelInfo.size / 1024).toFixed(2)} KB`
                          : null
                        return (
                          <SelectItem key={model} value={model}>
                            <div className="flex items-center justify-between w-full">
                              <span>{model}</span>
                              {sizeStr && (
                                <span className="text-xs text-muted-foreground ml-2">{sizeStr}</span>
                              )}
                            </div>
                          </SelectItem>
                        )
                      })
                    )
                  ) : (
                    providerModels[formData.provider].map((model) => (
                      <SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {formData.provider === "ollama" && !isLoadingOllamaModels && ollamaModels.length > 0 && (
                <div className="text-xs text-muted mt-1 space-y-1">
                  <p>已找到 {ollamaModels.length} 个模型</p>
                  {ollamaModelInfo.some((m) => m.size) && (
                    <p className="text-muted-foreground/80">
                      总大小:{" "}
                      {(() => {
                        const totalSize = ollamaModelInfo.reduce((sum, m) => sum + (m.size || 0), 0)
                        return totalSize >= 1024 * 1024 * 1024
                          ? `${(totalSize / (1024 * 1024 * 1024)).toFixed(2)} GB`
                          : totalSize >= 1024 * 1024
                          ? `${(totalSize / (1024 * 1024)).toFixed(2)} MB`
                          : `${(totalSize / 1024).toFixed(2)} KB`
                      })()}
                    </p>
                  )}
                </div>
              )}
              {formData.provider === "ollama" && ollamaModelsError && (
                <div className="text-xs text-red-600 dark:text-red-400 mt-1 space-y-1">
                  <p className="font-medium">连接失败：</p>
                  <p>{ollamaModelsError}</p>
                  <p className="text-muted-foreground mt-2">
                    <strong>解决方案：</strong>
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-0.5 ml-2">
                    <li>确保 Ollama 服务正在运行（默认地址：http://localhost:11434）</li>
                    <li>检查 API 端点 URL 是否正确</li>
                    <li>如果使用远程 Ollama，请确保网络连接正常</li>
                    <li>使用 <code className="bg-muted px-1 rounded">ollama pull &lt;model&gt;</code> 下载模型</li>
                  </ul>
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="apiKey">API密钥</Label>
              <Input
                id="apiKey"
                type="password"
                value={formData.apiKey}
                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                placeholder={formData.provider === "ollama" ? "可选（Ollama 通常不需要 API Key）" : "sk-..."}
                required={formData.provider !== "ollama"}
              />
              <p className="text-xs text-muted mt-1">
                {formData.provider === "ollama"
                  ? "Ollama 本地部署通常不需要 API Key，可留空"
                  : "您的API密钥将被安全存储"}
              </p>
            </div>

            <div>
              <Label htmlFor="baseUrl">API端点</Label>
              <div className="flex gap-2">
                <Input
                  id="baseUrl"
                  value={formData.baseUrl}
                  onChange={(e) => {
                    const newBaseUrl = e.target.value
                    setFormData({ ...formData, baseUrl: newBaseUrl })
                    // 如果是 Ollama 且 baseUrl 改变，延迟自动刷新模型列表
                    if (formData.provider === "ollama" && newBaseUrl) {
                      // 清除之前的timeout
                      if (refreshTimeoutRef.current) {
                        clearTimeout(refreshTimeoutRef.current)
                      }
                      // 使用防抖，避免频繁请求
                      refreshTimeoutRef.current = setTimeout(() => {
                        loadOllamaModels(newBaseUrl)
                      }, 1000)
                    }
                  }}
                  placeholder="将根据提供商自动设置"
                />
                {formData.provider === "ollama" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => loadOllamaModels(formData.baseUrl || providerBaseUrls.ollama)}
                    disabled={isLoadingOllamaModels}
                    className="whitespace-nowrap"
                  >
                    {isLoadingOllamaModels ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin mr-1" />
                        加载中
                      </>
                    ) : (
                      "刷新模型"
                    )}
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted mt-1">
                已自动设置为 <code className="text-xs bg-muted px-1 py-0.5 rounded">{providerBaseUrls[formData.provider]}</code>，如需使用自定义端点可手动修改
                {formData.provider === "ollama" && (
                  <span>（修改后会自动刷新模型列表，或点击「刷新模型」按钮手动刷新）</span>
                )}
              </p>
            </div>

            <div>
              <Label htmlFor="temperature">温度: {formData.temperature}</Label>
              <Slider
                id="temperature"
                min={0}
                max={2}
                step={0.1}
                value={[formData.temperature]}
                onValueChange={([value]) => setFormData({ ...formData, temperature: value })}
                className="mt-2"
              />
              <p className="text-xs text-muted mt-1">控制输出的随机性。较高的值使输出更随机，较低的值更确定。</p>
            </div>

            <div>
              <Label htmlFor="maxTokens">最大Token数</Label>
              <Input
                id="maxTokens"
                type="number"
                value={formData.maxTokens}
                onChange={(e) => setFormData({ ...formData, maxTokens: Number.parseInt(e.target.value) })}
                min={100}
                max={32000}
                required
              />
              <p className="text-xs text-muted mt-1">生成响应的最大token数量</p>
            </div>

            {/* 测试连接区域 */}
            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label>测试连接</Label>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={isTesting || !formData.provider || !formData.model || !formData.apiKey}
                  className="min-w-[100px]"
                >
                  {isTesting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      测试中...
                    </>
                  ) : (
                    "测试连接"
                  )}
                </Button>
              </div>

              {testResult && (
                <div
                  className={`flex items-start gap-2 p-3 rounded-md ${
                    testResult.success
                      ? "bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800"
                      : "bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800"
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                  )}
                  <div className="flex-1">
                    <p
                      className={`text-sm font-medium ${
                        testResult.success
                          ? "text-green-800 dark:text-green-200"
                          : "text-red-800 dark:text-red-200"
                      }`}
                    >
                      {testResult.message}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit">保存</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
