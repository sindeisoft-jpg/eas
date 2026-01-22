import { NextResponse } from "next/server"
import { requireAuth, AuthenticatedRequest } from "@/lib/middleware"
import { db } from "@/lib/db"

async function handleGET(req: AuthenticatedRequest) {
  try {
    const user = req.user!
    
    // 添加错误处理和空结果处理
    const reports = await db.savedReport.findMany({
      where: {
        organizationId: user.organizationId,
        OR: [{ isPublic: true }, { createdBy: user.id }],
      },
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        id: true,
        title: true,
        description: true,
        sql: true,
        databaseConnectionId: true,
        chartConfig: true,
        organizationId: true,
        createdBy: true,
        isPublic: true,
        tags: true,
        schedule: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({ reports: reports || [] })
  } catch (error: any) {
    console.error("[Reports] Get all error:", error)
    // 返回空数组而不是错误，避免前端崩溃
    return NextResponse.json({ 
      reports: [],
      error: error?.message || "获取报表列表失败" 
    }, { status: 500 })
  }
}

async function handlePOST(req: AuthenticatedRequest) {
  try {
    const user = req.user!
    const { title, description, sql, databaseConnectionId, chartConfig, isPublic, tags, schedule } = await req.json()

    if (!title || !sql || !databaseConnectionId) {
      return NextResponse.json({ error: "标题、SQL 和数据库连接ID不能为空" }, { status: 400 })
    }

    const connection = await db.databaseConnection.findUnique({
      where: { id: databaseConnectionId },
    })

    if (!connection || connection.organizationId !== user.organizationId) {
      return NextResponse.json({ error: "数据库连接不存在或无权限" }, { status: 404 })
    }

    const report = await db.savedReport.create({
      data: {
        title,
        description: description || null,
        sql,
        databaseConnectionId,
        chartConfig: chartConfig || null,
        organizationId: user.organizationId,
        createdBy: user.id,
        isPublic: isPublic || false,
        tags: tags || [],
        schedule: schedule || null,
      },
    })

    return NextResponse.json({ report }, { status: 201 })
  } catch (error: any) {
    console.error("[Reports] Create error:", error)
    return NextResponse.json({ error: "创建报表失败" }, { status: 500 })
  }
}

export const GET = requireAuth(handleGET)
export const POST = requireAuth(handlePOST)

