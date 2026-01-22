import { NextResponse } from "next/server"
import { requireAuth, AuthenticatedRequest } from "@/lib/middleware"
import { db } from "@/lib/db"
import { SQLExecutor } from "@/lib/sql-executor"

async function handlePOST(req: AuthenticatedRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = req.user!
    const { id: connectionId } = await params

    const connection = await db.databaseConnection.findUnique({
      where: { id: connectionId },
    })

    if (!connection) {
      return NextResponse.json({ error: "数据库连接不存在" }, { status: 404 })
    }

    if (connection.organizationId !== user.organizationId) {
      return NextResponse.json({ error: "无权限" }, { status: 403 })
    }

    const isValid = await SQLExecutor.testConnection(connection as any)

    // Update connection status
    await db.databaseConnection.update({
      where: { id: connectionId },
      data: {
        status: isValid ? "connected" : "error",
        lastTestedAt: new Date(),
      },
    })

    return NextResponse.json({ success: isValid, message: isValid ? "连接成功" : "连接失败" })
  } catch (error: any) {
    console.error("[Databases] Test error:", error)
    return NextResponse.json({ error: "测试连接失败" }, { status: 500 })
  }
}

export const POST = requireAuth(handlePOST)

