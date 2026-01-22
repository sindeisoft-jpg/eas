import { NextResponse } from "next/server"
import { requireAuth, AuthenticatedRequest } from "@/lib/middleware"
import { db } from "@/lib/db"

/**
 * 批量获取所有配置数据
 * 使用 Prisma 事务将多个查询合并为一个数据库操作
 * 虽然仍然是多个 SQL 查询，但在数据库层面会优化执行
 */
async function handleGET(req: AuthenticatedRequest) {
  try {
    const user = req.user!
    const organizationId = user.organizationId

    // 使用 Prisma 事务，将多个查询合并为一个数据库操作
    // 事务中的所有查询会在一个数据库连接中执行，减少连接开销
    const [databaseConnections, llmConnections, agents] = await db.$transaction([
      // 查询数据库连接
      db.databaseConnection.findMany({
        where: {
          organizationId,
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          name: true,
          type: true,
          host: true,
          port: true,
          database: true,
          username: true,
          password: true, // 返回后会被隐藏
          ssl: true,
          organizationId: true,
          createdBy: true,
          createdAt: true,
          lastTestedAt: true,
          status: true,
          metadata: true,
          isDefault: true,
        },
      }),
      // 查询 LLM 连接
      db.lLMConnection.findMany({
        where: {
          organizationId,
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          name: true,
          provider: true,
          apiKey: true, // 返回后会被隐藏
          baseUrl: true,
          model: true,
          temperature: true,
          maxTokens: true,
          organizationId: true,
          createdBy: true,
          createdAt: true,
          status: true,
          isDefault: true,
        },
      }),
      // 查询智能体
      db.agent.findMany({
        where: {
          organizationId,
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          name: true,
          description: true,
          systemMessage: true,
          llmConnectionId: true,
          databaseConnectionId: true,
          tools: true,
          memory: true,
          workflow: true,
          execution: true,
          organizationId: true,
          createdBy: true,
          createdAt: true,
          updatedAt: true,
          status: true,
          isDefault: true,
        },
      }),
    ], {
      isolationLevel: 'ReadCommitted', // 使用读已提交隔离级别，提高性能
      timeout: 5000, // 5 秒超时
    })

    // 隐藏敏感信息
    const safeDatabaseConnections = databaseConnections.map((conn) => ({
      ...conn,
      password: "***",
    }))

    const safeLLMConnections = llmConnections.map((conn) => ({
      ...conn,
      apiKey: "***",
    }))

    return NextResponse.json({
      databases: safeDatabaseConnections,
      models: safeLLMConnections,
      agents: agents,
    })
  } catch (error: any) {
    console.error("[Config] Get all error:", error)
    return NextResponse.json(
      { error: "获取配置数据失败", details: error.message },
      { status: 500 }
    )
  }
}

export const GET = requireAuth(handleGET)
