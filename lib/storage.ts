// API-based storage utilities
import type { User, Organization, DatabaseConnection, ChatSession, SavedReport, LLMConnection, Agent } from "./types"
import { apiClient } from "./api-client"

// Initialize demo data - now handled by database seed
export function initializeDemoData() {
  // No-op - data is now in database
  return
}

// Specific entity functions - now using API
export const storage = {
  users: {
    getAll: async () => {
      const data = await apiClient.getUsers()
      return data.users
    },
    getById: async (id: string) => {
      const data = await apiClient.getUser(id)
      return data.user
    },
    save: async (user: User) => {
      if (user.id) {
        const data = await apiClient.updateUser(user.id, user)
        return data.user
      } else {
        const data = await apiClient.createUser(user)
        return data.user
      }
    },
    remove: async (id: string) => {
      await apiClient.deleteUser(id)
    },
  },
  dbConnections: {
    getAll: async () => {
      const data = await apiClient.getDatabases()
      return data.connections
    },
    getById: async (id: string) => {
      const data = await apiClient.getDatabase(id)
      return data.connection
    },
    save: async (conn: DatabaseConnection) => {
      if (conn.id) {
        const data = await apiClient.updateDatabase(conn.id, conn)
        return data.connection
      } else {
        const data = await apiClient.createDatabase(conn)
        return data.connection
      }
    },
    remove: async (id: string) => {
      await apiClient.deleteDatabase(id)
    },
  },
  chatSessions: {
    getAll: async () => {
      const data = await apiClient.getChatSessions()
      return data.sessions
    },
    getById: async (id: string) => {
      const data = await apiClient.getChatSession(id)
      return data.session
    },
    save: async (session: ChatSession) => {
      // 检查是否是临时 ID（以 session_ 开头）
      const isTemporaryId = session.id && session.id.startsWith("session_")
      
      if (session.id && !isTemporaryId) {
        // 更新现有会话
        const data = await apiClient.updateChatSession(session.id, {
          title: session.title,
          messages: session.messages || [],
          llmConnectionId: session.llmConnectionId,
          isPinned: session.isPinned,
        })
        return data.session
      } else {
        // 创建新会话
        const data = await apiClient.createChatSession({
          title: session.title,
          databaseConnectionId: session.databaseConnectionId,
          llmConnectionId: session.llmConnectionId,
        })
        
        // 如果提供了消息，立即更新会话以保存消息
        if (session.messages && session.messages.length > 0) {
          const updateData = await apiClient.updateChatSession(data.session.id, {
            title: session.title,
            messages: session.messages,
            llmConnectionId: session.llmConnectionId,
          })
          return updateData.session
        }
        
        return data.session
      }
    },
    remove: async (id: string) => {
      await apiClient.deleteChatSession(id)
    },
  },
  reports: {
    getAll: async () => {
      const data = await apiClient.getReports()
      return data.reports
    },
    getById: async (id: string) => {
      const reports = await apiClient.getReports()
      return reports.reports.find((r) => r.id === id)
    },
    save: async (report: SavedReport) => {
      const data = await apiClient.createReport(report)
      return data.report
    },
    remove: async (id: string) => {
      // Delete not implemented in API yet
      console.warn("Report delete not implemented")
    },
  },
  llmConnections: {
    getAll: async () => {
      const data = await apiClient.getModels()
      return data.connections
    },
    getById: async (id: string) => {
      const connections = await apiClient.getModels()
      return connections.connections.find((c) => c.id === id)
    },
    save: async (conn: LLMConnection) => {
      if (conn.id && conn.id.startsWith("llm_")) {
        // 这是一个新创建的连接（临时 ID），创建新记录
        const data = await apiClient.createModel(conn)
        return data.connection
      } else if (conn.id) {
        // 更新现有连接
        const data = await apiClient.updateModel(conn.id, conn)
        return data.connection
      } else {
        // 没有 ID，创建新连接
        const data = await apiClient.createModel(conn)
        return data.connection
      }
    },
    remove: async (id: string) => {
      await apiClient.deleteModel(id)
    },
  },
  dataDictionaries: {
    getAll: async () => {
      const data = await apiClient.getDictionaries()
      return data.dictionaries
    },
    getById: async (id: string) => {
      const dictionaries = await apiClient.getDictionaries()
      return dictionaries.dictionaries.find((d) => d.id === id)
    },
    save: async (dict: any) => {
      const data = await apiClient.createDictionary(dict)
      return data.dictionary
    },
    remove: async (id: string) => {
      // Delete not implemented in API yet
      console.warn("Data dictionary delete not implemented")
    },
  },
  sqlPolicies: {
    getAll: async () => {
      const data = await apiClient.getPolicies()
      return data.policies
    },
    getById: async (id: string) => {
      const policies = await apiClient.getPolicies()
      return policies.policies.find((p) => p.id === id)
    },
    save: async (policy: any) => {
      const data = await apiClient.createPolicy(policy)
      return data.policy
    },
    remove: async (id: string) => {
      // Delete not implemented in API yet
      console.warn("SQL policy delete not implemented")
    },
  },
  dataPermissions: {
    getAll: async () => {
      const data = await apiClient.getPermissions()
      return data.permissions
    },
    getById: async (id: string) => {
      const permissions = await apiClient.getPermissions()
      return permissions.permissions.find((p) => p.id === id)
    },
    save: async (perm: any) => {
      const data = await apiClient.createPermission(perm)
      return data.permission
    },
    remove: async (id: string) => {
      // Delete not implemented in API yet
      console.warn("Data permission delete not implemented")
    },
  },
  auditLogs: {
    getAll: async () => {
      const data = await apiClient.getAuditLogs()
      return data.logs
    },
    add: async (log: any) => {
      // Audit logs are created server-side
      console.warn("Audit log add should be done server-side")
    },
  },
  agents: {
    getAll: async () => {
      const data = await apiClient.getAgents()
      return data.agents
    },
    getById: async (id: string) => {
      const data = await apiClient.getAgent(id)
      return data.agent
    },
    save: async (agent: Agent) => {
      if (agent.id && agent.id.startsWith("agent_")) {
        // 这是一个新创建的智能体（临时 ID），创建新记录
        const data = await apiClient.createAgent(agent)
        return data.agent
      } else if (agent.id) {
        // 更新现有智能体
        const data = await apiClient.updateAgent(agent.id, agent)
        return data.agent
      } else {
        // 没有 ID，创建新智能体
        const data = await apiClient.createAgent(agent)
        return data.agent
      }
    },
    remove: async (id: string) => {
      await apiClient.deleteAgent(id)
    },
    createReportAgent: async (llmConnectionId: string, databaseConnectionId?: string) => {
      const data = await apiClient.createReportAgent(llmConnectionId, databaseConnectionId)
      return data.agent
    },
  },
}
