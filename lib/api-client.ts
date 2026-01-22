const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "/api"

class ApiClient {
  private getToken(): string | null {
    if (typeof window === "undefined") return null
    return localStorage.getItem("auth_token")
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.getToken()
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...options.headers,
    }

    if (token) {
      (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`
    }

    let response: Response
    try {
      response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
      })
    } catch (networkError: any) {
      // 网络错误（fetch 本身失败）
      const errorMessage = networkError?.message || "无法连接到服务器"
      const errorCode = networkError?.cause?.code || networkError?.code
      const errorSyscall = networkError?.cause?.syscall || networkError?.syscall
      
      // 构建详细的错误消息
      let detailedMessage = `网络请求失败: ${errorMessage}`
      
      if (errorCode) {
        detailedMessage += ` (错误代码: ${errorCode})`
      }
      if (errorSyscall) {
        detailedMessage += ` (系统调用: ${errorSyscall})`
      }
      
      const error = new Error(detailedMessage)
      ;(error as any).isNetworkError = true
      ;(error as any).originalError = networkError
      ;(error as any).errorCode = errorCode
      ;(error as any).errorSyscall = errorSyscall
      
      // 添加更多错误信息以便调试
      if (networkError?.name === "TypeError" && networkError?.message?.includes("Failed to fetch")) {
        ;(error as any).errorType = "NETWORK_ERROR"
        if (errorCode === "ENOTFOUND") {
          ;(error as any).hint = "DNS 解析失败，请检查服务器地址是否正确"
        } else if (errorCode === "ECONNREFUSED") {
          ;(error as any).hint = "连接被拒绝，请检查服务器是否运行"
        } else if (errorCode === "ETIMEDOUT") {
          ;(error as any).hint = "连接超时，请检查网络连接"
        } else {
          ;(error as any).hint = "请检查网络连接或服务器是否运行"
        }
      }
      throw error
    }

    if (!response.ok) {
      let error: any = { error: "请求失败" }
      let errorText = ""
      
      try {
        // 尝试解析 JSON 响应
        error = await response.json()
      } catch {
        // 如果 JSON 解析失败，尝试获取文本响应
        try {
          errorText = await response.text()
          if (errorText) {
            // 尝试解析文本中的 JSON
            try {
              error = JSON.parse(errorText)
            } catch {
              // 如果文本不是 JSON，使用文本作为错误消息
              error = { error: errorText || `HTTP ${response.status} ${response.statusText}` }
            }
          }
        } catch {
          // 如果获取文本也失败，使用状态码
          error = { error: `HTTP ${response.status} ${response.statusText}` }
        }
      }
      
      const errorMessage = error.error || error.message || `HTTP ${response.status} ${response.statusText}`
      const errorDetails = error.details || undefined
      const errorHint = error.hint || undefined
      const errorCode = error.code || undefined
      const fullError = new Error(errorMessage)
      
      if (errorDetails) {
        ;(fullError as any).details = errorDetails
      }
      if (errorHint) {
        ;(fullError as any).hint = errorHint
      }
      if (errorCode) {
        ;(fullError as any).code = errorCode
      }
      // 保存原始错误对象以便调试
      ;(fullError as any).originalError = error
      ;(fullError as any).status = response.status
      ;(fullError as any).statusText = response.statusText
      
      throw fullError
    }

    return response.json()
  }

  // Auth
  async login(email: string, password: string) {
    const data = await this.request<{ token: string; user: any }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    })
    if (typeof window !== "undefined" && data.token) {
      localStorage.setItem("auth_token", data.token)
    }
    return data
  }

  async logout() {
    if (typeof window !== "undefined") {
      localStorage.removeItem("auth_token")
    }
    return this.request("/auth/logout", { method: "POST" })
  }

  async getMe() {
    try {
      return await this.request<{ user: any }>("/auth/me")
    } catch (error: any) {
      // If 401, user is not authenticated - this is normal
      if (error.message?.includes("401") || error.message?.includes("未授权")) {
        throw new Error("NOT_AUTHENTICATED")
      }
      throw error
    }
  }

  // Users
  async getUsers() {
    return this.request<{ users: any[] }>("/users")
  }

  async getUser(id: string) {
    return this.request<{ user: any }>(`/users/${id}`)
  }

  async createUser(userData: any) {
    return this.request<{ user: any }>("/users", {
      method: "POST",
      body: JSON.stringify(userData),
    })
  }

  async updateUser(id: string, userData: any) {
    return this.request<{ user: any }>(`/users/${id}`, {
      method: "PUT",
      body: JSON.stringify(userData),
    })
  }

  async deleteUser(id: string) {
    return this.request<{ message: string }>(`/users/${id}`, {
      method: "DELETE",
    })
  }

  // Databases
  async getDatabases() {
    return this.request<{ connections: any[] }>("/databases")
  }

  async getDatabase(id: string) {
    return this.request<{ connection: any }>(`/databases/${id}`)
  }

  async createDatabase(connectionData: any) {
    return this.request<{ connection: any }>("/databases", {
      method: "POST",
      body: JSON.stringify(connectionData),
    })
  }

  async updateDatabase(id: string, connectionData: any) {
    return this.request<{ connection: any }>(`/databases/${id}`, {
      method: "PUT",
      body: JSON.stringify(connectionData),
    })
  }

  async deleteDatabase(id: string) {
    return this.request<{ message: string }>(`/databases/${id}`, {
      method: "DELETE",
    })
  }

  async testDatabase(id: string) {
    return this.request<{ success: boolean; message: string }>(`/databases/${id}/test`, {
      method: "POST",
    })
  }

  async queryDatabase(id: string, sql: string) {
    return this.request<{ result: any }>(`/databases/${id}/query`, {
      method: "POST",
      body: JSON.stringify({ sql }),
    })
  }

  async getDatabaseSchema(id: string) {
    return this.request<{ schemas: any[] }>(`/databases/${id}/schema`)
  }

  async testDatabaseConnection(connectionData: {
    type: string
    host: string
    port: number
    username: string
    password: string
    ssl: boolean
    database?: string
  }) {
    // 使用 list-databases API 来测试连接并获取数据库列表
    try {
      return await this.request<{ success: boolean; message: string; databases?: string[] }>(
        "/databases/list-databases",
        {
          method: "POST",
          body: JSON.stringify({
            type: connectionData.type,
            host: connectionData.host,
            port: connectionData.port,
            username: connectionData.username,
            password: connectionData.password,
            ssl: connectionData.ssl,
          }),
        }
      )
    } catch (error: any) {
      // 如果请求失败，返回错误格式
      return {
        success: false,
        message: error.message || "连接失败",
        databases: [],
      }
    }
  }

  async listDatabases(connectionData: {
    type: string
    host: string
    port: number
    username: string
    password: string
    ssl: boolean
  }) {
    return this.request<{ databases: string[] }>("/databases/list-databases", {
      method: "POST",
      body: JSON.stringify(connectionData),
    })
  }

  // Models
  async getModels() {
    return this.request<{ connections: any[] }>("/models")
  }

  async getModel(id: string) {
    return this.request<{ connection: any }>(`/models/${id}`)
  }

  async createModel(connectionData: any) {
    return this.request<{ connection: any }>("/models", {
      method: "POST",
      body: JSON.stringify(connectionData),
    })
  }

  async updateModel(id: string, connectionData: any) {
    return this.request<{ connection: any }>(`/models/${id}`, {
      method: "PUT",
      body: JSON.stringify(connectionData),
    })
  }

  async deleteModel(id: string) {
    return this.request<{ message: string }>(`/models/${id}`, {
      method: "DELETE",
    })
  }

  // Test LLM connection
  async testLLMConnection(connectionData: {
    provider: string
    model: string
    apiKey: string
    baseUrl?: string
  }) {
    try {
      return await this.request<{ success: boolean; message: string }>("/models/test", {
        method: "POST",
        body: JSON.stringify(connectionData),
      })
    } catch (error: any) {
      // 如果请求失败，返回错误格式
      return {
        success: false,
        message: error.message || "连接失败",
      }
    }
  }

  // Test LLM connection by ID (uses stored API key)
  async testLLMConnectionWithId(
    id: string,
    connectionData: {
      provider: string
      model: string
      baseUrl?: string
    }
  ) {
    try {
      return await this.request<{ success: boolean; message: string }>(`/models/${id}/test`, {
        method: "POST",
        body: JSON.stringify(connectionData),
      })
    } catch (error: any) {
      return {
        success: false,
        message: error.message || "连接失败",
      }
    }
  }

  // Get Ollama models list
  async getOllamaModels(baseUrl?: string) {
    try {
      return await this.request<{
        success: boolean
        message: string
        models: string[]
        modelInfo?: Array<{ name: string; size?: number; modifiedAt?: string; digest?: string }>
      }>("/models/ollama/list", {
        method: "POST",
        body: JSON.stringify({ baseUrl }),
      })
    } catch (error: any) {
      return {
        success: false,
        message: error.message || "获取模型列表失败",
        models: [],
        modelInfo: [],
      }
    }
  }

  // Chat
  async chat(messages: any[], databaseSchema: any, llmConfig: any, databaseConnectionId: string, sessionId?: string, agentId?: string) {
    return this.request<{ 
      message: string
      queryResult?: any
      sql?: string
      error?: string | null
      workProcess?: string[]
      intent?: {
        intent: string
        requiresFullData: boolean
        targetTables: string[]
      }
    }>("/chat", {
      method: "POST",
      body: JSON.stringify({
        messages,
        databaseSchema,
        llmConfig,
        databaseConnectionId,
        sessionId,
        agentId,
      }),
    })
  }

  async getChatSessions() {
    return this.request<{ sessions: any[] }>("/chat/sessions")
  }

  async getChatSession(id: string) {
    return this.request<{ session: any }>(`/chat/sessions/${id}`)
  }

  async createChatSession(sessionData: any) {
    return this.request<{ session: any }>("/chat/sessions", {
      method: "POST",
      body: JSON.stringify(sessionData),
    })
  }

  async updateChatSession(id: string, sessionData: { title?: string; messages?: any[]; isPinned?: boolean; llmConnectionId?: string | null }) {
    return this.request<{ session: any }>(`/chat/sessions/${id}`, {
      method: "PUT",
      body: JSON.stringify(sessionData),
    })
  }

  async deleteChatSession(id: string) {
    return this.request<{ message: string }>(`/chat/sessions/${id}`, {
      method: "DELETE",
    })
  }

  // Reports
  async getReports() {
    return this.request<{ reports: any[] }>("/reports")
  }

  async createReport(reportData: any) {
    return this.request<{ report: any }>("/reports", {
      method: "POST",
      body: JSON.stringify(reportData),
    })
  }

  // Dictionary
  async getDictionaries() {
    return this.request<{ dictionaries: any[] }>("/dictionary")
  }

  async createDictionary(dictionaryData: any) {
    return this.request<{ dictionary: any }>("/dictionary", {
      method: "POST",
      body: JSON.stringify(dictionaryData),
    })
  }

  // Permissions
  async getPermissions() {
    return this.request<{ permissions: any[] }>("/permissions")
  }

  async createPermission(permissionData: any) {
    return this.request<{ permission: any }>("/permissions", {
      method: "POST",
      body: JSON.stringify(permissionData),
    })
  }

  async updatePermission(id: string, permissionData: any) {
    return this.request<{ permission: any }>(`/permissions/${id}`, {
      method: "PUT",
      body: JSON.stringify(permissionData),
    })
  }

  async deletePermission(id: string) {
    return this.request<{ message: string }>(`/permissions/${id}`, {
      method: "DELETE",
    })
  }

  // Policies
  async getPolicies() {
    return this.request<{ policies: any[] }>("/policies")
  }

  async createPolicy(policyData: any) {
    return this.request<{ policy: any }>("/policies", {
      method: "POST",
      body: JSON.stringify(policyData),
    })
  }

  // Audit
  async getAuditLogs(params?: { limit?: number; offset?: number; action?: string; userId?: string }) {
    const query = new URLSearchParams()
    if (params?.limit) query.append("limit", params.limit.toString())
    if (params?.offset) query.append("offset", params.offset.toString())
    if (params?.action) query.append("action", params.action)
    if (params?.userId) query.append("userId", params.userId)

    const queryString = query.toString()
    return this.request<{ logs: any[]; total: number; limit: number; offset: number }>(
      `/audit${queryString ? `?${queryString}` : ""}`
    )
  }

  // System Settings
  async getSettings() {
    return this.request<{ settings: any }>("/settings")
  }

  async updateSettings(settings: any) {
    return this.request<{ settings: any }>("/settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    })
  }

  // Agents
  /**
   * 批量获取所有配置数据（数据库连接、LLM连接、智能体）
   * 将多个 API 请求合并为一个，减少 Prisma 查询次数
   */
  async getConfig() {
    const data = await this.request<{
      databases: any[]
      models: any[]
      agents: any[]
    }>("/config", {
      method: "GET",
    })
    return data
  }

  async getAgents() {
    return this.request<{ agents: any[] }>("/agents")
  }

  async getAgent(id: string) {
    return this.request<{ agent: any }>(`/agents/${id}`)
  }

  async createAgent(agentData: any) {
    return this.request<{ agent: any }>("/agents", {
      method: "POST",
      body: JSON.stringify(agentData),
    })
  }

  async updateAgent(id: string, agentData: any) {
    return this.request<{ agent: any }>(`/agents/${id}`, {
      method: "PUT",
      body: JSON.stringify(agentData),
    })
  }

  async deleteAgent(id: string) {
    return this.request<{ message: string }>(`/agents/${id}`, {
      method: "DELETE",
    })
  }

  async createReportAgent(llmConnectionId: string, databaseConnectionId?: string) {
    return this.request<{ agent: any }>("/agents/create-report-agent", {
      method: "POST",
      body: JSON.stringify({ llmConnectionId, databaseConnectionId }),
    })
  }

  // Prompt Configs
  async getPromptConfigs(category?: string) {
    const query = category ? `?category=${encodeURIComponent(category)}` : ""
    return this.request<{ configs: any[] }>(`/prompt-configs${query}`)
  }

  async getPromptConfigsByCategory(category: string) {
    return this.request<{ configs: any[] }>(`/prompt-configs/category/${category}`)
  }

  async getPromptConfig(category: string, name: string) {
    return this.request<{ content: string }>(`/prompt-configs/category/${category}/${name}`)
  }

  // 只允许更新现有配置，不允许创建新配置
  async updatePromptConfig(id: string, configData: {
    description?: string
    content: string
    variables?: string[]
    isActive?: boolean
  }) {
    return this.request<{ config: any }>(`/prompt-configs/${id}`, {
      method: "PUT",
      body: JSON.stringify(configData),
    })
  }

  async initPromptConfigs(force?: boolean) {
    return this.request<{ message: string; created: number; errors?: string[]; count?: number; hint?: string }>(
      "/prompt-configs/init",
      {
        method: "POST",
        body: JSON.stringify({ force: force || false }),
      }
    )
  }

  async optimizePromptConfigs() {
    return this.request<{
      message: string
      total: number
      optimized: number
      failed: number
      skipped: number
      errors?: string[]
      details?: Array<{ id: string; name: string; status: string; originalLength: number; optimizedLength: number }>
    }>("/prompt-configs/optimize", {
      method: "POST",
    })
  }

  async translatePromptContent(content: string) {
    return this.request<{
      translatedContent: string
      originalLength: number
      translatedLength: number
    }>("/prompt-configs/translate", {
      method: "POST",
      body: JSON.stringify({ content }),
    })
  }
}

export const apiClient = new ApiClient()


