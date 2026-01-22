import { NextResponse } from "next/server"
import { requireAuth, AuthenticatedRequest } from "@/lib/middleware"
import { db } from "@/lib/db"

async function handleGET(req: AuthenticatedRequest, { params }: { params: Promise<{ id: string }> }) {
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

    return NextResponse.json({
      connection: {
        ...connection,
        password: "***",
      },
    })
  } catch (error: any) {
    console.error("[Databases] Get error:", error)
    return NextResponse.json({ error: "获取数据库连接失败" }, { status: 500 })
  }
}

async function handlePUT(req: AuthenticatedRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = req.user!
    const { id: connectionId } = await params
    const { name, type, host, port, database, username, password, ssl, metadata, status, isDefault } = await req.json()

    const existingConnection = await db.databaseConnection.findUnique({
      where: { id: connectionId },
    })

    if (!existingConnection) {
      return NextResponse.json({ error: "数据库连接不存在" }, { status: 404 })
    }

    if (existingConnection.organizationId !== user.organizationId) {
      return NextResponse.json({ error: "无权限" }, { status: 403 })
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await db.databaseConnection.updateMany({
        where: {
          organizationId: user.organizationId,
          isDefault: true,
          id: { not: connectionId },
        },
        data: {
          isDefault: false,
        },
      })
    }

    const updateData: any = {}
    if (name) updateData.name = name
    if (type) updateData.type = type
    if (host) updateData.host = host
    if (port) updateData.port = port
    if (database) updateData.database = database
    if (username) updateData.username = username
    if (password) updateData.password = password
    if (ssl !== undefined) updateData.ssl = ssl
    if (metadata !== undefined) updateData.metadata = metadata
    if (status) updateData.status = status
    if (isDefault !== undefined) updateData.isDefault = isDefault

    const updatedConnection = await db.databaseConnection.update({
      where: { id: connectionId },
      data: updateData,
    })

    return NextResponse.json({
      connection: {
        ...updatedConnection,
        password: "***",
      },
    })
  } catch (error: any) {
    console.error("[Databases] Update error:", error)
    return NextResponse.json({ error: "更新数据库连接失败" }, { status: 500 })
  }
}

async function handleDELETE(req: AuthenticatedRequest, { params }: { params: Promise<{ id: string }> }) {
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

    await db.databaseConnection.delete({
      where: { id: connectionId },
    })

    return NextResponse.json({ message: "数据库连接已删除" })
  } catch (error: any) {
    console.error("[Databases] Delete error:", error)
    return NextResponse.json({ error: "删除数据库连接失败" }, { status: 500 })
  }
}

export const GET = requireAuth(handleGET)
export const PUT = requireAuth(handlePUT)
export const DELETE = requireAuth(handleDELETE)
