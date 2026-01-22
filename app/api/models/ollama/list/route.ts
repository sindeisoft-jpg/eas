import { NextResponse } from "next/server"
import { requireAuth, AuthenticatedRequest } from "@/lib/middleware"

async function handlePOST(req: AuthenticatedRequest) {
  try {
    const { baseUrl } = await req.json()

    // 默认使用 localhost:11434，但允许自定义
    const ollamaBaseUrl = baseUrl || "http://localhost:11434"
    
    // 移除末尾的 /v1 或 /api，因为我们要调用 /api/tags
    const cleanBaseUrl = ollamaBaseUrl.replace(/\/v1$/, "").replace(/\/api$/, "")
    
    // 构建 Ollama API URL
    const apiUrl = `${cleanBaseUrl}/api/tags`

    console.log("[Ollama] Fetching models from:", apiUrl)

    // 调用 Ollama API 获取模型列表
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10秒超时

    let response: Response
    try {
      response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      })

      clearTimeout(timeoutId)
    } catch (fetchError: any) {
      clearTimeout(timeoutId)
      console.error("[Ollama] Fetch error:", fetchError)

      if (fetchError.name === "AbortError") {
        return NextResponse.json(
          { success: false, message: "请求超时（10秒），请检查 Ollama 服务是否正在运行", models: [] },
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
        diagnosticInfo += `\nOllama 服务地址: ${cleanBaseUrl}`
        
        let diagnosticMessage = ""
        
        if (errorCode === "ENOTFOUND" || errorMsg.includes("getaddrinfo") || errorMsg.includes("ENOTFOUND") || errorMsg.includes("DNS")) {
          diagnosticMessage = `❌ **DNS 解析失败**\n\n无法解析 Ollama 服务地址。${diagnosticInfo}\n\n**可能的原因：**\n1. Ollama 服务地址配置错误\n2. 网络无法访问该地址\n3. DNS 服务器问题\n\n**解决方案：**\n1. 检查 Ollama 服务地址是否正确\n2. 确认网络可以访问该地址\n3. 检查 DNS 设置`
        } else if (errorCode === "ECONNREFUSED" || errorMsg.includes("ECONNREFUSED") || errorMsg.includes("连接被拒绝")) {
          diagnosticMessage = `❌ **连接被拒绝**\n\n无法连接到 Ollama 服务。${diagnosticInfo}\n\n**可能的原因：**\n1. Ollama 服务未运行\n2. 服务地址或端口配置错误\n3. 防火墙阻止连接\n\n**解决方案：**\n1. 启动 Ollama 服务：\`ollama serve\`\n2. 检查服务地址和端口（默认：http://localhost:11434）\n3. 测试连接：\`curl http://localhost:11434/api/tags\`\n4. 检查防火墙设置`
        } else if (errorCode === "ETIMEDOUT" || errorMsg.includes("ETIMEDOUT") || errorMsg.includes("timeout")) {
          diagnosticMessage = `❌ **连接超时**\n\n连接 Ollama 服务超时。${diagnosticInfo}\n\n**可能的原因：**\n1. 网络连接速度慢\n2. Ollama 服务响应慢\n3. 防火墙或代理延迟\n\n**解决方案：**\n1. 检查网络连接\n2. 确认 Ollama 服务正常运行\n3. 检查防火墙和代理设置`
        } else if (errorMsg.includes("certificate") || errorMsg.includes("SSL") || errorMsg.includes("TLS")) {
          diagnosticMessage = `❌ **SSL/TLS 证书验证失败**\n\n${diagnosticInfo}\n\n**可能的原因：**\n1. Ollama 服务使用自签名证书\n2. 证书已过期\n\n**解决方案：**\n1. 检查 Ollama 服务是否使用 HTTPS\n2. 验证证书是否有效`
        } else {
          diagnosticMessage = `❌ **无法连接到 Ollama 服务**\n\n错误信息: ${errorMsg}${diagnosticInfo}\n\n**请检查：**\n1. Ollama 服务是否正在运行（运行 \`ollama serve\` 启动服务）\n2. 服务地址和端口是否正确（默认：http://localhost:11434）\n3. 防火墙是否阻止了连接\n4. 网络连接是否正常`
        }
        
        return NextResponse.json(
          {
            success: false,
            message: diagnosticMessage,
            models: [],
          },
          { status: 500 }
        )
      }
      
      return NextResponse.json(
        { success: false, message: `网络请求失败: ${fetchError.message || "未知错误"}`, models: [] },
        { status: 500 }
      )
    }

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[Ollama] API error:", response.status, errorText)
      
      let errorMessage = `Ollama 服务请求失败 (${response.status})`
      try {
        const errorJson = JSON.parse(errorText)
        errorMessage = errorJson.error?.message || errorJson.message || errorMessage
      } catch {
        errorMessage = errorText || errorMessage
      }

      return NextResponse.json(
        {
          success: false,
          message: errorMessage,
          models: [],
        },
        { status: response.status }
      )
    }

    // 解析响应
    try {
      const data = await response.json()
      
      // Ollama API 返回格式: { models: [{ name: "llama3.2", size: 1234567, modified_at: "...", ... }] }
      const models = data.models || []
      const modelInfo = models.map((model: any) => {
        // 保留完整的模型名称（包括标签部分，如 :4b, :latest 等）
        const name = model.name || ""
        return {
          name: name.trim(),
          size: model.size || 0, // 模型大小（字节）
          modifiedAt: model.modified_at || model.modifiedAt || null, // 修改时间
          digest: model.digest || null, // 模型摘要
        }
      }).filter((m: any) => m.name) // 过滤空值

      // 去重并排序（保留完整名称）
      const uniqueModels = Array.from(
        new Map(modelInfo.map((m: any) => [m.name, m])).values()
      ).sort((a: any, b: any) => a.name.localeCompare(b.name))

      // 提取模型名称列表（向后兼容）
      const modelNames = uniqueModels.map((m: any) => m.name)

      console.log("[Ollama] Found models:", modelNames)

      return NextResponse.json({
        success: true,
        models: modelNames, // 保持向后兼容，返回名称列表
        modelInfo: uniqueModels, // 新增：返回详细信息
        message: `成功获取 ${uniqueModels.length} 个模型`,
      })
    } catch (error) {
      console.error("[Ollama] Failed to parse response:", error)
      return NextResponse.json(
        {
          success: false,
          message: "Ollama 服务返回了无效的响应格式",
          models: [],
        },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error("[Ollama] List models error:", error)
    return NextResponse.json(
      {
        success: false,
        message: error.message || "获取模型列表失败",
        models: [],
      },
      { status: 500 }
    )
  }
}

export const POST = requireAuth(handlePOST)
