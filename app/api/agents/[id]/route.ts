import { NextResponse } from "next/server"
import { requireAuth, AuthenticatedRequest } from "@/lib/middleware"
import { db } from "@/lib/db"

async function handleGET(req: AuthenticatedRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = req.user!
    const { id } = await params

    const agent = await db.agent.findUnique({
      where: { id },
    })

    if (!agent) {
      return NextResponse.json({ error: "智能体不存在" }, { status: 404 })
    }

    if (agent.organizationId !== user.organizationId) {
      return NextResponse.json({ error: "无权限" }, { status: 403 })
    }

    return NextResponse.json({ agent })
  } catch (error: any) {
    console.error("[Agents] Get error:", error)
    return NextResponse.json({ error: "获取智能体失败" }, { status: 500 })
  }
}

async function handlePUT(req: AuthenticatedRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = req.user!
    const { id } = await params
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

    const agent = await db.agent.findUnique({
      where: { id },
    })

    if (!agent) {
      return NextResponse.json({ error: "智能体不存在" }, { status: 404 })
    }

    if (agent.organizationId !== user.organizationId) {
      return NextResponse.json({ error: "无权限" }, { status: 403 })
    }

    // 如果更新了LLM连接，验证其存在性和权限
    if (llmConnectionId && llmConnectionId !== agent.llmConnectionId) {
      const llmConnection = await db.lLMConnection.findUnique({
        where: { id: llmConnectionId },
      })

      if (!llmConnection) {
        return NextResponse.json({ error: "LLM连接不存在" }, { status: 400 })
      }

      if (llmConnection.organizationId !== user.organizationId) {
        return NextResponse.json({ error: "无权限使用该LLM连接" }, { status: 403 })
      }
    }

    // 如果更新了数据库连接，验证其存在性和权限
    if (databaseConnectionId !== undefined && databaseConnectionId !== agent.databaseConnectionId) {
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
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await db.agent.updateMany({
        where: {
          organizationId: user.organizationId,
          isDefault: true,
          id: { not: id },
        },
        data: {
          isDefault: false,
        },
      })
    }

    const updatedAgent = await db.agent.update({
      where: { id },
      data: {
        name: name !== undefined ? name : agent.name,
        description: description !== undefined ? description : agent.description,
        systemMessage: systemMessage !== undefined ? systemMessage : agent.systemMessage,
        llmConnectionId: llmConnectionId !== undefined ? llmConnectionId : agent.llmConnectionId,
        databaseConnectionId:
          databaseConnectionId !== undefined ? databaseConnectionId || null : agent.databaseConnectionId,
        tools: tools !== undefined ? tools : agent.tools,
        memory: memory !== undefined ? memory : agent.memory,
        workflow: workflow !== undefined ? workflow : agent.workflow,
        execution: execution !== undefined ? execution : agent.execution,
        status: status !== undefined ? status : agent.status,
        isDefault: isDefault !== undefined ? isDefault : agent.isDefault,
      },
    })

    return NextResponse.json({ agent: updatedAgent })
  } catch (error: any) {
    console.error("[Agents] Update error:", error)
    return NextResponse.json({ error: "更新智能体失败" }, { status: 500 })
  }
}

async function handleDELETE(req: AuthenticatedRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = req.user!
    const { id } = await params

    const agent = await db.agent.findUnique({
      where: { id },
    })

    if (!agent) {
      return NextResponse.json({ error: "智能体不存在" }, { status: 404 })
    }

    if (agent.organizationId !== user.organizationId) {
      return NextResponse.json({ error: "无权限" }, { status: 403 })
    }

    await db.agent.delete({
      where: { id },
    })

    return NextResponse.json({ message: "智能体已删除" })
  } catch (error: any) {
    console.error("[Agents] Delete error:", error)
    return NextResponse.json({ error: "删除智能体失败" }, { status: 500 })
  }
}

export const GET = requireAuth(handleGET)
export const PUT = requireAuth(handlePUT)
export const DELETE = requireAuth(handleDELETE)
