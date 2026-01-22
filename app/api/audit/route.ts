import { NextResponse } from "next/server"
import { requireAuth, AuthenticatedRequest } from "@/lib/middleware"
import { db } from "@/lib/db"

async function handleGET(req: AuthenticatedRequest) {
  try {
    const user = req.user!
    if (user.role !== "admin") {
      return NextResponse.json({ error: "无权限" }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const limit = parseInt(searchParams.get("limit") || "100")
    const offset = parseInt(searchParams.get("offset") || "0")
    const action = searchParams.get("action")
    const userId = searchParams.get("userId")

    const where: any = {
      organizationId: user.organizationId,
    }

    if (action) {
      where.action = action
    }

    if (userId) {
      where.userId = userId
    }

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: {
          timestamp: "desc",
        },
        take: limit,
        skip: offset,
      }),
      db.auditLog.count({ where }),
    ])

    return NextResponse.json({ logs, total, limit, offset })
  } catch (error: any) {
    console.error("[Audit] Get logs error:", error)
    return NextResponse.json({ error: "获取审计日志失败" }, { status: 500 })
  }
}

export const GET = requireAuth(handleGET)

