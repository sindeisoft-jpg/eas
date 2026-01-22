import { NextResponse } from "next/server"
import { requireAuth, AuthenticatedRequest } from "@/lib/middleware"
import { db } from "@/lib/db"

async function handler(req: AuthenticatedRequest) {
  try {
    const userId = req.user!.id

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        organizationId: true,
        createdAt: true,
        lastLoginAt: true,
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            plan: true,
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 })
    }

    return NextResponse.json({ user })
  } catch (error: any) {
    console.error("[Auth] Get me error:", error)
    
    // Check for common database errors
    let errorMessage = "获取用户信息失败"
    let statusCode = 500
    
    if (error.message?.includes("PrismaClient") || error.message?.includes("Cannot find module")) {
      errorMessage = "数据库客户端未初始化"
      statusCode = 503 // Service Unavailable
    } else if (error.message?.includes("P1001") || error.message?.includes("Can't reach database")) {
      errorMessage = "无法连接到数据库"
      statusCode = 503
    } else if (process.env.NODE_ENV === "development") {
      errorMessage = `获取用户信息失败: ${error.message || error.toString()}`
    }
    
    return NextResponse.json({ error: errorMessage }, { status: statusCode })
  }
}

export const GET = requireAuth(handler)