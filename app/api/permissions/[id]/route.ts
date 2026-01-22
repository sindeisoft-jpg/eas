import { NextResponse } from "next/server"
import { requireAuth, AuthenticatedRequest } from "@/lib/middleware"
import { db } from "@/lib/db"

async function handlePUT(
  req: AuthenticatedRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = req.user!
    if (user.role !== "admin") {
      return NextResponse.json({ error: "无权限" }, { status: 403 })
    }

    const { id } = await params
    const { name, description, role, databaseConnectionId, tablePermissions } = await req.json()

    if (!name || !databaseConnectionId || !tablePermissions) {
      return NextResponse.json({ error: "必填字段不能为空" }, { status: 400 })
    }

    // 检查权限是否存在且属于当前组织
    const existingPermission = await db.dataPermission.findUnique({
      where: { id },
    })

    if (!existingPermission || existingPermission.organizationId !== user.organizationId) {
      return NextResponse.json({ error: "权限不存在或无权限" }, { status: 404 })
    }

    // 检查数据库连接是否存在
    const connection = await db.databaseConnection.findUnique({
      where: { id: databaseConnectionId },
    })

    if (!connection || connection.organizationId !== user.organizationId) {
      return NextResponse.json({ error: "数据库连接不存在或无权限" }, { status: 404 })
    }

    const permission = await db.dataPermission.update({
      where: { id },
      data: {
        name,
        description: description || null,
        role: role || "viewer",
        databaseConnectionId,
        tablePermissions,
      },
    })

    return NextResponse.json({ permission })
  } catch (error: any) {
    console.error("[Permissions] Update error:", error)
    return NextResponse.json({ error: "更新权限失败" }, { status: 500 })
  }
}

async function handleDELETE(
  req: AuthenticatedRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = req.user!
    if (user.role !== "admin") {
      return NextResponse.json({ error: "无权限" }, { status: 403 })
    }

    const { id } = await params

    // 检查权限是否存在且属于当前组织
    const existingPermission = await db.dataPermission.findUnique({
      where: { id },
    })

    if (!existingPermission || existingPermission.organizationId !== user.organizationId) {
      return NextResponse.json({ error: "权限不存在或无权限" }, { status: 404 })
    }

    await db.dataPermission.delete({
      where: { id },
    })

    return NextResponse.json({ message: "权限已删除" })
  } catch (error: any) {
    console.error("[Permissions] Delete error:", error)
    return NextResponse.json({ error: "删除权限失败" }, { status: 500 })
  }
}

export const PUT = requireAuth(handlePUT)
export const DELETE = requireAuth(handleDELETE)
