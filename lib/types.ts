// Core type definitions for the enterprise BI system

export interface User {
  id: string
  email: string
  name: string
  avatar?: string
  role: "admin" | "analyst" | "viewer"
  organizationId: string
  createdAt: string
  lastLoginAt?: string
}

export interface Organization {
  id: string
  name: string
  slug: string
  plan: "free" | "pro" | "enterprise"
  createdAt: string
  settings: OrganizationSettings
}

export interface OrganizationSettings {
  allowedDomains?: string[]
  maxDatabaseConnections: number
  maxUsers: number
}

export interface DatabaseConnection {
  id: string
  name: string
  type: "mysql" | "postgresql" | "sqlite" | "sqlserver"
  host: string
  port: number
  database: string
  username: string
  password: string
  ssl: boolean
  organizationId: string
  createdBy: string
  createdAt: string
  lastTestedAt?: string
  status: "connected" | "disconnected" | "error"
  isDefault?: boolean
  metadata?: {
    tables?: string[]
    schemas?: DatabaseSchema[]
  }
}

export interface DatabaseSchema {
  tableName: string
  columns: ColumnInfo[]
  rowCount?: number
}

export interface ColumnInfo {
  name: string
  type: string
  nullable: boolean
  isPrimaryKey: boolean
  isForeignKey: boolean
  description?: string
}

export interface ChatSession {
  id: string
  title: string
  databaseConnectionId: string
  llmConnectionId?: string
  isPinned?: boolean
  organizationId: string
  createdBy: string
  createdAt: string
  updatedAt: string
  status?: string // idle, processing, completed, error
  currentTaskId?: string | null // 当前正在处理的任务ID
  messages: ChatMessage[]
}

export interface ChatMessage {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  timestamp: string
  metadata?: {
    sql?: string
    queryResult?: QueryResult
    firstQueryResult?: QueryResult
    firstQuerySQL?: string
    chartConfig?: ChartConfig
    error?: string
  }
}

export interface QueryResult {
  columns: string[]
  /**
   * 原始字段名（未翻译），用于列级权限/脱敏对齐
   */
  originalColumns?: string[]
  /**
   * 字段名映射：original -> display（翻译后）
   */
  columnNameMap?: Record<string, string>
  rows: Record<string, any>[]
  rowCount: number
  executionTime: number
}

export interface ChartConfig {
  type: "bar" | "line" | "pie" | "area" | "scatter" | "table" | "radar" | "composed" | 
        "bar-horizontal" | "bar-stacked" | "area-stacked" |
        "gauge" | "funnel" | "heatmap" | "tree" | "treemap" | "sunburst" |
        "graph" | "parallel" | "sankey" | "boxplot" | "candlestick" | "map"
  title: string
  xAxis?: string
  yAxis?: string | string[]
  data: Record<string, any>[]
  colors?: string[]
}

export interface SavedReport {
  id: string
  title: string
  description?: string
  sql: string
  databaseConnectionId: string
  chartConfig?: ChartConfig
  organizationId: string
  createdBy: string
  createdAt: string
  updatedAt: string
  isPublic: boolean
  tags: string[]
  schedule?: ReportSchedule
}

export interface ReportSchedule {
  enabled: boolean
  frequency: "daily" | "weekly" | "monthly"
  time: string
  recipients: string[]
}

export type LLMProvider =
  | "openai"
  | "anthropic"
  | "deepseek"
  | "groq"
  | "google"
  | "xai"
  | "cohere"
  | "mistral"
  | "baidu"
  | "qwen"
  | "hunyuan"
  | "zhipu"
  | "moonshot"
  | "yi"
  | "minimax"
  | "doubao"
  | "ollama"
  // 国际模型
  | "azure-openai"
  | "together"
  | "perplexity"
  | "replicate"
  | "huggingface"
  // 国产模型
  | "baichuan"
  | "stepfun"
  | "mianbi"
  | "langboat"
  | "xverse"

export interface LLMConnection {
  id: string
  name: string
  provider: LLMProvider
  apiKey: string
  baseUrl?: string
  model: string
  temperature: number
  maxTokens: number
  organizationId: string
  createdBy: string
  createdAt: string
  status: "active" | "inactive" | "error"
  isDefault: boolean
}

export interface LLMConfig {
  provider: LLMProvider
  model: string
  temperature: number
  maxTokens: number
}

export interface SQLSecurityPolicy {
  id: string
  name: string
  organizationId: string
  allowedOperations: SQLOperation[]
  blockedKeywords: string[]
  maxExecutionTime: number // 秒
  maxRowsReturned: number
  requiresApproval: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type SQLOperation = "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "CREATE" | "DROP" | "ALTER" | "TRUNCATE"

export interface DataPermission {
  id: string
  name: string
  description?: string
  role: "admin" | "analyst" | "viewer"
  databaseConnectionId: string
  tablePermissions: TablePermission[]
  organizationId: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface TablePermission {
  tableName: string
  allowedOperations: SQLOperation[]
  columnPermissions: ColumnPermission[]
  // 数据访问范围：'all' 表示可访问全部数据，'user_related' 表示仅可访问与用户相关的数据
  dataScope: "all" | "user_related"
  // 行级过滤条件（SQL WHERE 子句），当 dataScope 为 'user_related' 时使用
  // 可以使用 {{user_id}}, {{user_email}}, {{user_name}} 等占位符
  rowLevelFilter?: string // SQL WHERE clause with placeholders
  // 用户关联字段映射，用于自动生成行级过滤条件
  // 例如：{ userId: "user_id", userEmail: "email" } 表示用 user_id 或 email 字段关联用户
  userRelationFields?: {
    userId?: string // 用户ID字段名
    userEmail?: string // 用户邮箱字段名
    userName?: string // 用户名字段名
  }
  // 是否启用此表的权限控制
  enabled: boolean
  // 敏感表标记：标记为敏感表（如财务表、人事表等），需要特别权限才能访问
  isSensitive?: boolean
  // 表分类：用于组织和管理表（如：财务、人事、销售、运营等）
  category?: string
  // 敏感级别：low（低）、medium（中）、high（高）、critical（关键）
  sensitivityLevel?: "low" | "medium" | "high" | "critical"
}

export interface ColumnPermission {
  columnName: string
  accessible: boolean
  masked: boolean // 是否脱敏显示
  maskType?: "hash" | "partial" | "full"
}

export interface DataDictionary {
  id: string
  databaseConnectionId: string
  tableName: string
  tableDescription: string
  businessContext: string
  tableAlias?: string[]
  columns: ColumnDictionary[]
  relationships: TableRelationship[]
  sampleQueries: string[]
  organizationId: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface ColumnDictionary {
  columnName: string
  displayName: string
  description: string
  businessMeaning: string
  dataType: string
  sampleValues: string[]
  validationRules?: string
  isPII: boolean // 是否为个人隐私信息
  isBusinessKey: boolean
}

export interface TableRelationship {
  targetTable: string
  relationshipType: "one-to-one" | "one-to-many" | "many-to-many"
  foreignKey: string
  targetKey: string
  description: string
}

export interface AuditLog {
  id: string
  timestamp: string
  userId: string
  userName: string
  action: "query" | "create" | "update" | "delete" | "login" | "export" | "agent_execution"
  resourceType: "database" | "report" | "model" | "permission" | "agent"
  resourceId?: string
  details: string
  sql?: string
  ipAddress?: string
  userAgent?: string
  status: "success" | "failed" | "blocked"
  errorMessage?: string
  organizationId: string
}

export interface SystemSettings {
  id: string
  organizationId: string
  queryCache: {
    enabled: boolean
    ttl: number // 缓存时间（秒）
    maxSize: number // MB
  }
  performance: {
    maxConcurrentQueries: number
    defaultTimeout: number // 秒
    enableQueryOptimization: boolean
  }
  security: {
    enableSQLValidation: boolean
    requireApprovalForDangerousOps: boolean
    enableAuditLog: boolean
    sessionTimeout: number // 分钟
  }
  alerts: {
    enabled: boolean
    slowQueryThreshold: number // 秒
    errorRateThreshold: number // 百分比
    notificationChannels: string[] // email, slack, etc
  }
  updatedBy: string
  updatedAt: string
}

// 智能体相关类型定义
export interface Agent {
  id: string
  name: string
  description?: string
  systemMessage: string
  llmConnectionId: string
  databaseConnectionId?: string
  tools: AgentTool[]
  memory: AgentMemory
  workflow: AgentWorkflow
  execution: AgentExecution
  organizationId: string
  createdBy: string
  createdAt: string
  updatedAt: string
  status: "active" | "inactive" | "error"
  isDefault?: boolean
}

export interface AgentTool {
  id: string
  type: "http_request" | "sql_query" | "code_execution" | "file_operation" | "custom"
  name: string
  description: string
  config: Record<string, any> | SQLToolConfig | HTTPToolConfig | CustomToolConfig
  enabled: boolean
}

// SQL 查询工具配置
export interface SQLToolConfig {
  sql: string // SQL 语句
  operation: "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "CUSTOM"
  parameters?: Array<{
    name: string
    type: "string" | "number" | "date" | "boolean"
    required: boolean
    defaultValue?: string
  }>
}

// HTTP 请求工具配置
export interface HTTPToolConfig {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH"
  url: string
  headers?: Record<string, string>
  body?: string
  parameters?: Array<{
    name: string
    type: "string" | "number" | "date" | "boolean"
    required: boolean
  }>
}

// 自定义工具配置
export interface CustomToolConfig {
  [key: string]: any
}

export interface AgentMemory {
  type: "simple" | "vector" | "none"
  enabled: boolean
  maxHistory?: number // 最大历史记录数
  config?: Record<string, any>
}

export interface AgentWorkflow {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

export interface WorkflowNode {
  id: string
  type: "trigger" | "llm" | "tool" | "condition" | "transform" | "output"
  name: string
  position: { x: number; y: number }
  config: Record<string, any>
}

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

export interface AgentExecution {
  timeout: number // 超时时间（秒）
  maxRetries: number // 最大重试次数
  retryDelay: number // 重试延迟（秒）
  concurrency: number // 并发执行数
  enableLogging: boolean
}

// 任务规划相关类型（参考火山引擎智能分析Agent）
export interface TaskPlan {
  id: string
  userRequest: string
  goal: string
  steps: AnalysisStep[]
  status: "planning" | "executing" | "completed" | "failed" | "paused"
  currentStepIndex: number
  createdAt: string
  updatedAt: string
  estimatedTime?: number
}

export interface AnalysisStep {
  id: string
  type: "data_collection" | "data_analysis" | "sql_query" | "python_code" | "visualization" | "summary" | "attribution"
  title: string
  description: string
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped"
  dependencies: string[]
  config?: {
    sql?: string
    pythonCode?: string
    targetTables?: string[]
    analysisType?: string
    parameters?: Record<string, any>
  }
  result?: any
  error?: string
  executionTime?: number
  canIntervene?: boolean
}

export interface AnalysisReport {
  id: string
  title: string
  goal: string
  sections: ReportSection[]
  summary: string
  keyFindings: string[]
  recommendations?: string[]
  generatedAt: string
  metadata: {
    totalSteps: number
    completedSteps: number
    executionTime: number
  }
}

export interface ReportSection {
  id: string
  type: "text" | "ai_analysis" | "ai_summary" | "chart" | "table" | "metric"
  title: string
  content: any
  order: number
}

export interface AttributionAnalysis {
  insights: AttributionInsight[]
  summary: string
  recommendations?: string[]
  dataPoints: {
    time: string | number
    value: number
    label?: string
  }[]
  turningPoints: {
    time: string | number
    value: number
    change: number
    description: string
  }[]
}

export interface AttributionInsight {
  type: "trend_change" | "spike" | "drop" | "correlation" | "anomaly"
  description: string
  timePoint?: string | number
  magnitude?: number
  factors?: string[]
  confidence: number
}
