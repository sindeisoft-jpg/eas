import { NextResponse } from "next/server"
import { requireAuth, AuthenticatedRequest } from "@/lib/middleware"
import { db } from "@/lib/db"

/**
 * 调用LLM翻译内容为中文
 */
async function translateContentWithLLM(
  llmConnection: any,
  content: string
): Promise<string> {
  const provider = llmConnection.provider || "openai"
  const model = llmConnection.model || "gpt-4o-mini"
  const baseUrl = llmConnection.baseUrl || (provider === "ollama" ? "http://localhost:11434/v1" : "https://api.openai.com/v1")
  const temperature = 0.3 // 使用较低温度以获得更一致的翻译结果
  const maxTokens = 4000 // 翻译后的内容可能更长

  // 构建API URL
  let apiUrl = baseUrl.endsWith("/") ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`
  
  if (baseUrl.includes("cloudflare.com")) {
    apiUrl = `https://gateway.ai.cloudflare.com/v1/${provider}/${model}/chat/completions`
  }

  const headers: HeadersInit = {
    "Content-Type": "application/json",
  }

  const apiKey = llmConnection.apiKey
  if (!apiKey || apiKey.trim() === "" || apiKey === "***") {
    throw new Error("LLM API Key未配置")
  }

  if (baseUrl.includes("cloudflare.com")) {
    // Cloudflare AI Gateway 不需要 API key
  } else if (provider === "ollama") {
    if (apiKey && apiKey.trim() !== "") {
      headers["Authorization"] = `Bearer ${apiKey}`
    }
  } else if (provider === "anthropic") {
    headers["x-api-key"] = apiKey
    headers["anthropic-version"] = "2023-06-01"
  } else {
    headers["Authorization"] = `Bearer ${apiKey}`
  }

  // 构建翻译提示词
  const translationPrompt = `请将以下内容翻译成中文。要求：

1. **保持格式**：保留所有Markdown格式、代码块、变量占位符（如 {{variableName}}）等
2. **准确翻译**：准确翻译所有文本内容，保持专业术语的准确性
3. **保持结构**：保留原有的段落结构、列表、标题等
4. **变量处理**：不要翻译变量占位符，保持 {{variableName}} 格式不变
5. **代码块**：代码块中的内容不翻译，保持原样

**原始内容：**
\`\`\`
${content}
\`\`\`

**请直接返回翻译后的内容，不要包含任何解释或说明文字，只返回翻译后的内容本身。**`

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: "system",
            content: "你是一个专业的内容翻译助手，擅长将英文内容准确翻译成中文，同时保持原有的格式、结构和变量占位符不变。",
          },
          {
            role: "user",
            content: translationPrompt,
          },
        ],
        temperature,
        max_tokens: maxTokens,
        stream: false,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`LLM API调用失败: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    
    // 支持多种响应格式
    const translatedContent = 
      data.choices?.[0]?.message?.content || 
      data.content || 
      data.message?.content ||
      data.response ||
      ""

    if (!translatedContent || translatedContent.trim().length === 0) {
      throw new Error("LLM返回的翻译内容为空")
    }

    // 清理可能的markdown代码块标记
    let cleanedContent = translatedContent.trim()
    if (cleanedContent.startsWith("```")) {
      // 移除代码块标记
      cleanedContent = cleanedContent.replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "")
    }

    return cleanedContent.trim()
  } catch (error: any) {
    console.error(`[PromptTranslate] LLM调用失败:`, error)
    throw new Error(`翻译内容失败: ${error.message}`)
  }
}

async function handlePOST(req: AuthenticatedRequest) {
  try {
    const user = req.user!
    if (user.role !== "admin") {
      return NextResponse.json({ error: "无权限" }, { status: 403 })
    }

    const { content } = await req.json()

    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { error: "内容不能为空" },
        { status: 400 }
      )
    }

    console.log("[PromptTranslate] 开始翻译内容，长度:", content.length)

    // 获取默认的LLM连接
    const defaultConnections = await db.lLMConnection.findMany({
      where: {
        organizationId: user.organizationId,
        status: "active",
        isDefault: true,
      },
      take: 1,
    })

    let llmConnection = defaultConnections[0]

    // 如果没有默认连接，获取第一个激活的连接
    if (!llmConnection) {
      const anyConnections = await db.lLMConnection.findMany({
        where: {
          organizationId: user.organizationId,
          status: "active",
        },
        take: 1,
      })
      llmConnection = anyConnections[0]
    }

    if (!llmConnection) {
      return NextResponse.json(
        { error: '未找到可用的AI模型连接。请先在"模型管理"页面配置并激活一个AI模型连接。' },
        { status: 400 }
      )
    }

    console.log("[PromptTranslate] 使用LLM连接:", llmConnection.name)

    // 调用LLM翻译内容
    const translatedContent = await translateContentWithLLM(llmConnection, content)

    console.log("[PromptTranslate] 翻译完成，原始长度:", content.length, "翻译后长度:", translatedContent.length)

    return NextResponse.json({
      translatedContent,
      originalLength: content.length,
      translatedLength: translatedContent.length,
    })
  } catch (error: any) {
    console.error("[PromptTranslate] 翻译过程出错:", error)
    return NextResponse.json(
      {
        error: "翻译内容失败",
        details: error.message,
      },
      { status: 500 }
    )
  }
}

export const POST = requireAuth(handlePOST)
