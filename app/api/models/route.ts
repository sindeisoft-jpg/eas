import { NextResponse } from "next/server"
import { requireAuth, AuthenticatedRequest } from "@/lib/middleware"
import { db } from "@/lib/db"

async function handleGET(req: AuthenticatedRequest) {
  try {
    const user = req.user!
    const connections = await db.lLMConnection.findMany({
      where: {
        organizationId: user.organizationId,
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    // Don't return API key in response
    const safeConnections = connections.map((conn) => ({
      ...conn,
      apiKey: "***",
    }))

    return NextResponse.json({ connections: safeConnections })
  } catch (error: any) {
    console.error("[Models] Get all error:", error)
    return NextResponse.json({ error: "获取模型连接列表失败" }, { status: 500 })
  }
}

async function handlePOST(req: AuthenticatedRequest) {
  try {
    const user = req.user!
    const { name, provider, apiKey, baseUrl, model, temperature, maxTokens, isDefault } = await req.json()

    if (!name || !provider || !apiKey || !model) {
      return NextResponse.json({ error: "必填字段不能为空" }, { status: 400 })
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await db.lLMConnection.updateMany({
        where: {
          organizationId: user.organizationId,
          isDefault: true,
        },
        data: {
          isDefault: false,
        },
      })
    }

    const newConnection = await db.lLMConnection.create({
      data: {
        name,
        provider,
        apiKey, // In production, encrypt this
        baseUrl: baseUrl || null,
        model,
        temperature: temperature || 0.7,
        maxTokens: maxTokens || 2000,
        organizationId: user.organizationId,
        createdBy: user.id,
        status: "active",
        isDefault: isDefault || false,
      },
    })

    return NextResponse.json(
      {
        connection: {
          ...newConnection,
          apiKey: "***",
        },
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error("[Models] Create error:", error)
    return NextResponse.json({ error: "创建模型连接失败" }, { status: 500 })
  }
}

export const GET = requireAuth(handleGET)
export const POST = requireAuth(handlePOST)

