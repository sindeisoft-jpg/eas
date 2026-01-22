import { NextResponse } from "next/server"
import { requireAuth, AuthenticatedRequest } from "@/lib/middleware"

async function handlePOST(req: AuthenticatedRequest) {
  try {
    const user = req.user!
    const { provider, model, apiKey, baseUrl } = await req.json()

    if (!provider || !model) {
      return NextResponse.json(
        { success: false, message: "缺少必要参数：provider 和 model" },
        { status: 400 }
      )
    }

    // Ollama 通常不需要 API Key
    if (!apiKey && provider !== "ollama") {
      return NextResponse.json(
        { success: false, message: "缺少必要参数：apiKey" },
        { status: 400 }
      )
    }

    // 构建 API 请求 URL
    const defaultBaseUrl = baseUrl || (provider === "ollama" ? "http://localhost:11434/v1" : "https://api.openai.com/v1")
    let apiUrl: string

    // 根据不同提供商构建正确的 API URL
    if (defaultBaseUrl.includes("cloudflare.com")) {
      // Cloudflare AI Gateway
      apiUrl = `https://gateway.ai.cloudflare.com/v1/${provider}/${model}/chat/completions`
    } else if (provider === "baidu") {
      // 百度文心一言使用不同的端点格式
      apiUrl = `${defaultBaseUrl}/chat/completions`
    } else if (provider === "qwen") {
      // 阿里云通义千问
      apiUrl = `${defaultBaseUrl}/services/aigc/text-generation/generation`
    } else if (provider === "hunyuan") {
      // 腾讯混元
      apiUrl = `${defaultBaseUrl}/chat/completions`
    } else if (provider === "zhipu") {
      // 智谱AI
      apiUrl = `${defaultBaseUrl}/chat/completions`
    } else if (provider === "google") {
      // Google Gemini 使用不同的端点
      apiUrl = `${defaultBaseUrl}/models/${model}:generateContent`
    } else if (provider === "ollama") {
      // Ollama 使用 OpenAI 兼容格式
      apiUrl = defaultBaseUrl.endsWith("/")
        ? `${defaultBaseUrl}chat/completions`
        : `${defaultBaseUrl}/chat/completions`
    } else {
      // OpenAI 兼容格式（包括 DeepSeek, Anthropic 等）
      apiUrl = defaultBaseUrl.endsWith("/")
        ? `${defaultBaseUrl}chat/completions`
        : `${defaultBaseUrl}/chat/completions`
    }

    console.log("[Models] Test API URL:", apiUrl.replace(apiKey, "***"))

    // 构建请求头
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    }

    // 根据 provider 设置认证头
    if (defaultBaseUrl.includes("cloudflare.com")) {
      // Cloudflare AI Gateway 不需要 API key
    } else if (provider === "ollama") {
      // Ollama 通常不需要 API Key，但如果提供了则使用
      if (apiKey && apiKey.trim() !== "") {
        headers["Authorization"] = `Bearer ${apiKey}`
      }
    } else if (provider === "anthropic") {
      headers["x-api-key"] = apiKey
      headers["anthropic-version"] = "2023-06-01"
    } else {
      headers["Authorization"] = `Bearer ${apiKey}`
    }

    // 根据不同提供商构建请求体
    let requestBody: any
    if (provider === "google") {
      // Google Gemini 使用不同的请求格式
      requestBody = {
        contents: [
          {
            parts: [
              {
                text: "Hello",
              },
            ],
          },
        ],
      }
    } else if (provider === "baidu" || provider === "qwen" || provider === "hunyuan" || provider === "zhipu") {
      // 某些国产模型可能需要不同的格式
      requestBody = {
        model: model,
        messages: [
          {
            role: "user",
            content: "Hello",
          },
        ],
        max_tokens: 10,
      }
    } else {
      // OpenAI 兼容格式（包括 Ollama）
      requestBody = {
        model: model,
        messages: [
          {
            role: "user",
            content: "Hello",
          },
        ],
        max_tokens: 10,
      }
    }

    // 发送测试请求（简单的提示词）
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000) // 15秒超时

    let response: Response
    try {
      console.log("[Models] Test request:", {
        url: apiUrl.replace(apiKey, "***"),
        provider,
        model,
        hasApiKey: !!apiKey,
        baseUrl: defaultBaseUrl,
      })

      response = await fetch(apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)
    } catch (fetchError: any) {
      clearTimeout(timeoutId)
      console.error("[Models] Test fetch error:", {
        name: fetchError.name,
        message: fetchError.message,
        cause: fetchError.cause,
        stack: fetchError.stack?.substring(0, 200),
      })

      if (fetchError.name === "AbortError") {
        return NextResponse.json(
          { success: false, message: "请求超时（15秒），请检查网络连接" },
          { status: 408 }
        )
      } else if (fetchError.message?.includes("fetch failed") || fetchError.cause || fetchError.name === "TypeError") {
        // 提取更详细的错误信息
        const errorMsg = fetchError.cause?.message || fetchError.message || "网络连接失败"
        const errorCode = fetchError.cause?.code || fetchError.code
        const errorSyscall = fetchError.cause?.syscall || fetchError.syscall
        
        // 构建详细的错误诊断信息
        let diagnosticInfo = ""
        if (errorCode) {
          diagnosticInfo += `\n错误代码: ${errorCode}`
        }
        if (errorSyscall) {
          diagnosticInfo += `\n系统调用: ${errorSyscall}`
        }
        diagnosticInfo += `\nAPI 端点: ${defaultBaseUrl}`
        
        // 提供更详细的错误诊断
        let diagnosticMessage = ""
        
        // 检查是否是 DNS 或网络问题
        if (errorCode === "ENOTFOUND" || errorMsg.includes("getaddrinfo") || errorMsg.includes("ENOTFOUND") || errorMsg.includes("DNS")) {
          diagnosticMessage = `❌ **DNS 解析失败**\n\n无法解析 API 服务地址。${diagnosticInfo}\n\n**可能的原因：**\n1. API 端点 URL 配置错误\n2. 网络无法访问该域名\n3. DNS 服务器问题\n\n**解决方案：**\n1. 检查 API 端点 URL 是否正确\n2. 确认网络可以访问该域名\n3. 检查 DNS 设置`
        } else if (errorCode === "ECONNREFUSED" || errorMsg.includes("ECONNREFUSED") || errorMsg.includes("连接被拒绝")) {
          diagnosticMessage = `❌ **连接被拒绝**\n\n无法连接到 API 服务。${diagnosticInfo}\n\n**可能的原因：**\n1. API 服务未运行\n2. 端口配置错误\n3. 防火墙阻止连接\n\n**解决方案：**\n1. 检查 API 服务是否正在运行\n2. 确认端口配置正确\n3. 检查防火墙设置`
        } else if (errorCode === "ETIMEDOUT" || errorMsg.includes("ETIMEDOUT") || errorMsg.includes("timeout")) {
          diagnosticMessage = `❌ **连接超时**\n\n连接 API 服务超时。${diagnosticInfo}\n\n**可能的原因：**\n1. 网络连接速度慢\n2. API 服务响应慢\n3. 防火墙或代理延迟\n\n**解决方案：**\n1. 检查网络连接\n2. 确认 API 服务正常运行\n3. 检查防火墙和代理设置`
        } else if (errorMsg.includes("certificate") || errorMsg.includes("SSL") || errorMsg.includes("TLS")) {
          diagnosticMessage = `❌ **SSL/TLS 证书验证失败**\n\n${diagnosticInfo}\n\n**可能的原因：**\n1. API 端点使用自签名证书\n2. 证书已过期\n3. 证书链不完整\n\n**解决方案：**\n1. 检查 API 端点是否使用 HTTPS\n2. 验证证书是否有效\n3. 如有必要，联系 API 服务提供商`
        } else {
          diagnosticMessage = `❌ **网络连接失败**\n\n无法连接到 AI 服务。${diagnosticInfo}\n请求 URL: ${apiUrl.replace(apiKey, "***")}\n\n**请检查：**\n1. API 端点 URL 是否正确\n`
          if (provider !== "ollama") {
            diagnosticMessage += "2. API Key 是否有效\n"
          } else {
            diagnosticMessage += "2. Ollama 服务是否正在运行（默认地址：http://localhost:11434）\n"
            diagnosticMessage += "3. 模型是否已下载（使用 `ollama pull <model>` 命令）\n"
          }
          diagnosticMessage += `${provider !== "ollama" ? "3" : "4"}. 网络连接是否正常\n`
          diagnosticMessage += `${provider !== "ollama" ? "4" : "5"}. 防火墙是否阻止了连接\n`
        }
        
        return NextResponse.json(
          {
            success: false,
            message: diagnosticMessage,
          },
          { status: 500 }
        )
      }
      return NextResponse.json(
        { success: false, message: `网络请求失败: ${fetchError.message || "未知错误"}` },
        { status: 500 }
      )
    }

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[Models] Test API error:", response.status, errorText)

      let errorMessage = `AI 模型请求失败 (${response.status})`
      let errorCode: number | undefined
      try {
        const errorJson = JSON.parse(errorText)
        errorCode = errorJson.error?.code || errorJson.code
        errorMessage = errorJson.error?.message || errorJson.message || errorMessage
        
        // 针对特定错误代码提供友好的错误提示
        if (errorCode === 1008 || errorMessage.toLowerCase().includes("insufficient balance")) {
          errorMessage = `❌ **账户余额不足**\n\nMiniMax API 账户余额不足，无法完成请求。\n\n**解决方案：**\n1. 前往 MiniMax 控制台充值：https://platform.minimax.chat/\n2. 检查账户余额和套餐状态\n3. 确认 API Key 对应的账户是否有足够的余额\n\n错误代码: ${errorCode || "1008"}\n原始错误: ${errorMessage}`
        } else if (errorCode === 1001 || errorMessage.toLowerCase().includes("invalid api key")) {
          errorMessage = `❌ **API Key 无效**\n\nMiniMax API Key 无效或已过期。\n\n**解决方案：**\n1. 前往 MiniMax 控制台：https://platform.minimax.chat/\n2. 检查并重新生成 API Key\n3. 在"模型管理"页面更新 API Key\n\n错误代码: ${errorCode || "1001"}`
        } else if (errorCode === 1002 || errorMessage.toLowerCase().includes("rate limit")) {
          errorMessage = `❌ **请求频率超限**\n\nMiniMax API 请求频率超过限制。\n\n**解决方案：**\n1. 稍后重试\n2. 检查账户的 API 调用限制\n3. 考虑升级套餐以提高调用频率\n\n错误代码: ${errorCode || "1002"}`
        }
      } catch {
        errorMessage = errorText || errorMessage
      }

      return NextResponse.json(
        {
          success: false,
          message: errorMessage,
        },
        { status: response.status }
      )
    }

    // 尝试解析响应
    try {
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
        if (provider === "ollama" && data.model) {
          return NextResponse.json({
            success: true,
            message: "连接成功！模型配置正确。",
          })
        }
        
        console.error("[Models] Unexpected response format:", {
          provider,
          model,
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
    } catch (error) {
      console.error("[Models] Failed to parse response:", error)
      return NextResponse.json(
        {
          success: false,
          message: "AI 服务返回了无效的响应格式",
        },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error("[Models] Test error:", error)
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
