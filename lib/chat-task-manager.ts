/**
 * 对话任务管理器
 * 管理后台对话处理任务，支持持久化和状态追踪
 */

import { db } from "@/lib/db"
import type { AuthenticatedRequest } from "@/lib/middleware"

export interface ChatTask {
  id: string
  sessionId: string
  userId: string
  organizationId: string
  status: "pending" | "processing" | "completed" | "error"
  createdAt: Date
  updatedAt: Date
  error?: string
  result?: any
}

// 内存中的任务存储（用于快速访问）
const taskStore = new Map<string, ChatTask>()

// SSE 客户端连接管理
const sseClients = new Map<string, Set<ReadableStreamDefaultController>>()

/**
 * 创建新的对话任务
 */
export async function createChatTask(
  sessionId: string,
  userId: string,
  organizationId: string
): Promise<string> {
  const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(7)}`
  
  const task: ChatTask = {
    id: taskId,
    sessionId,
    userId,
    organizationId,
    status: "pending",
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  
  taskStore.set(taskId, task)
  
  // 更新会话状态
  await db.chatSession.update({
    where: { id: sessionId },
    data: {
      status: "processing",
      currentTaskId: taskId,
      updatedAt: new Date(),
    },
  })
  
  return taskId
}

/**
 * 更新任务状态
 */
export async function updateTaskStatus(
  taskId: string,
  status: ChatTask["status"],
  result?: any,
  error?: string
) {
  const task = taskStore.get(taskId)
  if (!task) {
    console.warn(`[ChatTask] Task ${taskId} not found`)
    return
  }
  
  task.status = status
  task.updatedAt = new Date()
  if (result) task.result = result
  if (error) task.error = error
  
  taskStore.set(taskId, task)
  
  // 更新会话状态
  if (status === "completed" || status === "error") {
    await db.chatSession.update({
      where: { id: task.sessionId },
      data: {
        status: status === "completed" ? "idle" : "error",
        currentTaskId: null,
        updatedAt: new Date(),
      },
    })
  }
  
  // 通知所有 SSE 客户端
  notifySSEClients(task.sessionId, {
    type: "task_update",
    taskId,
    status,
    result,
    error,
  })
}

/**
 * 获取任务状态
 */
export function getTask(taskId: string): ChatTask | undefined {
  return taskStore.get(taskId)
}

/**
 * 获取会话的当前任务
 */
export function getSessionTask(sessionId: string): ChatTask | undefined {
  for (const task of taskStore.values()) {
    if (task.sessionId === sessionId && (task.status === "pending" || task.status === "processing")) {
      return task
    }
  }
  return undefined
}

/**
 * 注册 SSE 客户端
 */
export function registerSSEClient(sessionId: string, controller: ReadableStreamDefaultController) {
  if (!sseClients.has(sessionId)) {
    sseClients.set(sessionId, new Set())
  }
  sseClients.get(sessionId)!.add(controller)
  
  // 静默注册SSE客户端（减少日志噪音）
}

/**
 * 注销 SSE 客户端
 */
export function unregisterSSEClient(sessionId: string, controller: ReadableStreamDefaultController) {
  const clients = sseClients.get(sessionId)
  if (clients) {
    clients.delete(controller)
    if (clients.size === 0) {
      sseClients.delete(sessionId)
    }
  }
}

/**
 * 通知所有 SSE 客户端
 */
function notifySSEClients(sessionId: string, data: any) {
  const clients = sseClients.get(sessionId)
  if (!clients || clients.size === 0) {
    // 静默处理：没有SSE客户端（减少日志噪音）
    return
  }
  
  const message = `data: ${JSON.stringify(data)}\n\n`
  const messageBytes = new TextEncoder().encode(message)
  
  const disconnectedClients: ReadableStreamDefaultController[] = []
  
  for (const controller of clients) {
    try {
      controller.enqueue(messageBytes)
    } catch (error) {
      // 客户端可能已断开，标记为移除
      console.warn(`[ChatTask] Failed to send SSE message to client:`, error)
      disconnectedClients.push(controller)
    }
  }
  
  // 移除已断开的客户端
  for (const controller of disconnectedClients) {
    clients.delete(controller)
  }
  
  if (clients.size === 0) {
    sseClients.delete(sessionId)
  }
}

/**
 * 发送流式更新到 SSE 客户端
 */
export function sendStreamUpdate(sessionId: string, type: string, data: any) {
  notifySSEClients(sessionId, { type, ...data })
}

/**
 * 清理旧任务（定期清理已完成的任务）
 */
export function cleanupOldTasks() {
  const now = Date.now()
  const maxAge = 24 * 60 * 60 * 1000 // 24小时
  
  for (const [taskId, task] of taskStore.entries()) {
    const age = now - task.createdAt.getTime()
    if (age > maxAge && (task.status === "completed" || task.status === "error")) {
      taskStore.delete(taskId)
    }
  }
}

// 定期清理旧任务
setInterval(cleanupOldTasks, 60 * 60 * 1000) // 每小时清理一次
