import { NextResponse } from "next/server"
import { requireAuth, AuthenticatedRequest } from "@/lib/middleware"
import { db } from "@/lib/db"

async function handleGET(req: AuthenticatedRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = req.user!
    const { id } = await params

    const connection = await db.lLMConnection.findUnique({
      where: { id },
    })

    if (!connection) {
      return NextResponse.json({ error: "模型连接不存在" }, { status: 404 })
    }

    if (connection.organizationId !== user.organizationId) {
      return NextResponse.json({ error: "无权限" }, { status: 403 })
    }

    // Don't return API key in response
    return NextResponse.json({
      connection: {
        ...connection,
        apiKey: "***",
      },
    })
  } catch (error: any) {
    console.error("[Models] Get error:", error)
    return NextResponse.json({ error: "获取模型连接失败" }, { status: 500 })
  }
}

async function handlePUT(req: AuthenticatedRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = req.user!
    const { id } = await params
    const { name, provider, apiKey, baseUrl, model, temperature, maxTokens, isDefault, status } = await req.json()

    const connection = await db.lLMConnection.findUnique({
      where: { id },
    })

    if (!connection) {
      return NextResponse.json({ error: "模型连接不存在" }, { status: 404 })
    }

    if (connection.organizationId !== user.organizationId) {
      return NextResponse.json({ error: "无权限" }, { status: 403 })
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await db.lLMConnection.updateMany({
        where: {
          organizationId: user.organizationId,
          isDefault: true,
          id: { not: id },
        },
        data: {
          isDefault: false,
        },
      })
    }

    // 如果 apiKey 未提供、是 "***" 或空字符串，表示用户没有修改，保留原有的 API Key
    // 如果 apiKey 明确提供了且不是占位符，则更新
    const shouldUpdateApiKey = apiKey !== undefined && 
                                apiKey !== null &&
                                apiKey !== "***" && 
                                apiKey.trim() !== "" &&
                                apiKey !== connection.apiKey

    console.log("[Models] Updating LLM connection:", {
      id,
      shouldUpdateApiKey,
      hasApiKeyInRequest: apiKey !== undefined,
      apiKeyValue: apiKey === "***" ? "***" : (apiKey ? `${apiKey.substring(0, 5)}...` : "empty"),
      currentApiKeyLength: connection.apiKey?.length || 0,
    })

    const updatedConnection = await db.lLMConnection.update({
      where: { id },
      data: {
        name: name || connection.name,
        provider: provider || connection.provider,
        apiKey: shouldUpdateApiKey ? apiKey : connection.apiKey, // 只有在新值有效时才更新
        baseUrl: baseUrl !== undefined ? baseUrl : connection.baseUrl,
        model: model || connection.model,
        temperature: temperature !== undefined ? temperature : connection.temperature,
        maxTokens: maxTokens !== undefined ? maxTokens : connection.maxTokens,
        isDefault: isDefault !== undefined ? isDefault : connection.isDefault,
        status: status || connection.status,
      },
    })

    return NextResponse.json({
      connection: {
        ...updatedConnection,
        apiKey: "***",
      },
    })
  } catch (error: any) {
    console.error("[Models] Update error:", error)
    return NextResponse.json({ error: "更新模型连接失败" }, { status: 500 })
  }
}

async function handleDELETE(req: AuthenticatedRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = req.user!
    const { id } = await params

    const connection = await db.lLMConnection.findUnique({
      where: { id },
    })

    if (!connection) {
      return NextResponse.json({ error: "模型连接不存在" }, { status: 404 })
    }

    if (connection.organizationId !== user.organizationId) {
      return NextResponse.json({ error: "无权限" }, { status: 403 })
    }

    await db.lLMConnection.delete({
      where: { id },
    })

    return NextResponse.json({ message: "模型连接已删除" })
  } catch (error: any) {
    console.error("[Models] Delete error:", error)
    return NextResponse.json({ error: "删除模型连接失败" }, { status: 500 })
  }
}

export const GET = requireAuth(handleGET)
export const PUT = requireAuth(handlePUT)
export const DELETE = requireAuth(handleDELETE)

