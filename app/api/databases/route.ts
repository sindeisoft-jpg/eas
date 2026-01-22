import { NextResponse } from "next/server"
import { requireAuth, AuthenticatedRequest } from "@/lib/middleware"
import { db } from "@/lib/db"

const handleGET = async (req: AuthenticatedRequest) => {
  try {
    const user = req.user!
    const connections = await db.databaseConnection.findMany({
      where: {
        organizationId: user.organizationId,
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    // Don't return password in response
    const safeConnections = connections.map((conn) => ({
      ...conn,
      password: "***",
    }))

    return NextResponse.json({ connections: safeConnections })
  } catch (error: any) {
    console.error("[Databases] Get all error:", error)
    return NextResponse.json({ error: "获取数据库连接列表失败" }, { status: 500 })
  }
}

const handlePOST = async (req: AuthenticatedRequest) => {
  try {
    const user = req.user!
    const { name, type, host, port, database, username, password, ssl, metadata, isDefault } = await req.json()

    if (!name || !type || !host || !database || !username || !password) {
      return NextResponse.json({ error: "必填字段不能为空" }, { status: 400 })
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await db.databaseConnection.updateMany({
        where: {
          organizationId: user.organizationId,
          isDefault: true,
        },
        data: {
          isDefault: false,
        },
      })
    }

    const newConnection = await db.databaseConnection.create({
      data: {
        name,
        type,
        host,
        port: port || 3306,
        database,
        username,
        password, // In production, encrypt this
        ssl: ssl || false,
        metadata: metadata || null,
        organizationId: user.organizationId,
        createdBy: user.id,
        status: "disconnected",
        isDefault: isDefault || false,
      },
    })

    return NextResponse.json(
      {
        connection: {
          ...newConnection,
          password: "***",
        },
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error("[Databases] Create error:", error)
    return NextResponse.json({ error: "创建数据库连接失败" }, { status: 500 })
  }
}

export const GET = requireAuth(handleGET)
export const POST = requireAuth(handlePOST)

