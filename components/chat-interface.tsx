"use client"

import type React from "react"

import { useState, useRef, useEffect, useMemo, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Send, Bot, User, Loader2, Database, Code, TrendingUp, Save, Plus, MessageSquare, Trash2, Search, MoreVertical, Edit, Pin, Eye, EyeOff, Eraser, Sparkles, ChevronDown, ChevronUp, FileText, RotateCw, Copy, Pencil, Check, HelpCircle, BarChart3, Grid3x3 } from "lucide-react"
import { LoadingSpinner } from "@/components/ui/spinner"
import type { DatabaseConnection, LLMConnection, LLMConfig, QueryResult, ChatMessage, ChatSession, Agent } from "@/lib/types"
import { inferChartType } from "@/lib/demo-data"
import { parseLLMResponse } from "@/lib/json-parser"
import { findMatchingColumn, mapVisualizationFields } from "@/lib/field-mapper"
import { ensureVisualization, validateAndFixVisualization, generateVisualizationFromQueryResult } from "@/lib/visualization-helper"
import { storage } from "@/lib/storage"
import { ChartDialog } from "./chart-dialog"
import { ChartRenderer } from "./chart-renderer"
import { AIReportViewer } from "./ai-report-viewer"
import { ScrollArea } from "@/components/ui/scroll-area"
import { QueryStepsDisplay, type QueryStep } from "./query-steps-display"
import { formatNumber, formatQuerySummary, parseWorkProcess } from "@/lib/number-formatter"
import { translateColumnName } from "@/lib/utils"
import { TypingEffect } from "./typing-effect"
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "@/components/ui/use-toast"
import { DataTable, createColumnsFromQueryResult } from "./data-table"
import { MessageActions } from "./message-actions"
import { LoadingSkeletonEnhanced } from "./loading-skeleton-enhanced"
import { ChartDrilldown } from "./chart-drilldown"
import { ShortcutsHelp } from "./shortcuts-help"
import { EnhancedInput } from "./enhanced-input"
import { ReportPreviewCard } from "./report-preview-card"
import { ReportGenerationConfirm } from "./report-generation-confirm"
import { IntentAnalyzer } from "@/lib/intent-analyzer"
import { ChatHelpDialog } from "./chat-help-dialog"
import { detectJSONData, isChartableJSON, extractAllJSONData } from "@/lib/json-data-detector"
import { inferChartTypeFromJSON, createChartConfig } from "@/lib/chart-type-inferrer"
import { EChartsRenderer } from "./echarts-renderer"
import { EChartsTableRenderer } from "./echarts-table-renderer"
import { parseCommand } from "@/lib/command-parser"

interface Message {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  workProcess?: string[]
  intent?: any
  timestamp?: string
  currentStep?: string
  stepMessage?: string
  metadata?: {
    queryResult?: QueryResult
    firstQueryResult?: QueryResult
    chartConfig?: any
    attributionAnalysis?: any
    aiReport?: any
  }
}

interface ChatInterfaceProps {
  connections: DatabaseConnection[]
  llmConnections?: LLMConnection[]
  agents?: Agent[]
  userId: string
  organizationId: string
  onSaveReport?: (sql: string, result: QueryResult, title: string) => void
}

/**
 * 从消息ID中提取时间戳
 * ID格式: msg_${timestamp}_role
 */
function extractTimestampFromId(id: string): number | null {
  const match = id.match(/msg_(\d+)_/)
  return match ? parseInt(match[1], 10) : null
}

/**
 * 对消息数组进行排序，确保按正确的时间顺序显示
 * 使用多层排序确保稳定性：
 * 1. 优先按时间戳排序（最重要）
 * 2. 时间戳相同时，从ID中提取时间戳作为辅助排序
 * 3. ID时间戳也相同时，按角色排序（user在前，assistant在后）
 * 4. 最后使用ID字符串排序确保完全稳定
 * 
 * 这个函数确保即使时间戳相同或非常接近，消息顺序也能保持稳定
 */
function sortMessages(messages: Message[]): Message[] {
  return [...messages].sort((a, b) => {
    // 第一优先级：按时间戳排序（最重要）
    const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0
    const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0
    
    // 如果时间戳不同，直接返回时间差
    if (timeA !== timeB) {
      return timeA - timeB
    }
    
    // 第二优先级：如果时间戳相同，尝试从ID中提取时间戳
    // ID格式: msg_${sessionId}_${timestamp}_${random}_${role}
    const idTimeA = extractTimestampFromId(a.id) || 0
    const idTimeB = extractTimestampFromId(b.id) || 0
    
    if (idTimeA !== idTimeB) {
      return idTimeA - idTimeB
    }
    
    // 第三优先级：如果ID时间戳也相同，按角色排序（user在前，assistant在后）
    // 这确保了用户消息总是出现在对应的助手消息之前
    if (a.role === "user" && b.role === "assistant") return -1
    if (a.role === "assistant" && b.role === "user") return 1
    
    // 第四优先级：最后使用ID字符串排序确保完全稳定（即使所有条件都相同）
    // 这保证了排序的完全确定性
    return a.id.localeCompare(b.id)
  })
}

/**
 * 对会话列表进行排序，确保顺序稳定
 */
function sortSessions(sessions: ChatSession[]): ChatSession[] {
  return [...sessions].sort((a, b) => {
    // 置顶的会话始终在最前面
    if (a.isPinned && !b.isPinned) return -1
    if (!a.isPinned && b.isPinned) return 1
    // 如果都置顶或都不置顶，按更新时间排序
    const timeDiff = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    // 如果更新时间相同，使用ID作为辅助排序键，确保顺序稳定
    if (timeDiff === 0) {
      return a.id.localeCompare(b.id)
    }
    return timeDiff
  })
}

/**
 * 生成唯一的消息ID，包含会话ID确保不同会话的消息不会冲突
 */
function generateMessageId(sessionId: string, role: string): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 11) // 9位随机字符串
  // 清理sessionId中的特殊字符，避免在ID中造成问题
  const cleanSessionId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_')
  return `msg_${cleanSessionId}_${timestamp}_${random}_${role}`
}

/**
 * 验证消息是否属于指定会话
 */
function isMessageForSession(messageId: string, sessionId: string): boolean {
  // 检查消息ID是否包含会话ID
  const cleanSessionId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_')
  return messageId.includes(cleanSessionId)
}

export function ChatInterface({ connections, llmConnections = [], agents = [], userId, organizationId, onSaveReport }: ChatInterfaceProps) {
  const PLACEHOLDER_ASSISTANT_MESSAGE = "正在处理您的请求..."
  const getUnifiedLoadingText = (executing: boolean) =>
    `正在处理您的请求，${executing ? "执行查询中..." : "思考中..."}`

  // 自动选择默认数据库：优先选择isDefault为true的，否则选择第一个连接
  const defaultConnection = useMemo(() => 
    connections.find((c) => c.isDefault) || connections[0],
    [connections]
  )
  const [selectedConnection, setSelectedConnection] = useState<string>(defaultConnection?.id || "")
  
  // 自动选择默认智能体：优先选择isDefault为true的，否则选择第一个激活的智能体
  const defaultAgent = useMemo(() => 
    agents.find((a) => a.isDefault && a.status === "active") || 
    agents.find((a) => a.status === "active"),
    [agents]
  )
  const [selectedAgentId, setSelectedAgentId] = useState<string>(defaultAgent?.id || "")
  
  // 从配置的模型中选择默认模型，或使用第一个可用模型
  const defaultModel = useMemo(() => 
    llmConnections.find((m) => m.isDefault) || llmConnections[0],
    [llmConnections]
  )
  const [llmConfig, setLlmConfig] = useState<LLMConfig>({
    provider: defaultModel?.provider || "openai",
    model: defaultModel?.model || "gpt-4o-mini",
    temperature: defaultModel?.temperature || 0.3,
    maxTokens: defaultModel?.maxTokens || 2000,
  })

  // 获取选中的智能体 - 使用 useMemo 优化
  const selectedAgent = useMemo(() => 
    agents.find((a) => a.id === selectedAgentId),
    [agents, selectedAgentId]
  )
  
  // 获取智能体绑定的数据库连接 - 使用 useMemo 优化
  const agentDatabase = useMemo(() => 
    selectedAgent?.databaseConnectionId
      ? connections.find((conn) => conn.id === selectedAgent.databaseConnectionId)
      : null,
    [selectedAgent, connections]
  )

  // 获取有效的数据库连接ID：优先使用智能体的数据库，否则使用手动选择的 - 使用 useCallback 优化
  const getEffectiveDatabaseId = useCallback(() => {
    return (selectedAgent && agentDatabase) ? agentDatabase.id : selectedConnection
  }, [selectedAgent, agentDatabase, selectedConnection])

  // 当选择智能体时，自动设置 LLM 连接和数据库连接
  useEffect(() => {
    if (selectedAgent) {
      // 设置 LLM 连接
      const agentLLM = llmConnections.find((llm) => llm.id === selectedAgent.llmConnectionId)
      if (agentLLM) {
        setLlmConfig((prev) => {
          // 只有当配置真正改变时才更新，避免不必要的重渲染
          if (
            prev.provider === agentLLM.provider &&
            prev.model === agentLLM.model &&
            prev.temperature === agentLLM.temperature &&
            prev.maxTokens === agentLLM.maxTokens
          ) {
            return prev
          }
          return {
            provider: agentLLM.provider,
            model: agentLLM.model,
            temperature: agentLLM.temperature,
            maxTokens: agentLLM.maxTokens,
          }
        })
      }

      // 设置数据库连接（如果智能体配置了）
      if (selectedAgent.databaseConnectionId) {
        const agentDB = connections.find((conn) => conn.id === selectedAgent.databaseConnectionId)
        if (agentDB && selectedConnection !== selectedAgent.databaseConnectionId) {
          setSelectedConnection(selectedAgent.databaseConnectionId)
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgentId, selectedAgent?.llmConnectionId, selectedAgent?.databaseConnectionId, llmConnections, connections])

  // 当智能体列表更新时，自动选择默认智能体（如果当前没有选中）
  useEffect(() => {
    if (agents.length > 0 && !selectedAgentId) {
      const defaultAgent = agents.find((a) => a.isDefault && a.status === "active") || 
                           agents.find((a) => a.status === "active")
      if (defaultAgent) {
        setSelectedAgentId(defaultAgent.id)
      }
    }
  }, [agents, selectedAgentId])

  // 当数据库连接列表更新时，自动选择默认数据库（如果当前没有选中且智能体没有绑定数据库）
  useEffect(() => {
    if (connections.length > 0 && !selectedConnection && !selectedAgent?.databaseConnectionId) {
      const defaultConn = connections.find((c) => c.isDefault) || connections[0]
      if (defaultConn) {
        setSelectedConnection(defaultConn.id)
      }
    }
  }, [connections, selectedConnection, selectedAgent?.databaseConnectionId])

  // 当智能体列表更新时，如果当前选中的智能体还在，更新相关状态
  useEffect(() => {
    if (selectedAgentId && agents.length > 0) {
      const updatedAgent = agents.find((a) => a.id === selectedAgentId)
      if (updatedAgent && updatedAgent.databaseConnectionId && updatedAgent.databaseConnectionId !== selectedAgent?.databaseConnectionId) {
        // 智能体的数据库连接已更新，更新本地状态
        const updatedAgentDB = connections.find((conn) => conn.id === updatedAgent.databaseConnectionId)
        if (updatedAgentDB && updatedAgent.databaseConnectionId) {
          setSelectedConnection(updatedAgent.databaseConnectionId)
        }
      }
    }
  }, [agents, selectedAgentId, connections, selectedAgent])
  // 多会话状态管理：为每个会话维护独立的状态
  // sessionId -> { messages, queryResults, firstQueryResults, isLoading, isExecuting }
  type SessionState = {
    messages: Message[]
    queryResults: Record<string, QueryResult>
    firstQueryResults: Record<string, QueryResult>
    isLoading: boolean
    isExecuting: boolean
  }
  
  const [sessionStates, setSessionStates] = useState<Record<string, SessionState>>({})
  
  // 获取或创建会话状态（优化：使用useCallback，但依赖sessionStates）
  const getSessionState = useCallback((sessionId: string): SessionState => {
    if (!sessionStates[sessionId]) {
      return {
        messages: [],
        queryResults: {},
        firstQueryResults: {},
        isLoading: false,
        isExecuting: false,
      }
    }
    return sessionStates[sessionId]
  }, [sessionStates])
  
  // 更新会话状态
  const updateSessionState = useCallback((sessionId: string, updater: (state: SessionState) => SessionState) => {
    setSessionStates(prev => {
      const currentState = prev[sessionId] || {
        messages: [],
        queryResults: {},
        firstQueryResults: {},
        isLoading: false,
        isExecuting: false,
      }
      return {
        ...prev,
        [sessionId]: updater(currentState),
      }
    })
  }, [])
  
  // 跟踪每个会话的加载和执行状态（用于显示指示器）
  const [sessionLoadingStates, setSessionLoadingStates] = useState<Record<string, { isLoading: boolean; isExecuting: boolean }>>({})
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  // 尝试从 localStorage 恢复上次的会话ID，如果没有则使用临时ID
  const getInitialSessionId = () => {
    if (typeof window !== "undefined") {
      const savedSessionId = localStorage.getItem("currentChatSessionId")
      if (savedSessionId && !savedSessionId.startsWith("session_")) {
        // 如果是真实ID，使用它
        return savedSessionId
      }
    }
    return `session_${Date.now()}`
  }
  const [currentSessionId, setCurrentSessionId] = useState(getInitialSessionId())
  
  // 当 currentSessionId 改变时，保存到 localStorage
  useEffect(() => {
    if (currentSessionId && !currentSessionId.startsWith("session_")) {
      // 只保存真实ID，不保存临时ID
      if (typeof window !== "undefined") {
        localStorage.setItem("currentChatSessionId", currentSessionId)
      }
    }
  }, [currentSessionId])
  // 用于跟踪所有正在进行的请求的会话ID（支持多会话并发）
  const loadingSessionIdsRef = useRef<Set<string>>(new Set())
  const executingSessionIdsRef = useRef<Set<string>>(new Set())
  // 跟踪正在创建中的会话ID（临时ID -> 真实ID的映射）
  const creatingSessionsRef = useRef<Map<string, string>>(new Map())
  // 跟踪新创建的会话ID及其创建时间（用于保护期机制）
  const newSessionsRef = useRef<Map<string, number>>(new Map())
  // 跟踪最近请求失败的会话ID（用于防抖，避免频繁请求不存在的会话）
  const failedSessionIdsRef = useRef<Set<string>>(new Set())
  // 跟踪已经加载过消息的会话ID（避免重复加载）
  const loadedSessionIdsRef = useRef<Set<string>>(new Set())
  const [chartDialogOpen, setChartDialogOpen] = useState(false)
  const [selectedMessageForChart, setSelectedMessageForChart] = useState<string>("")
  
  // 修改消息对话框
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingMessage, setEditingMessage] = useState<Message | null>(null)
  const [editMessageContent, setEditMessageContent] = useState("")
  
  // SSE 连接管理
  const sseEventSourceRef = useRef<EventSource | null>(null)
  const sseReconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // 当前会话的状态（从sessionStates中获取）
  const currentSessionState = useMemo(() => getSessionState(currentSessionId), [currentSessionId, getSessionState])
  const messages = currentSessionState.messages
  
  // 开发环境：记录当前会话的消息状态
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Chat] Current session ${currentSessionId} messages:`, {
        messageCount: messages.length,
        messages: messages.map(m => ({
          id: m.id,
          role: m.role,
          contentLength: m.content?.length || 0,
          contentPreview: m.content?.substring(0, 50) || "empty",
        }))
      })
    }
  }, [currentSessionId, messages])
  const queryResults = currentSessionState.queryResults
  const firstQueryResults = currentSessionState.firstQueryResults
  const isLoading = currentSessionState.isLoading
  const isExecuting = currentSessionState.isExecuting
  const hasPlaceholderAssistantMessage = messages.some(
    (m) => m.role === "assistant" && m.content === PLACEHOLDER_ASSISTANT_MESSAGE
  )
  
  const [input, setInput] = useState("")
  
  // 图表钻取状态
  const [drilldownState, setDrilldownState] = useState<{
    messageId: string
    chartConfig: any
    queryResult: QueryResult
  } | null>(null)
  
  // 快捷键帮助对话框
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  
  // 帮助对话框状态
  const [helpDialogOpen, setHelpDialogOpen] = useState(false)
  
  // 快捷键监听
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘/ 或 Ctrl+/ 显示快捷键帮助
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault()
        setShortcutsOpen(true)
      }
    }
    
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [])
  
  // 用户界面设置：是否显示 SQL 详细信息（全局）
  const [showSqlDetails, setShowSqlDetails] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("chat_show_sql_details")
      return saved !== null ? saved === "true" : true // 默认显示
    }
    return true
  })

  // 每条消息的详细信息显示状态（messageId -> 是否显示）
  const [messageDetailsVisible, setMessageDetailsVisible] = useState<Record<string, boolean>>({})
  
  // 执行流程折叠状态（默认折叠）
  const [expandedWorkProcess, setExpandedWorkProcess] = useState<Record<string, boolean>>({})
  
  // 复制按钮状态（messageId -> 是否已复制），用于显示勾号
  const [copiedMessages, setCopiedMessages] = useState<Record<string, boolean>>({})
  
  // 报表展开状态（messageId -> 是否展开）
  const [expandedReports, setExpandedReports] = useState<Record<string, boolean>>({})
  
  // 报表弹窗状态（messageId -> 是否打开弹窗）
  const [reportModalOpen, setReportModalOpen] = useState<Record<string, boolean>>({})
  
  // 报表生成确认对话框状态
  const [reportConfirmOpen, setReportConfirmOpen] = useState(false)
  const [pendingReportQuestion, setPendingReportQuestion] = useState<string>("")
  const [pendingReportType, setPendingReportType] = useState<string>("custom")
  
  // 已删除折叠功能：消息内容始终展开显示

  // 监听设置变化事件
  useEffect(() => {
    const handleSettingsChange = (event: CustomEvent) => {
      if (event.detail?.showSqlDetails !== undefined) {
        setShowSqlDetails(event.detail.showSqlDetails)
      }
    }
    
    if (typeof window !== "undefined") {
      window.addEventListener("chatSettingsChanged", handleSettingsChange as EventListener)
      return () => {
        window.removeEventListener("chatSettingsChanged", handleSettingsChange as EventListener)
      }
    }
  }, [])
  
  // 历史会话相关状态
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [isLoadingSessions, setIsLoadingSessions] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null)
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [sessionToRename, setSessionToRename] = useState<string | null>(null)
  const [newSessionTitle, setNewSessionTitle] = useState("")
  const [clearAllDialogOpen, setClearAllDialogOpen] = useState(false)
  const [isClearingAll, setIsClearingAll] = useState(false)
  const [lastClearTime, setLastClearTime] = useState<number | null>(null) // 记录最后一次清空的时间
  const [searchQuery, setSearchQuery] = useState("")
  const [isCreatingSession, setIsCreatingSession] = useState(false)
  
  // 左侧边栏宽度（可拖动调整）- 默认300px
  const [sidebarWidth, setSidebarWidth] = useState(300) // 默认300px
  const [isResizing, setIsResizing] = useState(false)

  // 如果选择了智能体，使用智能体的数据库连接；否则使用手动选择的连接 - 使用 useMemo 优化
  const connection = useMemo(() => {
    if (selectedAgent && agentDatabase) {
      return agentDatabase
    }
    return connections.find((c) => c.id === selectedConnection)
  }, [selectedAgent, agentDatabase, connections, selectedConnection])

  // 检查消息中是否包含图表相关的关键词
  const hasChartKeywords = (content: string): boolean => {
    if (!content) return false
    const lowerContent = content.toLowerCase()
    
    // 图表相关的动作词（必须与图表相关）
    const chartActionKeywords = [
      "生成图表", "创建图表", "制作图表", "分析图表",
      "画图表", "绘制图表", "展示图表", "显示图表",
      "生成柱状图", "生成折线图", "生成饼图", "生成面积图",
      "创建柱状图", "创建折线图", "创建饼图", "创建面积图",
      "制作柱状图", "制作折线图", "制作饼图", "制作面积图",
      "分析柱状图", "分析折线图", "分析饼图", "分析面积图",
      "数据可视化", "可视化数据", "可视化展示",
      "生成chart", "创建chart", "制作chart", "分析chart",
      "generate chart", "create chart", "make chart", "analyze chart",
      "visualize", "visualization",
      // 添加更多变体
      "生成一个图表", "创建一个图表", "制作一个图表",
      "生成图表来", "创建图表来", "制作图表来",
      "生成图表用于", "创建图表用于", "制作图表用于",
      "用图表", "用图表来", "用图表展示", "用图表显示",
      "展现", "展示", "显示", "呈现", "描绘",
      // 添加分析类关键词
      "做分析", "进行分析", "分析一下", "分析", "分析数据",
      "数据分析", "数据对比", "数据比较", "趋势分析",
      "对比", "比较", "变化", "趋势", "走势",
      "analyze", "analysis", "compare", "comparison", "trend",
      // 添加时间序列关键词
      "按月", "按年", "按季度", "按周", "按日",
      "分别", "各", "各个", "每个", "每月", "每年",
      "monthly", "yearly", "quarterly", "weekly", "daily",
      "by month", "by year", "by quarter", "per month", "per year"
    ]
    
    // 检查是否包含图表相关的动作词
    const hasDirectKeyword = chartActionKeywords.some(keyword => lowerContent.includes(keyword.toLowerCase()))
    
    // 如果直接匹配到关键词，直接返回
    if (hasDirectKeyword) return true
    
    // 额外的智能匹配：如果包含"图表"+"展现/展示/显示"等词，也认为是图表需求
    const chartWord = ["图表", "chart", "图"]
    const actionWords = ["展现", "展示", "显示", "呈现", "描绘", "用于", "来"]
    
    const hasChartWord = chartWord.some(word => lowerContent.includes(word))
    const hasActionWord = actionWords.some(word => lowerContent.includes(word))
    
    // 如果同时包含图表词和动作词，认为是图表需求
    if (hasChartWord && hasActionWord) return true
    
    // 如果包含"用于展现"、"用于展示"等表达，也认为是图表需求
    if (lowerContent.includes("用于展现") || 
        lowerContent.includes("用于展示") || 
        lowerContent.includes("用于显示") ||
        lowerContent.includes("来展现") ||
        lowerContent.includes("来展示") ||
        lowerContent.includes("来显示")) {
      return true
    }
    
    return false
  }

  // 根据数据特征和用户意图，智能决定显示格式
  const determineDisplayFormat = (
    queryResult: any,
    userQuestion: string,
    hasChartIntent: boolean,
    commandType?: 'report' | 'chart' | 'table' | null
  ): "large-number" | "chart" | "table" | "chart-and-table" => {
    if (!queryResult || !queryResult.rows || queryResult.rows.length === 0) {
      return "table"
    }

    const rowCount = queryResult.rowCount || queryResult.rows.length
    const columns = queryResult.columns || []
    const lowerQuestion = (userQuestion || "").toLowerCase()

    // 0. 如果用户通过命令指定了类型，优先使用命令类型
    if (commandType === 'table') {
      return "table"
    }
    if (commandType === 'chart') {
      // 如果数据适合图表，返回图表；否则返回表格
      if (columns.length >= 2 && rowCount > 0 && rowCount <= 1000) {
        return "chart"
      }
      return "table"
    }

    // 0.5 用户未指定组件展示（且也没有图表意图）时，默认用表格展示
    // 说明：这里会禁止“自动推断图表/大数字”等行为，只有用户明确要求图表时才展示图表
    if ((commandType === null || typeof commandType === "undefined") && !hasChartIntent) {
      return "table"
    }

    // 1. 检查是否适合大字符显示（单个数值）
    const isSingleValue = rowCount === 1 && columns.length === 1
    const isAggregateResult = rowCount === 1 && columns.length === 2 && 
                              typeof queryResult.rows[0][columns[1]] === "number"
    
    // 如果用户没有要求图表，且是单个数值或聚合结果，显示大字符
    if (!hasChartIntent && (isSingleValue || isAggregateResult)) {
      return "large-number"
    }

    // 2. 检查是否适合图表显示
    const canShowChart = columns.length >= 2 && 
                        rowCount > 0 && 
                        rowCount <= 1000

    if (canShowChart) {
      // 检查是否有图表意图
      if (hasChartIntent) {
        // 如果用户明确要求图表，且数据量较少，只显示图表
        if (rowCount <= 50) {
          return "chart"
        } else {
          // 数据量较大时，同时显示图表和表格
          return "chart-and-table"
        }
      }

      // 检查数据特征是否适合可视化
      const hasTimeColumn = columns.some((col: string) => 
        col.toLowerCase().includes("month") || 
        col.toLowerCase().includes("date") || 
        col.toLowerCase().includes("time") ||
        col.toLowerCase().includes("日期") ||
        col.toLowerCase().includes("时间") ||
        col.toLowerCase().includes("月份") ||
        col.toLowerCase().includes("年") ||
        col.toLowerCase().includes("月")
      )

      const hasRegionColumn = columns.some((col: string) => 
        col.toLowerCase().includes("地区") ||
        col.toLowerCase().includes("地域") ||
        col.toLowerCase().includes("区域") ||
        col.toLowerCase().includes("国家") ||
        col.toLowerCase().includes("城市") ||
        col.toLowerCase().includes("省份") ||
        col.toLowerCase().includes("country") ||
        col.toLowerCase().includes("region") ||
        col.toLowerCase().includes("city") ||
        col.toLowerCase().includes("province") ||
        col.toLowerCase().includes("state")
      )

      // 检查问题中是否包含分析类关键词
      const hasAnalysisIntent = lowerQuestion.includes("分析") ||
                               lowerQuestion.includes("对比") ||
                               lowerQuestion.includes("比较") ||
                               lowerQuestion.includes("趋势") ||
                               lowerQuestion.includes("变化") ||
                               lowerQuestion.includes("分别") ||
                               lowerQuestion.includes("各") ||
                               lowerQuestion.includes("按月") ||
                               lowerQuestion.includes("按年")

      // 如果数据明显适合可视化（时间序列、地区分布）或用户有分析意图，显示图表
      if ((hasTimeColumn || hasRegionColumn || hasAnalysisIntent) && rowCount <= 100) {
        return "chart"
      }
    }

    // 3. 默认显示表格
    return "table"
  }

  // 获取与当前助手消息对应的用户消息
  const getCorrespondingUserMessage = (assistantMessageId: string): Message | null => {
    const assistantIndex = messages.findIndex(m => m.id === assistantMessageId)
    if (assistantIndex === -1) return null
    
    // 向前查找最近的一条用户消息
    for (let i = assistantIndex - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        return messages[i]
      }
    }
    return null
  }

  // 解析消息内容，提取 JSON 信息
  // 简单的Markdown渲染函数（用于助手消息）
  const renderMarkdown = (content: string): React.ReactNode => {
    if (!content) return null
    
    // 过滤掉 function_calls 相关的所有内容（DSML格式，支持中文竖线｜和英文竖线|）
    // 1. 移除整个 function_calls 块（从 DSML 标记开始到下一个段落或结束）
    content = content.replace(/<[｜|]\s*DSML\s*[｜|]\s*function_calls\s*>/gi, '')
    content = content.replace(/<[｜|]\s*DSML\s*[｜|]\s*function_calls\s*>[\s\S]*?(?=\n\n|$)/gi, '')
    // 2. 移除 invoke 标记及其后的内容
    content = content.replace(/<[｜|]\s*DSML\s*[｜|]\s*invoke[^>]*>[\s\S]*?(?=\n\n|$)/gi, '')
    // 3. 移除 parameter 标记及其后的 SQL 查询内容
    content = content.replace(/<[｜|]\s*DSML\s*[｜|]\s*parameter[^>]*>[\s\S]*?(?=\n\n|$|```|图表|结果|数据)/gi, '')
    // 4. 移除所有其他 DSML 标记（支持中文竖线｜和英文竖线|）
    content = content.replace(/<[｜|]\s*DSML\s*[｜|]\s*[^>]*>/gi, '')
    // 5. 清理多余空行
    content = content.replace(/\n{3,}/g, '\n\n')
    content = content.trim()
    
    // 6. 按行分割并进一步过滤：移除包含DSML标记的行（支持中文竖线｜和英文竖线|）
    const lines = content.split('\n').filter(line => {
      const trimmed = line.trim()
      // 过滤掉包含DSML标记的行（支持中文竖线｜和英文竖线|）
      if (/<[｜|]\s*DSML/i.test(trimmed)) return false
      return true
    })
    const elements: React.ReactNode[] = []
    let currentList: string[] = []
    let currentListType: 'ordered' | 'unordered' | null = null
    let currentParagraph: string[] = []
    
    const flushList = () => {
      if (currentList.length > 0) {
        const ListTag = currentListType === 'ordered' ? 'ol' : 'ul'
        const listClass = currentListType === 'ordered' ? 'list-decimal ml-6 space-y-1 my-2' : 'list-disc ml-6 space-y-1 my-2'
        const ListComponent = currentListType === 'ordered' ? 'ol' : 'ul'
        elements.push(
          <ListComponent key={`list-${elements.length}`} className={listClass}>
            {currentList.map((item, idx) => {
              const text = item.replace(/^[\-\*] /, '').replace(/^\d+\. /, '').trim()
              const processedText = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
              return (
                <li key={idx} className="text-foreground" dangerouslySetInnerHTML={{ __html: processedText }} />
              )
            })}
          </ListComponent>
        )
        currentList = []
        currentListType = null
      }
    }
    
    const flushParagraph = () => {
      if (currentParagraph.length > 0) {
        const paraText = currentParagraph.join('\n')
        const processedText = paraText
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>')
          .replace(/\n/g, '<br/>')
        elements.push(
          <p key={`para-${elements.length}`} className="text-foreground leading-relaxed my-2" dangerouslySetInnerHTML={{ __html: processedText }} />
        )
        currentParagraph = []
      }
    }
    
    lines.forEach((line, lineIndex) => {
      const trimmedLine = line.trim()
      
      // 处理标题
      if (trimmedLine.match(/^### /)) {
        flushList()
        flushParagraph()
        const text = trimmedLine.replace(/^### /, '').trim()
        elements.push(<h3 key={`h3-${lineIndex}`} className="text-lg font-semibold mt-4 mb-2 text-foreground">{text}</h3>)
        return
      }
      if (trimmedLine.match(/^## /)) {
        flushList()
        flushParagraph()
        const text = trimmedLine.replace(/^## /, '').trim()
        elements.push(<h2 key={`h2-${lineIndex}`} className="text-xl font-semibold mt-6 mb-3 text-foreground">{text}</h2>)
        return
      }
      if (trimmedLine.match(/^# /)) {
        flushList()
        flushParagraph()
        const text = trimmedLine.replace(/^# /, '').trim()
        elements.push(<h1 key={`h1-${lineIndex}`} className="text-2xl font-bold mt-8 mb-4 text-foreground">{text}</h1>)
        return
      }
      
      // 处理列表项
      if (trimmedLine.match(/^\d+\. /)) {
        flushParagraph()
        if (currentListType !== 'ordered') {
          flushList()
          currentListType = 'ordered'
        }
        currentList.push(trimmedLine)
        return
      }
      if (trimmedLine.match(/^[\-\*] /)) {
        flushParagraph()
        if (currentListType !== 'unordered') {
          flushList()
          currentListType = 'unordered'
        }
        currentList.push(trimmedLine)
        return
      }
      
      // 处理代码块（过滤掉SQL查询代码块）
      if (trimmedLine.match(/^```/)) {
        flushList()
        flushParagraph()
        // 查找代码块的结束
        let codeContent = trimmedLine + '\n'
        for (let i = lineIndex + 1; i < lines.length; i++) {
          codeContent += lines[i] + '\n'
          if (lines[i].trim().match(/^```/)) {
            break
          }
        }
        const codeMatch = codeContent.match(/^```(\w+)?\n([\s\S]*?)```$/)
        if (codeMatch) {
          const language = codeMatch[1] || ''
          const code = codeMatch[2]
          // 过滤掉包含DSML标记的代码块（function_calls相关，支持中文竖线｜和英文竖线|）
          const hasDSML = /<[｜|]\s*DSML/i.test(code)
          
          if (!hasDSML) {
            elements.push(
              <pre key={`code-${lineIndex}`} className="bg-muted p-4 rounded-lg overflow-x-auto my-2">
                <code className={`language-${language}`}>{code}</code>
              </pre>
            )
          }
          // 如果是SQL代码块或包含DSML，直接跳过，不显示
        }
        return
      }
      
      // 空行：刷新当前段落或列表
      if (trimmedLine === '') {
        flushList()
        flushParagraph()
        return
      }
      
      // 普通文本行
      if (currentList.length > 0) {
        flushList()
      }
      currentParagraph.push(line)
    })
    
    // 处理剩余内容
    flushList()
    flushParagraph()
    
    return <div className="space-y-2">{elements}</div>
  }

  const parseMessageJson = (content: string): { explanation?: string; sql?: string; reasoning?: string; visualization?: any; hasJson: boolean } => {
    // 使用新的统一JSON解析器
    const parsed = parseLLMResponse(content)
    
    if (parsed.hasJson) {
      return {
        explanation: parsed.explanation,
        sql: parsed.sql,
        reasoning: parsed.reasoning,
        visualization: parsed.visualization,
        hasJson: true
      }
    }
    
    return { hasJson: false }
  }

  /**
   * 获取图表配置（多层降级方案）
   * 降级1: API返回的visualization → 降级2: 自动推断 → 降级3: 默认配置 → 降级4: 返回null（显示表格）
   */
  const getChartConfigWithFallback = useCallback((
    message: string,
    queryResult: QueryResult,
    userQuestion: string
  ): ChartConfig | null => {
    if (!queryResult || !queryResult.rows || queryResult.rows.length === 0) {
      return null
    }

    const columns = queryResult.columns || []
    if (columns.length < 2) {
      return null
    }
    
    // 确保rows是对象数组格式（如果rows是数组数组，转换为对象数组）
    const rows = queryResult.rows.map((row: any) => {
      // 如果row是数组，转换为对象
      if (Array.isArray(row)) {
        const rowObj: any = {}
        columns.forEach((col: string, idx: number) => {
          rowObj[col] = row[idx]
        })
        return rowObj
      }
      // 如果已经是对象，直接返回
      return row
    })

    // 降级1: 尝试从API返回的visualization获取配置
    const jsonInfo = parseMessageJson(message)
    if (jsonInfo.visualization) {
      try {
        // 验证并修复visualization格式
        const fixedVisualization = validateAndFixVisualization(jsonInfo.visualization, queryResult)
        if (fixedVisualization) {
          // 映射字段名，确保与查询结果列名匹配
          const mappedVisualization = mapVisualizationFields(fixedVisualization, columns)
          
          // 确保xAxis和yAxis都在列名中
          let xAxis = mappedVisualization.xAxis
          let yAxis = mappedVisualization.yAxis

          // 智能匹配xAxis
          if (xAxis && !columns.includes(xAxis)) {
            const matched = findMatchingColumn(xAxis, columns, { fuzzy: true })
            if (matched) {
              xAxis = matched
            } else if (columns.length > 0) {
              xAxis = columns[0]
            }
          } else if (!xAxis && columns.length > 0) {
            xAxis = columns[0]
          }

          // 智能匹配yAxis
          if (yAxis) {
            if (Array.isArray(yAxis)) {
              yAxis = yAxis
                .map((y: string) => {
                  if (columns.includes(y)) return y
                  const matched = findMatchingColumn(y, columns, { fuzzy: true })
                  return matched || y
                })
                .filter((y: string) => columns.includes(y))
              
              if (yAxis.length === 0 && columns.length > 1) {
                yAxis = columns[1]
              }
            } else {
              if (!columns.includes(yAxis)) {
                const matched = findMatchingColumn(yAxis, columns, { fuzzy: true })
                if (matched) {
                  yAxis = matched
                } else if (columns.length > 1) {
                  yAxis = columns[1]
                }
              }
            }
          } else if (columns.length > 1) {
            yAxis = columns[1]
          }

          // 规范化图表类型
          const chartType = normalizeChartTypeFromVisualization(mappedVisualization.type || mappedVisualization.chartType || 'bar')

          return {
            type: chartType,
            title: mappedVisualization.title || '数据图表',
            xAxis: xAxis,
            yAxis: yAxis,
            data: rows,
            colors: ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#ef4444"]
          }
        }
      } catch (error) {
        console.warn("[Chat] Failed to parse visualization from API response:", error)
        // 继续降级
      }
    }

    // 降级2: 使用inferChartType自动推断（使用转换后的rows）
    try {
      const convertedQueryResult = { ...queryResult, rows }
      const inferred = inferChartType(convertedQueryResult, userQuestion)
      if (inferred) {
        return inferred
      }
    } catch (error) {
      console.warn("[Chat] Failed to infer chart type:", error)
      // 继续降级
    }

    // 降级3: 使用inferChartTypeFromJSON（更智能的推断，使用转换后的rows）
    try {
      const jsonData = detectJSONData(JSON.stringify(rows))
      if (jsonData) {
        const inferred = inferChartTypeFromJSON(jsonData, userQuestion)
        if (inferred) {
          return inferred
        }
      }
    } catch (error) {
      console.warn("[Chat] Failed to infer chart type from JSON:", error)
      // 继续降级
    }

    // 降级4: 使用默认配置（柱状图，使用转换后的rows）
    if (columns.length >= 2) {
      return {
        type: 'bar',
        title: '数据图表',
        xAxis: columns[0],
        yAxis: columns.length > 1 ? columns[1] : columns[0],
        data: rows,
        colors: ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#ef4444"]
      }
    }

    // 降级5: 返回null，显示表格
    return null
  }, [])

  /**
   * 规范化图表类型
   */
  const normalizeChartTypeFromVisualization = (type: string): ChartConfig["type"] => {
    const typeMap: Record<string, ChartConfig["type"]> = {
      'bar': 'bar',
      'column': 'bar',
      '柱状图': 'bar',
      'line': 'line',
      '折线图': 'line',
      'pie': 'pie',
      '饼图': 'pie',
      'area': 'area',
      '面积图': 'area',
      'scatter': 'scatter',
      '散点图': 'scatter',
      'radar': 'radar',
      '雷达图': 'radar',
      'table': 'table',
      '表格': 'table',
      'bar-horizontal': 'bar-horizontal',
      'bar-stacked': 'bar-stacked',
      'area-stacked': 'area-stacked',
      'composed': 'composed'
    }
    return typeMap[type?.toLowerCase()] || 'bar'
  }

  // 解析消息内容，优先显示最终回答，同时保留其他有用信息
  const parseMessageContent = (content: string, messageId: string): string => {
    try {
      // 如果内容为空，直接返回
      if (!content || content.trim() === '') {
        return content
      }
      
      // 检测是否包含可图表化的JSON数据
      const jsonDataStructures = extractAllJSONData(content)
      const hasChartableData = jsonDataStructures.some(jsonData => isChartableJSON(jsonData))
      
      // 如果包含可图表化的JSON数据，移除JSON代码块，只保留解释文本
      if (hasChartableData) {
        // 移除 ```json ... ``` 代码块
        let cleanedContent = content.replace(/```json\s*[\s\S]*?```/g, '')
        
        // 尝试提取JSON对象中的explanation字段
        const jsonInfo = parseMessageJson(content)
        if (jsonInfo.explanation) {
          // 如果有explanation，只显示explanation
          return jsonInfo.explanation.trim()
        }
        
        // 移除纯JSON数组格式 [ ... ]
        cleanedContent = cleanedContent.replace(/\[\s*\{[\s\S]*?\}\s*\]/g, '')
        
        // 移除包含data/chartData等字段的JSON对象
        cleanedContent = cleanedContent.replace(/\{\s*"data"\s*:\s*\[[\s\S]*?\]\s*\}/g, '')
        cleanedContent = cleanedContent.replace(/\{\s*"chartData"\s*:\s*\[[\s\S]*?\]\s*\}/g, '')
        cleanedContent = cleanedContent.replace(/\{\s*"values"\s*:\s*\[[\s\S]*?\]\s*\}/g, '')
        
        // 清理多余的空行
        cleanedContent = cleanedContent.replace(/\n{3,}/g, '\n\n').trim()
        
        // 如果清理后还有内容，返回清理后的内容
        if (cleanedContent.trim()) {
          return cleanedContent.trim()
        }
        
        // 如果清理后没有内容，返回默认提示
        return "数据已通过图表/表格展示，请查看下方可视化内容。"
      }
      
      // 首先尝试解析 JSON 内容
      const jsonInfo = parseMessageJson(content)
      
      // 如果包含 JSON 信息，提取并格式化显示
      if (jsonInfo.hasJson) {
        const parts: string[] = []
        
        // 优先显示 explanation（这通常是最终回答）
        if (jsonInfo.explanation && jsonInfo.explanation.trim()) {
          parts.push(jsonInfo.explanation.trim())
        }
        
        // 如果没有 explanation，尝试从原始内容中提取非 JSON 的文本内容
        if (parts.length === 0) {
          // 移除 JSON 代码块，保留其他文本
          const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/g
          let textContent = content.replace(jsonBlockRegex, '').trim()
          
          // 如果移除 JSON 后还有文本内容，使用它
          if (textContent && !textContent.startsWith('{')) {
            parts.push(textContent)
          }
        }
        
        // 如果仍然没有内容，检查原始内容是否包含非 JSON 的文本
        if (parts.length === 0) {
          // 尝试提取 JSON 代码块之前的文本
          const beforeJsonMatch = content.match(/^([\s\S]*?)```json/)
          if (beforeJsonMatch && beforeJsonMatch[1].trim()) {
            parts.push(beforeJsonMatch[1].trim())
          }
          
          // 尝试提取 JSON 代码块之后的文本
          const afterJsonMatch = content.match(/```json[\s\S]*?```([\s\S]*?)$/)
          if (afterJsonMatch && afterJsonMatch[1].trim()) {
            if (parts.length > 0) {
              parts.push('\n\n' + afterJsonMatch[1].trim())
            } else {
              parts.push(afterJsonMatch[1].trim())
            }
          }
        }
        
        // 显示 reasoning（推理过程）- 作为补充信息，但不重复显示
        if (jsonInfo.reasoning && 
            jsonInfo.reasoning.trim() && 
            jsonInfo.reasoning.trim() !== jsonInfo.explanation?.trim() &&
            !parts.some(p => p.includes(jsonInfo.reasoning.trim()))) {
          if (parts.length > 0) parts.push('\n\n---\n\n**推理过程：**\n' + jsonInfo.reasoning.trim())
        }
        
        // 显示 sql（SQL 查询）- 作为补充信息
        if (jsonInfo.sql && jsonInfo.sql.trim()) {
          if (parts.length > 0) parts.push('\n\n---\n\n**SQL 查询：**\n```sql\n' + jsonInfo.sql.trim() + '\n```')
        }
        
        // 如果有提取的内容，返回格式化后的文本
        if (parts.length > 0) {
          return parts.join('')
        }
      }
      
      // 如果没有 JSON 内容，移除 JSON 代码块但保留其他内容
      const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/g
      let processedContent = content.replace(jsonBlockRegex, '')
      
      // 检查是否是纯 JSON 对象格式
      const trimmedContent = processedContent.trim()
      if (trimmedContent.startsWith('{') && trimmedContent.endsWith('}')) {
        try {
          const parsed = JSON.parse(trimmedContent)
          // 如果是包含 explanation、sql、reasoning、visualization 的 JSON，提取内容
          if (parsed.explanation || parsed.sql || parsed.reasoning) {
            const parts: string[] = []
            // 优先显示 explanation（最终回答）
            if (parsed.explanation && parsed.explanation.trim()) {
              parts.push(parsed.explanation.trim())
            }
            // 显示推理过程
            if (parsed.reasoning && 
                parsed.reasoning.trim() && 
                parsed.reasoning.trim() !== parsed.explanation?.trim()) {
              if (parts.length > 0) parts.push('\n\n---\n\n**推理过程：**\n' + parsed.reasoning.trim())
            }
            // 显示 SQL 查询
            if (parsed.sql && parsed.sql.trim()) {
              if (parts.length > 0) parts.push('\n\n---\n\n**SQL 查询：**\n```sql\n' + parsed.sql.trim() + '\n```')
            }
            if (parts.length > 0) {
              return parts.join('')
            }
          }
        } catch {
          // 解析失败，继续处理原始内容
        }
      }
      
      // 清理多余的空行，但保留内容
      processedContent = processedContent.trim()
      
      // 返回处理后的内容，如果为空则返回原始内容
      return processedContent || content
    } catch {
      // 如果处理失败，返回原始内容
      return content
    }
  }

  // 当模型列表变化时，更新默认模型
  useEffect(() => {
    if (llmConnections.length > 0) {
      const defaultModel = llmConnections.find((m) => m.isDefault) || llmConnections[0]
      if (defaultModel) {
        setLlmConfig((prev) => {
          // 只有当配置真正改变时才更新，避免不必要的重渲染
          if (
            prev.provider === defaultModel.provider &&
            prev.model === defaultModel.model &&
            prev.temperature === defaultModel.temperature &&
            prev.maxTokens === defaultModel.maxTokens
          ) {
            return prev
          }
          return {
            provider: defaultModel.provider,
            model: defaultModel.model,
            temperature: defaultModel.temperature,
            maxTokens: defaultModel.maxTokens,
          }
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [llmConnections])

  // 滚动到底部 - 只影响对话区域，不影响其他控件
  useEffect(() => {
    if (messagesEndRef.current) {
      // 获取对话区域的滚动容器
      const scrollContainer = messagesEndRef.current.closest('.overflow-y-auto')
      if (scrollContainer) {
        // 只在对话区域内滚动，不影响页面其他部分
        scrollContainer.scrollTo({
          top: scrollContainer.scrollHeight,
          behavior: "smooth"
        })
      } else {
        // 如果没有找到滚动容器，使用更安全的滚动方式
        messagesEndRef.current.scrollIntoView({ 
          behavior: "smooth",
          block: "nearest",
          inline: "nearest"
        })
      }
    }
  }, [messages, currentSessionId])

  // 加载历史会话列表
  useEffect(() => {
    const loadSessions = async () => {
      if (!userId || !organizationId || isClearingAll) return // 防止清空时加载
      
      // 如果最近清空过（5秒内），不自动加载，避免重新加载已删除的数据
      if (lastClearTime && Date.now() - lastClearTime < 5000) {
        console.log("[Chat] 最近清空过，跳过自动加载")
        return
      }
      
      setIsLoadingSessions(true)
      try {
        const allSessions = await storage.chatSessions.getAll()
        // 后端已经按 organizationId 过滤，但为了安全起见，前端也进行过滤
        // 同时按 createdBy 过滤，只显示当前用户创建的会话
        const userSessions = allSessions.filter(
          (s) => {
            // 如果字段缺失，跳过该会话（避免错误）
            if (!s.organizationId || !s.createdBy) {
              console.warn("会话缺少必要字段:", s.id, { organizationId: s.organizationId, createdBy: s.createdBy })
              return false
            }
            return s.organizationId === organizationId && s.createdBy === userId
          }
        )
        const sortedSessions = sortSessions(userSessions)
        // 只在数据真正变化时才更新状态，避免不必要的重新渲染
        setSessions(prev => {
          // 比较会话数量和ID，如果相同则不更新
          if (prev.length === sortedSessions.length && 
              prev.every((s, i) => s.id === sortedSessions[i]?.id)) {
            return prev
          }
          return sortedSessions
        })
      } catch (error) {
        console.error("Failed to load sessions:", error)
        // 发生错误时，不清空已有数据，避免界面闪烁
      } finally {
        setIsLoadingSessions(false)
      }
    }
    
    // 如果正在清空，不加载会话列表
    if (isClearingAll) {
      return
    }
    
    loadSessions()
  }, [userId, organizationId, isClearingAll, lastClearTime]) // 添加 isClearingAll 和 lastClearTime 依赖

  // 过滤会话列表（根据搜索关键词）
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) {
      return sessions
    }
    const query = searchQuery.toLowerCase().trim()
    return sessions.filter((session) => 
      session.title.toLowerCase().includes(query)
    )
  }, [sessions, searchQuery])

  // 连接到 SSE 流以接收实时更新（优化：防止重复连接）
  const connectSSE = useCallback((sessionId: string) => {
    // 如果是临时会话ID，不连接 SSE
    if (sessionId.startsWith("session_")) {
      return
    }
    
    // 检查是否已经连接到相同的会话
    if (sseEventSourceRef.current && sseEventSourceRef.current.readyState === EventSource.OPEN) {
      // 已经连接，不需要重新连接
      return
    }
    
    // 断开现有连接
    if (sseEventSourceRef.current) {
      sseEventSourceRef.current.close()
      sseEventSourceRef.current = null
    }
    
    // 清除重连定时器
    if (sseReconnectTimeoutRef.current) {
      clearTimeout(sseReconnectTimeoutRef.current)
      sseReconnectTimeoutRef.current = null
    }
    
    try {
      // EventSource 不支持自定义 headers，但会自动发送 cookies
      // 如果使用 Bearer token 认证，需要从 localStorage 获取 token 并通过 URL 参数传递
      const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null
      const url = token 
        ? `/api/chat/stream/${sessionId}?token=${encodeURIComponent(token)}`
        : `/api/chat/stream/${sessionId}`
      
      const eventSource = new EventSource(url)
      sseEventSourceRef.current = eventSource
      
      eventSource.onopen = () => {
        // 连接成功，静默处理（减少日志噪音）
      }
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          handleSSEMessage(sessionId, data)
        } catch (error) {
          console.error("[SSE] Failed to parse message:", error)
        }
      }
      
      eventSource.onerror = (error) => {
        // EventSource 的错误事件不包含详细的错误信息
        // 检查 readyState 来判断连接状态
        if (eventSource.readyState === EventSource.CLOSED) {
          // 连接已关闭，只在需要时记录警告
          if (currentSessionId === sessionId && process.env.NODE_ENV === 'development') {
            // 只有当前会话且在开发环境才记录，避免日志噪音
          }
        } else if (eventSource.readyState === EventSource.CONNECTING) {
          // 正在重连，不处理（减少日志噪音）
          return
        } else {
          // 其他错误，只在开发环境记录
          if (process.env.NODE_ENV === 'development') {
            console.error("[SSE] Connection error for session:", sessionId, "readyState:", eventSource.readyState)
          }
        }
        
        // 只有在连接完全关闭时才清理和重连
        if (eventSource.readyState === EventSource.CLOSED) {
          eventSource.close()
          sseEventSourceRef.current = null
          
          // 尝试重连（指数退避，但只在当前会话时重连）
          if (currentSessionId === sessionId) {
            const reconnectDelay = 3000 // 3秒
            sseReconnectTimeoutRef.current = setTimeout(() => {
              // 再次检查会话是否仍然是当前会话，避免重复连接
              if (currentSessionId === sessionId && !sseEventSourceRef.current) {
                connectSSE(sessionId)
              }
            }, reconnectDelay)
          }
        }
      }
    } catch (error) {
      console.error("[SSE] Failed to create connection:", error)
    }
  }, [currentSessionId])
  
  // 防抖定时器ref，用于合并频繁的状态更新
  const debounceTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map())
  
  // 处理 SSE 消息（使用useCallback优化，添加防抖机制）
  const handleSSEMessage = useCallback((sessionId: string, data: any) => {
    // 心跳消息和连接消息完全忽略，不触发任何处理
    if (data.type === "connected" || data.type === "heartbeat") {
      return
    }
    
    // 立即处理的任务类型（不需要防抖）
    if (data.type === "task_created") {
      loadingSessionIdsRef.current.add(sessionId)
      updateSessionState(sessionId, (state) => ({
        ...state,
        isLoading: true,
      }))
      return
    }
    
    // 需要防抖的状态更新（避免频繁重渲染）
    if (data.type === "processing_started" || data.type === "status_update") {
      // 清除之前的防抖定时器
      const existingTimer = debounceTimersRef.current.get(sessionId)
      if (existingTimer) {
        clearTimeout(existingTimer)
      }
      
      // 设置新的防抖定时器（200ms延迟）
      const timer = setTimeout(() => {
        const sessionState = getSessionState(sessionId)
        const lastMessage = sessionState.messages[sessionState.messages.length - 1]
        if (lastMessage && lastMessage.role === "assistant") {
          updateSessionState(sessionId, (state) => ({
            ...state,
            messages: sortMessages(
              state.messages.map((msg) => 
                msg.id === lastMessage.id 
                  ? { 
                      ...msg, 
                      workProcess: data.workProcess || msg.workProcess,
                      stepMessage: data.message || msg.stepMessage
                    }
                  : msg
              )
            ),
          }))
        }
        debounceTimersRef.current.delete(sessionId)
      }, 200)
      
      debounceTimersRef.current.set(sessionId, timer)
      return
    }
    
    if (data.type === "step_started") {
      // 处理步骤开始（静默处理，减少日志）
      const sessionState = getSessionState(sessionId)
      const lastMessage = sessionState.messages[sessionState.messages.length - 1]
      if (lastMessage && lastMessage.role === "assistant") {
        updateSessionState(sessionId, (state) => ({
          ...state,
          messages: sortMessages(
            state.messages.map((msg) => 
              msg.id === lastMessage.id 
                ? { 
                    ...msg, 
                    workProcess: data.workProcess || msg.workProcess,
                    currentStep: data.step,
                    stepMessage: data.message
                  }
                : msg
            )
          ),
        }))
      }
      return
    }
    
    if (data.type === "step_completed") {
      // 处理步骤完成（静默处理，减少日志）
      const sessionState = getSessionState(sessionId)
      const lastMessage = sessionState.messages[sessionState.messages.length - 1]
      if (lastMessage && lastMessage.role === "assistant") {
        updateSessionState(sessionId, (state) => ({
          ...state,
          messages: sortMessages(
            state.messages.map((msg) => 
              msg.id === lastMessage.id 
                ? { 
                    ...msg, 
                    workProcess: data.workProcess || msg.workProcess,
                    currentStep: undefined, // 步骤完成，清除当前步骤
                    stepMessage: undefined
                  }
                : msg
            )
          ),
        }))
      }
      
      // 如果是查询完成，更新查询结果（如果有部分结果）
      if (data.step === "query_execution" && data.queryResult) {
        // 可以在这里显示部分结果，但完整结果会在task_completed时更新
      }
      return
    }
    
    // 最终结果准备完成也需要防抖
    if (data.type === "final_result_ready") {
      // 清除之前的防抖定时器
      const existingTimer = debounceTimersRef.current.get(`${sessionId}_final`)
      if (existingTimer) {
        clearTimeout(existingTimer)
      }
      
      // 设置新的防抖定时器（200ms延迟）
      const timer = setTimeout(() => {
        if (data.workProcess && Array.isArray(data.workProcess)) {
          const sessionState = getSessionState(sessionId)
          const lastMessage = sessionState.messages[sessionState.messages.length - 1]
          if (lastMessage && lastMessage.role === "assistant") {
            updateSessionState(sessionId, (state) => ({
              ...state,
              messages: sortMessages(
                state.messages.map((msg) => 
                  msg.id === lastMessage.id 
                    ? { ...msg, workProcess: data.workProcess }
                    : msg
                )
              ),
            }))
          }
        }
        debounceTimersRef.current.delete(`${sessionId}_final`)
      }, 200)
      
      debounceTimersRef.current.set(`${sessionId}_final`, timer)
      return
    }
    
    if (data.type === "task_completed") {
      const result = data.result
      if (result) {
        // 处理完成的结果
        const assistantMessage: Message & { workProcess?: string[]; intent?: any } = {
          id: generateMessageId(sessionId, "assistant"),
          role: "assistant",
          content: result.message || result.error || "无法生成响应",
          workProcess: result.workProcess,
          intent: result.intent,
          timestamp: new Date().toISOString(),
        }
        
        // 更新消息
        updateSessionState(sessionId, (state) => ({
          ...state,
          messages: sortMessages([...state.messages, assistantMessage]),
          isLoading: false,
        }))
        
        // 合并状态更新，减少重渲染次数
        updateSessionState(sessionId, (state) => {
          const newState: SessionState = {
            ...state,
            messages: sortMessages([...state.messages, assistantMessage]),
            isLoading: false,
          }
          
          // 更新查询结果（合并到一次更新中）
          if (result.queryResult) {
            newState.queryResults = {
              ...state.queryResults,
              [assistantMessage.id]: result.queryResult,
            }
          }
          
          if (result.firstQueryResult) {
            newState.firstQueryResults = {
              ...state.firstQueryResults,
              [assistantMessage.id]: result.firstQueryResult,
            }
          }
          
          return newState
        })
        
        // 保存消息到数据库（通过 API）
        // 这里可以调用 API 来保存消息，或者让后端自动保存
      }
      
      // 清除加载状态
      loadingSessionIdsRef.current.delete(sessionId)
      setSessionLoadingStates(prev => ({
        ...prev,
        [sessionId]: {
          isLoading: false,
          isExecuting: prev[sessionId]?.isExecuting || false,
        },
      }))
      
      return
    }
    
    if (data.type === "task_error") {
      console.error("[SSE] Task error:", data.error)
      
      const errorMessage: Message = {
        id: generateMessageId(sessionId, "assistant"),
        role: "assistant",
        content: `❌ **处理失败**\n\n${data.error || "未知错误"}`,
        timestamp: new Date().toISOString(),
      }
      
      updateSessionState(sessionId, (state) => ({
        ...state,
        messages: sortMessages([...state.messages, errorMessage]),
        isLoading: false,
      }))
      
      // 清除加载状态
      loadingSessionIdsRef.current.delete(sessionId)
      setSessionLoadingStates(prev => ({
        ...prev,
        [sessionId]: {
          isLoading: false,
          isExecuting: prev[sessionId]?.isExecuting || false,
        },
      }))
      
      return
    }
    
    if (data.type === "task_status") {
      // 任务状态更新
      if (data.status === "processing") {
        loadingSessionIdsRef.current.add(sessionId)
        updateSessionState(sessionId, (state) => ({
          ...state,
          isLoading: true,
        }))
      }
      return
    }
  }, [updateSessionState, generateMessageId, getSessionState])
  
  // 当会话切换时，重新连接 SSE（优化：添加清理防抖定时器）
  useEffect(() => {
    if (currentSessionId) {
      connectSSE(currentSessionId)
    }
    
    // 清理函数：断开连接并清理防抖定时器
    return () => {
      if (sseEventSourceRef.current) {
        sseEventSourceRef.current.close()
        sseEventSourceRef.current = null
      }
      if (sseReconnectTimeoutRef.current) {
        clearTimeout(sseReconnectTimeoutRef.current)
        sseReconnectTimeoutRef.current = null
      }
      // 清理所有防抖定时器
      debounceTimersRef.current.forEach((timer) => clearTimeout(timer))
      debounceTimersRef.current.clear()
    }
  }, [currentSessionId, connectSSE])
  
  // 组件卸载时断开 SSE 连接
  useEffect(() => {
    return () => {
      if (sseEventSourceRef.current) {
        sseEventSourceRef.current.close()
        sseEventSourceRef.current = null
      }
      if (sseReconnectTimeoutRef.current) {
        clearTimeout(sseReconnectTimeoutRef.current)
        sseReconnectTimeoutRef.current = null
      }
    }
  }, [])

  // 检查并恢复进行中的对话任务（优化：改进网络错误处理）
  const checkAndRecoverTasks = useCallback(async (sessionId: string) => {
    try {
      // 检查是否最近请求失败过（防抖机制）
      if (failedSessionIdsRef.current.has(sessionId)) {
        return
      }
      
      // 检查会话状态
      let session
      try {
        session = await storage.chatSessions.getById(sessionId)
        // 请求成功，从失败列表中移除（如果存在）
        failedSessionIdsRef.current.delete(sessionId)
      } catch (error: any) {
        // 如果会话不存在（404），标记为失败并静默处理
        if (error?.status === 404 || error?.message?.includes("404") || error?.message?.includes("不存在")) {
          // 标记为失败，避免频繁请求
          failedSessionIdsRef.current.add(sessionId)
          // 5分钟后清除失败标记（允许重试）
          setTimeout(() => {
            failedSessionIdsRef.current.delete(sessionId)
          }, 5 * 60 * 1000)
          return
        }
        // 其他错误，静默处理
        return
      }
      
      if (!session) {
        // 静默处理：会话不存在（减少日志）
        return
      }
      
      // 如果会话状态是 processing，说明有任务在进行
      if (session.status === "processing" || session.currentTaskId) {
        // 标记为加载中
        loadingSessionIdsRef.current.add(sessionId)
        updateSessionState(sessionId, (state) => ({
          ...state,
          isLoading: true,
        }))
        
        setSessionLoadingStates(prev => ({
          ...prev,
          [sessionId]: {
            isLoading: true,
            isExecuting: prev[sessionId]?.isExecuting || false,
          },
        }))
        
        // 确保 SSE 连接已建立（会在 useEffect 中自动连接）
        // 如果还没有连接，立即连接
        if (!sseEventSourceRef.current || sseEventSourceRef.current.readyState === EventSource.CLOSED) {
          connectSSE(sessionId)
        }
      }
    } catch (error: any) {
      // 网络错误或服务器错误，静默处理（不显示给用户，避免干扰）
      // 只在开发环境记录详细错误
      if (process.env.NODE_ENV === 'development') {
        const isNetworkError = error?.isNetworkError || error?.message?.includes("Failed to fetch") || error?.message?.includes("网络请求失败")
        if (isNetworkError) {
          // 网络错误，可能是服务器未启动或网络问题，静默处理
        } else {
          // 其他错误，记录但不中断用户操作
          console.warn("[Chat] Failed to check task status (non-critical):", error?.message || error)
        }
      }
      // 静默失败，不影响用户体验
    }
  }, [updateSessionState, connectSSE])

  // 加载指定会话的消息 - 使用 useCallback 优化
  const loadSession = useCallback(async (sessionId: string) => {
    try {
      // 立即更新会话ID，防止竞态条件
      setCurrentSessionId(sessionId)
      
      // 检查并恢复进行中的任务
      await checkAndRecoverTasks(sessionId)
      
      // 检查是否有针对该会话的请求正在进行
      const isLoading = loadingSessionIdsRef.current.has(sessionId)
      const isExecuting = executingSessionIdsRef.current.has(sessionId)
      
      // 如果会话状态不存在，初始化它（但保留现有的加载状态）
      if (!sessionStates[sessionId]) {
        updateSessionState(sessionId, () => ({
          messages: [],
          queryResults: {},
          firstQueryResults: {},
          isLoading,
          isExecuting,
        }))
      } else {
        // 更新加载状态（合并，不覆盖现有消息和查询结果）
        // 注意：这里只更新加载状态，消息和查询结果会在后面合并
        updateSessionState(sessionId, (state) => ({
          ...state,
          isLoading,
          isExecuting,
        }))
      }
      
      // 确保有智能体被选中（如果没有，自动选择默认智能体）
      if (!selectedAgentId && agents.length > 0) {
        const defaultAgent = agents.find((a) => a.isDefault && a.status === "active") || 
                             agents.find((a) => a.status === "active")
        if (defaultAgent) {
          setSelectedAgentId(defaultAgent.id)
        }
      }
      
      // 检查是否最近请求失败过（防抖机制）
      if (failedSessionIdsRef.current.has(sessionId)) {
        // 最近请求失败过，跳过本次请求（避免频繁请求不存在的会话）
        return
      }
      
      // 标记为正在加载，防止重复加载
      if (loadingSessionIdsRef.current.has(sessionId)) {
        // 已经在加载中，跳过
        return
      }
      loadingSessionIdsRef.current.add(sessionId)
      
      let session
      try {
        session = await storage.chatSessions.getById(sessionId)
        // 请求成功，从失败列表中移除（如果存在）
        failedSessionIdsRef.current.delete(sessionId)
      } catch (error: any) {
        // 网络错误或服务器错误，静默处理
        const isNetworkError = error?.isNetworkError || error?.message?.includes("Failed to fetch") || error?.message?.includes("网络请求失败")
        if (isNetworkError) {
          // 网络错误，可能是服务器未启动或网络问题
          // 静默处理，使用空状态继续，不影响用户体验
          if (process.env.NODE_ENV === 'development') {
            console.warn("[Chat] Network error loading session (non-critical):", sessionId)
          }
        } else {
          // 其他错误（如404），清除 localStorage 中的会话ID
          if (error?.status === 404 || error?.message?.includes("404") || error?.message?.includes("不存在")) {
            // 标记为失败，避免频繁请求
            failedSessionIdsRef.current.add(sessionId)
            // 5分钟后清除失败标记（允许重试）
            setTimeout(() => {
              failedSessionIdsRef.current.delete(sessionId)
            }, 5 * 60 * 1000)
            
            if (typeof window !== "undefined") {
              localStorage.removeItem("currentChatSessionId")
            }
            // 如果这是当前会话，创建新会话
            if (currentSessionId === sessionId) {
              console.log("[Chat] 会话不存在（404），创建新会话")
              createNewSession()
            }
          } else {
            if (process.env.NODE_ENV === 'development') {
              console.warn("[Chat] Failed to load session (non-critical):", error?.message || error)
            }
          }
        }
        // 即使加载失败，也继续执行，使用空状态
        return
      }
      
      if (!session) {
        // 会话不存在，清除 localStorage 中的会话ID并创建新会话
        if (typeof window !== "undefined") {
          localStorage.removeItem("currentChatSessionId")
        }
        // 如果这是当前会话，创建新会话
        if (currentSessionId === sessionId) {
          console.log("[Chat] 会话不存在，创建新会话")
          createNewSession()
        }
        return
      }
      
      // 在加载存储数据后，再次获取当前内存中的状态
      // 这样可以捕获在加载过程中可能更新的状态（比如正在进行的请求产生的消息）
      const currentMemoryState = sessionStates[sessionId] || {
        messages: [],
        queryResults: {},
        firstQueryResults: {},
        isLoading: loadingSessionIdsRef.current.has(sessionId),
        isExecuting: executingSessionIdsRef.current.has(sessionId),
      }
      
      // 检查会话状态，如果是 processing，确保加载状态正确
      if (session.status === "processing" || session.currentTaskId) {
        loadingSessionIdsRef.current.add(sessionId)
        setSessionLoadingStates(prev => ({
          ...prev,
          [sessionId]: {
            isLoading: true,
            isExecuting: prev[sessionId]?.isExecuting || false,
          },
        }))
      }
      
      if (session && session.messages) {
        // 开发环境：记录加载的消息数据
        if (process.env.NODE_ENV === 'development') {
          console.log(`[Chat] Loading session ${sessionId}:`, {
            messageCount: session.messages.length,
            messages: session.messages.map((m: ChatMessage) => ({
              id: m.id,
              role: m.role,
              contentLength: m.content?.length || 0,
              contentPreview: m.content?.substring(0, 50) || "empty",
              hasTimestamp: !!m.timestamp,
            }))
          })
        }
        
        // 过滤掉系统消息并转换为Message格式
        const storedMessages: Message[] = session.messages
          .filter((msg: ChatMessage) => msg.role !== "system")
          .map((msg: ChatMessage) => {
            // 验证内容是否存在
            if (!msg.content || msg.content.trim() === '') {
              console.warn(`[Chat] Message ${msg.id} has empty content`)
            }
            
            // 验证时间戳是否存在且有效
            if (!msg.timestamp) {
              console.warn(`[Chat] Message ${msg.id} missing timestamp, using current time as fallback`)
            } else {
              // 验证时间戳格式是否正确
              const timestampDate = new Date(msg.timestamp)
              if (isNaN(timestampDate.getTime())) {
                console.warn(`[Chat] Message ${msg.id} has invalid timestamp: ${msg.timestamp}`)
              }
            }
            
            // 从metadata中恢复workProcess和intent
            const metadata = msg.metadata as any
            return {
              id: msg.id,
              role: msg.role as "user" | "assistant" | "system",
              content: msg.content || "", // 确保content不为undefined
              // 保留原始时间戳，如果没有则使用当前时间（降级处理）
              timestamp: msg.timestamp || new Date().toISOString(),
              workProcess: metadata?.workProcess || undefined, // 从metadata恢复workProcess
              intent: metadata?.intent || undefined, // 从metadata恢复intent（如果有）
              metadata: metadata || undefined, // 保留完整的metadata
            }
          })
        
        // 恢复查询结果（从存储中）
        const restoredResults: Record<string, QueryResult> = {}
        const restoredFirstResults: Record<string, QueryResult> = {}
        session.messages.forEach((msg: ChatMessage) => {
          if (msg.metadata?.queryResult) {
            restoredResults[msg.id] = msg.metadata.queryResult
          }
          // 使用类型断言，因为类型定义可能还没有完全更新
          const metadata = msg.metadata as any
          if (metadata?.firstQueryResult) {
            restoredFirstResults[msg.id] = metadata.firstQueryResult as QueryResult
          }
        })
        
        // 合并消息：以消息ID为键，优先保留更新的消息（基于时间戳）
        const messageMap = new Map<string, Message>()
        
        // 先添加存储中的消息
        storedMessages.forEach(msg => {
          messageMap.set(msg.id, msg)
        })
        
        // 再添加内存中的消息（如果有更新的，会覆盖存储中的）
        currentMemoryState.messages.forEach(msg => {
          const existing = messageMap.get(msg.id)
          if (!existing) {
            // 内存中有新消息，直接添加
            messageMap.set(msg.id, msg)
          } else {
            // 比较时间戳，保留更新的消息
            const existingTime = existing.timestamp ? new Date(existing.timestamp).getTime() : 0
            const memoryTime = msg.timestamp ? new Date(msg.timestamp).getTime() : 0
            if (memoryTime > existingTime || (memoryTime === existingTime && msg.content.length > existing.content.length)) {
              // 内存中的消息更新或内容更长（可能是正在生成的消息），使用内存中的
              messageMap.set(msg.id, msg)
            }
          }
        })
        
        // 合并查询结果：优先保留内存中的结果（可能包含正在进行的查询结果）
        const mergedQueryResults = {
          ...restoredResults, // 存储中的结果
          ...currentMemoryState.queryResults, // 内存中的结果（优先，会覆盖存储中的）
        }
        
        const mergedFirstQueryResults = {
          ...restoredFirstResults, // 存储中的结果
          ...currentMemoryState.firstQueryResults, // 内存中的结果（优先）
        }
        
        // 将合并后的消息转换为数组并排序
        const mergedMessages = sortMessages(Array.from(messageMap.values()))
        
        // 验证排序后的消息顺序（开发环境）
        if (process.env.NODE_ENV === "development" && mergedMessages.length > 1) {
          let orderIssues = 0
          for (let i = 1; i < mergedMessages.length; i++) {
            const prev = mergedMessages[i - 1]
            const curr = mergedMessages[i]
            const prevTime = prev.timestamp ? new Date(prev.timestamp).getTime() : 0
            const currTime = curr.timestamp ? new Date(curr.timestamp).getTime() : 0
            if (prevTime > currTime) {
              orderIssues++
              console.warn(`[Chat] Message order issue detected: message ${prev.id} (${prevTime}) should come after ${curr.id} (${currTime})`)
            }
          }
          if (orderIssues === 0 && mergedMessages.length > 0) {
            console.log(`[Chat] Merged ${mergedMessages.length} messages (${storedMessages.length} from storage, ${currentMemoryState.messages.length} from memory), all in correct order`)
          }
        }
        
        // 开发环境：记录合并后的消息
        if (process.env.NODE_ENV === 'development' && mergedMessages.length > 0) {
          console.log(`[Chat] Merged ${mergedMessages.length} messages for session ${sessionId}:`, {
            userMessages: mergedMessages.filter(m => m.role === "user").length,
            assistantMessages: mergedMessages.filter(m => m.role === "assistant").length,
            messages: mergedMessages.map(m => ({
              id: m.id,
              role: m.role,
              contentLength: m.content?.length || 0,
              contentPreview: m.content?.substring(0, 50) || "empty",
            }))
          })
        }
        
        // 更新会话状态（合并而不是覆盖）
        updateSessionState(sessionId, (state) => ({
          ...state,
          messages: mergedMessages,
          queryResults: mergedQueryResults,
          firstQueryResults: mergedFirstQueryResults,
          isLoading: loadingSessionIdsRef.current.has(sessionId),
          isExecuting: executingSessionIdsRef.current.has(sessionId),
        }))
        
        // currentSessionId 已经在函数开始时设置，这里不需要再次设置
        if (session.databaseConnectionId) {
          setSelectedConnection(session.databaseConnectionId)
        }
        
        // 加载完成，清除加载状态并标记为已加载
        loadingSessionIdsRef.current.delete(sessionId)
        loadedSessionIdsRef.current.add(sessionId)
        updateSessionState(sessionId, (state) => ({
          ...state,
          isLoading: false,
        }))
      }
    } catch (error) {
      console.error("Failed to load session:", error)
      // 即使加载失败，也要重置加载状态（仅针对当前会话）
      loadingSessionIdsRef.current.delete(sessionId)
      updateSessionState(sessionId, (state) => ({
        ...state,
        isLoading: false,
        isExecuting: false,
      }))
    }
  }, [currentSessionId, agents, selectedAgentId, connections, organizationId, userId, sessionStates, updateSessionState])

  // 创建新会话 - 使用 useCallback 优化（必须在 useEffect 之前定义）
  const createNewSession = useCallback(async () => {
    // 防止重复点击（只检查当前是否正在创建，不阻止创建多个新会话）
    if (isCreatingSession) {
      return
    }

    setIsCreatingSession(true)
    
    try {
      const newSessionId = `session_${Date.now()}`
      
      // 初始化新会话的状态
      updateSessionState(newSessionId, () => ({
        messages: [],
        queryResults: {},
        firstQueryResults: {},
        isLoading: false,
        isExecuting: false,
      }))
      
      // 切换到新会话
      setCurrentSessionId(newSessionId)
      
      // 新建对话时，优先选择默认智能体（如果存在且激活）
      if (agents.length > 0) {
        const defaultAgent = agents.find((a) => a.isDefault && a.status === "active")
        if (defaultAgent) {
          // 如果找到了默认智能体，无论当前是否已选择其他智能体，都切换到默认智能体
          setSelectedAgentId(defaultAgent.id)
          console.log("[Chat] 新建对话，自动选择默认智能体:", defaultAgent.name)
        } else if (!selectedAgentId) {
          // 如果没有默认智能体，且当前没有选中智能体，选择第一个激活的智能体
          const firstActiveAgent = agents.find((a) => a.status === "active")
          if (firstActiveAgent) {
            setSelectedAgentId(firstActiveAgent.id)
            console.log("[Chat] 新建对话，自动选择第一个激活的智能体:", firstActiveAgent.name)
          }
        }
      }
      
      // 如果没有智能体，提示用户
      if (agents.length === 0) {
        toast({
          title: "无法创建新对话",
          description: "请先创建智能体。您可以前往\"智能体管理\"页面创建智能体。",
          variant: "destructive",
        })
        return
      }
      
      // 确定使用的数据库连接ID
      let dbConnectionId = getEffectiveDatabaseId()
      console.log("[Chat] 创建新会话 - 数据库连接ID:", dbConnectionId, {
        selectedAgent,
        agentDatabase: agentDatabase?.id,
        selectedConnection,
        availableConnections: connections.length,
      })
      
      // 如果没有选择数据库连接，尝试使用默认数据库或第一个可用的连接
      if (!dbConnectionId && connections.length > 0) {
        const defaultConn = connections.find((c) => c.isDefault) || connections[0]
        dbConnectionId = defaultConn.id
        setSelectedConnection(defaultConn.id)
        console.log("[Chat] 自动选择数据库连接:", dbConnectionId, defaultConn.isDefault ? "(默认)" : "(第一个可用)")
      }
      
      // 如果已选择数据库连接，立即创建一个新会话
      if (dbConnectionId) {
        try {
          // 找到当前选择的 LLM 连接 ID
          const currentLlmConnection = llmConnections.find(
            (conn) => conn.model === llmConfig.model && conn.provider === llmConfig.provider
          )
          const llmConnectionId = currentLlmConnection?.id

          const { apiClient } = await import("@/lib/api-client")
          console.log("[Chat] 调用 API 创建会话:", {
            title: "新对话",
            databaseConnectionId: dbConnectionId,
            llmConnectionId: llmConnectionId || undefined,
          })
          
          const response = await apiClient.createChatSession({
            title: "新对话",
            databaseConnectionId: dbConnectionId,
            llmConnectionId: llmConnectionId || undefined,
          })
          
          console.log("[Chat] API 响应:", response)
          
          // 检查响应是否包含 session
          if (!response || !response.session) {
            console.error("[Chat] 响应格式错误:", response)
            throw new Error("创建会话失败：服务器返回的数据格式不正确")
          }
          
          const { session } = response
          console.log("[Chat] 会话创建成功，ID:", session.id)
          
          // 将临时会话的状态迁移到真实会话ID
          const tempSessionState = getSessionState(newSessionId)
          if (tempSessionState) {
            updateSessionState(session.id, () => tempSessionState)
            // 清除临时会话的状态
            setSessionStates(prev => {
              const newStates = { ...prev }
              delete newStates[newSessionId]
              return newStates
            })
          }
          
          // 记录临时ID到真实ID的映射
          creatingSessionsRef.current.set(newSessionId, session.id)
          
          // 记录新会话的创建时间（用于保护期机制）
          newSessionsRef.current.set(session.id, Date.now())
          
          // 使用新创建的会话 ID，并添加验证
          try {
            setCurrentSessionId(session.id)
            // 验证更新是否成功（通过检查下一个渲染周期的值）
            console.log("[Chat] 会话ID已更新为:", session.id)
          } catch (error) {
            console.error("[Chat] 更新会话ID失败:", error)
            // 如果更新失败，重试一次
            setTimeout(() => {
              setCurrentSessionId(session.id)
            }, 0)
          }
          
          // 清空搜索框，以便显示新会话
          setSearchQuery("")
          
          // 立即将新创建的会话添加到列表中（确保用户能看到）
          setSessions(prev => {
            // 检查是否已经存在（避免重复）
            const exists = prev.find(s => s.id === session.id)
            if (exists) {
              // 如果已存在，更新它
              return sortSessions(prev.map(s => s.id === session.id ? session : s))
            } else {
              // 如果不存在，添加到列表开头
              return sortSessions([session, ...prev])
            }
          })
          
          // 异步重新加载会话列表以确保数据同步（延迟一点以确保服务器已保存）
          // 使用新会话ID作为引用，确保即使刷新后也能保留新会话
          const newSessionIdRef = session.id
          const creationTime = Date.now()
          setTimeout(async () => {
            try {
              const allSessions = await storage.chatSessions.getAll()
              const userSessions = allSessions.filter(
                (s) => s.organizationId === organizationId && s.createdBy === userId
              )
              
              // 智能合并：确保新会话不会丢失（添加保护期机制）
              setSessions(prev => {
                // 从刷新后的列表创建映射，用于去重和查找
                const refreshedMap = new Map(userSessions.map(s => [s.id, s]))
                
                // 检查新会话是否在刷新列表中
                const newSessionInRefreshed = refreshedMap.has(newSessionIdRef)
                
                // 检查新会话是否在保护期内（5秒）
                const sessionAge = Date.now() - creationTime
                const isProtected = sessionAge < 5000
                
                // 从当前列表中找到新会话
                const newSessionInCurrent = prev.find(s => s.id === newSessionIdRef)
                
                // 合并策略：
                // 1. 先添加刷新后的所有会话（这些是服务器确认存在的）
                // 2. 如果新会话不在刷新列表中，但在保护期内，从当前列表中保留它
                const merged = [
                  ...userSessions,
                  // 如果新会话不在刷新列表中，但在保护期内，从当前列表中添加它
                  ...(newSessionInRefreshed ? [] : (isProtected && newSessionInCurrent ? [newSessionInCurrent] : []))
                ]
                
                // 去重：确保每个会话只出现一次（刷新列表优先）
                const uniqueMerged = Array.from(
                  new Map(merged.map(s => [s.id, s])).values()
                )
                
                return sortSessions(uniqueMerged)
              })
              
              // 如果新会话已经在服务器列表中，清除保护期标记
              const allSessionsMap = new Map(userSessions.map(s => [s.id, s]))
              if (allSessionsMap.has(newSessionIdRef)) {
                // 新会话已确认存在于服务器，可以清除保护期
                // 但保留映射记录，以便后续使用
              }
            } catch (refreshError) {
              console.error("刷新会话列表失败:", refreshError)
              // 即使刷新失败，新会话已经添加到列表中，用户可以继续使用
            }
          }, 1000) // 延迟1秒以确保服务器已保存

          // 显示成功提示
          toast({
            title: "创建成功",
            description: "新对话已创建",
          })
        } catch (error: any) {
          console.error("创建新会话失败:", error)
          const errorMessage = error?.message || error?.error || "创建新会话失败，请稍后重试"
          toast({
            title: "创建新对话失败",
            description: errorMessage,
            variant: "destructive",
          })
          // 如果创建失败，仍然使用临时 ID
          setCurrentSessionId(`session_${Date.now()}`)
        }
      } else {
        // 如果没有可用的数据库连接，提示用户
        if (connections.length === 0) {
          toast({
            title: "无法创建新对话",
            description: "请先添加数据库连接。您可以前往\"数据库管理\"页面添加数据库连接。",
            variant: "destructive",
          })
        } else {
          // 有数据库连接但未选择，提示用户需要选择数据库连接
          toast({
            title: "无法创建新对话",
            description: "请先选择数据库连接。",
            variant: "destructive",
          })
        }
        // 使用临时 ID
        setCurrentSessionId(`session_${Date.now()}`)
      }
    } catch (error: any) {
      // 捕获所有未预期的错误
      console.error("创建新会话时发生未预期的错误:", error)
      const errorMessage = error?.message || error?.error || "创建新会话失败，请稍后重试"
      toast({
        title: "创建新对话失败",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      // 确保无论成功还是失败，都重置创建状态
      setIsCreatingSession(false)
    }
  }, [agents, selectedAgentId, connections, getEffectiveDatabaseId, llmConnections, llmConfig, organizationId, userId, getSessionState, updateSessionState, selectedAgent, agentDatabase, isCreatingSession, sessions])

  // 会话列表加载完成后，自动加载当前会话的消息
  useEffect(() => {
    // 等待会话列表加载完成，或正在清空时，不自动加载
    if (isLoadingSessions || isClearingAll) return
    
    // 如果当前会话ID是临时ID，且会话列表不为空，自动选择第一个会话
    if (currentSessionId.startsWith("session_") && sessions.length > 0) {
      const firstSession = sessions[0]
      console.log("[Chat] 当前会话是临时ID，自动切换到第一个会话:", firstSession.id)
      setCurrentSessionId(firstSession.id)
      return
    }
    
    // 如果当前会话ID是真实ID
    if (!currentSessionId.startsWith("session_")) {
      // 检查该会话是否在会话列表中（可能已被删除）
      const sessionExists = sessions.some(s => s.id === currentSessionId)
      
      if (!sessionExists) {
        // 会话不存在
        if (sessions.length > 0) {
          // 如果列表不为空，选择第一个会话
          console.log("[Chat] 当前会话不存在，自动切换到第一个会话:", sessions[0].id)
          setCurrentSessionId(sessions[0].id)
        } else {
          // 如果列表为空，清除 localStorage 并创建新会话
          if (typeof window !== "undefined") {
            localStorage.removeItem("currentChatSessionId")
          }
          console.log("[Chat] 当前会话不存在且列表为空，创建新会话")
          createNewSession()
        }
        return
      }
      
      // 会话存在，检查是否需要加载消息
      // 检查是否已经加载过该会话（避免重复加载）
      const isAlreadyLoaded = loadedSessionIdsRef.current.has(currentSessionId)
      // 检查是否正在加载该会话（避免重复加载）
      const isCurrentlyLoading = loadingSessionIdsRef.current.has(currentSessionId)
      // 如果会话状态不存在或没有消息，说明需要从数据库加载
      // 添加防抖：只在会话状态真正需要加载时才加载，且不在加载中，且未加载过
      if (!isAlreadyLoaded && !isCurrentlyLoading && (!currentSessionState || currentSessionState.messages.length === 0)) {
        // 使用防抖，避免频繁请求
        const sessionIdToLoad = currentSessionId
        const loadTimer = setTimeout(() => {
          // 再次检查会话是否仍然是当前会话，且不在加载中，且未加载过
          const stillNeedsLoad = !loadedSessionIdsRef.current.has(sessionIdToLoad) &&
                                 !loadingSessionIdsRef.current.has(sessionIdToLoad) && 
                                 currentSessionId === sessionIdToLoad && 
                                 (!sessionStates[sessionIdToLoad] || sessionStates[sessionIdToLoad].messages.length === 0)
          if (stillNeedsLoad) {
            console.log("[Chat] 当前会话是真实ID，自动加载消息:", sessionIdToLoad)
            loadSession(sessionIdToLoad)
          }
        }, 100)
        
        return () => clearTimeout(loadTimer)
      }
    }
  }, [sessions, isLoadingSessions, currentSessionId, currentSessionState, loadSession, createNewSession, isClearingAll, sessionStates])

  // 打开删除确认对话框
  const openDeleteDialog = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSessionToDelete(sessionId)
    setDeleteDialogOpen(true)
  }

  // 确认删除会话
  const confirmDeleteSession = async () => {
    if (!sessionToDelete) return
    
    try {
      await storage.chatSessions.remove(sessionToDelete)
      // 清除已加载标记，确保如果重新创建相同ID的会话能正常加载
      loadedSessionIdsRef.current.delete(sessionToDelete)
      if (currentSessionId === sessionToDelete) {
        createNewSession()
      }
      // 重新加载会话列表
      const allSessions = await storage.chatSessions.getAll()
      const userSessions = allSessions.filter(
        (s) => s.organizationId === organizationId && s.createdBy === userId
      )
        setSessions(sortSessions(userSessions))
      setDeleteDialogOpen(false)
      setSessionToDelete(null)
    } catch (error: any) {
      if (process.env.NODE_ENV === "development") {
        console.error("Failed to delete session:", error)
      }
      const errorMessage = error?.message || error?.error || "删除会话失败，请稍后重试"
      toast({
        title: "删除失败",
        description: errorMessage,
        variant: "destructive",
      })
      setDeleteDialogOpen(false)
      setSessionToDelete(null)
    }
  }

  // 打开重命名对话框
  const openRenameDialog = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const session = sessions.find((s) => s.id === sessionId)
    if (session) {
      setSessionToRename(sessionId)
      setNewSessionTitle(session.title)
      setRenameDialogOpen(true)
    }
  }

  // 确认重命名会话
  const confirmRenameSession = async () => {
    if (!sessionToRename || !newSessionTitle.trim()) return

    try {
      const { apiClient } = await import("@/lib/api-client")
      await apiClient.updateChatSession(sessionToRename, {
        title: newSessionTitle.trim(),
      })
      
      // 重新加载会话列表
      const allSessions = await storage.chatSessions.getAll()
      const userSessions = allSessions.filter(
        (s) => s.organizationId === organizationId && s.createdBy === userId
      )
      // 排序：置顶的在前，然后按更新时间排序
        setSessions(sortSessions(userSessions))
      setRenameDialogOpen(false)
      setSessionToRename(null)
      setNewSessionTitle("")
    } catch (error) {
      console.error("Failed to rename session:", error)
      setRenameDialogOpen(false)
      setSessionToRename(null)
      setNewSessionTitle("")
    }
  }

  // 切换置顶状态
  const togglePinSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const session = sessions.find((s) => s.id === sessionId)
      if (!session) return

      const { apiClient } = await import("@/lib/api-client")
      await apiClient.updateChatSession(sessionId, {
        isPinned: !session.isPinned,
      })

      // 重新加载会话列表
      const allSessions = await storage.chatSessions.getAll()
      const userSessions = allSessions.filter(
        (s) => s.organizationId === organizationId && s.createdBy === userId
      )
      // 排序：置顶的在前，然后按更新时间排序
        setSessions(sortSessions(userSessions))
    } catch (error) {
      console.error("Failed to toggle pin session:", error)
    }
  }

  // 清空所有聊天记录
  const confirmClearAllSessions = async () => {
    setIsClearingAll(true)
    try {
      const { apiClient } = await import("@/lib/api-client")
      
      // 获取所有属于当前用户的会话
      const allSessions = await storage.chatSessions.getAll()
      const userSessions = allSessions.filter(
        (s) => s.organizationId === organizationId && s.createdBy === userId
      )

      if (userSessions.length === 0) {
        toast({ 
          title: "提示", 
          description: "没有需要清空的会话" 
        })
        setClearAllDialogOpen(false)
        setIsClearingAll(false)
        return
      }

      // 批量删除所有会话（使用 Promise.all 提高效率）
      const deleteResults = await Promise.allSettled(
        userSessions.map(session => apiClient.deleteChatSession(session.id))
      )
      
      // 检查删除结果
      const failedDeletes = deleteResults
        .map((result, index) => ({ result, session: userSessions[index] }))
        .filter(({ result }) => result.status === 'rejected')
      
      if (failedDeletes.length > 0) {
        console.warn(`[Chat] ${failedDeletes.length} 个会话删除失败，将重试`)
        // 重试失败的删除
        await Promise.allSettled(
          failedDeletes.map(({ session }) => 
            apiClient.deleteChatSession(session.id).catch(error => {
              console.error(`[Chat] 重试删除会话 ${session.id} 失败:`, error)
              return null
            })
          )
        )
      }

      // 等待数据库操作完成
      await new Promise(resolve => setTimeout(resolve, 800))

      // 验证删除是否成功 - 最多重试3次
      let remainingSessions: any[] = []
      let retryCount = 0
      const maxRetries = 3
      
      while (retryCount < maxRetries) {
        const allSessions = await storage.chatSessions.getAll()
        remainingSessions = allSessions.filter(
          (s) => s.organizationId === organizationId && s.createdBy === userId
        )
        
        if (remainingSessions.length === 0) {
          break // 删除成功
        }
        
        console.log(`[Chat] 第 ${retryCount + 1} 次验证：仍有 ${remainingSessions.length} 个会话，继续删除...`)
        
        // 再次删除残留的会话
        await Promise.allSettled(
          remainingSessions.map(session => 
            apiClient.deleteChatSession(session.id).catch(error => {
              console.error(`[Chat] 删除残留会话 ${session.id} 失败:`, error)
              return null
            })
          )
        )
        
        // 等待数据库操作
        await new Promise(resolve => setTimeout(resolve, 500))
        retryCount++
      }
      
      if (remainingSessions.length > 0) {
        console.error(`[Chat] 清空后仍有 ${remainingSessions.length} 个会话无法删除`)
        // 不抛出错误，而是显示警告，让用户知道有部分会话可能未删除
        toast({
          title: "清空完成",
          description: `已清空 ${userSessions.length - remainingSessions.length} 个会话，${remainingSessions.length} 个会话删除失败`,
          variant: "default",
        })
        // 继续执行，清空列表，让用户手动处理残留的会话
      }

      // 清空所有会话状态
      setSessionStates({})
      
      // 清除已加载标记
      loadedSessionIdsRef.current.clear()
      
      // 清除 localStorage
      if (typeof window !== "undefined") {
        localStorage.removeItem("currentChatSessionId")
      }
      
      // 清空会话列表（防止自动加载）
      setSessions([])
      
      // 记录清空时间，用于防止立即重新加载
      setLastClearTime(Date.now())
      
      // 创建新会话（不等待完成，避免触发重新加载）
      createNewSession().catch(error => {
        console.error("创建新会话失败:", error)
      })
      
      // 成功提示
      toast({
        title: "清空成功",
        description: `已清空 ${userSessions.length} 个会话`,
      })
      
      setClearAllDialogOpen(false)
      
      // 延迟重置 isClearingAll，给删除操作更多时间完成，防止立即重新加载
      // 延迟时间足够长，确保所有删除操作和数据库更新都完成
      setTimeout(() => {
        setIsClearingAll(false)
        // 5秒后清除清空时间标记，允许正常加载
        setTimeout(() => {
          setLastClearTime(null)
        }, 5000)
      }, 2000) // 延迟2秒，确保删除操作完全完成
    } catch (error: any) {
      if (process.env.NODE_ENV === "development") {
        console.error("Failed to clear all sessions:", error)
      }
      const errorMessage = error?.message || error?.error || "清空所有聊天记录失败，请稍后重试"
      toast({
        title: "清空失败",
        description: errorMessage,
        variant: "destructive",
      })
      setClearAllDialogOpen(false)
      setIsClearingAll(false)
    }
  }

  // 拖动调整左侧边栏宽度
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return
      const newWidth = e.clientX
      // 限制最小和最大宽度，移除吸附性（不使用Math.round等）
      if (newWidth >= 200 && newWidth <= 600) {
        setSidebarWidth(newWidth)
      }
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }
  }, [isResizing])

  // 保存会话 - 使用防抖优化
  // 注意：API 已经在每次对话时保存了消息，这里主要用于确保会话标题和完整消息列表被保存
  // 为每个会话独立保存
  useEffect(() => {
    // 遍历所有会话状态，为每个会话保存
    Object.entries(sessionStates).forEach(([sessionId, sessionState]) => {
      // 确定使用的数据库连接ID（使用当前会话的配置）
      const dbConnectionId = (selectedAgent && agentDatabase) 
        ? agentDatabase.id 
        : selectedConnection
      
      if (sessionState.messages.length > 0 && dbConnectionId) {
        const saveTimer = setTimeout(async () => {
          try {
            // 只保存属于该会话的消息
            const sessionMessages = sessionState.messages.filter((msg) => {
              return msg.role !== "system" && isMessageForSession(msg.id, sessionId)
            })
            
            if (sessionMessages.length === 0) {
              return
            }
            
            const chatMessages: ChatMessage[] = sessionMessages
              .map((msg) => {
                // 获取对应的用户消息
                const correspondingUserMsg = msg.role === "assistant" 
                  ? sessionState.messages.find((m, idx) => {
                      const msgIdx = sessionState.messages.findIndex(ms => ms.id === msg.id)
                      for (let i = msgIdx - 1; i >= 0; i--) {
                        if (sessionState.messages[i].role === "user") return sessionState.messages[i]
                      }
                      return null
                    })
                  : null
                
                return {
                  id: msg.id,
                  role: msg.role,
                  content: msg.content,
                  timestamp: msg.timestamp || new Date().toISOString(),
                  metadata: sessionState.queryResults[msg.id] || sessionState.firstQueryResults[msg.id]
                  ? {
                      queryResult: sessionState.queryResults[msg.id],
                      firstQueryResult: sessionState.firstQueryResults[msg.id],
                      chartConfig: sessionState.queryResults[msg.id] ? (inferChartType(sessionState.queryResults[msg.id], correspondingUserMsg?.content || msg.content) || undefined) : undefined,
                    }
                  : undefined,
                }
              })

            // 生成会话标题（使用第一条用户消息）
            const firstUserMessage = sessionMessages.find((m) => m.role === "user")
            const sessionTitle = firstUserMessage
              ? firstUserMessage.content.substring(0, 50) + (firstUserMessage.content.length > 50 ? "..." : "")
              : "新对话"

            // 找到当前选择的 LLM 连接 ID
            const currentLlmConnection = llmConnections.find(
              (conn) => conn.model === llmConfig.model && conn.provider === llmConfig.provider
            )
            const llmConnectionId = currentLlmConnection?.id

            // 检查会话 ID 是否是临时 ID（以 session_ 开头）
            const isTemporaryId = sessionId.startsWith("session_")
            
            const effectiveDbConnectionId = getEffectiveDatabaseId()
            
            if (isTemporaryId) {
              // 检查是否已经有对应的真实会话ID（通过 creatingSessionsRef）
              const realSessionId = creatingSessionsRef.current.get(sessionId)
              
              if (realSessionId) {
                // 如果已经有真实会话ID，直接更新真实会话，而不是创建新会话
                console.log(`[Chat] 临时会话 ${sessionId} 已有真实ID ${realSessionId}，更新真实会话`)
                try {
                  await storage.chatSessions.save({
                    id: realSessionId,
                    title: sessionTitle,
                    databaseConnectionId: effectiveDbConnectionId || dbConnectionId,
                    llmConnectionId,
                    organizationId,
                    createdBy: userId,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    messages: chatMessages,
                  } as any)
                  
                  // 如果这是当前会话，确保 currentSessionId 是真实ID
                  if (currentSessionId === sessionId) {
                    setCurrentSessionId(realSessionId)
                  }
                } catch (error) {
                  console.error(`更新真实会话 ${realSessionId} 失败:`, error)
                }
                return // 跳过后续的创建逻辑
              }
              
              // 检查 currentSessionId 是否已经是真实ID（不是临时ID）
              if (currentSessionId && !currentSessionId.startsWith("session_") && currentSessionId !== sessionId) {
                // 如果当前会话ID已经是真实ID，说明会话已经创建，跳过临时ID的保存
                console.log(`[Chat] 当前会话ID ${currentSessionId} 已是真实ID，跳过临时会话 ${sessionId} 的保存`)
                return
              }
              
              // 如果是临时 ID，尝试创建新会话
              // 注意：如果 API 已经创建了会话，这里可能会失败，但这是正常的
              // 因为 API 会在 handleSubmit 中创建会话并返回真实 ID
              try {
                const newSession = await storage.chatSessions.save({
                  id: sessionId, // 临时ID，storage 会忽略并创建新会话
                  title: sessionTitle,
                  databaseConnectionId: effectiveDbConnectionId || dbConnectionId,
                  llmConnectionId,
                  organizationId,
                  createdBy: userId,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  messages: chatMessages,
                } as any)
                
                // 如果创建成功，更新会话ID并迁移状态
                if (newSession && newSession.id && newSession.id !== sessionId) {
                  // 记录临时ID到真实ID的映射
                  creatingSessionsRef.current.set(sessionId, newSession.id)
                  newSessionsRef.current.set(newSession.id, Date.now())
                  
                  const currentState = getSessionState(sessionId)
                  updateSessionState(newSession.id, () => currentState)
                  setSessionStates(prev => {
                    const newStates = { ...prev }
                    delete newStates[sessionId]
                    return newStates
                  })
                  // 如果这是当前会话，更新 currentSessionId
                  if (currentSessionId === sessionId) {
                    setCurrentSessionId(newSession.id)
                  }
                }
              } catch (error) {
                // 如果创建失败（可能是因为 API 已经创建了会话），这是正常的
                // 我们会在 handleSubmit 中处理会话ID的更新
                console.log(`临时会话 ${sessionId} 保存失败，可能已由 API 创建:`, error)
              }
            } else {
              // 已存在的会话，更新会话和消息
              try {
                await storage.chatSessions.save({
                  id: sessionId,
                  title: sessionTitle,
                  databaseConnectionId: effectiveDbConnectionId || dbConnectionId,
                  llmConnectionId,
                  organizationId,
                  createdBy: userId,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  messages: chatMessages,
                } as any)
              } catch (saveError: any) {
                // 如果保存失败且错误是"会话不存在或无权限"
                if (saveError?.message?.includes("会话不存在") || 
                    saveError?.message?.includes("无权限") ||
                    saveError?.status === 404) {
                  console.warn(`会话 ${sessionId} 不存在，尝试作为新会话创建`)
                  // 尝试作为新会话创建
                  try {
                    const newSession = await storage.chatSessions.save({
                      id: `session_${Date.now()}`, // 使用临时ID，让storage创建新会话
                      title: sessionTitle,
                      databaseConnectionId: effectiveDbConnectionId || dbConnectionId,
                      llmConnectionId,
                      organizationId,
                      createdBy: userId,
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                      messages: chatMessages,
                    } as any)
                    
                    // 如果创建成功，更新会话ID并迁移状态
                    if (newSession && newSession.id && newSession.id !== sessionId) {
                      const currentState = getSessionState(sessionId)
                      updateSessionState(newSession.id, () => currentState)
                      setSessionStates(prev => {
                        const newStates = { ...prev }
                        delete newStates[sessionId]
                        return newStates
                      })
                      // 如果这是当前会话，更新 currentSessionId
                      if (currentSessionId === sessionId) {
                        setCurrentSessionId(newSession.id)
                      }
                    }
                  } catch (createError) {
                    // 创建也失败，记录错误但不抛出（避免影响用户体验）
                    console.error(`创建新会话失败:`, createError)
                  }
                } else {
                  // 其他错误，重新抛出
                  throw saveError
                }
              }
            }
          } catch (error: any) {
            console.error(`保存会话 ${sessionId} 失败:`, error)
            if (error.details) {
              console.error("错误详情:", error.details)
            }
            if (error.stack && process.env.NODE_ENV === "development") {
              console.error("错误堆栈:", error.stack)
            }
          }
        }, 2000) // 防抖：2秒后保存

        return () => clearTimeout(saveTimer)
      }
    })
  }, [sessionStates, selectedConnection, selectedAgent, agentDatabase, llmConfig, llmConnections, organizationId, userId, getEffectiveDatabaseId, currentSessionId, getSessionState, updateSessionState])

  const executeQuery = useCallback(async (sql: string, messageId: string, targetSessionId: string) => {
    // 确定使用的数据库连接：智能体的数据库或手动选择的数据库
    const dbConnectionId = getEffectiveDatabaseId()
    if (!dbConnectionId) return

    // 标记该会话正在执行查询
    executingSessionIdsRef.current.add(targetSessionId)
    updateSessionState(targetSessionId, (state) => ({
      ...state,
      isExecuting: true,
    }))
    
    // 更新全局加载状态（用于显示指示器）
    setSessionLoadingStates(prev => ({
      ...prev,
      [targetSessionId]: {
        isLoading: prev[targetSessionId]?.isLoading || false,
        isExecuting: true,
      },
    }))

    try {
      const { apiClient } = await import("@/lib/api-client")
      const data = await apiClient.queryDatabase(dbConnectionId, sql)
      
      // 无论会话是否切换，都要更新结果（后台进程继续运行）
      if (data.result && data.result.rows && data.result.columns) {
        console.log('[Query Result] 查询结果已返回', {
          messageId,
          targetSessionId,
          rowCount: data.result.rows.length,
          columns: data.result.columns,
          result: data.result
        })
        updateSessionState(targetSessionId, (state) => ({
          ...state,
          queryResults: {
            ...state.queryResults,
            [messageId]: data.result,
          },
        }))
        console.log('[Query Result] 查询结果已保存到状态', {
          messageId,
          targetSessionId
        })
      } else {
        console.error('[Query Result] 查询结果格式不正确', {
          messageId,
          data: data
        })
        throw new Error("查询结果格式不正确")
      }
    } catch (error: any) {
      console.error("[Chat] Query execution error:", error)
      
      // 保存错误信息，但不在 queryResults 中显示错误（会在消息中显示）
      const errorMsg = error.message || "查询执行失败"
      
      // 更新对应的消息，添加错误信息（无论会话是否切换）
      updateSessionState(targetSessionId, (state) => ({
        ...state,
        messages: sortMessages(
          state.messages.map((msg) => {
            if (msg.id === messageId) {
              return {
                ...msg,
                content: `${msg.content}\n\n❌ 执行失败: ${errorMsg}`,
              }
            }
            return msg
          })
        ),
      }))
    } finally {
      // 清除执行状态（无论会话是否切换）
      executingSessionIdsRef.current.delete(targetSessionId)
      updateSessionState(targetSessionId, (state) => ({
        ...state,
        isExecuting: false,
      }))
      
      // 更新全局加载状态
      setSessionLoadingStates(prev => ({
        ...prev,
        [targetSessionId]: {
          isLoading: prev[targetSessionId]?.isLoading || false,
          isExecuting: false,
        },
      }))
    }
  }, [getEffectiveDatabaseId, connections, updateSessionState])

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation() // 阻止事件冒泡，避免影响其他控件
    }
    if (!input.trim() || isLoading) return
    
    // 确保有智能体被选中
    if (!selectedAgent) {
      toast({
        title: "请先选择智能体",
        variant: "destructive",
      })
      return
    }
    
    // 确保智能体配置了数据库连接
    if (!agentDatabase) {
      toast({
        title: "智能体未配置数据库连接",
        description: "请前往智能体管理页面配置",
        variant: "destructive",
      })
      return
    }

    // 使用当前会话ID（无论是否切换，都使用当前会话）
    const targetSessionId = currentSessionId

    // 保存原始输入（包含命令），用于显示给用户
    const originalInput = input.trim()
    let userQuestion = originalInput
    
    // 解析命令（支持 /报表、/图表、/表格 等，以及具体图表类型命令）
    const commandResult = parseCommand(userQuestion)
    let commandType: 'report' | 'chart' | 'table' | null = null
    let chartType: ChartConfig["type"] | null = null
    
    // 如果有命令，提取清理后的问题和命令类型（用于后端处理）
    if (commandResult.command) {
      userQuestion = commandResult.question
      commandType = commandResult.command
      chartType = commandResult.chartType || null
    }
    
    // 检查是否是已确认的报表生成请求
    const isConfirmedReport = userQuestion.includes('[已确认生成报表]')
    if (isConfirmedReport) {
      userQuestion = userQuestion.replace('[已确认生成报表]', '').trim()
    }
    
    // 检测是否需要生成报表（如果命令是 /报表，强制生成报表）
    const shouldGenerateReport = commandType === 'report' || IntentAnalyzer.shouldGenerateReport(userQuestion)
    let detectedReportType = "custom"
    
    if (shouldGenerateReport && !isConfirmedReport) {
      // 检测报表类型
      const lowerQuestion = userQuestion.toLowerCase()
      if (lowerQuestion.includes('销售趋势') || lowerQuestion.includes('sales trend')) {
        detectedReportType = "sales_trend"
      } else if (lowerQuestion.includes('销售漏斗') || lowerQuestion.includes('sales funnel')) {
        detectedReportType = "sales_funnel"
      } else if (lowerQuestion.includes('收入') || lowerQuestion.includes('revenue')) {
        detectedReportType = "revenue_analysis"
      } else if (lowerQuestion.includes('客户') || lowerQuestion.includes('customer')) {
        detectedReportType = "customer_analysis"
      } else if (lowerQuestion.includes('产品') || lowerQuestion.includes('product')) {
        detectedReportType = "product_analysis"
      }
      
      // 检查是否是显式命令（包含报表关键词）
      const REPORT_KEYWORDS = ['报表', '报告', '分析报告', '生成报表', '创建报表', '生成报告']
      const isExplicitCommand = REPORT_KEYWORDS.some(keyword => userQuestion.includes(keyword))
      
      // 如果是显式命令，直接生成；否则显示确认对话框
      if (!isExplicitCommand) {
        setPendingReportQuestion(userQuestion)
        setPendingReportType(detectedReportType)
        setReportConfirmOpen(true)
        return // 等待用户确认
      }
    }

    // 保存原始输入到消息内容中（包含命令），这样用户可以看到他们输入了什么
    // 同时将清理后的问题和命令信息保存到 metadata 中，供后端使用
    const userMessage: Message = {
      id: generateMessageId(targetSessionId, "user"),
      role: "user",
      content: originalInput, // 保存原始输入，包含命令
      timestamp: new Date().toISOString(), // 添加时间戳，确保消息可以正确排序
      metadata: {
        ...(commandType ? {
          commandType: commandType,
          chartType: chartType || undefined
        } : {}),
        // 保存清理后的问题，供后端使用
        processedQuestion: userQuestion
      }
    }
    
    // 调试日志：记录命令类型信息
    console.log("[ChatInterface] User message created with command metadata", {
      messageId: userMessage.id,
      commandType: userMessage.metadata?.commandType,
      chartType: userMessage.metadata?.chartType,
      originalInput: originalInput.substring(0, 100),
      processedQuestion: userQuestion.substring(0, 100)
    })

    // 添加用户消息到目标会话
    updateSessionState(targetSessionId, (state) => ({
      ...state,
      messages: sortMessages([...state.messages, userMessage]),
    }))
    
    setInput("")
    
    // 标记该会话正在加载
    loadingSessionIdsRef.current.add(targetSessionId)
    updateSessionState(targetSessionId, (state) => ({
      ...state,
      isLoading: true,
    }))
    
    // 更新全局加载状态（用于显示指示器）
    setSessionLoadingStates(prev => ({
      ...prev,
      [targetSessionId]: {
        isLoading: true,
        isExecuting: prev[targetSessionId]?.isExecuting || false,
      },
    }))

    try {
      const { apiClient } = await import("@/lib/api-client")
      
      // 如果选择了智能体，重新获取最新的智能体配置以确保使用最新的数据库配置
      let latestAgent = selectedAgent
      if (selectedAgentId) {
        try {
          const agentData = await apiClient.getAgent(selectedAgentId)
          latestAgent = agentData.agent
          // 如果智能体的数据库连接已更新，更新本地状态
          if (latestAgent?.databaseConnectionId && latestAgent.databaseConnectionId !== selectedAgent?.databaseConnectionId) {
            const agentDbId = latestAgent.databaseConnectionId
            const updatedAgentDB = connections.find((conn) => conn.id === agentDbId)
            if (updatedAgentDB && agentDbId) {
              setSelectedConnection(agentDbId)
            }
          }
        } catch (error) {
          console.warn("[Chat] Failed to refresh agent config, using cached:", error)
          // 如果获取失败，继续使用缓存的配置
        }
      }
      
      // 获取数据库 schema（如果还没有）- 使用缓存
      let schema = connection?.metadata?.schemas
      // 确定使用的数据库连接ID：优先使用最新获取的智能体配置
      const latestAgentDbId = latestAgent?.databaseConnectionId
      const dbConnectionId = (latestAgentDbId && connections.find((conn) => conn.id === latestAgentDbId))
        ? latestAgentDbId
        : getEffectiveDatabaseId()
      
      // Schema缓存：使用sessionStorage缓存schema，避免重复查询
      // 优化：延长缓存时间从5分钟到30分钟，减少重复查询
      const schemaCacheKey = `schema_cache_${dbConnectionId}`
      const schemaCacheTimestampKey = `schema_cache_timestamp_${dbConnectionId}`
      const CACHE_DURATION = 30 * 60 * 1000 // 30分钟缓存（优化：从5分钟延长到30分钟）
      
      if (!schema && dbConnectionId) {
        try {
          // 检查缓存
          const cachedSchema = typeof window !== "undefined" ? sessionStorage.getItem(schemaCacheKey) : null
          const cacheTimestamp = typeof window !== "undefined" ? sessionStorage.getItem(schemaCacheTimestampKey) : null
          
          if (cachedSchema && cacheTimestamp) {
            const cacheAge = Date.now() - parseInt(cacheTimestamp, 10)
            if (cacheAge < CACHE_DURATION) {
              // 使用缓存
              schema = JSON.parse(cachedSchema)
              console.log("[Chat] Using cached schema, age:", Math.round(cacheAge / 1000), "seconds")
            } else {
              // 缓存过期，清除
              if (typeof window !== "undefined") {
                sessionStorage.removeItem(schemaCacheKey)
                sessionStorage.removeItem(schemaCacheTimestampKey)
              }
            }
          }
          
          // 如果缓存不可用，从API获取
          if (!schema) {
            const schemaData = await apiClient.getDatabaseSchema(dbConnectionId)
            schema = schemaData.schemas
            
            // 保存到缓存
            if (typeof window !== "undefined" && schema) {
              sessionStorage.setItem(schemaCacheKey, JSON.stringify(schema))
              sessionStorage.setItem(schemaCacheTimestampKey, Date.now().toString())
            }
          }
        } catch (error) {
          console.warn("[Chat] Failed to fetch schema:", error)
        }
      }

      let data: {
        message: string
        queryResult?: any
        firstQueryResult?: any
        firstQuerySQL?: string
        sql?: string
        error?: string | null
        workProcess?: string[]
        sessionId?: string
        intent?: any
        attributionAnalysis?: any
        aiReport?: any
      }

      // 获取目标会话的消息（用于API调用）
      const targetSessionState = getSessionState(targetSessionId)
      
      // 创建占位的assistant消息，用于显示实时进度
      const placeholderMessageId = generateMessageId(targetSessionId, "assistant")
      const placeholderMessage: Message & { workProcess?: string[] } = {
        id: placeholderMessageId,
        role: "assistant",
        content: PLACEHOLDER_ASSISTANT_MESSAGE,
        workProcess: [],
        timestamp: new Date().toISOString(),
      }
      
      // 立即添加占位消息，让用户看到处理已开始
      updateSessionState(targetSessionId, (state) => ({
        ...state,
        messages: sortMessages([...state.messages, placeholderMessage]),
      }))
      
      // 确保SSE连接已建立
      if (!targetSessionId.startsWith("session_")) {
        connectSSE(targetSessionId)
      }
      
      try {
        // 发送消息时包含 metadata，确保命令类型等信息被传递到后端
        const messagesToSend = [...targetSessionState.messages, userMessage].map((m) => ({
          role: m.role,
          content: m.content,
          metadata: m.metadata || undefined // 包含 metadata，特别是 commandType
        }))
        
        console.log('[Chat] Sending messages to API', {
          messageCount: messagesToSend.length,
          lastMessage: messagesToSend[messagesToSend.length - 1],
          lastMessageMetadata: messagesToSend[messagesToSend.length - 1]?.metadata
        })
        
        data = await apiClient.chat(
          messagesToSend,
          schema || connection?.metadata,
          llmConfig,
          dbConnectionId,
          targetSessionId,
          selectedAgentId || undefined
        ) as {
          message: string
          queryResult?: any
          firstQueryResult?: any
          firstQuerySQL?: string
          sql?: string
          error?: string | null
          workProcess?: string[]
          sessionId?: string
          intent?: any
          attributionAnalysis?: any
          aiReport?: any
        }
      } catch (error: any) {
        console.error("[Chat] API request failed:", error)
        
        // 创建错误消息（无论会话是否切换，都要更新）
        let errorMessage = error?.message || error?.error || "请求失败"
        const errorDetails = error?.details || undefined
        const errorHint = error?.hint || undefined
        const errorCode = error?.code || undefined
        const status = error?.status || undefined
        const isNetworkError = error?.isNetworkError || false
        
        // 根据错误类型提供更具体的提示
        let errorContent = `❌ **请求失败**\n\n${errorMessage}`
        
        if (status) {
          errorContent += `\n\n状态码: ${status}`
        }
        
        if (errorCode) {
          errorContent += `\n\n错误代码: ${errorCode}`
        }
        
        if (errorDetails) {
          errorContent += `\n\n详细信息：${errorDetails}`
        }
        
        if (errorHint) {
          errorContent += `\n\n提示：${errorHint}`
        }
        
        if (isNetworkError) {
          errorContent += `\n\n**网络连接错误**\n\n可能的原因：\n1. 网络连接中断\n2. 服务器无法访问\n3. 防火墙阻止连接\n\n**解决方案：**\n1. 检查网络连接\n2. 确认服务器地址是否正确\n3. 检查防火墙设置`
        } else if (status === 401 || status === 403) {
          errorContent += `\n\n**认证错误**\n\n可能的原因：\n1. 登录已过期\n2. 权限不足\n\n**解决方案：**\n1. 重新登录\n2. 联系管理员检查权限`
        } else if (status === 404) {
          errorContent += `\n\n**资源未找到**\n\n可能的原因：\n1. API 端点不存在\n2. 资源已被删除\n\n**解决方案：**\n1. 检查 API 配置\n2. 刷新页面重试`
        } else if (status === 500 || status >= 500) {
          errorContent += `\n\n**服务器错误**\n\n可能的原因：\n1. 服务器内部错误\n2. 数据库连接失败\n3. LLM 服务不可用\n\n**解决方案：**\n1. 稍后重试\n2. 检查服务器日志\n3. 联系管理员`
        } else {
          errorContent += `\n\n**可能的原因：**\n1. 网络连接问题\n2. 服务器错误\n3. 数据库连接失败\n4. LLM 服务不可用\n\n**解决方案：**\n1. 检查网络连接\n2. 刷新页面重试\n3. 检查数据库和 LLM 连接配置\n4. 查看浏览器控制台获取更多信息`
        }
        
        const assistantMessage: Message = {
          id: generateMessageId(targetSessionId, "assistant"),
          role: "assistant",
          content: errorContent,
          timestamp: new Date().toISOString(),
        }
        
        // 更新目标会话的消息（无论会话是否切换）
        updateSessionState(targetSessionId, (state) => ({
          ...state,
          messages: sortMessages([...state.messages, assistantMessage]),
          isLoading: false,
        }))
        
        // 清除加载状态
        loadingSessionIdsRef.current.delete(targetSessionId)
        setSessionLoadingStates(prev => ({
          ...prev,
          [targetSessionId]: {
            isLoading: false,
            isExecuting: prev[targetSessionId]?.isExecuting || false,
          },
        }))
        return
      }

      // 如果 API 返回了新的 sessionId（说明创建了新会话），更新 currentSessionId
      const effectiveSessionId = data.sessionId && data.sessionId !== targetSessionId ? data.sessionId : targetSessionId
      if (data.sessionId && data.sessionId !== targetSessionId) {
        // 将当前会话的状态迁移到新会话ID
        const currentState = getSessionState(targetSessionId)
        updateSessionState(effectiveSessionId, () => currentState)
        
        // 清除临时会话的状态（如果原会话ID是临时的）
        if (targetSessionId.startsWith("session_")) {
          setSessionStates(prev => {
            const newStates = { ...prev }
            delete newStates[targetSessionId]
            return newStates
          })
        }
        
        setCurrentSessionId(effectiveSessionId)
        
        // 刷新会话列表以显示更新后的标题
        try {
          const allSessions = await storage.chatSessions.getAll()
          const userSessions = allSessions.filter(
            (s) => s.organizationId === organizationId && s.createdBy === userId
          )
          setSessions(sortSessions(userSessions))
        } catch (error) {
          console.error("刷新会话列表失败:", error)
        }
      }

      // 更新占位消息，而不是创建新消息
      // 确保消息内容不为空，如果为空则从workProcess中提取或使用默认值
      let messageContent = data.message || data.error || ""
      
      // 如果消息内容为空或只是占位符，尝试从workProcess中提取有意义的信息
      if (!messageContent || messageContent.trim() === "" || messageContent === PLACEHOLDER_ASSISTANT_MESSAGE) {
        if (data.workProcess && data.workProcess.length > 0) {
          // 查找最后一条包含实际内容的信息（排除统计和执行完成信息）
          const meaningfulMessages = data.workProcess.filter((step: string) => {
            return !step.includes("统计") && 
                   !step.includes("执行完成") && 
                   !step.includes("迭代") &&
                   !step.includes("Agent 开始执行") &&
                   !step.includes("使用 Agent 架构") &&
                   step.trim().length > 0
          })
          if (meaningfulMessages.length > 0) {
            messageContent = meaningfulMessages[meaningfulMessages.length - 1]
              .replace(/\*\*/g, '') // 移除markdown加粗标记
              .replace(/^[🔍💬📊🔄🤖⚙️✅❌]\s*/, '') // 移除emoji前缀
              .trim()
          }
        }
        
        // 如果仍然为空，使用默认消息
        if (!messageContent || messageContent.trim() === "") {
          messageContent = data.error || "无法生成响应"
        }
      }
      
      console.log("[Chat] Updating assistant message:", {
        messageId: placeholderMessageId,
        contentLength: messageContent?.length || 0,
        contentPreview: messageContent?.substring(0, 100) || "empty",
        hasWorkProcess: !!(data.workProcess && data.workProcess.length > 0),
        workProcessLength: data.workProcess?.length || 0,
      })
      
      const assistantMessage: Message & { workProcess?: string[]; intent?: any } = {
        id: placeholderMessageId,
        role: "assistant",
        content: messageContent,
        workProcess: data.workProcess,
        intent: data.intent,
        timestamp: new Date().toISOString(),
      }

      // 更新目标会话的消息（替换占位消息）
      updateSessionState(effectiveSessionId, (state) => ({
        ...state,
        messages: sortMessages(
          state.messages.map((msg) => 
            msg.id === placeholderMessageId ? assistantMessage : msg
          )
        ),
      }))

      // 如果 API 返回了第一次查询结果，保存并显示
      if (data.firstQueryResult) {
        updateSessionState(effectiveSessionId, (state) => ({
          ...state,
          firstQueryResults: {
            ...state.firstQueryResults,
            [assistantMessage.id]: data.firstQueryResult,
          },
        }))
      }

      // 如果 API 返回了第二次查询结果，直接使用
      if (data.queryResult) {
        console.log('[Query Result from API] API 返回了查询结果', {
          assistantMessageId: assistantMessage.id,
          placeholderMessageId: placeholderMessageId,
          hasRows: data.queryResult.rows?.length > 0,
          rowCount: data.queryResult.rows?.length || 0,
          columns: data.queryResult.columns,
          queryResult: data.queryResult
        })
        updateSessionState(effectiveSessionId, (state) => ({
          ...state,
          queryResults: {
            ...state.queryResults,
            [assistantMessage.id]: data.queryResult,
          },
        }))
        console.log('[Query Result from API] 查询结果已保存', {
          assistantMessageId: assistantMessage.id,
          effectiveSessionId
        })
      }

      // 保存归因分析结果
      if (data.attributionAnalysis) {
        updateSessionState(effectiveSessionId, (state) => ({
          ...state,
          messages: sortMessages(
            state.messages.map((msg) => {
              if (msg.id === assistantMessage.id) {
                return {
                  ...msg,
                  metadata: {
                    ...(msg.metadata || {}),
                    attributionAnalysis: data.attributionAnalysis,
                  },
                }
              }
              return msg
            })
          ),
        }))
      }

      // 保存AI报告
      if (data.aiReport) {
        updateSessionState(effectiveSessionId, (state) => ({
          ...state,
          messages: sortMessages(
            state.messages.map((msg) => {
              if (msg.id === assistantMessage.id) {
                return {
                  ...msg,
                  metadata: {
                    ...(msg.metadata || {}),
                    aiReport: data.aiReport,
                  },
                }
              }
              return msg
            })
          ),
        }))
      }

      // 如果有 SQL 但没有结果，尝试执行查询（无论会话是否切换）
      if (data.sql && !data.error && !data.queryResult) {
        try {
          const jsonBlockMatch = data.message.match(/```json\s*([\s\S]*?)\s*```/)
          const jsonMatch = jsonBlockMatch
            ? jsonBlockMatch[1]
            : data.message.match(/\{[\s\S]*\}/)?.[0]

          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch)
            if (parsed.sql) {
              await executeQuery(parsed.sql, assistantMessage.id, effectiveSessionId)
            }
          } else if (data.sql) {
            await executeQuery(data.sql, assistantMessage.id, effectiveSessionId)
          }
        } catch (error) {
          console.log("[Chat] Could not parse or execute SQL:", error)
        }
      }

      // 如果有错误，更新消息内容
      if (data.error) {
        console.error("[Chat] API returned error:", data.error)
        
        // 检查错误消息是否已经包含详细的诊断信息（包含换行符和多个段落）
        const hasDetailedError = data.error.includes("\n\n") || data.error.includes("**") || data.error.includes("解决方案")
        
        // 提供更友好的错误提示
        let errorHint = ""
        
        if (hasDetailedError) {
          // 错误消息已经包含详细诊断信息，直接使用
          errorHint = `\n\n${data.error}`
        } else if (data.error.includes("Access denied") || data.error.includes("连接")) {
          // 数据库连接错误
          errorHint = `\n\n⚠️ **数据库连接错误**\n\n${data.error}\n\n**解决方案：**\n1. 检查数据库连接配置（用户名、密码）\n2. 确认数据库服务正在运行\n3. 验证用户权限是否足够\n4. 前往"数据库管理"页面测试连接`
        } else if (data.error.includes("Unknown column") || data.error.includes("不存在") || data.error.includes("does not exist")) {
          // 列不存在错误
          const columnMatch = data.error.match(/Unknown column ['"]([^'"]+)['"]/i) || 
                             data.error.match(/列 ['"]([^'"]+)['"] 不存在/i) ||
                             data.error.match(/does not exist: ['"]([^'"]+)['"]/i)
          const columnName = columnMatch ? columnMatch[1] : "未知列"
          
          errorHint = `\n\n❌ **SQL 执行错误：列不存在**\n\n错误信息：${data.error}\n\n**问题分析：**\nAI 生成的 SQL 查询中使用了不存在的列名 "${columnName}"。这可能是因为：\n1. 数据库架构中没有该列\n2. 列名拼写错误\n3. 表结构已更改\n\n**解决方案：**\n1. 检查数据库架构，确认正确的列名\n2. 重新提问，并明确指定要查询的列名\n3. 如果列名确实不存在，请描述您需要查询的数据内容，让 AI 重新生成查询\n\n💡 **提示：** 您可以前往"数据库管理"页面查看完整的数据库架构信息。`
        } else if (data.error.includes("Unknown table") || data.error.includes("表不存在") || data.error.includes("Table") && data.error.includes("doesn't exist")) {
          // 表不存在错误
          const tableMatch = data.error.match(/Unknown table ['"]([^'"]+)['"]/i) || 
                            data.error.match(/表 ['"]([^'"]+)['"] 不存在/i) ||
                            data.error.match(/Table ['"]([^'"]+)['"] doesn't exist/i)
          const tableName = tableMatch ? tableMatch[1] : "未知表"
          
          errorHint = `\n\n❌ **SQL 执行错误：表不存在**\n\n错误信息：${data.error}\n\n**问题分析：**\nAI 生成的 SQL 查询中使用了不存在的表名 "${tableName}"。\n\n**解决方案：**\n1. 检查数据库架构，确认正确的表名\n2. 重新提问，并明确指定要查询的表名\n3. 如果表名确实不存在，请描述您需要查询的数据内容\n\n💡 **提示：** 您可以前往"数据库管理"页面查看完整的数据库架构信息。`
        } else if (data.error.includes("SQL 执行失败") || data.error.includes("SQL syntax")) {
          // SQL 语法错误
          errorHint = `\n\n❌ **SQL 执行错误**\n\n错误信息：${data.error}\n\n**问题分析：**\n生成的 SQL 查询存在语法错误或逻辑问题。\n\n**解决方案：**\n1. 检查错误信息，了解具体问题\n2. 重新提问，更详细地描述您的需求\n3. 如果问题持续，可以尝试简化查询需求\n\n💡 **提示：** 您可以查看上方的 SQL 语句，检查是否有明显错误。`
        } else if (data.error.includes("达到最大迭代次数") || data.error.includes("最大迭代次数")) {
          // Agent 迭代次数限制错误
          const match = data.error.match(/达到最大迭代次数 \((\d+)\/(\d+)\)/)
          const currentIteration = match ? match[1] : "未知"
          const maxIteration = match ? match[2] : "10"
          const toolCallsMatch = data.error.match(/工具调用 (\d+) 次/)
          const toolCalls = toolCallsMatch ? toolCallsMatch[1] : "未知"
          
          errorHint = `\n\n⚠️ **AI 处理超时**\n\n错误信息：${data.error}\n\n**问题分析：**\nAI 在处理您的请求时达到了最大迭代次数限制（${currentIteration}/${maxIteration} 次迭代，${toolCalls} 次工具调用）。这通常发生在：\n1. 查询需求过于复杂，需要多次尝试\n2. 数据库结构信息不完整，导致 AI 需要多次探索\n3. 查询结果需要多次处理和分析\n\n**解决方案：**\n1. **简化查询需求**：将复杂问题拆分为多个简单问题\n2. **提供更多上下文**：在提问时明确指定表名、列名等关键信息\n3. **分步查询**：先查询基础数据，再基于结果进行进一步分析\n4. **检查数据库结构**：确保数据库架构信息完整，前往"数据库管理"页面查看\n5. **重新提问**：点击"重新提交"按钮，或尝试用不同的方式表达需求\n\n💡 **提示：** 如果问题持续存在，可以尝试：\n- 使用更具体的表名和列名\n- 将复杂查询拆分为多个步骤\n- 检查数据库连接和权限是否正常`
        } else {
          // 其他 SQL 错误
          errorHint = `\n\n❌ **SQL 执行错误**\n\n错误信息：${data.error}\n\n**解决方案：**\n1. 检查错误信息，了解具体问题\n2. 确认数据库连接和权限正常\n3. 重新提问，更详细地描述您的需求\n4. 如果问题持续，请前往"数据库管理"页面检查数据库状态`
        }
        
        updateSessionState(effectiveSessionId, (state) => ({
          ...state,
          messages: sortMessages(
            state.messages.map((msg) => {
              if (msg.id === assistantMessage.id) {
                return {
                  ...msg,
                  content: `${msg.content}${errorHint}`,
                }
              }
              return msg
            })
          ),
        }))
      }
      
      // 清除加载状态
      loadingSessionIdsRef.current.delete(effectiveSessionId)
      updateSessionState(effectiveSessionId, (state) => ({
        ...state,
        isLoading: false,
      }))
      
      setSessionLoadingStates(prev => ({
        ...prev,
        [effectiveSessionId]: {
          isLoading: false,
          isExecuting: prev[effectiveSessionId]?.isExecuting || false,
        },
      }))
    } catch (error: any) {
      console.error("[Chat] Chat error:", error)
      
      // 提供更友好的错误提示
      let errorContent = `抱歉，处理您的请求时遇到错误。`
      
      // 如果错误消息已经包含详细的诊断信息（包含换行符和多个段落），直接使用
      const hasDetailedError = error.message?.includes("\n\n") || error.message?.includes("**")
      
      if (hasDetailedError) {
        // 错误消息已经包含详细诊断信息，直接使用
        errorContent = error.message
      } else if (error.message?.includes("API Key") || error.message?.includes("未配置")) {
        errorContent = `❌ 错误: ${error.message}\n\n请前往"模型管理"页面配置 AI 模型连接，需要提供有效的 API Key。`
      } else if (error.message?.includes("fetch failed") || error.message?.includes("无法连接") || error.message?.includes("网络")) {
        errorContent = `❌ 网络错误: ${error.message}\n\n请检查：\n1. 网络连接是否正常\n2. AI 模型 API 配置是否正确（前往"模型管理"页面）\n3. API Key 是否有效\n4. API 服务是否可访问`
      } else if (error.message?.includes("数据库连接")) {
        errorContent = `❌ 数据库错误: ${error.message}\n\n请检查数据库连接配置是否正确。`
      } else {
        errorContent = `❌ 错误: ${error.message || "未知错误"}\n\n如果问题持续存在，请检查：\n1. 数据库连接是否正常\n2. AI 模型配置是否正确\n3. 网络连接是否正常`
      }
      
      const errorMessage: Message = {
        id: generateMessageId(targetSessionId, "error"),
        role: "assistant",
        content: errorContent,
        timestamp: new Date().toISOString(),
      }
      
      // 更新目标会话的消息（无论会话是否切换）
      updateSessionState(targetSessionId, (state) => ({
        ...state,
        messages: sortMessages([...state.messages, errorMessage]),
        isLoading: false,
      }))
      
      // 清除加载状态
      loadingSessionIdsRef.current.delete(targetSessionId)
      setSessionLoadingStates(prev => ({
        ...prev,
        [targetSessionId]: {
          isLoading: false,
          isExecuting: prev[targetSessionId]?.isExecuting || false,
        },
      }))
    }
  }, [input, isLoading, selectedAgent, agentDatabase, currentSessionId, connection, llmConfig, selectedAgentId, connections, getEffectiveDatabaseId, executeQuery, updateSessionState, getSessionState, organizationId, userId])

  // 重试失败的消息
  const handleRetryMessage = useCallback(async (errorMessage: Message) => {
    // 找到对应的用户消息
    const userMessage = getCorrespondingUserMessage(errorMessage.id)
    if (!userMessage) {
      toast({
        title: "无法重试",
        description: "找不到对应的用户消息",
        variant: "destructive",
      })
      return
    }

    // 删除错误消息
    updateSessionState(currentSessionId, (state) => ({
      ...state,
      messages: state.messages.filter(m => m.id !== errorMessage.id),
    }))

    // 重新发送用户消息 - 直接调用 handleSubmit 的逻辑
    // 使用 useRef 来存储 handleSubmit 的引用，或者直接复制逻辑
    const targetSessionId = currentSessionId
    
    // 创建用户消息
    const retryUserMessage: Message = {
      id: generateMessageId(targetSessionId, "user"),
      role: "user",
      content: userMessage.content,
      timestamp: new Date().toISOString(),
    }

    // 添加用户消息到目标会话
    updateSessionState(targetSessionId, (state) => ({
      ...state,
      messages: sortMessages([...state.messages, retryUserMessage]),
    }))
    
    setInput("")
    
    // 标记该会话正在加载
    loadingSessionIdsRef.current.add(targetSessionId)
    updateSessionState(targetSessionId, (state) => ({
      ...state,
      isLoading: true,
    }))
    
    setSessionLoadingStates(prev => ({
      ...prev,
      [targetSessionId]: {
        isLoading: true,
        isExecuting: prev[targetSessionId]?.isExecuting || false,
      },
    }))

    // 调用 API 发送消息（复用 handleSubmit 的逻辑）
    try {
      const { apiClient } = await import("@/lib/api-client")
      
      // 获取数据库 schema
      const targetSessionState = getSessionState(targetSessionId)
      let schema = connection?.metadata?.schemas
      const dbConnectionId = getEffectiveDatabaseId()
      
      if (!schema && dbConnectionId) {
        try {
          const schemaData = await apiClient.getDatabaseSchema(dbConnectionId)
          schema = schemaData.schemas
        } catch (error) {
          console.warn("[Chat] Failed to fetch schema:", error)
        }
      }

      const data = await apiClient.chat(
        [...targetSessionState.messages, retryUserMessage].map((m) => ({ role: m.role, content: m.content })),
        schema || connection?.metadata,
        llmConfig,
        dbConnectionId,
        targetSessionId,
        selectedAgentId || undefined
      ) as any

      // 处理响应（复用 handleSubmit 的成功处理逻辑）
      const effectiveSessionId = data.sessionId && data.sessionId !== targetSessionId ? data.sessionId : targetSessionId
      if (data.sessionId && data.sessionId !== targetSessionId) {
        const currentState = getSessionState(targetSessionId)
        updateSessionState(effectiveSessionId, () => currentState)
        setCurrentSessionId(effectiveSessionId)
      }

      const assistantMessage: Message & { workProcess?: string[]; intent?: any } = {
        id: generateMessageId(effectiveSessionId, "assistant"),
        role: "assistant",
        content: data.message || data.error || "无法生成响应",
        workProcess: data.workProcess,
        intent: data.intent,
        timestamp: new Date().toISOString(),
      }

      updateSessionState(effectiveSessionId, (state) => ({
        ...state,
        messages: sortMessages([...state.messages, assistantMessage]),
        isLoading: false,
      }))

      if (data.queryResult) {
        updateSessionState(effectiveSessionId, (state) => ({
          ...state,
          queryResults: {
            ...state.queryResults,
            [assistantMessage.id]: data.queryResult,
          },
        }))
      }

      if (data.firstQueryResult) {
        updateSessionState(effectiveSessionId, (state) => ({
          ...state,
          firstQueryResults: {
            ...state.firstQueryResults,
            [assistantMessage.id]: data.firstQueryResult,
          },
        }))
      }

      loadingSessionIdsRef.current.delete(effectiveSessionId)
      setSessionLoadingStates(prev => ({
        ...prev,
        [effectiveSessionId]: {
          isLoading: false,
          isExecuting: prev[effectiveSessionId]?.isExecuting || false,
        },
      }))
    } catch (error: any) {
      console.error("[Chat] Retry error:", error)
      const errorContent = `❌ 重试失败: ${error.message || "未知错误"}`
      const errorMsg: Message = {
        id: generateMessageId(targetSessionId, "assistant"),
        role: "assistant",
        content: errorContent,
        timestamp: new Date().toISOString(),
      }
      updateSessionState(targetSessionId, (state) => ({
        ...state,
        messages: sortMessages([...state.messages, errorMsg]),
        isLoading: false,
      }))
      loadingSessionIdsRef.current.delete(targetSessionId)
      setSessionLoadingStates(prev => ({
        ...prev,
        [targetSessionId]: {
          isLoading: false,
          isExecuting: prev[targetSessionId]?.isExecuting || false,
        },
      }))
    }
  }, [currentSessionId, getCorrespondingUserMessage, updateSessionState, getSessionState, connection, llmConfig, selectedAgentId, getEffectiveDatabaseId, generateMessageId, sortMessages, setInput, setCurrentSessionId, setSessionLoadingStates])

  // 处理重新提交用户消息
  const handleRetryUserMessage = useCallback((messageId: string, content: string) => {
    // 将消息内容设置到输入框
    setInput(content)
    // 延迟一下，确保输入框已更新，然后自动提交
    setTimeout(() => {
      // 创建一个模拟的事件对象来调用 handleSubmit
      const mockEvent = {
        preventDefault: () => {},
        stopPropagation: () => {},
      } as React.FormEvent
      handleSubmit(mockEvent)
    }, 100)
  }, [handleSubmit, setInput])

  // 检测是否是错误消息
  const isErrorMessage = useCallback((message: Message): boolean => {
    if (message.role !== "assistant") return false
    const content = message.content.toLowerCase()
    return content.includes("❌") || 
           content.includes("错误") || 
           content.includes("失败") || 
           content.includes("error") ||
           content.includes("处理失败") ||
           content.includes("请求失败")
  }, [])

  const handleSaveReport = (messageId: string) => {
    const result = queryResults[messageId]
    const message = messages.find((m) => m.id === messageId)
    if (result && message && onSaveReport) {
      const title = message.content.substring(0, 50)
      const sqlMatch = message.content.match(/```sql\n([\s\S]*?)\n```/) || message.content.match(/"sql":\s*"([^"]*)"/)
      const sql = sqlMatch ? sqlMatch[1] : "SELECT * FROM table"
      onSaveReport(sql, result, title)
    }
  }

  const handleViewChart = (messageId: string) => {
    setSelectedMessageForChart(messageId)
    setChartDialogOpen(true)
  }

  if (connections.length === 0) {
    return (
      <Card className="p-12 text-center">
        <Database className="w-16 h-16 text-muted mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-foreground mb-2">暂无数据库连接</h3>
        <p className="text-muted mb-6">添加数据库连接以开始使用AI查询</p>
        <Button onClick={() => (window.location.href = "/dashboard/databases")}>前往数据库管理</Button>
      </Card>
    )
  }

  if (llmConnections.length === 0) {
    return (
      <Card className="p-12 text-center">
        <Bot className="w-16 h-16 text-muted mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-foreground mb-2">暂无配置的AI模型</h3>
        <p className="text-muted mb-6">添加AI模型连接以开始使用智能对话功能</p>
        <Button onClick={() => (window.location.href = "/dashboard/models")}>前往模型管理</Button>
      </Card>
    )
  }

  if (agents.length === 0) {
    return (
      <Card className="p-12 text-center">
        <Sparkles className="w-16 h-16 text-muted mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-foreground mb-2">暂无智能体</h3>
        <p className="text-muted mb-6">创建智能体以开始使用智能对话功能。智能对话必须使用智能体。</p>
        <Button onClick={() => (window.location.href = "/dashboard/agents")}>前往智能体管理</Button>
      </Card>
    )
  }

  return (
    <div className="flex w-full h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* 左侧历史记录栏 */}
      <div 
        data-sidebar
        className="border-r border-border/30 bg-background/95 backdrop-blur-sm flex flex-col flex-shrink-0 h-full overflow-hidden relative"
        style={{ 
          width: `${sidebarWidth}px`,
          position: 'relative',
          isolation: 'isolate',
        }}
      >
        <div 
          data-search-container
          className="flex-shrink-0 p-3 bg-background/95 backdrop-blur-sm relative z-20 h-14"
          style={{
            position: 'sticky',
            top: 0,
            left: 0,
            right: 0,
            width: '100%',
            flexShrink: 0,
            transform: 'translateZ(0)',
            willChange: 'transform',
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            height: '56px',
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="搜索历史记录..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-muted/50 border border-transparent focus:border-primary/50 focus:ring-2 focus:ring-primary/20 text-sm transition-all duration-300 hover:bg-muted/70"
              />
            </div>
            <Button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                createNewSession().catch((error) => {
                  console.error("创建新会话时发生错误:", error)
                })
              }}
              disabled={isCreatingSession}
              size="icon"
              className="h-9 w-9 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-300 flex-shrink-0 shadow-md hover:shadow-lg hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              title={isCreatingSession ? "正在创建..." : "新建对话"}
            >
              {isCreatingSession ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
            </Button>
            <Button
              onClick={() => setClearAllDialogOpen(true)}
              size="icon"
              className="h-9 w-9 rounded-lg bg-muted/50 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all duration-300 flex-shrink-0 shadow-sm hover:shadow-md hover:scale-105"
              title="清空所有聊天记录"
              disabled={isClearingAll}
            >
              {isClearingAll ? (
                <LoadingSpinner size="sm" variant="dots" />
              ) : (
                <Eraser className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>

        <ScrollArea 
          className="flex-1 min-h-0 overflow-hidden"
          style={{
            position: 'relative',
            zIndex: 1,
          }}
        >
          <div className="p-2 space-y-1">
            {isLoadingSessions ? (
              <LoadingSkeletonEnhanced type="list" count={5} />
            ) : filteredSessions.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                {searchQuery.trim() ? "未找到匹配的对话" : "暂无历史记录"}
              </div>
            ) : (
              filteredSessions.map((session) => (
                <div
                  key={session.id}
                  data-session-item
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    loadSession(session.id)
                  }}
                  className={`group relative p-3 rounded-lg cursor-pointer transition-all duration-300 hover:bg-muted/50 ${
                    currentSessionId === session.id
                      ? "bg-muted/50 text-foreground"
                      : "hover:bg-muted/30"
                  }`}
                  style={{ 
                    scrollMargin: 0,
                    scrollMarginTop: 0,
                    scrollMarginBottom: 0,
                  }}
                >
                  <div className="flex items-start gap-2">
                    <MessageSquare className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                      currentSessionId === session.id ? "text-foreground" : "text-muted-foreground"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <div className={`text-sm font-medium truncate ${
                          currentSessionId === session.id ? "text-foreground" : "text-foreground"
                        }`}>
                          {session.title}
                        </div>
                        {session.isPinned && (
                          <Pin className="w-3 h-3 text-muted-foreground fill-muted-foreground" />
                        )}
                        {/* 显示会话状态指示器 */}
                        {(() => {
                          const sessionState = sessionLoadingStates[session.id]
                          if (sessionState?.isLoading || sessionState?.isExecuting) {
                            return (
                              <Loader2 className="w-3 h-3 text-primary animate-spin" />
                            )
                          }
                          return null
                        })()}
                      </div>
                      <div className={`text-xs mt-1 ${
                        currentSessionId === session.id
                          ? "text-muted-foreground"
                          : "text-muted-foreground"
                      }`}>
                        {new Date(session.updatedAt).toLocaleDateString("zh-CN", {
                          month: "short",
                          day: "numeric",
                        })}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 rounded-md opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-muted/50 flex-shrink-0 hover:scale-110"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="rounded-lg border-border/50 w-32 shadow-lg">
                        <DropdownMenuItem
                          onClick={(e) => openRenameDialog(session.id, e)}
                          className="rounded-md cursor-pointer transition-colors duration-200"
                        >
                          <Edit className="w-4 h-4 mr-2" />
                          重命名
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => togglePinSession(session.id, e)}
                          className="rounded-md cursor-pointer transition-colors duration-200"
                        >
                          <Pin className={`w-4 h-4 mr-2 ${session.isPinned ? "fill-current" : ""}`} />
                          {session.isPinned ? "取消置顶" : "置顶"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => openDeleteDialog(session.id, e)}
                          className="rounded-md cursor-pointer text-destructive focus:text-destructive transition-colors duration-200"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* 拖动条 - 拖动时显示线框，拖动结束后恢复超细线 */}
      <div
        className={`flex-shrink-0 relative cursor-col-resize ${
          isResizing 
            ? 'w-1 bg-primary/20' 
            : 'w-[1px] bg-border/30 hover:bg-border/50'
        }`}
        style={{
          // 确保拖动结束后恢复1px超细线
          transition: isResizing ? 'none' : 'width 0.2s ease, background-color 0.2s ease',
        }}
        onMouseDown={(e) => {
          e.preventDefault()
          setIsResizing(true)
        }}
      />

      {/* 右侧对话区域 - 固定位置 */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <div className="flex flex-col h-full w-[85%] mx-auto px-4 lg:px-8">
          {/* 对话区域 - Grok 风格 */}
          <div className="flex-1 overflow-y-auto space-y-4 min-h-0 pt-4 pb-4 smooth-scroll" style={{ 
            isolation: 'isolate',
            contain: 'layout style paint'
          }}>
        {messages.length === 0 && (
          <div className="h-full flex items-center justify-center animate-fade-in">
            <div className="text-center max-w-md">
              <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-5 border border-primary/20">
                <Bot className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2 tracking-tight">开始对话</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">使用自然语言提问您的数据问题</p>
            </div>
          </div>
        )}

        {sortMessages(messages)
          .filter((message) => {
            // 过滤掉系统消息
            // 注意：不需要检查 isMessageForSession，因为：
            // 1. API已经按sessionId过滤了消息
            // 2. 前端通过 sessionStates[currentSessionId] 获取消息，已经按会话隔离
            // 3. 数据库消息ID是UUID格式，不包含会话ID，isMessageForSession会导致所有消息被过滤
            return message.role !== "system"
          })
          .map((message) => (
          <div
            key={message.id}
            className={`flex gap-4 ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {message.role === "assistant" && (
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 border border-primary/20 transition-all duration-200 hover:bg-primary/15">
                {message.content === PLACEHOLDER_ASSISTANT_MESSAGE ? (
                  <div className="relative w-5 h-5">
                    {/* 外层旋转圆环 */}
                    <div className="absolute inset-0 rounded-full border-2 border-primary/20"></div>
                    {/* 中层旋转圆环 - 持续旋转 */}
                    <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary border-r-primary animate-thinking-spin"></div>
                    {/* 内层脉冲圆点 */}
                    <div className="absolute inset-1.5 rounded-full bg-primary/60 animate-thinking-pulse"></div>
                    {/* 中心点 */}
                    <div className="absolute inset-2 rounded-full bg-primary"></div>
                  </div>
                ) : (
                  <Bot className="w-4 h-4 text-primary" />
                )}
              </div>
            )}

            {/* 用户消息：显示在气泡中，右侧对齐 */}
            {message.role === "user" ? (
              <div className="flex-1 max-w-[85%] flex justify-end animate-fade-in-up group">
                <div className="rounded-lg px-4 py-2.5 pr-12 transition-all duration-200 hover:shadow-md bg-primary text-white shadow-sm relative">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 whitespace-pre-wrap text-sm leading-relaxed text-white">
                      {message.content || "暂无内容"}
                    </div>
                  </div>
                  {/* 增强的消息操作 - 重新设计位置：放在气泡右上角内部 */}
                  <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10">
                    <MessageActions
                      messageId={message.id}
                      content={message.content}
                      onReply={(id) => {
                        const replyMessage = messages.find(m => m.id === id)
                        if (replyMessage) {
                          setInput(`> ${replyMessage.content}\n\n`)
                          // 延迟聚焦，确保EnhancedInput已渲染
                          setTimeout(() => {
                            const textarea = document.querySelector('textarea[placeholder*="输入消息"]') as HTMLTextAreaElement
                            textarea?.focus()
                          }, 100)
                        }
                      }}
                      onRetry={(id, content) => {
                        handleRetryUserMessage(id, content)
                      }}
                      onEdit={(id, content) => {
                        setEditingMessage(message)
                        setEditMessageContent(content)
                        setEditDialogOpen(true)
                      }}
                      onDelete={(id) => {
                        // TODO: 实现删除消息功能
                        toast({
                          title: "删除消息",
                          description: "消息删除功能开发中",
                        })
                      }}
                      canEdit={true}
                      canDelete={true}
                      canRetry={true}
                    />
                  </div>
                </div>
              </div>
            ) : (
              /* 助手消息：直接显示，无气泡，左侧对齐，支持Markdown */
              <div className="flex-1 max-w-[85%] animate-fade-in-up group relative">
                <div className="w-full relative">
                  {/* 增强的消息操作 - 重新设计位置：放在消息内容区域的右上角 */}
                  <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10">
                    <MessageActions
                      messageId={message.id}
                      content={message.content}
                      onReply={(id) => {
                        const replyMessage = messages.find(m => m.id === id)
                        if (replyMessage) {
                          setInput(`> ${replyMessage.content}\n\n`)
                          // 延迟聚焦，确保EnhancedInput已渲染
                          setTimeout(() => {
                            const textarea = document.querySelector('textarea[placeholder*="输入消息"]') as HTMLTextAreaElement
                            textarea?.focus()
                          }, 100)
                        }
                      }}
                      canEdit={false}
                      canDelete={false}
                    />
                  </div>
                  
                  <div className={`space-y-3 ${isErrorMessage(message) ? "text-red-600 dark:text-red-400" : "text-foreground"}`}>
                    {/* 使用Markdown渲染助手消息内容 */}
                    {(() => {
                      // 占位消息：渲染统一的“处理+思考”提示，避免与底部 loading 重复显示
                      if (message.content === PLACEHOLDER_ASSISTANT_MESSAGE) {
                        return (
                          <div className="bg-muted/50 rounded-lg px-4 py-2.5 border border-border/50 shadow-sm animate-fade-in inline-block">
                            <div className="flex items-center gap-2">
                              {/* 流畅的弹跳动画 - 三个圆点依次弹跳，展现思考律动 */}
                              <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-primary animate-thinking-bounce" style={{ animationDelay: '0ms' }}></div>
                                <div className="w-2 h-2 rounded-full bg-primary animate-thinking-bounce" style={{ animationDelay: '200ms' }}></div>
                                <div className="w-2 h-2 rounded-full bg-primary animate-thinking-bounce" style={{ animationDelay: '400ms' }}></div>
                              </div>
                              <p className="text-sm text-foreground font-medium animate-thinking-text">
                                {getUnifiedLoadingText(isExecuting)}
                              </p>
                            </div>
                          </div>
                        )
                      }

                      // 先过滤掉所有工具调用过程，再显示
                      let displayContent = message.content && message.content.trim() 
                        ? message.content.trim() 
                        : "暂无内容"
                      
                      // 在渲染前先过滤掉 function_calls 相关的内容（支持中文竖线｜和英文竖线|）
                      if (displayContent && !isErrorMessage(message)) {
                        // 移除所有 DSML function_calls 相关的内容（支持中文竖线｜和英文竖线|）
                        displayContent = displayContent
                          .replace(/<[｜|]\s*DSML\s*[｜|]\s*function_calls\s*>[\s\S]*?(?=\n\n|$)/gi, '')
                          .replace(/<[｜|]\s*DSML\s*[｜|]\s*invoke[^>]*>[\s\S]*?(?=\n\n|$)/gi, '')
                          .replace(/<[｜|]\s*DSML\s*[｜|]\s*parameter[^>]*>[\s\S]*?(?=\n\n|$)/gi, '')
                          .replace(/<[｜|]\s*DSML\s*[｜|]\s*[^>]*>/gi, '')
                          .replace(/\n{3,}/g, '\n\n')
                          .trim()
                      }
                      
                      // 如果过滤后内容为空，不显示
                      if (!displayContent || displayContent === "暂无内容") {
                        return null
                      }
                      
                      // 错误消息：直接显示，不使用Markdown
                      if (isErrorMessage(message)) {
                        return (
                          <div className="whitespace-pre-wrap text-base leading-relaxed">
                            {displayContent}
                          </div>
                        )
                      }
                      
                      // 普通消息：使用Markdown渲染（renderMarkdown内部会再次过滤）
                      return (
                        <div className="text-base leading-relaxed">
                          {renderMarkdown(displayContent)}
                        </div>
                      )
                    })()}
                    
                    {/* 执行流程摘要已移除，完整流程在下方折叠区域显示 */}
                  </div>
                  
                  {/* JSON数据自动图表/表格生成 */}
                  {(() => {
                    try {
                      // 只在非错误消息中检测JSON图表/表格
                      if (isErrorMessage(message)) {
                        return null
                      }
                      
                      // 检测消息中的JSON数据
                      const jsonDataStructures = extractAllJSONData(message.content)
                      
                      if (jsonDataStructures.length > 0) {
                        return (
                          <div className="mt-4 space-y-4">
                            {jsonDataStructures.map((jsonData, index) => {
                              try {
                                console.log("[Chat] Processing JSON data structure", {
                                  index,
                                  isArray: jsonData.isArray,
                                  isObject: jsonData.isObject,
                                  dataLength: jsonData.data?.length || 0,
                                  hasMetadata: !!jsonData.metadata
                                })
                                
                                if (!isChartableJSON(jsonData)) {
                                  console.log("[Chat] JSON data is not chartable", {
                                    index,
                                    dataLength: jsonData.data?.length || 0
                                  })
                                  return null
                                }
                                
                                // 获取对应的用户问题
                                const userMessage = getCorrespondingUserMessage(message.id)
                                const userQuestion = userMessage?.content || ""
                                const hasChartIntent = hasChartKeywords(userQuestion)
                                
                                // 获取命令类型和具体图表类型（如果有）
                                const commandType = userMessage?.metadata?.commandType as 'chart' | 'table' | null
                                const specifiedChartType = userMessage?.metadata?.chartType as ChartConfig["type"] | null
                                
                                console.log("[Chat] Rendering JSON chart/table", {
                                  messageId: message.id,
                                  commandType,
                                  specifiedChartType,
                                  jsonDataType: jsonData.metadata?.type,
                                  dataLength: jsonData.data.length,
                                  hasMetadata: !!jsonData.metadata
                                })
                                
                                // 用户未指定任何组件（且也没有图表意图）时：默认用表格展示
                                // 目的：避免 LLM 输出了 visualization / metadata.type 时自动画图
                                if ((commandType === null || typeof commandType === "undefined") && !hasChartIntent) {
                                  const tableConfig = createChartConfig(jsonData, 'table', userQuestion)
                                  if (tableConfig) {
                                    return (
                                      <div key={`json-table-${message.id}-${index}`} className="mt-4">
                                        <EChartsTableRenderer
                                          config={tableConfig}
                                          className="rounded-lg"
                                          isLoading={false}
                                        />
                                      </div>
                                    )
                                  }
                                  return null
                                }

                                // 如果用户明确要求表格，强制使用表格类型，忽略 JSON 中的 visualization 字段
                                if (commandType === 'table') {
                                  console.log("[Chat] User requested table, forcing table type and ignoring visualization", {
                                    messageId: message.id,
                                    jsonDataType: jsonData.metadata?.type
                                  })
                                  const tableConfig = createChartConfig(jsonData, 'table', userQuestion)
                                  if (tableConfig) {
                                    return (
                                      <div key={`json-table-${message.id}-${index}`} className="mt-4">
                                        <EChartsTableRenderer
                                          config={tableConfig}
                                          className="rounded-lg"
                                          isLoading={false}
                                        />
                                      </div>
                                    )
                                  }
                                  return null
                                }
                                
                                // 如果JSON metadata中指定了图表类型，优先使用（来自LLM返回的visualization字段）
                                let finalChartType = specifiedChartType
                                if (!finalChartType && jsonData.metadata?.type) {
                                  finalChartType = jsonData.metadata.type as ChartConfig["type"]
                                  console.log("[Chat] Using chart type from JSON metadata", {
                                    type: finalChartType
                                  })
                                }
                                
                                // 如果用户指定了具体图表类型，直接使用
                                if (finalChartType) {
                                  const directConfig = createChartConfig(jsonData, finalChartType, userQuestion)
                                  if (directConfig) {
                                    console.log("[Chat] Created chart config", {
                                      type: directConfig.type,
                                      title: directConfig.title,
                                      dataLength: directConfig.data.length
                                    })
                                    
                                    // 对于表格类型，不限制数据量（使用分页）
                                    // 对于图表类型，限制数据量避免性能问题
                                    if (directConfig.type !== 'table' && jsonData.data.length > 1000) {
                                      console.warn("[Chat] JSON data too large for chart, skipping chart generation")
                                      return null
                                    }
                                    
                                    // 根据类型渲染图表或表格
                                    if (directConfig.type === 'table') {
                                      return (
                                        <div key={`json-table-${message.id}-${index}`} className="mt-4">
                                          <EChartsTableRenderer
                                            config={directConfig}
                                            className="rounded-lg"
                                            isLoading={false}
                                          />
                                        </div>
                                      )
                                    } else {
                                      return (
                                        <div key={`json-chart-${message.id}-${index}`} className="mt-4">
                                          <EChartsRenderer
                                            config={directConfig}
                                            className="rounded-lg"
                                            isLoading={false}
                                            onChartClick={(data, chartIndex) => {
                                              console.log("Chart clicked:", data, chartIndex)
                                            }}
                                          />
                                        </div>
                                      )
                                    }
                                  } else {
                                    console.warn("[Chat] Failed to create chart config", {
                                      chartType: finalChartType,
                                      dataLength: jsonData.data.length
                                    })
                                  }
                                }
                                
                                // 否则使用智能推断
                                const preferredType = commandType === 'chart' || hasChartIntent ? 'chart' :
                                                     commandType === 'table' ? 'table' : 'table'
                                
                                // 如果用户明确要求表格，强制使用表格类型，不进行推断
                                if (commandType === 'table') {
                                  console.log("[Chat] User requested table, forcing table type (bypassing inference)", {
                                    messageId: message.id,
                                    jsonDataType: jsonData.metadata?.type
                                  })
                                  const tableConfig = createChartConfig(jsonData, 'table', userQuestion)
                                  if (tableConfig) {
                                    return (
                                      <div key={`json-table-${message.id}-${index}`} className="mt-4">
                                        <EChartsTableRenderer
                                          config={tableConfig}
                                          className="rounded-lg"
                                          isLoading={false}
                                        />
                                      </div>
                                    )
                                  }
                                  return null
                                }
                                
                                // 推断图表/表格类型（传递命令类型作为优先类型）
                                const chartConfig = inferChartTypeFromJSON(jsonData, userQuestion, preferredType)
                                
                                if (!chartConfig) {
                                  console.warn("[Chat] Failed to infer chart type from JSON", {
                                    dataLength: jsonData.data.length,
                                    hasMetadata: !!jsonData.metadata
                                  })
                                  return null
                                }
                                
                                console.log("[Chat] Inferred chart config", {
                                  type: chartConfig.type,
                                  title: chartConfig.title
                                })
                                
                                // 对于表格类型，不限制数据量（使用分页）
                                // 对于图表类型，限制数据量避免性能问题
                                if (chartConfig.type !== 'table' && jsonData.data.length > 1000) {
                                  console.warn("[Chat] JSON data too large for chart, skipping chart generation", {
                                    dataLength: jsonData.data.length,
                                    chartType: chartConfig.type
                                  })
                                  return null
                                }
                                
                                // 根据类型渲染图表或表格
                                if (chartConfig.type === 'table') {
                                  return (
                                    <div key={`json-table-${message.id}-${index}`} className="mt-4">
                                      <EChartsTableRenderer
                                        config={chartConfig}
                                        className="rounded-lg"
                                        isLoading={false}
                                      />
                                    </div>
                                  )
                                } else {
                                  return (
                                    <div key={`json-chart-${message.id}-${index}`} className="mt-4">
                                      <EChartsRenderer
                                        config={chartConfig}
                                        className="rounded-lg"
                                        isLoading={false}
                                        onChartClick={(data, chartIndex) => {
                                          // 图表点击事件处理
                                          console.log("Chart clicked:", data, chartIndex)
                                        }}
                                      />
                                    </div>
                                  )
                                }
                              } catch (err) {
                                console.warn(`[Chat] Error rendering JSON chart/table ${index}:`, err)
                                return null
                              }
                            })}
                          </div>
                        )
                      }
                      
                      return null
                    } catch (error) {
                      console.warn("[Chat] Error detecting JSON charts/tables:", error)
                      return null
                    }
                  })()}
                  
                  {/* 助手消息的操作按钮 */}
                  <div className="flex items-center gap-1 mt-2 flex-shrink-0">
                    {/* 重试按钮（仅在错误消息时显示） */}
                    {isErrorMessage(message) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-full opacity-70 hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                        onClick={() => handleRetryMessage(message)}
                        title="重新发送"
                      >
                        <RotateCw className="w-4 h-4" />
                      </Button>
                    )}
                    
                    {/* 眼睛按钮：显示/隐藏详细信息 */}
                    {(() => {
                      const jsonInfo = parseMessageJson(message.content)
                      if (jsonInfo.hasJson && (jsonInfo.explanation || jsonInfo.sql || jsonInfo.reasoning)) {
                        const isVisible = messageDetailsVisible[message.id] ?? showSqlDetails
                        return (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                            onClick={() => {
                              setMessageDetailsVisible(prev => ({
                                ...prev,
                                [message.id]: !isVisible
                              }))
                            }}
                            title={isVisible ? "隐藏详细信息" : "显示详细信息"}
                          >
                            {isVisible ? (
                              <Eye className="w-4 h-4" />
                            ) : (
                              <EyeOff className="w-4 h-4" />
                            )}
                          </Button>
                        )
                      }
                      return null
                    })()}
                  </div>
                  
                  {/* 助手消息的额外内容（步骤展示、查询结果等） */}
                  {/* 步骤展示（如果有workProcess）- 默认隐藏，不显示给用户 */}
                  {false && message.workProcess && message.workProcess.length > 0 && (() => {
                  const isExpanded = expandedWorkProcess[message.id] ?? false
                  const parsedSteps = parseWorkProcess(message.workProcess)
                  const querySteps: QueryStep[] = parsedSteps.map((step, index) => {
                    const stepDetails: any = {}
                    
                    // 如果是意图解析步骤，提取intent信息
                    if (step.title.includes("意图") || step.title.includes("解析")) {
                      if (message.intent) {
                        stepDetails.intent = message.intent.query || getCorrespondingUserMessage(message.id)?.content || ""
                        stepDetails.businessTheme = message.intent.businessTheme || "数据分析"
                        stepDetails.queryMode = message.intent.queryMode || "查询模式"
                        stepDetails.metrics = message.intent.metrics || []
                        stepDetails.filters = message.intent.filters || []
                      }
                    }
                    
                    // 如果是SQL生成步骤，提取SQL信息
                    if (step.title.includes("SQL") || step.title.includes("生成")) {
                      const jsonInfo = parseMessageJson(message.content)
                      if (jsonInfo.sql) {
                        stepDetails.sql = jsonInfo.sql
                        stepDetails.sqlSteps = [
                          "Schema映射",
                          "Few-shot示例",
                          "LLM解析S2SQL",
                          "修正S2SQL",
                          "最终执行SQL"
                        ]
                      }
                    }
                    
                    // 如果是数据查询步骤，提取结果信息
                    if (step.title.includes("查询") || step.title.includes("数据")) {
                      const result = queryResults[message.id]
                      if (result) {
                        const userMsg = getCorrespondingUserMessage(message.id)
                        stepDetails.summary = formatQuerySummary(result, userMsg?.content || "")
                        
                        // 如果只有一行一列，提取结果值
                        if (result.rows && result.rows.length === 1 && result.columns && result.columns.length === 1) {
                          stepDetails.result = result.rows[0][result.columns[0]]
                        }
                      }
                    }
                    
                    return {
                      id: `step_${message.id}_${index}`,
                      title: step.title,
                      status: step.status,
                      duration: step.duration,
                      details: Object.keys(stepDetails).length > 0 ? stepDetails : undefined,
                      timestamp: message.timestamp,
                    }
                  })
                  
                  return (
                    <div className="mt-4 pt-4 border-t border-border/40">
                      {/* 折叠/展开按钮 */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full flex items-center justify-between h-8 px-3 text-xs text-muted-foreground hover:text-foreground mb-2"
                        onClick={() => {
                          setExpandedWorkProcess(prev => ({
                            ...prev,
                            [message.id]: !isExpanded
                          }))
                        }}
                      >
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                          <span>执行流程 ({querySteps.length} 步)</span>
                        </div>
                        <span className="text-xs opacity-60">
                          {isExpanded ? "点击收起" : "点击展开"}
                        </span>
                      </Button>
                      
                      {/* 执行流程内容 - 根据折叠状态显示/隐藏 */}
                      {isExpanded && (
                        <QueryStepsDisplay 
                          steps={querySteps}
                          onRequery={() => {
                            const userMsg = getCorrespondingUserMessage(message.id)
                            if (userMsg) {
                              setInput(userMsg.content)
                            }
                          }}
                          onExportLog={() => {
                            const jsonInfo = parseMessageJson(message.content)
                            if (jsonInfo.sql) {
                              const log = {
                                timestamp: new Date().toISOString(),
                                userQuestion: getCorrespondingUserMessage(message.id)?.content || "",
                                steps: message.workProcess,
                                sql: jsonInfo.sql,
                                result: queryResults[message.id],
                              }
                              const blob = new Blob([JSON.stringify(log, null, 2)], { type: "application/json" })
                              const url = URL.createObjectURL(blob)
                              const a = document.createElement("a")
                              a.href = url
                              a.download = `query-log-${message.id}.json`
                              a.click()
                              URL.revokeObjectURL(url)
                            }
                          }}
                        />
                      )}
                    </div>
                  )
                })()}

                {/* 详细信息显示区域 - 已隐藏，不向用户显示 JSON 内容 */}

                  {/* 第一次查询结果（数据结构）- 表格显示 */}
                  {firstQueryResults[message.id] && (
                  <div className="mt-4 pt-4 border-t border-border/40">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs text-muted-foreground font-medium">
                        📊 第一次查询结果（数据结构）
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground mb-3">
                      返回 {firstQueryResults[message.id].rowCount} 条结构信息
                      {firstQueryResults[message.id].executionTime > 0 && (
                        <span className="ml-2">· 耗时 {firstQueryResults[message.id].executionTime}ms</span>
                      )}
                    </div>
                    {firstQueryResults[message.id].rows && firstQueryResults[message.id].rows.length > 0 && (
                      <div className="mt-4">
                        <DataTable
                          columns={createColumnsFromQueryResult(firstQueryResults[message.id].columns)}
                          data={firstQueryResults[message.id].rows}
                          searchable={true}
                          exportable={true}
                          defaultPageSize={10}
                        />
                      </div>
                    )}
                  </div>
                )}

                  {/* 第二次查询结果（实际数据）- 图表和表格显示 */}
                  {(() => {
                    const hasQueryResult = !!queryResults[message.id]
                    console.log('[Query Result Check]', {
                      messageId: message.id,
                      hasQueryResult,
                      queryResult: queryResults[message.id],
                      allQueryResults: Object.keys(queryResults)
                    })
                    return hasQueryResult
                  })() && (() => {
                  // 检查对应的用户消息是否包含图表关键词
                  const userMessage = getCorrespondingUserMessage(message.id)
                  const shouldShowChart = userMessage ? hasChartKeywords(userMessage.content) : false
                  
                  console.log('[Query Result Display] 开始渲染查询结果', {
                    messageId: message.id,
                    hasQueryResult: !!queryResults[message.id],
                    userMessage: userMessage?.content?.substring(0, 50)
                  })
                  
                  return (
                    <div className="mt-4 pt-4 border-t border-border/40 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-muted-foreground font-medium">
                          📈 第二次查询结果（实际数据）
                        </div>
                        {shouldShowChart && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => handleViewChart(message.id)}
                          >
                            <TrendingUp className="w-3.5 h-3.5 mr-1.5" />
                            查看图表
                          </Button>
                        )}
                      </div>
                      {/* 数据总结 */}
                      {(() => {
                        const userMsg = getCorrespondingUserMessage(message.id)
                        const userQuestion = userMsg?.content || ""
                        const hasChartIntent = hasChartKeywords(userQuestion)
                        const commandType = userMsg?.metadata?.commandType as 'report' | 'chart' | 'table' | null
                        const summary = formatQuerySummary(queryResults[message.id], userQuestion)
                        
                        // 使用智能格式选择函数决定显示格式
                        const displayFormat = determineDisplayFormat(
                          queryResults[message.id],
                          userQuestion,
                          hasChartIntent,
                          commandType
                        )
                        
                        return (
                          <div className="mb-4 p-4 bg-gradient-to-br from-primary/5 to-primary/10 rounded-lg border border-primary/20">
                            <div className="text-sm font-medium text-foreground mb-2">总结:</div>
                            <div className="text-base text-foreground leading-relaxed">{summary}</div>
                            {/* 根据显示格式决定是否显示大数字 */}
                            {displayFormat === "large-number" && (() => {
                              const rows = queryResults[message.id].rows
                              const columns = queryResults[message.id].columns || []
                              
                              // 单个数值（一行一列）
                              if (rows.length === 1 && columns.length === 1) {
                                return (
                                  <div className="mt-4">
                                    <div className="text-4xl font-bold text-primary mb-2">
                                      {formatNumber(rows[0][columns[0]], { showOriginal: true })}
                                    </div>
                                  </div>
                                )
                              }
                              
                              // 聚合结果（一行两列，第二列是数值）
                              if (rows.length === 1 && columns.length === 2 && typeof rows[0][columns[1]] === "number") {
                                return (
                                  <div className="mt-4">
                                    <div className="text-xs text-muted-foreground mb-1">{translateColumnName(columns[0])}: {rows[0][columns[0]]}</div>
                                    <div className="text-4xl font-bold text-primary">
                                      {formatNumber(rows[0][columns[1]], { showOriginal: true })}
                                    </div>
                                  </div>
                                )
                              }
                              
                              return null
                            })()}
                          </div>
                        )
                      })()}
                      
                      <div className="text-xs text-muted-foreground mb-3">
                        返回 {queryResults[message.id].rowCount} 条结果
                        {queryResults[message.id].executionTime > 0 && (
                          <span className="ml-2">· 耗时 {queryResults[message.id].executionTime}ms</span>
                        )}
                      </div>
                      
                      {/* 自动生成的图表 - 使用多层降级方案 */}
                      {queryResults[message.id].rows && queryResults[message.id].rows.length > 0 && (() => {
                        const userMessage = getCorrespondingUserMessage(message.id)
                        const userQuestion = userMessage?.content || ""
                        const hasChartIntent = hasChartKeywords(userQuestion)
                        
                        // 获取命令类型（如果有）
                        const userMsgForChart = getCorrespondingUserMessage(message.id)
                        const commandTypeForChart = userMsgForChart?.metadata?.commandType as 'report' | 'chart' | 'table' | null
                        
                        // 使用智能格式选择函数决定显示格式
                        const displayFormat = determineDisplayFormat(
                          queryResults[message.id],
                          userQuestion,
                          hasChartIntent,
                          commandTypeForChart
                        )
                        
                        // 如果用户明确要求表格，不显示图表（即使消息中有 visualization 字段）
                        if (commandTypeForChart === 'table') {
                          console.log('[Chart Render] User requested table, skipping chart display', {
                            messageId: message.id,
                            commandType: commandTypeForChart,
                            hasVisualization: !!message.metadata?.chartConfig
                          })
                          return null
                        }
                        
                        // 如果用户使用了图表命令（如 @柱状图），强制显示图表
                        const chartTypeFromCommand = userMsgForChart?.metadata?.chartType as string | null | undefined
                        const shouldForceChart = commandTypeForChart === 'chart' && chartTypeFromCommand
                        
                        // 如果格式不是图表相关，且用户没有明确要求图表，不显示图表
                        if (!shouldForceChart && displayFormat !== "chart" && displayFormat !== "chart-and-table") {
                          console.log('[Chart Render] Display format is not chart-related, skipping', {
                            messageId: message.id,
                            displayFormat,
                            commandType: commandTypeForChart
                          })
                          return null
                        }
                        
                        // 将查询结果转换为对象数组格式（如果rows是数组数组）
                        const rows = queryResults[message.id].rows
                        const columns = queryResults[message.id].columns || []
                        const convertedRows = rows.map((row: any) => {
                          // 如果row是数组，转换为对象
                          if (Array.isArray(row)) {
                            const rowObj: any = {}
                            columns.forEach((col: string, idx: number) => {
                              rowObj[col] = row[idx]
                            })
                            return rowObj
                          }
                          // 如果已经是对象，直接返回
                          return row
                        })
                        
                        // 创建临时的queryResult对象，使用转换后的rows
                        const convertedQueryResult = {
                          ...queryResults[message.id],
                          rows: convertedRows
                        }
                        
                        // 使用多层降级方案获取图表配置
                        let chartConfig = getChartConfigWithFallback(
                          message.content,
                          convertedQueryResult,
                          userQuestion
                        )
                        
                        // 如果用户使用了图表命令但配置生成失败，强制生成配置
                        if (shouldForceChart && !chartConfig) {
                          if (columns.length >= 2) {
                            chartConfig = {
                              type: chartTypeFromCommand || 'bar',
                              title: userQuestion.replace(/@[柱折饼面散雷].*图\s*/gi, '').trim() || '数据图表',
                              xAxis: columns[0],
                              yAxis: columns.length > 1 ? columns[1] : columns[0],
                              data: convertedRows,
                              colors: ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#ef4444"]
                            }
                          }
                        }
                        
                        // 只在数据适合可视化时显示图表（至少2列，且数据量合理）
                        const canShowChart = queryResults[message.id].columns.length >= 2 && 
                                           queryResults[message.id].rows.length > 0 &&
                                           queryResults[message.id].rows.length <= 1000
                        
                        if (canShowChart && chartConfig) {
                          // 检测图表是否正在加载
                          const isChartLoading = false
                          
                          return (
                            <div className="mt-4">
                              <ChartRenderer 
                                config={chartConfig} 
                                className="rounded-lg"
                                isLoading={isChartLoading}
                                onChartClick={(data, index) => {
                                  // 启用图表钻取功能
                                  setDrilldownState({
                                    messageId: message.id,
                                    chartConfig,
                                    queryResult: queryResults[message.id],
                                  })
                                }}
                              />
                            </div>
                          )
                        }
                        return null
                      })()}
                      
                      {/* 数据表格 - 根据显示格式决定是否显示 */}
                      {queryResults[message.id] && (() => {
                        const userMessage = getCorrespondingUserMessage(message.id)
                        const userQuestion = userMessage?.content || ""
                        const hasChartIntent = hasChartKeywords(userQuestion)
                        const commandType = userMessage?.metadata?.commandType as 'report' | 'chart' | 'table' | null
                        
                        // 调试信息
                        console.log('[Table Render Debug]', {
                          messageId: message.id,
                          commandType,
                          hasQueryResult: !!queryResults[message.id],
                          hasRows: queryResults[message.id]?.rows?.length > 0,
                          rowsLength: queryResults[message.id]?.rows?.length || 0,
                          columnsLength: queryResults[message.id]?.columns?.length || 0,
                          userQuestion: userQuestion.substring(0, 50),
                          metadata: userMessage?.metadata,
                          queryResult: queryResults[message.id]
                        })
                        
                        // 如果查询结果还没有返回数据，显示加载提示
                        if (!queryResults[message.id].rows || queryResults[message.id].rows.length === 0) {
                          // 如果用户使用了 @表格 命令，显示等待提示
                          if (commandType === 'table') {
                            return (
                              <div className="mt-4 p-4 bg-muted/50 rounded-lg border border-border/50">
                                <div className="text-sm text-muted-foreground">
                                  正在等待查询结果... 如果查询已完成但仍未显示表格，请刷新页面。
                                </div>
                              </div>
                            )
                          }
                          return null
                        }
                        
                        // 如果用户使用了 @表格 命令，强制显示表格
                        if (commandType === 'table') {
                          // 将查询结果转换为表格组件期望的格式
                          // queryResults 格式: { columns: string[], rows: any[] }
                          // EChartsTableRenderer 期望: data 是对象数组
                          const tableData = queryResults[message.id].rows.map((row: any) => {
                            const rowObj: any = {}
                            queryResults[message.id].columns.forEach((col: string, idx: number) => {
                              // 如果 row 是数组，按索引获取；如果是对象，按列名获取
                              if (Array.isArray(row)) {
                                rowObj[col] = row[idx]
                              } else {
                                rowObj[col] = row[col] ?? row[idx] ?? null
                              }
                            })
                            return rowObj
                          })
                          
                          const tableConfig: ChartConfig = {
                            type: 'table',
                            title: userQuestion.replace(/@表格\s*/gi, '').trim() || '数据表格',
                            data: tableData,
                          }
                          
                          console.log('[Table Config]', {
                            originalRows: queryResults[message.id].rows,
                            columns: queryResults[message.id].columns,
                            convertedData: tableData,
                            config: tableConfig
                          })
                          
                          return (
                            <div className="mt-4">
                              <EChartsTableRenderer
                                config={tableConfig}
                                className="rounded-lg"
                                isLoading={false}
                              />
                            </div>
                          )
                        }
                        
                        // 使用智能格式选择函数决定显示格式
                        const displayFormat = determineDisplayFormat(
                          queryResults[message.id],
                          userQuestion,
                          hasChartIntent,
                          commandType
                        )
                        
                        // 如果格式是大字符，不显示表格
                        if (displayFormat === "large-number") {
                          return null
                        }
                        
                        // 如果格式是图表且用户没有明确要求表格，不显示表格
                        if (displayFormat === "chart" && commandType !== 'table') {
                          return null
                        }
                        
                        // 其他情况显示 DataTable（向后兼容）
                        return (
                        <div className="mt-4">
                          <DataTable
                            columns={createColumnsFromQueryResult(queryResults[message.id].columns)}
                            data={queryResults[message.id].rows}
                            searchable={true}
                            exportable={true}
                            defaultPageSize={20}
                          />
                        </div>
                        )
                      })()}
                    </div>
                  )
                  })()}

                  {/* 智能归因分析结果 */}
                  {message.metadata?.attributionAnalysis && (() => {
                  const attribution = message.metadata.attributionAnalysis
                  return (
                    <div className="mt-4 pt-4 border-t border-border/30">
                      <Card className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                        <div className="flex items-center gap-2 mb-3">
                          <TrendingUp className="w-4 h-4 text-primary" />
                          <h3 className="text-sm font-semibold text-foreground">智能归因分析</h3>
                        </div>
                        {attribution.summary && (
                          <p className="text-sm text-foreground/90 mb-3 leading-relaxed">{attribution.summary}</p>
                        )}
                        {attribution.insights && attribution.insights.length > 0 && (
                          <div className="space-y-2 mb-3">
                            <div className="text-xs font-medium text-foreground mb-2">关键洞察</div>
                            {attribution.insights.slice(0, 5).map((insight: any, index: number) => (
                              <div key={index} className="text-xs text-foreground/80 pl-3 border-l-2 border-primary/30 leading-relaxed">
                                <span className="font-medium">[{insight.type}]</span> {insight.description}
                                {insight.confidence && (
                                  <span className="text-muted-foreground ml-2">
                                    (置信度: {(insight.confidence * 100).toFixed(0)}%)
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {attribution.recommendations && attribution.recommendations.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-primary/20">
                            <div className="text-xs font-medium text-foreground mb-2">建议</div>
                            <ul className="space-y-1.5">
                              {attribution.recommendations.map((rec: string, index: number) => (
                                <li key={index} className="text-xs text-foreground/80 pl-3 leading-relaxed">• {rec}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </Card>
                    </div>
                  )
                })()}

                  {/* AI分析报告 - 使用报表预览卡片 */}
                  {message.metadata?.aiReport && (
                    <div className="mt-4 pt-4 border-t border-border/30">
                      <ReportPreviewCard
                        report={message.metadata.aiReport}
                        onViewFull={() => {
                          setReportModalOpen(prev => ({ ...prev, [message.id]: true }))
                        }}
                        onExport={async (format) => {
                          // 导出逻辑
                          try {
                            if (format === "markdown") {
                              const { ReportGenerator } = await import("@/lib/report-generator")
                              const markdown = ReportGenerator.formatAsMarkdown(message.metadata.aiReport)
                              const blob = new Blob([markdown], { type: "text/markdown" })
                              const url = URL.createObjectURL(blob)
                              const a = document.createElement("a")
                              a.href = url
                              a.download = `${message.metadata.aiReport.title}.md`
                              document.body.appendChild(a)
                              a.click()
                              document.body.removeChild(a)
                              URL.revokeObjectURL(url)
                              toast({
                                title: "导出成功",
                                description: "报表已导出为 Markdown 格式",
                              })
                            } else if (format === "json") {
                              const json = JSON.stringify(message.metadata.aiReport, null, 2)
                              const blob = new Blob([json], { type: "application/json" })
                              const url = URL.createObjectURL(blob)
                              const a = document.createElement("a")
                              a.href = url
                              a.download = `${message.metadata.aiReport.title}.json`
                              document.body.appendChild(a)
                              a.click()
                              document.body.removeChild(a)
                              URL.revokeObjectURL(url)
                              toast({
                                title: "导出成功",
                                description: "报表已导出为 JSON 格式",
                              })
                            } else if (format === "pdf") {
                              toast({
                                title: "PDF 导出",
                                description: "PDF 导出功能需要额外配置，当前支持 Markdown 和 JSON 导出",
                              })
                            }
                          } catch (error) {
                            console.error("导出失败:", error)
                            toast({
                              title: "导出失败",
                              description: "导出报表时发生错误，请稍后重试",
                              variant: "destructive",
                            })
                          }
                        }}
                        onShare={() => {
                          toast({
                            title: "分享功能",
                            description: "报表分享功能即将推出",
                          })
                        }}
                        onSave={() => {
                          toast({
                            title: "保存功能",
                            description: "报表保存功能即将推出",
                          })
                        }}
                      />
                      {/* 报表弹窗 */}
                      {reportModalOpen[message.id] && (
                        <AIReportViewer
                          report={message.metadata.aiReport}
                          modal={true}
                          open={reportModalOpen[message.id]}
                          onOpenChange={(open) => {
                            setReportModalOpen(prev => ({ ...prev, [message.id]: open }))
                          }}
                          onClose={() => {
                            setReportModalOpen(prev => ({ ...prev, [message.id]: false }))
                          }}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {(isLoading || isExecuting) && !hasPlaceholderAssistantMessage && (
          <div className="flex gap-3 animate-fade-in-up">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 border border-primary/20">
              {/* 美观的动态思考动画 - 多层旋转效果，持续旋转 */}
              <div className="relative w-5 h-5">
                {/* 外层旋转圆环 */}
                <div className="absolute inset-0 rounded-full border-2 border-primary/20"></div>
                {/* 中层旋转圆环 - 持续快速旋转 */}
                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary border-r-primary animate-thinking-spin"></div>
                {/* 内层脉冲圆点 - 律动效果 */}
                <div className="absolute inset-1.5 rounded-full bg-primary/60 animate-thinking-pulse"></div>
                {/* 中心点 */}
                <div className="absolute inset-2 rounded-full bg-primary"></div>
              </div>
            </div>
            <div className="bg-muted/50 rounded-lg px-4 py-2.5 border border-border/50 shadow-sm animate-fade-in">
              <div className="flex items-center gap-2">
                {/* 流畅的弹跳动画 - 三个圆点依次弹跳，展现思考律动 */}
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-primary animate-thinking-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 rounded-full bg-primary animate-thinking-bounce" style={{ animationDelay: '200ms' }}></div>
                  <div className="w-2 h-2 rounded-full bg-primary animate-thinking-bounce" style={{ animationDelay: '400ms' }}></div>
                </div>
                {/* 思考文本律动效果 */}
                <p className="text-sm text-foreground font-medium animate-thinking-text">{getUnifiedLoadingText(isExecuting)}</p>
              </div>
            </div>
          </div>
        )}

          <div ref={messagesEndRef} />
        </div>

        {/* 修改消息对话框 - 精美优化版 */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent 
            className="sm:max-w-[850px] p-0 gap-0 bg-card backdrop-blur-xl border border-border/50 shadow-lg overflow-hidden rounded-lg"
            showCloseButton={true}
          >
            {/* 顶部标题栏 */}
            <div className="px-6 py-4 border-b border-border/50">
              <DialogHeader>
                <DialogTitle className="text-lg font-semibold text-foreground flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Pencil className="w-4 h-4 text-primary" />
                  </div>
                  <span>修改问题</span>
                </DialogTitle>
              </DialogHeader>
            </div>
            
            {/* 主要内容区域 */}
            <div className="px-6 py-5">
              <div className="relative group">
                <Textarea
                  value={editMessageContent}
                  onChange={(e) => setEditMessageContent(e.target.value)}
                  className="min-h-[100px] max-h-[250px] w-full bg-card border border-border/50 focus:border-primary focus:ring-2 focus:ring-primary/20 text-foreground placeholder:text-muted-foreground/60 resize-none rounded-lg px-4 py-3 text-sm leading-relaxed transition-all duration-200 hover:border-primary/30"
                  placeholder="在这里输入您的问题..."
                  autoFocus
                  rows={4}
                  onKeyDown={(e) => {
                    // 支持 Ctrl/Cmd + Enter 快速发送
                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                      e.preventDefault()
                      const sendButton = document.querySelector('[data-send-edit-message]') as HTMLButtonElement
                      sendButton?.click()
                    }
                    // 支持 Enter 发送（如果内容不为空）
                    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && editMessageContent.trim()) {
                      e.preventDefault()
                      const sendButton = document.querySelector('[data-send-edit-message]') as HTMLButtonElement
                      sendButton?.click()
                    }
                  }}
                />
                {/* 字符计数 */}
                {editMessageContent.length > 0 && (
                  <div className="absolute bottom-4 right-4 px-2 py-1 rounded-md bg-muted/80 backdrop-blur-sm text-xs text-muted-foreground">
                    {editMessageContent.length} 字符
                  </div>
                )}
              </div>
              
              {/* 底部操作栏 */}
              <div className="mt-5 pt-4 border-t border-border/30 flex items-center justify-between">
                <div className="text-xs text-muted-foreground/80 flex items-center gap-3">
                  <span className="flex items-center gap-1.5">
                    <kbd className="px-1.5 py-0.5 text-xs font-semibold text-foreground bg-muted border border-border/50 rounded">Enter</kbd>
                    <span>发送</span>
                  </span>
                  <span className="text-border/50">•</span>
                  <span className="flex items-center gap-1.5">
                    <kbd className="px-1.5 py-0.5 text-xs font-semibold text-foreground bg-muted border border-border/50 rounded">Shift</kbd>
                    <span>+</span>
                    <kbd className="px-1.5 py-0.5 text-xs font-semibold text-foreground bg-muted border border-border/50 rounded">Enter</kbd>
                    <span>换行</span>
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditDialogOpen(false)
                      setEditingMessage(null)
                      setEditMessageContent("")
                    }}
                    className="h-10 px-5 rounded-lg border-border/60 bg-background hover:bg-muted/80 hover:border-border transition-all duration-200 font-medium"
                  >
                    取消
                  </Button>
                  <Button
                    data-send-edit-message
                    onClick={async () => {
                      if (!editMessageContent.trim() || !editingMessage) {
                        return
                      }
                      
                      // 关闭对话框
                      setEditDialogOpen(false)
                      
                      // 更新原消息的内容，删除该消息之后的所有助手回复，保留之前的完整对话历史
                      const messageIndex = messages.findIndex(m => m.id === editingMessage.id)
                      if (messageIndex !== -1) {
                        // 找到该消息之后第一个助手回复的位置
                        // 删除从该消息之后第一个助手回复开始的所有消息
                        let firstAssistantAfterIndex = -1
                        for (let i = messageIndex + 1; i < messages.length; i++) {
                          if (messages[i].role === "assistant") {
                            firstAssistantAfterIndex = i
                            break
                          }
                        }
                        
                        // 如果找到了助手回复，删除从该助手回复开始的所有消息
                        // 如果没有找到，说明该消息之后没有助手回复，只更新消息内容即可
                        const messagesToKeep = firstAssistantAfterIndex !== -1
                          ? messages.slice(0, firstAssistantAfterIndex)
                          : messages.slice(0, messageIndex + 1)
                        
                        // 更新消息内容
                        const updatedMessagesList = messagesToKeep.map((msg, idx) => 
                          idx === messageIndex 
                            ? { ...msg, content: editMessageContent.trim() }
                            : msg
                        )
                        
                        // 更新状态
                        updateSessionState(currentSessionId, (state) => {
                          // 清理被删除消息的查询结果
                          const deletedMessageIds = new Set(
                            messages.slice(firstAssistantAfterIndex !== -1 ? firstAssistantAfterIndex : messageIndex + 1)
                              .map(m => m.id)
                          )
                          
                          return {
                            ...state,
                            messages: updatedMessagesList,
                            queryResults: Object.fromEntries(
                              Object.entries(state.queryResults).filter(([msgId]) => !deletedMessageIds.has(msgId))
                            ),
                            firstQueryResults: Object.fromEntries(
                              Object.entries(state.firstQueryResults).filter(([msgId]) => !deletedMessageIds.has(msgId))
                            ),
                          }
                        })
                        
                        // 获取更新后的完整消息列表（用于API调用）
                        const updatedMessages = updatedMessagesList
                        
                        // 基于当前对话次序继续提问
                        // 获取数据库 schema
                        const targetSessionState = getSessionState(currentSessionId)
                        let schema = connection?.metadata?.schemas
                        const dbConnectionId = getEffectiveDatabaseId()
                        
                        if (!schema && dbConnectionId) {
                          try {
                            const { apiClient } = await import("@/lib/api-client")
                            const schemaData = await apiClient.getDatabaseSchema(dbConnectionId)
                            schema = schemaData.schemas
                          } catch (error) {
                            console.warn("[Chat] Failed to fetch schema:", error)
                          }
                        }
                        
                        // 标记会话正在加载
                        loadingSessionIdsRef.current.add(currentSessionId)
                        updateSessionState(currentSessionId, (state) => ({
                          ...state,
                          isLoading: true,
                        }))
                        setSessionLoadingStates(prev => ({
                          ...prev,
                          [currentSessionId]: {
                            isLoading: true,
                            isExecuting: prev[currentSessionId]?.isExecuting || false,
                          },
                        }))
                        
                        // 调用 API 继续对话
                        try {
                          const { apiClient } = await import("@/lib/api-client")
                          const data = await apiClient.chat(
                            updatedMessages.map((m) => ({ role: m.role, content: m.content })),
                            schema || connection?.metadata,
                            llmConfig,
                            dbConnectionId,
                            currentSessionId,
                            selectedAgentId || undefined
                          ) as any
                          
                          // 处理响应
                          const effectiveSessionId = data.sessionId && data.sessionId !== currentSessionId ? data.sessionId : currentSessionId
                          if (data.sessionId && data.sessionId !== currentSessionId) {
                            const currentState = getSessionState(currentSessionId)
                            updateSessionState(effectiveSessionId, () => currentState)
                            setCurrentSessionId(effectiveSessionId)
                          }
                          
                          // 添加新的助手回复
                          const assistantMessage: Message & { workProcess?: string[]; intent?: any } = {
                            id: generateMessageId(effectiveSessionId, "assistant"),
                            role: "assistant",
                            content: data.message || data.error || "无法生成响应",
                            workProcess: data.workProcess,
                            intent: data.intent,
                            timestamp: new Date().toISOString(),
                          }
                          
                          updateSessionState(effectiveSessionId, (state) => ({
                            ...state,
                            messages: sortMessages([...state.messages, assistantMessage]),
                            isLoading: false,
                          }))
                          
                          // 更新查询结果
                          if (data.queryResult) {
                            updateSessionState(effectiveSessionId, (state) => ({
                              ...state,
                              queryResults: {
                                ...state.queryResults,
                                [assistantMessage.id]: data.queryResult,
                              },
                            }))
                          }
                          
                          if (data.firstQueryResult) {
                            updateSessionState(effectiveSessionId, (state) => ({
                              ...state,
                              firstQueryResults: {
                                ...state.firstQueryResults,
                                [assistantMessage.id]: data.firstQueryResult,
                              },
                            }))
                          }
                          
                          // 如果有 SQL 但没有结果，尝试执行查询
                          if (data.sql && !data.error && !data.queryResult) {
                            try {
                              const jsonBlockMatch = data.message.match(/```json\s*([\s\S]*?)\s*```/)
                              const jsonMatch = jsonBlockMatch
                                ? jsonBlockMatch[1]
                                : data.message.match(/\{[\s\S]*\}/)?.[0]
                              
                              if (jsonMatch) {
                                const parsed = JSON.parse(jsonMatch)
                                if (parsed.sql) {
                                  await executeQuery(parsed.sql, assistantMessage.id, effectiveSessionId)
                                }
                              } else if (data.sql) {
                                await executeQuery(data.sql, assistantMessage.id, effectiveSessionId)
                              }
                            } catch (error) {
                              console.log("[Chat] Could not parse or execute SQL:", error)
                            }
                          }
                          
                          loadingSessionIdsRef.current.delete(effectiveSessionId)
                          setSessionLoadingStates(prev => ({
                            ...prev,
                            [effectiveSessionId]: {
                              isLoading: false,
                              isExecuting: prev[effectiveSessionId]?.isExecuting || false,
                            },
                          }))
                        } catch (error: any) {
                          console.error("[Chat] Edit and resend error:", error)
                          const errorContent = `❌ 重新提问失败: ${error.message || "未知错误"}`
                          const errorMsg: Message = {
                            id: generateMessageId(currentSessionId, "assistant"),
                            role: "assistant",
                            content: errorContent,
                            timestamp: new Date().toISOString(),
                          }
                          updateSessionState(currentSessionId, (state) => ({
                            ...state,
                            messages: sortMessages([...state.messages, errorMsg]),
                            isLoading: false,
                          }))
                          loadingSessionIdsRef.current.delete(currentSessionId)
                          setSessionLoadingStates(prev => ({
                            ...prev,
                            [currentSessionId]: {
                              isLoading: false,
                              isExecuting: prev[currentSessionId]?.isExecuting || false,
                            },
                          }))
                        }
                      }
                      
                      // 清理编辑状态
                      setEditingMessage(null)
                      setEditMessageContent("")
                    }}
                    className="h-10 px-5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center gap-2 group"
                    disabled={!editMessageContent.trim()}
                  >
                    <Send className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    发送
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* 输入区域 - Grok 风格 - 固定在底部 */}
          <div 
            className="flex-shrink-0 sticky bottom-0 pt-4 pb-4 border-t border-border/50 bg-background z-10"
            style={{
              position: 'sticky',
              bottom: 0,
              isolation: 'isolate',
              contain: 'layout style paint',
              willChange: 'transform',
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
            }}
          >
            {/* 智能体、数据库和模型选择器 - 紧凑布局 */}
            <div className="flex items-center gap-2 mb-4">
              {agents.length > 0 ? (
                <Select 
                  value={selectedAgentId || ""} 
                  onValueChange={(value) => {
                    setSelectedAgentId(value)
                  }}
                >
                  <SelectTrigger className="h-9 w-[200px] text-sm rounded-lg border-border/50 bg-card data-[state=open]:border-primary/50 hover:border-primary/30 transition-all duration-300 shadow-sm hover:shadow-md">
                    <SelectValue placeholder="选择智能体" />
                  </SelectTrigger>
                  <SelectContent className="rounded-lg border-border/50 shadow-lg">
                    {agents.filter(a => a.status === "active").map((agent) => (
                      <SelectItem key={agent.id} value={agent.id} className="rounded-md">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-muted-foreground" />
                          {agent.name}
                          {agent.isDefault && (
                            <span className="text-xs text-muted-foreground ml-1">(默认)</span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="h-9 px-3 flex items-center gap-2 text-sm rounded-lg border border-destructive/50 bg-destructive/10 text-destructive">
                  <Sparkles className="w-4 h-4" />
                  <span>请先创建智能体</span>
                </div>
              )}

              {/* 如果选择了智能体，显示绑定的数据库（只读）；否则显示提示 */}
              {selectedAgent ? (
                agentDatabase ? (
                  <div className="h-9 px-3 flex items-center gap-2 text-sm rounded-lg border border-border/50 bg-muted/50 text-muted-foreground shadow-sm transition-all duration-300">
                    <Database className="w-4 h-4" />
                    <span>{agentDatabase.name}</span>
                  </div>
                ) : (
                  <div className="h-9 px-3 flex items-center gap-2 text-sm rounded-lg border border-destructive/50 bg-destructive/10 text-destructive shadow-sm transition-all duration-300">
                    <Database className="w-4 h-4" />
                    <span>智能体未配置数据库</span>
                  </div>
                )
              ) : (
                agents.length === 0 && (
                  <div className="h-9 px-3 flex items-center gap-2 text-sm rounded-lg border border-destructive/50 bg-destructive/10 text-destructive shadow-sm transition-all duration-300">
                    <Database className="w-4 h-4" />
                    <span>请先创建智能体</span>
                  </div>
                )
              )}

              {llmConnections.length > 0 && !selectedAgent && agents.length > 0 && (
                <Select
                  value={llmConfig.model}
                  onValueChange={(value) => {
                    const selectedModel = llmConnections.find((m) => m.model === value)
                    if (selectedModel) {
                      setLlmConfig({
                        provider: selectedModel.provider,
                        model: selectedModel.model,
                        temperature: selectedModel.temperature,
                        maxTokens: selectedModel.maxTokens,
                      })
                    }
                  }}
                >
                  <SelectTrigger className="h-9 w-[200px] text-sm rounded-lg border-border/50 bg-card data-[state=open]:border-primary/50 hover:border-primary/30 transition-all duration-300 shadow-sm hover:shadow-md">
                    <Bot className="w-4 h-4 mr-2 text-muted-foreground" />
                    <SelectValue placeholder="选择模型" />
                  </SelectTrigger>
                  <SelectContent className="rounded-lg border-border/50 shadow-lg">
                    {llmConnections.map((model) => (
                      <SelectItem key={model.id} value={model.model} className="rounded-md">
                        <div className="flex items-center gap-2">
                          <Bot className="w-4 h-4 text-muted-foreground" />
                          {model.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              
              {/* SQL 详细信息显示开关 */}
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-lg border-border/50 bg-card hover:bg-muted transition-all duration-300 shadow-sm hover:shadow-md hover:scale-105"
                onClick={() => {
                  const newValue = !showSqlDetails
                  setShowSqlDetails(newValue)
                  localStorage.setItem("chat_show_sql_details", String(newValue))
                }}
                title={showSqlDetails ? "隐藏 SQL 详细信息" : "显示 SQL 详细信息"}
              >
                {showSqlDetails ? (
                  <Eye className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <EyeOff className="w-4 h-4 text-muted-foreground" />
                )}
              </Button>
              
              {/* 帮助按钮 */}
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-lg border-border/50 bg-card hover:bg-muted transition-all duration-300 shadow-sm hover:shadow-md hover:scale-105"
                onClick={() => setHelpDialogOpen(true)}
                title="使用教程与示例"
              >
                <HelpCircle className="w-4 h-4 text-muted-foreground" />
              </Button>
            </div>

            {/* 增强输入框 - 支持多行、历史记录、语音输入 */}
            <EnhancedInput
              value={input}
              onChange={setInput}
              onSubmit={handleSubmit}
              placeholder={
                selectedAgent && agentDatabase
                  ? "输入问题或使用命令：@图表、@表格、@报表 (输入 @ 查看所有命令)"
                  : selectedAgent
                  ? "智能体未配置数据库连接..."
                  : agents.length === 0
                  ? "请先创建智能体..."
                  : "请先选择智能体..."
              }
              disabled={!selectedAgent || !agentDatabase || isLoading}
              isLoading={isLoading}
              onFileUpload={(files) => {
                // TODO: 实现文件上传功能
                toast({
                  title: "文件上传",
                  description: `已选择 ${files.length} 个文件（功能开发中）`,
                })
              }}
            />
            
            {/* 快速命令按钮 */}
            {selectedAgent && agentDatabase && (
              <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">快速命令：</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setInput("@图表 ")
                    const textarea = document.querySelector('textarea') as HTMLTextAreaElement
                    setTimeout(() => textarea?.focus(), 100)
                  }}
                >
                  <BarChart3 className="w-3 h-3 mr-1" />
                  图表
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setInput("@表格 ")
                    const textarea = document.querySelector('textarea') as HTMLTextAreaElement
                    setTimeout(() => textarea?.focus(), 100)
                  }}
                >
                  <Grid3x3 className="w-3 h-3 mr-1" />
                  表格
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setInput("@报表 ")
                    const textarea = document.querySelector('textarea') as HTMLTextAreaElement
                    setTimeout(() => textarea?.focus(), 100)
                  }}
                >
                  <FileText className="w-3 h-3 mr-1" />
                  报表
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground"
                  onClick={() => setHelpDialogOpen(true)}
                >
                  <HelpCircle className="w-3 h-3 mr-1" />
                  查看所有命令
                </Button>
              </div>
            )}
          </div>

        {selectedMessageForChart && queryResults[selectedMessageForChart] && (
          <ChartDialog
            open={chartDialogOpen}
            onClose={() => {
              setChartDialogOpen(false)
              setSelectedMessageForChart("")
            }}
            queryResult={queryResults[selectedMessageForChart]}
            initialQuestion={parseMessageContent(messages.find((m) => m.id === selectedMessageForChart)?.content || "", selectedMessageForChart)}
          />
        )}

        {/* 图表钻取对话框 */}
        {drilldownState && (
          <Dialog open={!!drilldownState} onOpenChange={(open) => {
            if (!open) setDrilldownState(null)
          }}>
            <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
              <ChartDrilldown
                chartConfig={drilldownState.chartConfig}
                originalData={drilldownState.queryResult}
                onBack={() => setDrilldownState(null)}
              />
            </DialogContent>
          </Dialog>
        )}

        {/* 快捷键帮助对话框 */}
        <ShortcutsHelp open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
        
        {/* 帮助对话框 */}
        <ChatHelpDialog open={helpDialogOpen} onOpenChange={setHelpDialogOpen} />
        
        {/* 报表生成确认对话框 */}
        <ReportGenerationConfirm
          open={reportConfirmOpen}
          userQuestion={pendingReportQuestion}
          detectedReportType={pendingReportType as any}
          onConfirm={() => {
            setReportConfirmOpen(false)
            // 重新提交问题（这次会直接生成报表，因为已经确认）
            const question = pendingReportQuestion
            setPendingReportQuestion("")
            
            // 设置输入并触发提交（通过设置一个标记来跳过确认）
            setInput(question + " [已确认生成报表]")
            // 使用 setTimeout 确保状态更新后再提交
            setTimeout(() => {
              const form = document.querySelector('form')
              if (form) {
                const submitEvent = new Event('submit', { bubbles: true, cancelable: true })
                form.dispatchEvent(submitEvent)
              }
            }, 50)
          }}
          onCancel={() => {
            setReportConfirmOpen(false)
            setPendingReportQuestion("")
          }}
        />
        </div>
      </div>

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="rounded-xl shadow-2xl" style={{ maxWidth: '480px', width: 'calc(100% - 2rem)' }}>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除此会话吗？此操作无法撤销，会话中的所有消息将被永久删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setDeleteDialogOpen(false)
              setSessionToDelete(null)
            }}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteSession}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 重命名对话框 */}
      <AlertDialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <AlertDialogContent className="rounded-xl shadow-2xl" style={{ maxWidth: '480px', width: 'calc(100% - 2rem)' }}>
          <AlertDialogHeader>
            <AlertDialogTitle>重命名会话</AlertDialogTitle>
            <AlertDialogDescription>
              请输入新的会话名称
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Input
              value={newSessionTitle}
              onChange={(e) => setNewSessionTitle(e.target.value)}
              placeholder="会话名称"
              className="rounded-lg transition-all duration-300 focus:ring-2 focus:ring-primary/20"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  confirmRenameSession()
                }
              }}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setRenameDialogOpen(false)
              setSessionToRename(null)
              setNewSessionTitle("")
            }}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRenameSession}
              disabled={!newSessionTitle.trim()}
            >
              确认
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 清空所有聊天记录确认对话框 */}
      <AlertDialog open={clearAllDialogOpen} onOpenChange={setClearAllDialogOpen}>
        <AlertDialogContent className="rounded-xl shadow-2xl" style={{ maxWidth: '480px', width: 'calc(100% - 2rem)' }}>
          <AlertDialogHeader>
            <AlertDialogTitle>确认清空所有聊天记录</AlertDialogTitle>
            <AlertDialogDescription>
              确定要清空所有聊天记录吗？此操作无法撤销，所有会话和消息将被永久删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              onClick={() => {
                setClearAllDialogOpen(false)
              }}
              disabled={isClearingAll}
            >
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmClearAllSessions}
              disabled={isClearingAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isClearingAll ? (
                <>
                  <LoadingSpinner size="sm" variant="dots" className="mr-2" />
                  清空中...
                </>
              ) : (
                "确认清空"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
