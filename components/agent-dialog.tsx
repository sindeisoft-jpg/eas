"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { storage } from "@/lib/storage"
import type { Agent, AgentTool, AgentMemory, AgentWorkflow, AgentExecution, LLMConnection, DatabaseConnection, SQLToolConfig } from "@/lib/types"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Card } from "@/components/ui/card"
import { Plus, Trash2, X, Code, FileText, Play, Loader2, CheckCircle2, XCircle, Info, Sparkles } from "lucide-react"
import { translateColumnName } from "@/lib/utils"

interface AgentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  agent?: Agent
  onSave: () => void
}

export function AgentDialog({ open, onOpenChange, agent, onSave }: AgentDialogProps) {
  const { user } = useAuth()
  const [llmConnections, setLlmConnections] = useState<LLMConnection[]>([])
  const [dbConnections, setDbConnections] = useState<DatabaseConnection[]>([])
  const [testingTools, setTestingTools] = useState<Record<string, { loading: boolean; result: any; error: string | null }>>({})
  const [formData, setFormData] = useState({
    name: "",
    description: "",
          systemMessage: `# 角色
你是一个专业的数据库查询助手和数据分析专家。你的任务是理解用户的需求，生成准确的SQL查询，执行查询并基于实际数据回答用户问题。

# 核心能力

## 1. 需求理解
- 仔细分析用户的问题和需求
- 识别查询类型（单表查询、多表关联、聚合统计、时间序列分析等）
- 确定需要查询的表和字段
- 理解用户意图（列表、统计、对比、趋势等）

## 2. SQL查询生成
- **必须根据数据库结构生成SQL查询**，不要假设字段存在
- 只使用数据库结构中存在的表和字段
- 确保SQL语法正确，符合数据库类型（{{databaseType}}）
- 支持复杂的多表关联查询
- 支持聚合函数（COUNT, SUM, AVG, MAX, MIN等）
- 支持时间维度分析（按日、周、月、季度、年）
- **绝对禁止查询密码相关字段**（password, pwd, passwd, secret, token等）

## 3. 查询执行
- **必须使用工具执行SQL查询**，不要只提供SQL建议
- 用户需要的是**实际数据**，不是SQL示例
- 分析查询结果，提取关键信息
- 基于实际数据回答用户问题

# 数据库信息

数据库类型: {{databaseType}}
数据库名称: {{databaseName}}

## 可用表结构
{{databaseSchema}}

# SQL生成规则

## 1. 字段使用规则（必须严格遵守）
- **只能使用数据库结构中存在的表和字段**
- 不要假设字段存在，必须根据提供的数据库结构来生成SQL
- 如果数据库结构中没有相关信息，明确告知用户
- 字段名必须与数据库结构中的完全一致（注意大小写）

## 2. SQL语法规则
- 只生成SELECT查询，不要生成增删改操作
- 使用正确的数据库语法（{{databaseType}}）
- 表名和字段名使用反引号包裹（如果包含特殊字符）
- 字符串常量使用单引号包裹
- 日期时间函数根据数据库类型使用（MySQL: DATE_FORMAT, PostgreSQL: TO_CHAR等）

## 3. 安全规则
- **绝对禁止查询密码相关字段**：
  - 不要查询任何包含 "password"、"pwd"、"passwd"、"pass"、"secret"、"token" 等关键词的字段
  - 不要查询中文密码字段（如"密码"、"口令"、"密钥"等）
  - 如果使用 SELECT *，系统会自动过滤密码字段，但建议明确指定需要的字段，避免 SELECT *
  - 如果 SQL 中包含密码字段，工具会拒绝执行并报错

## 4. 查询优化建议
- 对于大数据量查询，考虑添加适当的WHERE条件
- 使用索引字段进行过滤和排序
- 避免不必要的子查询
- 合理使用JOIN，避免笛卡尔积

# 工作流程

## 步骤1：理解需求
1. 仔细阅读用户问题
2. 识别查询类型和所需数据
3. 确定需要查询的表和字段
4. 检查数据库结构，确认表和字段存在

## 步骤2：生成SQL查询
1. 根据数据库结构生成SQL查询
2. 确保字段名正确（与数据库结构中的完全一致）
3. 检查SQL语法是否正确
4. 确保不包含密码相关字段

## 步骤3：执行查询（必须）
1. **立即调用工具执行SQL查询**（不要只提供SQL建议）
2. 等待工具返回查询结果
3. 如果查询失败，分析错误原因并修正SQL
4. 重新调用工具执行修正后的SQL（最多重试2-3次）

## 步骤4：分析结果并回答
1. 分析查询结果，提取关键信息
2. 基于实际数据回答用户问题
3. 如果结果为空，明确告知用户
4. 提供清晰、准确的答案

# 工具使用规则（必须遵守）

## 1. 必须使用工具执行查询
- **绝对不要**只提供SQL建议而不执行
- **必须**调用工具来实际执行SQL查询
- 用户需要的是**实际数据**，不是SQL示例

## 2. 工具调用流程
1. 分析用户需求，确定需要查询的数据
2. **立即调用工具**执行SQL查询（不要只提供SQL建议）
3. 根据数据库结构生成正确的SQL语句
4. **调用工具执行查询**（这是必须的步骤）
5. 分析工具返回的结果
6. **基于实际查询结果回答用户问题**

## 3. 错误处理
- **如果工具执行失败，不要放弃！**
- 仔细阅读错误信息，分析失败原因
- 常见原因：
  - SQL 语法错误：检查SQL语句是否符合数据库语法
  - 表名或字段名不存在：检查数据库结构，使用正确的名称
  - 数据库连接问题：这通常是系统问题，可以告知用户
- **根据错误信息修正SQL后，可以再次调用工具**（最多重试2-3次）
- 如果多次尝试都失败，向用户说明情况并提供建议

## 4. 回答格式要求
- 工具执行成功后，**直接使用查询结果回答用户问题**
- 不要只说"可以这样查询"，而要**实际执行查询并给出结果**
- 例如：用户问"有多少销售人员"，应该调用工具查询后回答"我们共有 X 名销售人员"

# 示例对比

**❌ 错误做法**：
用户："我们有多少销售人员？"
回答："可以这样查询：SELECT COUNT(*) FROM users WHERE role = 'sales'"

**✅ 正确做法**：
用户："我们有多少销售人员？"
1. 调用工具：execute_sql_query({sql: "SELECT COUNT(*) as count FROM users WHERE role = 'sales'"})
2. 工具返回：{count: 15}
3. 回答："我们共有 15 名销售人员"

# 注意事项

1. **字段验证**：只使用数据库结构中存在的表和字段，不要假设字段存在
2. **SQL安全**：只生成SELECT查询，不要生成增删改操作
3. **必须执行**：必须使用工具执行查询，不要只提供SQL建议
4. **错误处理**：如果查询失败，分析错误原因并修正SQL，最多重试2-3次
5. **数据准确性**：确保SQL查询逻辑正确，基于实际数据回答，不要编造数据
6. **密码字段**：绝对禁止查询密码相关字段，如果SQL中包含密码字段，工具会拒绝执行`,
          systemMessageMode: "expression" as "fixed" | "expression",
    llmConnectionId: "",
    databaseConnectionId: "",
    tools: [] as AgentTool[],
    memory: {
      type: "simple" as "simple" | "vector" | "none",
      enabled: true,
      maxHistory: 10,
      config: {},
    } as AgentMemory,
    workflow: {
      nodes: [],
      edges: [],
    } as AgentWorkflow,
    execution: {
      timeout: 30,
      maxRetries: 3,
      retryDelay: 1,
      concurrency: 1,
      enableLogging: true,
    } as AgentExecution,
    status: "active" as "active" | "inactive" | "error",
    isDefault: false,
  })

  useEffect(() => {
    if (open) {
      loadConnections()
      if (agent) {
        // 确保工具配置格式正确（只保留SQL查询工具）
        const normalizedTools = (agent.tools || [])
          .filter((tool: AgentTool) => tool.type === "sql_query") // 只保留SQL查询工具
          .map((tool: AgentTool) => {
            if (!tool.config || typeof tool.config !== "object" || !("sql" in tool.config)) {
              // 如果 SQL 工具配置不完整，初始化默认配置
              return {
                ...tool,
                type: "sql_query" as const,
                config: {
                  sql: "",
                  operation: "SELECT" as const,
                } as SQLToolConfig,
              }
            }
            // 确保operation字段存在，如果不存在则设置默认值
            const toolConfig = tool.config as SQLToolConfig
            const validOperations: Array<"SELECT" | "INSERT" | "UPDATE" | "DELETE" | "CUSTOM"> = ["SELECT", "INSERT", "UPDATE", "DELETE", "CUSTOM"]
            const operation = toolConfig.operation && validOperations.includes(toolConfig.operation) 
              ? toolConfig.operation 
              : "SELECT"
            
            return {
              ...tool,
              type: "sql_query" as const, // 确保类型为sql_query
              config: {
                ...toolConfig,
                operation: operation, // 确保operation字段存在
              } as SQLToolConfig,
            }
          })
        
        setFormData({
          name: agent.name,
          description: agent.description || "",
          systemMessage: agent.systemMessage,
          systemMessageMode: ((agent as any).systemMessageMode || "fixed") as "fixed" | "expression",
          llmConnectionId: agent.llmConnectionId,
          databaseConnectionId: agent.databaseConnectionId || "",
          tools: normalizedTools,
          memory: agent.memory || {
            type: "simple",
            enabled: true,
            maxHistory: 10,
            config: {},
          },
          workflow: agent.workflow || { nodes: [], edges: [] },
          execution: agent.execution || {
            timeout: 30,
            maxRetries: 3,
            retryDelay: 1,
            concurrency: 1,
            enableLogging: true,
          },
          status: agent.status || "active",
          isDefault: agent.isDefault || false,
        })
      } else {
        setFormData({
          name: "",
          description: "",
          systemMessage: "你是一个有用的AI助手。",
          llmConnectionId: "",
          databaseConnectionId: "",
          tools: [],
          memory: {
            type: "simple",
            enabled: true,
            maxHistory: 10,
            config: {},
          },
          workflow: {
            nodes: [],
            edges: [],
          },
          execution: {
            timeout: 30,
            maxRetries: 3,
            retryDelay: 1,
            concurrency: 1,
            enableLogging: true,
          },
          status: "active",
          isDefault: false,
        })
      }
    }
  }, [agent, open])

  const loadConnections = async () => {
    try {
      const [llmData, dbData] = await Promise.all([
        storage.llmConnections.getAll(),
        storage.dbConnections.getAll(),
      ])
      setLlmConnections(llmData.filter((c) => c.organizationId === user?.organizationId))
      setDbConnections(dbData.filter((c) => c.organizationId === user?.organizationId))
    } catch (error) {
      console.error("Failed to load connections:", error)
    }
  }

  const handleAddTool = () => {
    const newTool: AgentTool = {
      id: `tool_${Date.now()}`,
      type: "sql_query",
      name: "",
      description: "",
      config: {
        sql: "",
        operation: "SELECT" as const,
      } as SQLToolConfig,
      enabled: true,
    }
    setFormData({
      ...formData,
      tools: [...formData.tools, newTool],
    })
  }

  const handleRemoveTool = (toolId: string) => {
    setFormData({
      ...formData,
      tools: formData.tools.filter((t) => t.id !== toolId),
    })
  }

  const handleUpdateTool = (toolId: string, updates: Partial<AgentTool>) => {
    setFormData({
      ...formData,
      tools: formData.tools.map((t) => {
        if (t.id === toolId) {
          return { ...t, ...updates }
        }
        return t
      }),
    })
  }

  const handleUpdateToolConfig = (toolId: string, configUpdates: Partial<SQLToolConfig>) => {
    setFormData({
      ...formData,
      tools: formData.tools.map((t) => {
        if (t.id === toolId && t.type === "sql_query") {
          const currentConfig = t.config as SQLToolConfig
          // 确保operation字段始终存在，如果更新中没有提供，则保留现有值或使用默认值
          const validOperations: Array<"SELECT" | "INSERT" | "UPDATE" | "DELETE" | "CUSTOM"> = ["SELECT", "INSERT", "UPDATE", "DELETE", "CUSTOM"]
          const operation = configUpdates.operation && validOperations.includes(configUpdates.operation)
            ? configUpdates.operation
            : (currentConfig?.operation && validOperations.includes(currentConfig.operation))
              ? currentConfig.operation
              : "SELECT"
          
          return {
            ...t,
            config: {
              ...currentConfig,
              ...configUpdates,
              operation: operation, // 确保operation字段始终存在且有效
            } as SQLToolConfig,
          }
        }
        return t
      }),
    })
  }

  const handleTestTool = async (toolId: string) => {
    const tool = formData.tools.find((t) => t.id === toolId)
    if (!tool || tool.type !== "sql_query") return

    const sql = (tool.config as SQLToolConfig)?.sql
    if (!sql || !sql.trim()) {
      alert("请先输入SQL语句")
      return
    }

    // 确定使用的数据库连接
    const dbConnectionId = formData.databaseConnectionId
    if (!dbConnectionId) {
      alert("请先选择数据库连接")
      return
    }

    // 设置测试状态为loading
    setTestingTools((prev) => ({
      ...prev,
      [toolId]: { loading: true, result: null, error: null },
    }))

    try {
      const { apiClient } = await import("@/lib/api-client")
      const response = await apiClient.queryDatabase(dbConnectionId, sql)
      
      setTestingTools((prev) => ({
        ...prev,
        [toolId]: { loading: false, result: response.result, error: null },
      }))
    } catch (error: any) {
      setTestingTools((prev) => ({
        ...prev,
        [toolId]: {
          loading: false,
          result: null,
          error: error.message || error.error || "测试失败",
        },
      }))
    }
  }

  /**
   * 验证智能体配置
   */
  const validateAgentConfig = (): { valid: boolean; errors: string[]; suggestions: string[] } => {
    const errors: string[] = []
    const suggestions: string[] = []

    // 验证系统提示词
    if (!formData.systemMessage || formData.systemMessage.trim().length === 0) {
      errors.push("系统提示词不能为空")
    } else if (formData.systemMessage.trim().length < 50) {
      suggestions.push("系统提示词过短（少于50字符），建议提供更详细的角色定义和执行规则")
    } else {
      // 检查是否包含关键信息
      const systemMessage = formData.systemMessage.toLowerCase()
      const hasRole = systemMessage.includes("角色") || systemMessage.includes("role") || systemMessage.includes("你是")
      const hasRules = systemMessage.includes("规则") || systemMessage.includes("rule") || systemMessage.includes("必须") || systemMessage.includes("禁止")
      const hasSteps = systemMessage.includes("步骤") || systemMessage.includes("step") || systemMessage.includes("流程")
      
      if (!hasRole) {
        suggestions.push("系统提示词中建议包含角色定义（例如：你是一个专业的数据库查询助手）")
      }
      if (!hasRules) {
        suggestions.push("系统提示词中建议包含执行规则（例如：必须使用工具执行查询、禁止查询密码字段等）")
      }
      if (!hasSteps && formData.systemMessageMode === "expression") {
        suggestions.push("系统提示词中建议包含执行步骤（例如：理解需求、生成SQL、执行查询、分析结果）")
      }
    }

    // 验证工具配置
    const enabledTools = formData.tools.filter(t => t.enabled)
    if (enabledTools.length === 0) {
      suggestions.push("建议至少启用一个工具，否则智能体将无法执行查询")
    }

    // 验证每个启用的工具
    enabledTools.forEach((tool, index) => {
      if (!tool.name || tool.name.trim().length === 0) {
        errors.push(`工具 ${index + 1} 的名称不能为空`)
      }

      // 验证工具描述
      if (!tool.description || tool.description.trim().length === 0) {
        suggestions.push(`工具 "${tool.name || `工具 ${index + 1}`}" 的描述为空，建议提供详细描述以便 LLM 正确选择工具`)
      } else if (tool.description.trim().length < 20) {
        suggestions.push(`工具 "${tool.name || `工具 ${index + 1}`}" 的描述过短（少于20字符），建议提供更详细的描述（包含功能、使用场景、参数说明）`)
      } else {
        // 检查描述是否包含关键信息
        const description = tool.description.toLowerCase()
        const hasFunction = description.includes("执行") || description.includes("查询") || description.includes("获取") || description.includes("功能")
        const hasUsage = description.includes("场景") || description.includes("用于") || description.includes("适用") || description.includes("参数")
        
        if (!hasFunction) {
          suggestions.push(`工具 "${tool.name || `工具 ${index + 1}`}" 的描述中建议说明工具的具体功能`)
        }
        if (!hasUsage && tool.type === "sql_query") {
          suggestions.push(`工具 "${tool.name || `工具 ${index + 1}`}" 的描述中建议说明使用场景和参数（例如：执行SQL查询，参数：sql）`)
        }
      }

      // 验证 SQL 工具配置
      if (tool.type === "sql_query") {
        const config = tool.config as SQLToolConfig
        if (!config.sql || config.sql.trim().length === 0) {
          errors.push(`工具 "${tool.name || `工具 ${index + 1}`}" 的 SQL 语句不能为空`)
        }
      }
    })

    // 验证 LLM 连接
    if (!formData.llmConnectionId) {
      errors.push("必须选择 LLM 连接")
    }

    // 验证数据库连接（如果有工具需要数据库）
    const needsDatabase = enabledTools.some(t => t.type === "sql_query")
    if (needsDatabase && !formData.databaseConnectionId) {
      suggestions.push("如果使用 SQL 查询工具，建议配置数据库连接以确保智能体能够获取数据库结构信息")
    }

    return {
      valid: errors.length === 0,
      errors,
      suggestions,
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // 验证配置
    const validation = validateAgentConfig()
    
    if (!validation.valid) {
      alert(`配置验证失败：\n${validation.errors.join("\n")}`)
      return
    }

    // 如果有建议，显示给用户（但不阻止保存）
    if (validation.suggestions.length > 0) {
      const shouldContinue = confirm(
        `配置优化建议：\n${validation.suggestions.join("\n")}\n\n是否继续保存？`
      )
      if (!shouldContinue) {
        return
      }
    }

    // 确保所有工具的config都包含operation字段
    const normalizedToolsForSave = formData.tools.map((tool) => {
      if (tool.type === "sql_query") {
        const toolConfig = tool.config as SQLToolConfig
        const validOperations: Array<"SELECT" | "INSERT" | "UPDATE" | "DELETE" | "CUSTOM"> = ["SELECT", "INSERT", "UPDATE", "DELETE", "CUSTOM"]
        const operation = toolConfig?.operation && validOperations.includes(toolConfig.operation)
          ? toolConfig.operation
          : "SELECT"
        
        return {
          ...tool,
          config: {
            ...toolConfig,
            operation: operation, // 确保operation字段存在
          } as SQLToolConfig,
        }
      }
      return tool
    })

    const newAgent: Agent & { systemMessageMode?: "fixed" | "expression" } = {
      id: agent?.id || `agent_${Date.now()}`,
      name: formData.name,
      description: formData.description || undefined,
      systemMessage: formData.systemMessage,
      systemMessageMode: formData.systemMessageMode,
      llmConnectionId: formData.llmConnectionId,
      databaseConnectionId: formData.databaseConnectionId || undefined,
      tools: normalizedToolsForSave, // 使用规范化后的tools
      memory: formData.memory,
      workflow: formData.workflow,
      execution: formData.execution,
      organizationId: user!.organizationId,
      createdBy: user!.id,
      createdAt: agent?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: formData.status,
      isDefault: formData.isDefault,
    }

    try {
      await storage.agents.save(newAgent)
      onSave()
    } catch (error) {
      console.error("Failed to save agent:", error)
      alert("保存智能体失败")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="agent-dialog-content max-h-[90vh]" 
        style={{ maxWidth: '680px', width: 'calc(100% - 2rem)' }}
      >
        <DialogHeader>
          <DialogTitle>{agent ? "编辑智能体" : "创建智能体"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="overflow-y-auto max-h-[calc(90vh-12rem)] pr-2">
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="basic">基本信息</TabsTrigger>
              <TabsTrigger value="llm">模型配置</TabsTrigger>
              <TabsTrigger value="tools">SQL查询配置</TabsTrigger>
              <TabsTrigger value="memory">记忆配置</TabsTrigger>
              <TabsTrigger value="execution">执行设置</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4">
              <div>
                <Label htmlFor="name">智能体名称</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="例如：数据分析助手"
                  required
                />
              </div>

              <div>
                <Label htmlFor="description">描述</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="智能体的功能描述"
                  rows={3}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="systemMessage">系统消息</Label>
                    {formData.tools && formData.tools.some(t => t.enabled) && (
                      <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded-md text-xs">
                        <Sparkles className="w-3 h-3" />
                        <span>Function Calling 模式</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant={formData.systemMessageMode === "fixed" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFormData({ ...formData, systemMessageMode: "fixed" })}
                    >
                      <FileText className="w-4 h-4 mr-1" />
                      固定值
                    </Button>
                    <Button
                      type="button"
                      variant={formData.systemMessageMode === "expression" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFormData({ ...formData, systemMessageMode: "expression" })}
                    >
                      <Code className="w-4 h-4 mr-1" />
                      表达式
                    </Button>
                  </div>
                </div>
                <Textarea
                  id="systemMessage"
                  value={formData.systemMessage}
                  onChange={(e) => setFormData({ ...formData, systemMessage: e.target.value })}
                  placeholder={
                    formData.systemMessageMode === "expression"
                      ? `例如：
# 角色
作为MySQL数据库查询助手，你需要按以下步骤执行，并回答问题。

# 执行步骤
1. 根据问题和数据库结构进行查询
问题是: {{userInput}}
数据库结构是:
{{databaseSchema}}

2. 根据查询结果回答问题`
                      : "定义智能体的角色和行为指令"
                  }
                  rows={formData.systemMessageMode === "expression" ? 12 : 6}
                  className={formData.systemMessageMode === "expression" ? "font-mono text-sm" : ""}
                  required
                />
                {formData.systemMessageMode === "expression" ? (
                  <div className="mt-2 p-3 bg-muted rounded-lg">
                    <p className="text-xs font-semibold mb-2">可用的模板变量：</p>
                    <div className="space-y-1 text-xs">
                      <div>
                        <code className="bg-background px-1.5 py-0.5 rounded">{`{{userInput}}`}</code>
                        <span className="ml-2 text-muted-foreground">- 用户的问题/输入</span>
                      </div>
                      <div>
                        <code className="bg-background px-1.5 py-0.5 rounded">{`{{databaseSchema}}`}</code>
                        <span className="ml-2 text-muted-foreground">- 数据库结构（JSON格式）</span>
                      </div>
                      <div>
                        <code className="bg-background px-1.5 py-0.5 rounded">{`{{databaseName}}`}</code>
                        <span className="ml-2 text-muted-foreground">- 数据库名称</span>
                      </div>
                      <div>
                        <code className="bg-background px-1.5 py-0.5 rounded">{`{{databaseType}}`}</code>
                        <span className="ml-2 text-muted-foreground">- 数据库类型（MySQL/PostgreSQL等）</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      系统消息用于指导智能体的行为，描述它的角色、能力和工作方式
                    </p>
                    {formData.tools && formData.tools.some(t => t.enabled) && (
                      <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                        <div className="flex items-start gap-2">
                          <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                          <div className="space-y-1.5 text-xs text-blue-800 dark:text-blue-200">
                            <p className="font-semibold">Function Calling 模式提示：</p>
                            <ul className="list-disc list-inside space-y-1 ml-2">
                              <li>系统会自动添加工具列表和使用说明</li>
                              <li>建议在系统消息中说明 Agent 的角色和如何使用工具</li>
                              <li>可以说明工具的使用场景和注意事项</li>
                              <li>建议提供工具使用的示例</li>
                            </ul>
                            <div className="mt-2 pt-2 border-t border-blue-200 dark:border-blue-700">
                              <p className="font-semibold mb-1">推荐模板：</p>
                              <button
                                type="button"
                                onClick={() => {
                                  const template = `# 角色
你是一个专业的数据库查询助手，可以帮助用户查询和分析数据。

# 核心能力
1. 理解用户的数据查询需求
2. 使用工具执行SQL查询获取数据
3. 分析查询结果并回答用户问题

# 工具使用规则
- 根据用户需求选择合适的工具
- 如果工具执行失败，分析错误原因并尝试其他方法
- 可以多次调用工具来完成复杂任务
- 工具执行结果会自动提供给你，无需手动处理

# 工作流程
1. 分析用户问题，确定需要查询的数据
2. 选择合适的工具执行查询
3. 分析查询结果
4. 生成清晰、准确的回答

# 注意事项
- 只使用可用的工具，不要假设工具存在
- 如果工具执行失败，向用户说明原因
- 确保回答基于实际的查询结果，不要编造数据`
                                  setFormData({ ...formData, systemMessage: template })
                                }}
                                className="text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                使用 Function Calling 模板
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <Label htmlFor="status">状态</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value: "active" | "inactive" | "error") =>
                    setFormData({ ...formData, status: value })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[101]">
                    <SelectItem value="active">运行中</SelectItem>
                    <SelectItem value="inactive">已停用</SelectItem>
                    <SelectItem value="error">错误</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    id="isDefault"
                    type="checkbox"
                    checked={formData.isDefault}
                    onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                    className="w-4 h-4 rounded border-border"
                  />
                  <Label htmlFor="isDefault" className="cursor-pointer">
                    设为默认智能体
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">默认智能体将在对话页面自动被选中</p>
              </div>
            </TabsContent>

            <TabsContent value="llm" className="space-y-4">
              <div>
                <Label htmlFor="llmConnectionId">LLM连接</Label>
                <Select
                  value={formData.llmConnectionId}
                  onValueChange={(value) => setFormData({ ...formData, llmConnectionId: value })}
                  required
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="选择LLM连接" />
                  </SelectTrigger>
                  <SelectContent className="z-[101]">
                    {llmConnections.map((conn) => (
                      <SelectItem key={conn.id} value={conn.id}>
                        {conn.name} ({conn.model})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="databaseConnectionId">数据库连接（可选）</Label>
                <Select
                  value={formData.databaseConnectionId || "__none__"}
                  onValueChange={(value) => {
                    setFormData({
                      ...formData,
                      databaseConnectionId: value === "__none__" ? "" : value,
                    })
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="选择数据库连接（可选）" />
                  </SelectTrigger>
                  <SelectContent className="z-[101]">
                    <SelectItem value="__none__">无</SelectItem>
                    {dbConnections.map((conn) => (
                      <SelectItem key={conn.id} value={conn.id}>
                        {conn.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  如果智能体需要访问数据库，请选择相应的数据库连接
                </p>
              </div>
            </TabsContent>

            <TabsContent value="tools" className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label>工具配置</Label>
                  {formData.tools && formData.tools.some(t => t.enabled) && (
                    <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded-md text-xs">
                      <Sparkles className="w-3 h-3" />
                      <span>Function Calling 模式</span>
                    </div>
                  )}
                </div>
                <Button type="button" onClick={handleAddTool} variant="outline" size="sm" className="gap-2">
                  <Plus className="w-4 h-4" />
                  添加工具
                </Button>
              </div>
              
              {formData.tools && formData.tools.some(t => t.enabled) && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="space-y-1 text-xs text-blue-800 dark:text-blue-200">
                      <p className="font-semibold">Function Calling 模式提示：</p>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li><strong>工具名称</strong>：简洁明了，LLM 会根据名称选择工具</li>
                        <li><strong>工具描述</strong>：详细说明工具的功能和使用场景，帮助 LLM 正确选择</li>
                        <li><strong>工具描述很重要</strong>：LLM 主要根据描述来判断是否使用该工具</li>
                        <li>建议在描述中包含：工具用途、适用场景、参数说明</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {formData.tools.length === 0 ? (
                <Card className="p-8 text-center border-dashed">
                  <p className="text-sm text-muted-foreground">还没有配置SQL查询</p>
                  <p className="text-xs text-muted-foreground mt-1">点击上方按钮添加SQL查询</p>
                </Card>
              ) : (
                <div className="space-y-4">
                  {formData.tools.map((tool) => (
                    <Card key={tool.id} className="p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={tool.enabled}
                            onCheckedChange={(checked) => handleUpdateTool(tool.id, { enabled: checked })}
                          />
                          <Label>启用</Label>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveTool(tool.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>

                      <div>
                        <Label>SQL查询名称</Label>
                        <Input
                          value={tool.name}
                          onChange={(e) => handleUpdateTool(tool.id, { name: e.target.value })}
                          placeholder="例如：获取数据库结构"
                        />
                      </div>

                      <div>
                        <Label>工具描述 *</Label>
                        <Textarea
                          value={tool.description}
                          onChange={(e) => handleUpdateTool(tool.id, { description: e.target.value })}
                          placeholder={tool.enabled ? "详细描述工具的功能、使用场景和参数说明（LLM会根据此描述选择工具）" : "描述工具的功能和用途"}
                          rows={3}
                          className={tool.enabled ? "border-blue-300 dark:border-blue-700" : ""}
                        />
                        {tool.enabled && (
                          <div className="mt-1.5 p-2 bg-blue-50 dark:bg-blue-950 rounded text-xs text-blue-800 dark:text-blue-200">
                            <p className="font-semibold mb-1">💡 Function Calling 提示：</p>
                            <p className="text-xs">工具描述非常重要！LLM 主要根据描述来判断是否使用该工具。建议包含：</p>
                            <ul className="list-disc list-inside ml-2 mt-1 space-y-0.5">
                              <li>工具的具体功能</li>
                              <li>适用场景和用例</li>
                              <li>参数说明（如果有）</li>
                            </ul>
                            <p className="mt-1.5 text-xs italic">示例："执行SQL查询获取数据。适用于需要从数据库查询信息的场景。参数：sql（SQL查询语句，仅支持SELECT），limit（可选，返回结果数量限制）"</p>
                          </div>
                        )}
                        {!tool.enabled && (
                          <p className="text-xs text-muted-foreground mt-1">
                            描述工具的功能和用途
                          </p>
                        )}
                      </div>

                      <div>
                        <Label htmlFor={`operation-${tool.id}`}>操作类型</Label>
                        <Select
                          value={(tool.config as SQLToolConfig)?.operation || "SELECT"}
                          onValueChange={(value: "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "CUSTOM") =>
                            handleUpdateToolConfig(tool.id, { operation: value })
                          }
                        >
                          <SelectTrigger id={`operation-${tool.id}`} className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="z-[101]">
                            <SelectItem value="SELECT">查（SELECT）</SelectItem>
                            <SelectItem value="INSERT">增（INSERT）</SelectItem>
                            <SelectItem value="UPDATE">改（UPDATE）</SelectItem>
                            <SelectItem value="DELETE">删（DELETE）</SelectItem>
                            <SelectItem value="CUSTOM">自定义（CUSTOM）</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground mt-1">
                          选择SQL操作类型：查（查询）、增（插入）、改（更新）、删（删除）
                        </p>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <Label htmlFor={`sql-${tool.id}`}>SQL 语句</Label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleTestTool(tool.id)}
                            disabled={testingTools[tool.id]?.loading || !(tool.config as SQLToolConfig)?.sql?.trim() || !formData.databaseConnectionId}
                            className="gap-2"
                          >
                            {testingTools[tool.id]?.loading ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                测试中...
                              </>
                            ) : (
                              <>
                                <Play className="w-4 h-4" />
                                测试
                              </>
                            )}
                          </Button>
                        </div>
                        <Textarea
                          id={`sql-${tool.id}`}
                          value={(tool.config as SQLToolConfig)?.sql || ""}
                          onChange={(e) => handleUpdateToolConfig(tool.id, { sql: e.target.value })}
                          placeholder="输入 SQL 语句，例如：SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '数据库名'"
                          rows={8}
                          className="font-mono text-sm"
                          required
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          提示：此SQL语句用于获取数据库结构。建议使用information_schema查询表结构和列信息。
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          示例：<code className="bg-muted px-1 rounded">SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'your_database'</code>
                        </p>
                        
                        {/* 测试结果展示 */}
                        {testingTools[tool.id] && !testingTools[tool.id].loading && (
                          <div className="mt-3 p-3 rounded-lg border">
                            {testingTools[tool.id].error ? (
                              <div className="flex items-start gap-2 text-red-600 dark:text-red-400">
                                <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                                <div className="flex-1">
                                  <p className="font-semibold text-sm mb-1">测试失败</p>
                                  <p className="text-xs">{testingTools[tool.id].error}</p>
                                </div>
                              </div>
                            ) : testingTools[tool.id].result ? (
                              <div className="space-y-2">
                                <div className="flex items-start gap-2 text-green-600 dark:text-green-400">
                                  <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
                                  <div className="flex-1">
                                    <p className="font-semibold text-sm">测试成功</p>
                                  </div>
                                </div>
                                {testingTools[tool.id].result.rows && (
                                  <div className="mt-2">
                                    <p className="text-xs text-muted-foreground mb-1">
                                      返回 {testingTools[tool.id].result.rows.length} 行数据
                                      {testingTools[tool.id].result.columns && (
                                        <span className="ml-2">，{testingTools[tool.id].result.columns.length} 列</span>
                                      )}
                                    </p>
                                    {testingTools[tool.id].result.columns && (
                                      <p className="text-xs text-muted-foreground mb-2">
                                        列：{testingTools[tool.id].result.columns.join(", ")}
                                      </p>
                                    )}
                                    {testingTools[tool.id].result.rows.length > 0 && (
                                      <div className="mt-2 max-h-96 overflow-auto rounded-lg border border-border/50 shadow-lg bg-background">
                                        <table className="w-full text-xs">
                                          <thead className="sticky top-0 z-10 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-b-2 border-primary/20">
                                            <tr>
                                              {testingTools[tool.id].result.columns?.map((col: string, idx: number) => (
                                                <th key={idx} className="text-left p-3 font-semibold text-foreground first:rounded-tl-lg last:rounded-tr-lg">
                                                  <div className="flex items-center gap-2">
                                                    <div className="w-1 h-3 bg-primary/40 rounded-full"></div>
                                                    <span>{translateColumnName(col)}</span>
                                                  </div>
                                                </th>
                                              ))}
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {testingTools[tool.id].result.rows.map((row: any, rowIdx: number) => (
                                              <tr 
                                                key={rowIdx} 
                                                className={`border-b border-border/30 transition-all duration-200 ${
                                                  rowIdx % 2 === 0 
                                                    ? "bg-background hover:bg-primary/5" 
                                                    : "bg-muted/30 hover:bg-primary/10"
                                                }`}
                                              >
                                                {testingTools[tool.id].result.columns?.map((col: string, colIdx: number) => (
                                                  <td key={colIdx} className="p-3 text-foreground">
                                                    <div className="max-w-xs truncate" title={String(row[col] || "")}>
                                                      <span className="text-foreground/90">{String(row[col] ?? "")}</span>
                                                    </div>
                                                  </td>
                                                ))}
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="memory" className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>启用记忆</Label>
                <Switch
                  checked={formData.memory.enabled}
                  onCheckedChange={(checked) =>
                    setFormData({
                      ...formData,
                      memory: { ...formData.memory, enabled: checked },
                    })
                  }
                />
              </div>

              {formData.memory.enabled && (
                <>
                  <div>
                    <Label htmlFor="memoryType">记忆类型</Label>
                    <Select
                      value={formData.memory.type}
                      onValueChange={(value: "simple" | "vector" | "none") =>
                        setFormData({
                          ...formData,
                          memory: { ...formData.memory, type: value },
                        })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="z-[101]">
                        <SelectItem value="simple">简单记忆</SelectItem>
                        <SelectItem value="vector">向量记忆</SelectItem>
                        <SelectItem value="none">无记忆</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {formData.memory.type === "simple" && (
                    <div>
                      <Label htmlFor="maxHistory">最大历史记录数</Label>
                      <Input
                        id="maxHistory"
                        type="number"
                        value={formData.memory.maxHistory || 10}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            memory: { ...formData.memory, maxHistory: parseInt(e.target.value) || 10 },
                          })
                        }
                        min={1}
                        max={100}
                      />
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="execution" className="space-y-4">
              <div>
                <Label htmlFor="timeout">超时时间（秒）</Label>
                <Input
                  id="timeout"
                  type="number"
                  value={formData.execution.timeout}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      execution: { ...formData.execution, timeout: parseInt(e.target.value) || 30 },
                    })
                  }
                  min={1}
                  max={300}
                />
              </div>

              <div>
                <Label htmlFor="maxRetries">最大重试次数</Label>
                <Input
                  id="maxRetries"
                  type="number"
                  value={formData.execution.maxRetries}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      execution: { ...formData.execution, maxRetries: parseInt(e.target.value) || 3 },
                    })
                  }
                  min={0}
                  max={10}
                />
              </div>

              <div>
                <Label htmlFor="retryDelay">重试延迟（秒）</Label>
                <Input
                  id="retryDelay"
                  type="number"
                  value={formData.execution.retryDelay}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      execution: { ...formData.execution, retryDelay: parseInt(e.target.value) || 1 },
                    })
                  }
                  min={0}
                  max={60}
                />
              </div>

              <div>
                <Label htmlFor="concurrency">并发执行数</Label>
                <Input
                  id="concurrency"
                  type="number"
                  value={formData.execution.concurrency}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      execution: { ...formData.execution, concurrency: parseInt(e.target.value) || 1 },
                    })
                  }
                  min={1}
                  max={10}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label>启用日志记录</Label>
                <Switch
                  checked={formData.execution.enableLogging}
                  onCheckedChange={(checked) =>
                    setFormData({
                      ...formData,
                      execution: { ...formData.execution, enableLogging: checked },
                    })
                  }
                />
              </div>
            </TabsContent>
          </Tabs>
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
