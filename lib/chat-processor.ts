/**
 * 对话处理器
 * 在后台异步处理对话请求
 */

import { db } from "@/lib/db"
import { SQLExecutor } from "@/lib/sql-executor"
import { SQLValidator } from "@/lib/sql-validator"
import { logAudit } from "@/lib/audit-helper"
import { IntentAnalyzer } from "@/lib/intent-analyzer"
import { DataExplorer } from "@/lib/data-explorer"
import { AgentToolExecutor } from "@/lib/agent-tool-executor"
import { PermissionApplier } from "@/lib/permission-applier"
import type { AgentTool, SQLToolConfig, DatabaseSchema } from "@/lib/types"
import { replaceTemplateVariables, formatDatabaseSchema } from "@/lib/template-engine"
import { detectPasswordQueryIntent, getPasswordQueryRejectionMessage, filterSensitiveFieldsFromResult, detectSensitiveFieldsInSQL } from "@/lib/security-filter"
import { extractAndAnalyzeCities } from "@/lib/utils"
import { FeatureGenerator } from "@/lib/feature-generator"
import { AttributionAnalyzer } from "@/lib/attribution-analyzer"
import { ReportGenerator } from "@/lib/report-generator"
import { updateTaskStatus, sendStreamUpdate } from "@/lib/chat-task-manager"
import type { AuthenticatedRequest } from "@/lib/middleware"

// 导入原有的处理逻辑（需要从 route.ts 中提取）
// 这里我们创建一个包装函数来调用原有的处理逻辑

export interface ChatProcessRequest {
  messages: any[]
  databaseSchema: any
  llmConfig: any
  databaseConnectionId: string
  sessionId: string
  agentId?: string
  userId: string
  organizationId: string
  taskId: string
}

/**
 * 处理对话请求（异步）
 * 这个函数会调用原有的 handlePOST 逻辑，但以异步方式执行
 */
export async function processChatRequest(request: ChatProcessRequest) {
  const { taskId, sessionId, userId, organizationId } = request

  try {
    // 更新任务状态为处理中
    await updateTaskStatus(taskId, "processing")

    // 发送流式更新：开始处理
    sendStreamUpdate(sessionId, "processing_started", {
      message: "开始处理您的请求...",
    })

    // 这里我们需要调用原有的处理逻辑
    // 由于原有代码非常复杂，我们创建一个简化的版本
    // 实际实现中，应该将原有的 handlePOST 函数重构为可复用的函数

    // 获取用户和会话信息
    const user = await db.user.findUnique({ where: { id: userId } })
    if (!user) {
      throw new Error("用户不存在")
    }

    const session = await db.chatSession.findUnique({
      where: { id: sessionId },
    })
    if (!session) {
      throw new Error("会话不存在")
    }

    // 获取数据库连接
    const connection = await db.databaseConnection.findUnique({
      where: { id: request.databaseConnectionId },
    })
    if (!connection || connection.organizationId !== organizationId) {
      throw new Error("数据库连接不存在或无权限")
    }

    // 发送流式更新：获取数据库连接成功
    sendStreamUpdate(sessionId, "status_update", {
      message: "已连接到数据库",
    })

    // 这里应该调用原有的完整处理逻辑
    // 为了简化，我们创建一个占位符
    // 实际实现需要将 route.ts 中的 handlePOST 函数重构为可复用的 processChat 函数

    // 模拟处理过程
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // 发送最终结果
    const result = {
      message: "处理完成",
      queryResult: null,
      sql: null,
      error: null,
    }

    await updateTaskStatus(taskId, "completed", result)

    sendStreamUpdate(sessionId, "task_completed", {
      result,
    })

    return result
  } catch (error: any) {
    console.error("[ChatProcessor] Error:", error)
    
    await updateTaskStatus(taskId, "error", undefined, error.message)

    sendStreamUpdate(sessionId, "task_error", {
      error: error.message || "处理失败",
    })

    throw error
  }
}

/**
 * 在后台处理对话请求
 */
export async function processChatInBackground(request: ChatProcessRequest) {
  // 不等待结果，立即返回
  processChatRequest(request).catch((error) => {
    console.error("[ChatProcessor] Background processing error:", error)
  })
}
