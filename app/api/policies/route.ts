import { NextResponse } from "next/server"
import { requireAuth, AuthenticatedRequest } from "@/lib/middleware"
import { db } from "@/lib/db"

async function handleGET(req: AuthenticatedRequest) {
  try {
    const user = req.user!
    if (user.role !== "admin") {
      return NextResponse.json({ error: "无权限" }, { status: 403 })
    }

    const policies = await db.sQLPolicy.findMany({
      where: {
        organizationId: user.organizationId,
      },
      orderBy: {
        updatedAt: "desc",
      },
    })

    return NextResponse.json({ policies })
  } catch (error: any) {
    console.error("[Policies] Get all error:", error)
    return NextResponse.json({ error: "获取策略列表失败" }, { status: 500 })
  }
}

async function handlePOST(req: AuthenticatedRequest) {
  try {
    const user = req.user!
    if (user.role !== "admin") {
      return NextResponse.json({ error: "无权限" }, { status: 403 })
    }

    const { name, allowedOperations, blockedKeywords, maxExecutionTime, maxRowsReturned, requiresApproval } =
      await req.json()

    if (!name || !allowedOperations) {
      return NextResponse.json({ error: "必填字段不能为空" }, { status: 400 })
    }

    const policy = await db.sQLPolicy.create({
      data: {
        name,
        allowedOperations,
        blockedKeywords: blockedKeywords || [],
        maxExecutionTime: maxExecutionTime || 30,
        maxRowsReturned: maxRowsReturned || 10000,
        requiresApproval: requiresApproval || false,
        organizationId: user.organizationId,
        createdBy: user.id,
      },
    })

    return NextResponse.json({ policy }, { status: 201 })
  } catch (error: any) {
    console.error("[Policies] Create error:", error)
    return NextResponse.json({ error: "创建策略失败" }, { status: 500 })
  }
}

export const GET = requireAuth(handleGET)
export const POST = requireAuth(handlePOST)

