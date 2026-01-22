import { NextResponse } from "next/server"
import { requireAuth, AuthenticatedRequest } from "@/lib/middleware"
import { db } from "@/lib/db"

async function handleGET(req: AuthenticatedRequest) {
  try {
    const user = req.user!
    // 优化：使用 select 替代 include，只查询需要的字段
    const sessions = await db.chatSession.findMany({
      where: {
        organizationId: user.organizationId,
      },
      select: {
        id: true,
        title: true,
        databaseConnectionId: true,
        llmConnectionId: true,
        isPinned: true,
        organizationId: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          select: {
            id: true,
            role: true,
            content: true,
            metadata: true,
            timestamp: true,
          },
          orderBy: [
            {
              timestamp: "asc",
            },
            {
              id: "asc", // 辅助排序：当时间戳相同时，按ID排序确保顺序稳定
            },
          ],
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    })

    return NextResponse.json({ sessions })
  } catch (error: any) {
    console.error("[Chat] Get sessions error:", error)
    return NextResponse.json({ error: "获取聊天会话失败" }, { status: 500 })
  }
}

async function handlePOST(req: AuthenticatedRequest) {
  try {
    const user = req.user!
    const { title, databaseConnectionId, llmConnectionId } = await req.json()

    if (!databaseConnectionId) {
      return NextResponse.json({ error: "数据库连接ID不能为空" }, { status: 400 })
    }

    // 优化：使用 select 只查询需要的字段
    const connection = await db.databaseConnection.findUnique({
      where: { id: databaseConnectionId },
      select: {
        id: true,
        organizationId: true,
      },
    })

    if (!connection || connection.organizationId !== user.organizationId) {
      return NextResponse.json({ error: "数据库连接不存在或无权限" }, { status: 404 })
    }

    // 如果提供了 llmConnectionId，验证它是否存在且属于该组织
    if (llmConnectionId) {
      const llmConnection = await db.lLMConnection.findUnique({
        where: { id: llmConnectionId },
        select: {
          id: true,
          organizationId: true,
        },
      })
      if (!llmConnection || llmConnection.organizationId !== user.organizationId) {
        return NextResponse.json({ error: "LLM连接不存在或无权限" }, { status: 404 })
      }
    }

    // 优化：使用 select 只查询需要的字段
    const session = await db.chatSession.create({
      data: {
        title: title || "新对话",
        databaseConnectionId,
        ...(llmConnectionId ? { llmConnectionId } : { llmConnectionId: null }),
        organizationId: user.organizationId,
        createdBy: user.id,
      },
      select: {
        id: true,
        title: true,
        databaseConnectionId: true,
        llmConnectionId: true,
        isPinned: true,
        organizationId: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          select: {
            id: true,
            role: true,
            content: true,
            metadata: true,
            timestamp: true,
          },
          orderBy: [
            {
              timestamp: "asc",
            },
            {
              id: "asc",
            },
          ],
        },
      },
    })

    return NextResponse.json({ session }, { status: 201 })
  } catch (error: any) {
    console.error("[Chat] Create session error:", error)
    const errorMessage = error.message || error.code || "创建聊天会话失败"
    const errorDetails = error.meta || undefined
    return NextResponse.json({ 
      error: errorMessage,
      details: errorDetails
    }, { status: 500 })
  }
}

export const GET = requireAuth(handleGET)
export const POST = requireAuth(handlePOST)

