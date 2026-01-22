import { NextResponse } from "next/server"
import { requireAuth, AuthenticatedRequest } from "@/lib/middleware"
import { ReportAgentGenerator } from "@/lib/report-agent-generator"
import { db } from "@/lib/db"

async function handlePOST(req: AuthenticatedRequest) {
  try {
    const user = req.user!
    const { llmConnectionId, databaseConnectionId } = await req.json()

    if (!llmConnectionId) {
      return NextResponse.json({ error: "LLM连接ID不能为空" }, { status: 400 })
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

    // 生成报告生成智能体配置（在服务器端执行，可以安全使用 Prisma）
    const reportAgentConfig = await ReportAgentGenerator.createDefaultReportAgent(
      llmConnectionId,
      databaseConnectionId
    )

    // 创建智能体
    const newAgent = await db.agent.create({
      data: {
        name: reportAgentConfig.name,
        description: reportAgentConfig.description || null,
        systemMessage: reportAgentConfig.systemMessage,
        llmConnectionId: reportAgentConfig.llmConnectionId,
        databaseConnectionId: reportAgentConfig.databaseConnectionId || null,
        tools: reportAgentConfig.tools || [],
        memory: reportAgentConfig.memory || { type: "simple", enabled: true, maxHistory: 10, config: {} },
        workflow: reportAgentConfig.workflow || { nodes: [], edges: [] },
        execution: reportAgentConfig.execution || {
          timeout: 30,
          maxRetries: 3,
          retryDelay: 1,
          concurrency: 1,
          enableLogging: true,
        },
        organizationId: user.organizationId,
        createdBy: user.id,
        status: reportAgentConfig.status || "active",
        isDefault: reportAgentConfig.isDefault || false,
      },
    })

    return NextResponse.json({ agent: newAgent }, { status: 201 })
  } catch (error: any) {
    console.error("[Agents] Create report agent error:", error)
    return NextResponse.json(
      { 
        error: "创建报告生成智能体失败",
        details: error.message || "未知错误"
      },
      { status: 500 }
    )
  }
}

export const POST = requireAuth(handlePOST)
