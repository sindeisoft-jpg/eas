/**
 * Server-Sent Events (SSE) 端点
 * 用于流式推送对话更新
 */

import { NextRequest } from "next/server"
import { requireAuth, AuthenticatedRequest } from "@/lib/middleware"
import { registerSSEClient, unregisterSSEClient, getSessionTask } from "@/lib/chat-task-manager"
import { db } from "@/lib/db"
import { authenticateRequest } from "@/lib/middleware"

async function handleGET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    // EventSource 不支持自定义 headers，所以需要从 URL 参数获取 token
    const { searchParams } = new URL(req.url)
    const token = searchParams.get("token")
    
    // 如果有 token，添加到请求 headers 中以便认证
    if (token) {
      req.headers.set("authorization", `Bearer ${token}`)
    }
    
    // 进行认证
    const authResult = await authenticateRequest(req)
    if (authResult.error) {
      return authResult.error
    }
    
    const user = authResult.user!
    const { sessionId } = await params

    // 验证会话权限
    const session = await db.chatSession.findFirst({
      where: {
        id: sessionId,
        organizationId: user.organizationId,
      },
    })

    if (!session) {
      return new Response("会话不存在或无权限", { status: 404 })
    }

    let controller: ReadableStreamDefaultController | null = null
    let heartbeatInterval: NodeJS.Timeout | null = null

    // 创建 SSE 流
    const stream = new ReadableStream({
      start(ctrl) {
        controller = ctrl

        // 注册 SSE 客户端
        registerSSEClient(sessionId, controller)

        // 发送初始连接确认
        const initialMessage = `data: ${JSON.stringify({ type: "connected", sessionId })}\n\n`
        try {
          controller.enqueue(new TextEncoder().encode(initialMessage))
        } catch (error) {
          console.error("[SSE] Failed to send initial message:", error)
        }

        // 检查是否有正在进行的任务
        const currentTask = getSessionTask(sessionId)
        if (currentTask) {
          const taskMessage = `data: ${JSON.stringify({
            type: "task_status",
            taskId: currentTask.id,
            status: currentTask.status,
          })}\n\n`
          try {
            controller.enqueue(new TextEncoder().encode(taskMessage))
          } catch (error) {
            console.error("[SSE] Failed to send task status:", error)
          }
        }

        // 定期发送心跳以保持连接（静默处理，减少日志）
        heartbeatInterval = setInterval(() => {
          if (controller) {
            try {
              const heartbeat = `data: ${JSON.stringify({ type: "heartbeat", timestamp: Date.now() })}\n\n`
              controller.enqueue(new TextEncoder().encode(heartbeat))
            } catch (error) {
              // 心跳失败，静默处理（减少日志噪音）
              if (heartbeatInterval) {
                clearInterval(heartbeatInterval)
                heartbeatInterval = null
              }
              if (controller) {
                unregisterSSEClient(sessionId, controller)
                controller = null
              }
            }
          }
        }, 30000) // 每30秒发送一次心跳

        // 监听连接关闭
        if (req.signal) {
          req.signal.addEventListener("abort", () => {
            if (heartbeatInterval) {
              clearInterval(heartbeatInterval)
              heartbeatInterval = null
            }
            if (controller) {
              unregisterSSEClient(sessionId, controller)
              try {
                controller.close()
              } catch (error) {
                // 连接可能已经关闭
              }
              controller = null
            }
          })
        }
      },
      cancel() {
        // 清理心跳定时器
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval)
          heartbeatInterval = null
        }
        // 清理 SSE 客户端连接
        // controller 在 handleGET 作用域内，cancel 可以通过闭包访问
        if (controller) {
          unregisterSSEClient(sessionId, controller)
          controller = null
        }
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no", // 禁用 nginx 缓冲
      },
    })
  } catch (error: any) {
    console.error("[SSE] Error:", error)
    return new Response("SSE 连接失败", { status: 500 })
  }
}

// 直接导出 handleGET，因为它已经内部处理了认证
export const GET = handleGET
