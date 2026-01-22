import { NextResponse } from "next/server"
import { requireAuth, AuthenticatedRequest } from "@/lib/middleware"
import { db } from "@/lib/db"

// 请求锁：防止同一会话的并发请求
const requestLocks = new Map<string, Promise<any>>()

// 安全地保存消息，处理并发冲突
async function safeUpsertMessage(
  tx: any,
  msg: any,
  sessionId: string
) {
  // 先检查消息是否已存在，避免并发冲突
  const existing = await tx.chatMessage.findUnique({
    where: { id: msg.id },
    select: { id: true },
  })
  
  if (existing) {
    // 消息已存在，使用 update
    try {
      return await tx.chatMessage.update({
        where: { id: msg.id },
        data: {
          role: msg.role,
          content: msg.content,
          metadata: msg.metadata ? JSON.parse(JSON.stringify(msg.metadata)) : null,
          timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
        },
        select: {
          id: true,
          role: true,
          content: true,
          metadata: true,
          timestamp: true,
        },
      })
    } catch (updateError: any) {
      console.warn(`[Chat] Failed to update message ${msg.id}:`, updateError)
      return null
    }
  } else {
    // 消息不存在，使用 create
    try {
      return await tx.chatMessage.create({
        data: {
          id: msg.id,
          sessionId: sessionId,
          role: msg.role,
          content: msg.content,
          metadata: msg.metadata ? JSON.parse(JSON.stringify(msg.metadata)) : null,
          timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
        },
        select: {
          id: true,
          role: true,
          content: true,
          metadata: true,
          timestamp: true,
        },
      })
    } catch (createError: any) {
      // 如果创建失败（可能是并发创建），尝试更新
      if (createError.code === 'P2002' || createError.message?.includes('Unique constraint')) {
        try {
          return await tx.chatMessage.update({
            where: { id: msg.id },
            data: {
              role: msg.role,
              content: msg.content,
              metadata: msg.metadata ? JSON.parse(JSON.stringify(msg.metadata)) : null,
              timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
            },
            select: {
              id: true,
              role: true,
              content: true,
              metadata: true,
              timestamp: true,
            },
          })
        } catch (updateError: any) {
          console.warn(`[Chat] Failed to create/update message ${msg.id}:`, updateError)
          return null
        }
      }
      throw createError
    }
  }
}

async function handleGET(req: AuthenticatedRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = req.user!
    const { id: sessionId } = await params

    // 优化：只查询需要的字段
    const session = await db.chatSession.findFirst({
      where: {
        id: sessionId,
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
    })

    if (!session) {
      return NextResponse.json({ error: "会话不存在或无权限" }, { status: 404 })
    }

    return NextResponse.json({ session })
  } catch (error: any) {
    console.error("[Chat] Get session error:", error)
    return NextResponse.json({ error: "获取聊天会话失败" }, { status: 500 })
  }
}

async function handlePUT(req: AuthenticatedRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = req.user!
    const { id: sessionId } = await params
    const body = await req.json()
    const { title, messages, llmConnectionId, isPinned, databaseConnectionId } = body

    // 优化：合并所有会话查询逻辑，只查询一次
    // 1. 如果需要更新会话信息，查询会话和 llmConnectionId
    // 2. 如果只是保存消息，查询完整的会话信息（避免后续再查询）
    // 3. 即使都没有，也需要验证会话存在（防止对不存在会话的操作）
    let existingSession: any = null
    const needsSessionUpdate = title !== undefined || llmConnectionId !== undefined || isPinned !== undefined
    const needsMessageSave = messages && Array.isArray(messages) && messages.length > 0
    
    // 总是查询会话以验证存在性和权限（即使没有需要更新的内容）
    existingSession = await db.chatSession.findFirst({
      where: {
        id: sessionId,
        organizationId: user.organizationId,
      },
      select: needsSessionUpdate
        ? {
            id: true,
            llmConnectionId: true, // 用于检查是否需要更新
          }
        : needsMessageSave
        ? {
            // 如果只是保存消息，查询完整的会话信息，避免后续再查询
            id: true,
            title: true,
            databaseConnectionId: true,
            llmConnectionId: true,
            isPinned: true,
            createdAt: true,
            updatedAt: true,
          }
        : {
            // 即使没有需要更新的内容，也至少查询ID以验证会话存在
            id: true,
          },
    })

    // 如果会话不存在，且 sessionId 是临时 ID，尝试创建新会话
    if (!existingSession && sessionId.startsWith("session_")) {
      // 临时会话 ID，需要从请求体中获取数据库连接信息
      // databaseConnectionId 已经从 body 中解构出来了
      
      if (!databaseConnectionId) {
        return NextResponse.json({ 
          error: "会话不存在且无法创建：缺少 databaseConnectionId" 
        }, { status: 400 })
      }
      
      // 验证数据库连接（只查询需要的字段）
      const connection = await db.databaseConnection.findFirst({
        where: {
          id: databaseConnectionId,
          organizationId: user.organizationId,
        },
        select: {
          id: true,
          organizationId: true,
        },
      })
      
      if (!connection) {
        return NextResponse.json({ 
          error: "数据库连接不存在或无权限" 
        }, { status: 404 })
      }
      
      // 创建新会话
      existingSession = await db.chatSession.create({
        data: {
          title: title || "新对话",
          databaseConnectionId,
          organizationId: user.organizationId,
          createdBy: user.id,
          llmConnectionId: llmConnectionId || null,
          status: "idle",
        },
        select: {
          id: true,
          llmConnectionId: true,
        },
      })
    }
    
    // 如果 existingSession 仍然为 null，说明会话不存在
    if (!existingSession) {
      return NextResponse.json({ error: "会话不存在或无权限" }, { status: 404 })
    }
    
    // 确保使用真实的会话 ID（如果创建了新会话）
    const actualSessionId = existingSession.id

    // 优化：使用请求锁防止同一会话的并发请求
    // 如果已经有正在处理的请求，等待它完成
    const lockKey = `session_${actualSessionId}`
    if (requestLocks.has(lockKey)) {
      // 等待正在处理的请求完成
      await requestLocks.get(lockKey)
    }

    // 创建新的请求锁
    const requestPromise = (async () => {
      try {
        // 如果提供了 llmConnectionId，验证它是否存在且属于该组织
        // 优化：如果 llmConnectionId 没有变化，跳过验证查询
        if (llmConnectionId !== undefined && existingSession && llmConnectionId !== existingSession.llmConnectionId) {
          if (llmConnectionId) {
            // 只查询需要的字段进行验证
            const llmConnection = await db.lLMConnection.findUnique({
              where: { id: llmConnectionId },
              select: {
                id: true,
                organizationId: true,
              },
            })
            if (!llmConnection || llmConnection.organizationId !== user.organizationId) {
              throw new Error("LLM连接不存在或无权限")
            }
          }
        }

        // 优化：合并会话更新和消息保存到一个事务中，减少操作次数
        let updatedSession: any = null
        let savedMessages: any[] = []
        const needsSessionUpdate = title !== undefined || llmConnectionId !== undefined || isPinned !== undefined
        const needsMessageSave = messages && Array.isArray(messages) && messages.length > 0

        // 验证消息格式（如果有消息）
        if (needsMessageSave) {
          for (const msg of messages) {
            if (!msg.role || !msg.content) {
              throw new Error("消息格式不正确：缺少 role 或 content 字段")
            }
            if (!["user", "assistant", "system"].includes(msg.role)) {
              throw new Error(`无效的消息角色: ${msg.role}`)
            }
          }
        }

        // 如果既需要更新会话，又需要保存消息，合并到一个事务
        if (needsSessionUpdate && needsMessageSave) {
          // 消息去重
          const uniqueMessages = new Map<string, typeof messages[0]>()
          const messagesWithoutId: typeof messages = []
          for (const msg of messages) {
            if (msg.id) {
              uniqueMessages.set(msg.id, msg)
            } else {
              messagesWithoutId.push(msg)
            }
          }
          const deduplicatedMessages = [...Array.from(uniqueMessages.values()), ...messagesWithoutId]

          // 合并操作到一个事务
          const updateData: any = {
            updatedAt: new Date(),
          }
          if (title !== undefined) {
            updateData.title = title
          }
          if (llmConnectionId !== undefined) {
            updateData.llmConnectionId = llmConnectionId || null
          }
          if (isPinned !== undefined) {
            updateData.isPinned = isPinned
          }

          try {
            await db.$transaction(async (tx) => {
              // 1. 更新会话
              updatedSession = await tx.chatSession.update({
                where: { id: actualSessionId },
                data: updateData,
                select: {
                  id: true,
                  title: true,
                  llmConnectionId: true,
                  databaseConnectionId: true,
                  isPinned: true,
                  updatedAt: true,
                },
              })

              // 2. 增量保存消息：只更新/插入传递的消息，不删除历史消息
              const messagesWithId = deduplicatedMessages.filter(msg => msg.id)
              const messagesWithoutId = deduplicatedMessages.filter(msg => !msg.id)

              // 对于有 ID 的消息，使用安全 upsert（处理并发冲突）
              for (const msg of messagesWithId) {
                const saved = await safeUpsertMessage(tx, msg, actualSessionId)
                if (saved) {
                  savedMessages.push(saved)
                }
              }

              // 对于没有 ID 的消息，使用 create（插入新消息）
              for (const msg of messagesWithoutId) {
                const saved = await tx.chatMessage.create({
                  data: {
                    sessionId: actualSessionId,
                    role: msg.role,
                    content: msg.content,
                    metadata: msg.metadata ? JSON.parse(JSON.stringify(msg.metadata)) : null,
                    timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
                  },
                  select: {
                    id: true,
                    role: true,
                    content: true,
                    metadata: true,
                    timestamp: true,
                  },
                })
                savedMessages.push(saved)
              }

              // 3. 查询所有消息（包括历史消息和新保存的消息）
              const allMessages = await tx.chatMessage.findMany({
                where: { sessionId: actualSessionId },
                select: {
                  id: true,
                  role: true,
                  content: true,
                  metadata: true,
                  timestamp: true,
                },
                orderBy: [{ timestamp: 'asc' }, { id: 'asc' }],
              })
              savedMessages = allMessages
            }, {
              timeout: 10000,
              maxWait: 5000,
              isolationLevel: 'ReadCommitted',
            })

            // 按时间戳排序
            savedMessages.sort((a, b) => {
              const timeDiff = a.timestamp.getTime() - b.timestamp.getTime()
              if (timeDiff !== 0) return timeDiff
              return a.id.localeCompare(b.id)
            })
          } catch (error: any) {
            console.error('[Chat] Transaction error:', error)
            if (error.code === 'P2034') {
              // 事务冲突，重新查询
              const existingMessages = await db.chatMessage.findMany({
                where: { sessionId: actualSessionId },
                select: {
                  id: true,
                  role: true,
                  content: true,
                  metadata: true,
                  timestamp: true,
                },
                orderBy: [{ timestamp: 'asc' }, { id: 'asc' }],
              })
              savedMessages = existingMessages
              // 重新查询会话
              updatedSession = await db.chatSession.findUnique({
                where: { id: actualSessionId },
                select: {
                  id: true,
                  title: true,
                  llmConnectionId: true,
                  databaseConnectionId: true,
                  isPinned: true,
                  updatedAt: true,
                },
              })
            } else {
              throw error
            }
          }
        } else if (needsSessionUpdate) {
          // 只更新会话
          const updateData: any = {
            updatedAt: new Date(),
          }
          if (title !== undefined) {
            updateData.title = title
          }
          if (llmConnectionId !== undefined) {
            updateData.llmConnectionId = llmConnectionId || null
          }
          if (isPinned !== undefined) {
            updateData.isPinned = isPinned
          }

          updatedSession = await db.chatSession.update({
            where: { id: actualSessionId },
            data: updateData,
            select: {
              id: true,
              title: true,
              llmConnectionId: true,
              databaseConnectionId: true,
              isPinned: true,
              updatedAt: true,
            },
          })
        } else if (needsMessageSave) {
          // 只保存消息
          const uniqueMessages = new Map<string, typeof messages[0]>()
          const messagesWithoutId: typeof messages = []
          for (const msg of messages) {
            if (msg.id) {
              uniqueMessages.set(msg.id, msg)
            } else {
              messagesWithoutId.push(msg)
            }
          }
          const deduplicatedMessages = [...Array.from(uniqueMessages.values()), ...messagesWithoutId]

          try {
            await db.$transaction(async (tx) => {
              // 增量保存消息：只更新/插入传递的消息，不删除历史消息
              const messagesWithId = deduplicatedMessages.filter(msg => msg.id)
              const messagesWithoutId = deduplicatedMessages.filter(msg => !msg.id)

              // 对于有 ID 的消息，使用安全 upsert（处理并发冲突）
              for (const msg of messagesWithId) {
                const saved = await safeUpsertMessage(tx, msg, actualSessionId)
                if (saved) {
                  savedMessages.push(saved)
                }
              }

              // 对于没有 ID 的消息，使用 create（插入新消息）
              for (const msg of messagesWithoutId) {
                const saved = await tx.chatMessage.create({
                  data: {
                    sessionId: actualSessionId,
                    role: msg.role,
                    content: msg.content,
                    metadata: msg.metadata ? JSON.parse(JSON.stringify(msg.metadata)) : null,
                    timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
                  },
                  select: {
                    id: true,
                    role: true,
                    content: true,
                    metadata: true,
                    timestamp: true,
                  },
                })
                savedMessages.push(saved)
              }

              // 查询所有消息（包括历史消息和新保存的消息）
              const allMessages = await tx.chatMessage.findMany({
                where: { sessionId: actualSessionId },
                select: {
                  id: true,
                  role: true,
                  content: true,
                  metadata: true,
                  timestamp: true,
                },
                orderBy: [{ timestamp: 'asc' }, { id: 'asc' }],
              })
              savedMessages = allMessages
            }, {
              timeout: 10000,
              maxWait: 5000,
              isolationLevel: 'ReadCommitted',
            })
          } catch (error: any) {
            console.error('[Chat] Message save error:', error)
            if (error.code === 'P2034') {
              const existingMessages = await db.chatMessage.findMany({
                where: { sessionId: actualSessionId },
                select: {
                  id: true,
                  role: true,
                  content: true,
                  metadata: true,
                  timestamp: true,
                },
                orderBy: [{ timestamp: 'asc' }, { id: 'asc' }],
              })
              savedMessages = existingMessages
            } else {
              throw error
            }
          }
        }

        return { updatedSession, savedMessages }
      } finally {
        // 清除请求锁
        requestLocks.delete(lockKey)
      }
    })()

    // 保存请求锁
    requestLocks.set(lockKey, requestPromise)

    // 等待请求完成
    const { updatedSession, savedMessages } = await requestPromise

    // 返回更新后的会话（包含消息）
    // 如果创建了新会话，返回新会话的 ID
    const finalSessionId = actualSessionId || sessionId
    
    // 优化：直接使用已保存的数据，避免重复查询
    if (savedMessages && savedMessages.length > 0) {
      // 有消息，需要返回消息
      let sessionData: any
      if (updatedSession) {
        // 已经更新了会话，直接使用更新后的数据
        sessionData = updatedSession
      } else if (existingSession && existingSession.title !== undefined) {
        // existingSession 有完整数据，直接使用
        sessionData = {
          id: existingSession.id,
          title: existingSession.title || null,
          databaseConnectionId: existingSession.databaseConnectionId || null,
          llmConnectionId: existingSession.llmConnectionId || null,
          isPinned: existingSession.isPinned || false,
          createdAt: existingSession.createdAt || null,
          updatedAt: existingSession.updatedAt || new Date(),
        }
      } else {
        // 需要查询会话数据
        sessionData = await db.chatSession.findUnique({
          where: { id: finalSessionId },
          select: {
            id: true,
            title: true,
            databaseConnectionId: true,
            llmConnectionId: true,
            isPinned: true,
            createdAt: true,
            updatedAt: true,
          },
        })
      }

      return NextResponse.json({ 
        session: {
          ...sessionData,
          messages: savedMessages, // 直接使用已保存的数据，不需要查询
        }
      })
    } else if (updatedSession) {
      // 只更新了会话，没有消息
      return NextResponse.json({ session: updatedSession })
    } else {
      // 没有更新会话，也没有保存消息，返回现有会话信息
      // 这种情况不应该发生，但为了安全起见，查询会话
      const session = await db.chatSession.findUnique({
        where: { id: finalSessionId },
        select: {
          id: true,
          title: true,
          databaseConnectionId: true,
          llmConnectionId: true,
          isPinned: true,
          createdAt: true,
          updatedAt: true,
        },
      })
      return NextResponse.json({ session })
    }
  } catch (error: any) {
    console.error("[Chat] Update session error:", error)
    const errorMessage = error.message || error.code || "更新聊天会话失败"
    const errorDetails = error.meta || undefined
    return NextResponse.json({ 
      error: errorMessage,
      details: errorDetails,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined
    }, { status: 500 })
  }
}

async function handleDELETE(req: AuthenticatedRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = req.user!
    const { id: sessionId } = await params

    if (!sessionId) {
      return NextResponse.json({ error: "会话ID不能为空" }, { status: 400 })
    }

    // 检查会话是否存在且属于当前用户组织
    // 优化：只查询需要的字段
    const session = await db.chatSession.findFirst({
      where: {
        id: sessionId,
        organizationId: user.organizationId,
      },
      select: {
        id: true,
        title: true,
        databaseConnectionId: true,
        llmConnectionId: true,
        isPinned: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!session) {
      return NextResponse.json({ error: "会话不存在或无权限" }, { status: 404 })
    }

    // 删除会话（消息会通过 CASCADE 自动删除）
    // 如果 CASCADE 没有正确配置，先手动删除消息
    try {
      await db.chatSession.delete({
        where: { id: sessionId },
      })
    } catch (deleteError: any) {
      // 如果删除失败，可能是外键约束问题，尝试先删除消息
      if (deleteError.code === "P2003" || deleteError.message?.includes("Foreign key constraint")) {
        console.log("[Chat] CASCADE not working, deleting messages first...")
        try {
          await db.chatMessage.deleteMany({
            where: { sessionId },
          })
          // 再次尝试删除会话
          await db.chatSession.delete({
            where: { id: sessionId },
          })
        } catch (retryError: any) {
          console.error("[Chat] Failed to delete session after retry:", retryError)
          throw retryError
        }
      } else {
        throw deleteError
      }
    }

    return NextResponse.json({ message: "会话已删除" })
  } catch (error: any) {
    console.error("[Chat] Delete session error:", error)
    const errorMessage = error.message || error.code || "删除聊天会话失败"
    const errorDetails = error.meta || undefined
    return NextResponse.json({ 
      error: errorMessage,
      details: errorDetails
    }, { status: 500 })
  }
}

export const GET = requireAuth(handleGET)
export const PUT = requireAuth(handlePUT)
export const DELETE = requireAuth(handleDELETE)

