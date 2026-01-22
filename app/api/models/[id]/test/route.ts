import { NextResponse } from "next/server"
import { requireAuth, AuthenticatedRequest } from "@/lib/middleware"
import { db } from "@/lib/db"

async function handlePOST(req: AuthenticatedRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = req.user!
    const { id } = await params
    const { provider, model, baseUrl } = await req.json()

    // 从数据库获取模型连接（包含真实的 API Key）
    const connection = await db.lLMConnection.findUnique({
      where: { id },
    })

    if (!connection) {
      return NextResponse.json({ success: false, message: "模型连接不存在" }, { status: 404 })
    }

    if (connection.organizationId !== user.organizationId) {
      return NextResponse.json({ success: false, message: "无权限" }, { status: 403 })
    }

    // 使用数据库中的真实 API Key 进行测试
    // 直接调用测试逻辑（复用 /models/test 的逻辑）
    const testProvider = provider || connection.provider
    const testModel = model || connection.model
    const testBaseUrl = baseUrl || connection.baseUrl || (testProvider === "ollama" ? "http://localhost:11434/v1" : "https://api.openai.com/v1")
    const testApiKey = connection.apiKey

    // 构建 API 请求 URL
    let apiUrl: string
    if (testBaseUrl.includes("cloudflare.com")) {
      apiUrl = `https://gateway.ai.cloudflare.com/v1/${testProvider}/${testModel}/chat/completions`
    } else if (testProvider === "baidu") {
      apiUrl = `${testBaseUrl}/chat/completions`
    } else if (testProvider === "qwen") {
      apiUrl = `${testBaseUrl}/services/aigc/text-generation/generation`
    } else if (testProvider === "hunyuan") {
      apiUrl = `${testBaseUrl}/chat/completions`
    } else if (testProvider === "zhipu") {
      apiUrl = `${testBaseUrl}/chat/completions`
    } else if (testProvider === "google") {
      apiUrl = `${testBaseUrl}/models/${testModel}:generateContent`
    } else if (testProvider === "ollama") {
      // Ollama 使用 OpenAI 兼容格式
      apiUrl = testBaseUrl.endsWith("/")
        ? `${testBaseUrl}chat/completions`
        : `${testBaseUrl}/chat/completions`
    } else {
      apiUrl = testBaseUrl.endsWith("/")
        ? `${testBaseUrl}chat/completions`
        : `${testBaseUrl}/chat/completions`
    }

    // 构建请求头
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    }

    if (testBaseUrl.includes("cloudflare.com")) {
      // Cloudflare AI Gateway 不需要 API key
    } else if (testProvider === "ollama") {
      // Ollama 通常不需要 API Key，但如果提供了则使用
      if (testApiKey && testApiKey.trim() !== "" && testApiKey !== "***") {
        headers["Authorization"] = `Bearer ${testApiKey}`
      }
    } else if (testProvider === "anthropic") {
      headers["x-api-key"] = testApiKey
      headers["anthropic-version"] = "2023-06-01"
    } else {
      headers["Authorization"] = `Bearer ${testApiKey}`
    }

    // 构建请求体
    let requestBody: any
    if (testProvider === "google") {
      requestBody = {
        contents: [
          {
            parts: [{ text: "Hello" }],
          },
        ],
      }
    } else {
      requestBody = {
        model: testModel,
        messages: [{ role: "user", content: "Hello" }],
        max_tokens: 10,
      }
    }

    // 发送测试请求
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = `AI 模型请求失败 (${response.status})`
        try {
          const errorJson = JSON.parse(errorText)
          errorMessage = errorJson.error?.message || errorJson.message || errorMessage
        } catch {
          errorMessage = errorText || errorMessage
        }
        return NextResponse.json({ success: false, message: errorMessage }, { status: response.status })
      }

      const data = await response.json()
      console.log("[Models] Test response data:", JSON.stringify(data).substring(0, 500))
      
      // 检查响应格式是否正确
      // OpenAI 兼容格式: data.choices[0].message.content
      // Anthropic 格式: data.content
      // Ollama 格式: data.message.content 或 data.response
      // Google 格式: data.candidates[0].content.parts[0].text
      const hasValidContent = 
        data.choices?.[0]?.message?.content || 
        data.content || 
        data.message?.content ||
        data.response ||
        data.candidates?.[0]?.content?.parts?.[0]?.text
      
      if (hasValidContent) {
        return NextResponse.json({
          success: true,
          message: "连接成功！模型配置正确。",
        })
      } else {
        // 对于 Ollama，即使格式不完全匹配，如果响应状态是 200 且包含 model 字段，也认为成功
        if (testProvider === "ollama" && data.model) {
          return NextResponse.json({
            success: true,
            message: "连接成功！模型配置正确。",
          })
        }
        
        console.error("[Models] Unexpected response format:", {
          provider: testProvider,
          model: testModel,
          hasChoices: !!data.choices,
          hasContent: !!data.content,
          hasMessage: !!data.message,
          hasResponse: !!data.response,
          dataKeys: Object.keys(data),
        })
        
        return NextResponse.json({
          success: false,
          message: `API 返回了意外的响应格式。响应数据: ${JSON.stringify(data).substring(0, 200)}`,
        })
      }
    } catch (fetchError: any) {
      clearTimeout(timeoutId)
      if (fetchError.name === "AbortError") {
        return NextResponse.json({ success: false, message: "请求超时（15秒），请检查网络连接" }, { status: 408 })
      }
      return NextResponse.json(
        {
          success: false,
          message: `无法连接到 AI 服务: ${fetchError.message || "网络连接失败"}。请检查网络连接和 API 配置。`,
        },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error("[Models] Test by ID error:", error)
    return NextResponse.json(
      {
        success: false,
        message: error.message || "测试连接失败",
      },
      { status: 500 }
    )
  }
}

export const POST = requireAuth(handlePOST)

