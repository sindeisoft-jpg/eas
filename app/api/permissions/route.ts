import { NextResponse } from "next/server"
import { requireAuth, AuthenticatedRequest } from "@/lib/middleware"
import { db } from "@/lib/db"

async function handleGET(req: AuthenticatedRequest) {
  try {
    const user = req.user!
    if (user.role !== "admin") {
      return NextResponse.json({ error: "无权限" }, { status: 403 })
    }

    const permissions = await db.dataPermission.findMany({
      where: {
        organizationId: user.organizationId,
      },
      orderBy: {
        updatedAt: "desc",
      },
    })

    return NextResponse.json({ permissions })
  } catch (error: any) {
    console.error("[Permissions] Get all error:", error)
    return NextResponse.json({ error: "获取权限列表失败" }, { status: 500 })
  }
}

async function handlePOST(req: AuthenticatedRequest) {
  try {
    const user = req.user!
    if (user.role !== "admin") {
      return NextResponse.json({ error: "无权限" }, { status: 403 })
    }

    const { name, description, role, databaseConnectionId, tablePermissions } = await req.json()

    if (!name || !databaseConnectionId || !tablePermissions) {
      return NextResponse.json({ error: "必填字段不能为空" }, { status: 400 })
    }

    const connection = await db.databaseConnection.findUnique({
      where: { id: databaseConnectionId },
    })

    if (!connection || connection.organizationId !== user.organizationId) {
      return NextResponse.json({ error: "数据库连接不存在或无权限" }, { status: 404 })
    }

    const permission = await db.dataPermission.create({
      data: {
        name,
        description: description || null,
        role: role || "viewer",
        databaseConnectionId,
        tablePermissions,
        organizationId: user.organizationId,
        createdBy: user.id,
      },
    })

    return NextResponse.json({ permission }, { status: 201 })
  } catch (error: any) {
    console.error("[Permissions] Create error:", error)
    return NextResponse.json({ error: "创建权限失败" }, { status: 500 })
  }
}

export const GET = requireAuth(handleGET)
export const POST = requireAuth(handlePOST)

