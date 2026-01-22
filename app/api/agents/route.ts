import { NextResponse } from "next/server"
import { requireAuth, AuthenticatedRequest } from "@/lib/middleware"
import { db } from "@/lib/db"

async function handleGET(req: AuthenticatedRequest) {
  try {
    const user = req.user!
    const agents = await db.agent.findMany({
      where: {
        organizationId: user.organizationId,
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    return NextResponse.json({ agents })
  } catch (error: any) {
    console.error("[Agents] Get all error:", error)
    console.error("[Agents] Error details:", {
      message: error.message,
      code: error.code,
      meta: error.meta,
    })
    
    // 检查是否是表不存在的错误
    const isTableNotExist = 
      error.code === 'P2001' || // Table does not exist
      error.code === 'P2003' || // Foreign key constraint
      error.message?.includes("doesn't exist") ||
      error.message?.includes("does not exist") ||
      error.message?.includes("Table") ||
      error.message?.toLowerCase().includes("table `agents`") ||
      error.meta?.target?.includes('agents')
    
    return NextResponse.json(
      {
        error: "获取智能体列表失败",
        details: error.message || "未知错误",
        code: error.code,
        hint: isTableNotExist 
          ? "数据库表 'agents' 不存在，请运行 SQL 脚本创建表" 
          : undefined,
      },
      { status: 500 }
    )
  }
}

async function handlePOST(req: AuthenticatedRequest) {
  try {
    const user = req.user!
    const {
      name,
      description,
      systemMessage,
      llmConnectionId,
      databaseConnectionId,
      tools,
      memory,
      workflow,
      execution,
      status,
      isDefault,
    } = await req.json()

    if (!name || !systemMessage || !llmConnectionId) {
      return NextResponse.json({ error: "必填字段不能为空" }, { status: 400 })
    }

    // 验证LLM连接是否存在且属于同一组织
    const llmConnection = await db.lLMConnection.findUnique({
      where: { id: llmConnectionId },
    })

    if (!llmConnection) {
      return NextResponse.json({ error: "LLM连接不存在" }, { status: 400 })
    }

    if (llmConnection.organizationId !== user.organizationId) {
      return NextResponse.json({ error: "无权限使用该LLM连接" }, { status: 403 })
    }

    // 如果设置了数据库连接，验证其存在性和权限
    if (databaseConnectionId) {
      const dbConnection = await db.databaseConnection.findUnique({
        where: { id: databaseConnectionId },
      })

      if (!dbConnection) {
        return NextResponse.json({ error: "数据库连接不存在" }, { status: 400 })
      }

      if (dbConnection.organizationId !== user.organizationId) {
        return NextResponse.json({ error: "无权限使用该数据库连接" }, { status: 403 })
      }
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await db.agent.updateMany({
        where: {
          organizationId: user.organizationId,
          isDefault: true,
        },
        data: {
          isDefault: false,
        },
      })
    }

    const newAgent = await db.agent.create({
      data: {
        name,
        description: description || null,
        systemMessage,
        llmConnectionId,
        databaseConnectionId: databaseConnectionId || null,
        tools: tools || [],
        memory: memory || { type: "simple", enabled: true, maxHistory: 10, config: {} },
        workflow: workflow || { nodes: [], edges: [] },
        execution: execution || {
          timeout: 30,
          maxRetries: 3,
          retryDelay: 1,
          concurrency: 1,
          enableLogging: true,
        },
        organizationId: user.organizationId,
        createdBy: user.id,
        status: status || "active",
        isDefault: isDefault || false,
      },
    })

    return NextResponse.json({ agent: newAgent }, { status: 201 })
  } catch (error: any) {
    console.error("[Agents] Create error:", error)
    return NextResponse.json({ error: "创建智能体失败" }, { status: 500 })
  }
}

export const GET = requireAuth(handleGET)
export const POST = requireAuth(handlePOST)
