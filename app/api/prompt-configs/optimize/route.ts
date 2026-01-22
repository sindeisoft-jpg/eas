import { NextResponse } from "next/server"
import { requireAuth, AuthenticatedRequest } from "@/lib/middleware"
import { db } from "@/lib/db"
import { PromptConfigService } from "@/lib/prompt-config-service"

/**
 * 调用LLM优化提示词
 */
async function optimizePromptWithLLM(
  llmConnection: any,
  originalPrompt: string,
  category: string,
  name: string,
  description: string
): Promise<string> {
  const provider = llmConnection.provider || "openai"
  const model = llmConnection.model || "gpt-4o-mini"
  const baseUrl = llmConnection.baseUrl || (provider === "ollama" ? "http://localhost:11434/v1" : "https://api.openai.com/v1")
  const temperature = 0.3 // 使用较低温度以获得更一致的优化结果
  const maxTokens = 4000 // 优化后的提示词可能更长

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

  // 构建优化提示词
  const optimizationPrompt = `你是一个提示词优化专家。请优化以下提示词，目标是：

1. **减少Token使用量**：精简冗余内容，合并重复说明，使用更简洁的表达
2. **提升响应速度**：移除不必要的示例和详细说明，保留核心功能
3. **保持功能完整性**：确保所有核心规则、变量和功能要求都保留
4. **优化结构**：使用更清晰的分层结构，便于AI理解

**提示词信息：**
- 分类：${category}
- 名称：${name}
- 描述：${description || "无"}

**原始提示词：**
\`\`\`
${originalPrompt}
\`\`\`

**优化要求：**
1. 保留所有变量占位符（如 {{variableName}}）
2. 保留所有核心规则和约束
3. 精简重复的说明和示例
4. 使用更简洁但准确的表达
5. 保持输出格式要求不变

**请直接返回优化后的提示词内容，不要包含任何解释或说明文字，只返回优化后的提示词本身。**`

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: "system",
            content: "你是一个专业的提示词优化专家，擅长精简和优化AI提示词，在保持功能完整性的同时减少Token使用量。",
          },
          {
            role: "user",
            content: optimizationPrompt,
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
    const optimizedContent = 
      data.choices?.[0]?.message?.content || 
      data.content || 
      data.message?.content ||
      data.response ||
      ""

    if (!optimizedContent || optimizedContent.trim().length === 0) {
      throw new Error("LLM返回的优化内容为空")
    }

    // 清理可能的markdown代码块标记
    let cleanedContent = optimizedContent.trim()
    if (cleanedContent.startsWith("```")) {
      // 移除代码块标记
      cleanedContent = cleanedContent.replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "")
    }

    return cleanedContent.trim()
  } catch (error: any) {
    console.error(`[PromptOptimize] LLM调用失败:`, error)
    throw new Error(`优化提示词失败: ${error.message}`)
  }
}

async function handlePOST(req: AuthenticatedRequest) {
  try {
    const user = req.user!
    if (user.role !== "admin") {
      return NextResponse.json({ error: "无权限" }, { status: 403 })
    }

    console.log("[PromptOptimize] 开始优化提示词...")

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

    console.log("[PromptOptimize] 使用LLM连接:", llmConnection.name)

    // 获取所有激活的提示词配置
    const allConfigs = await PromptConfigService.getAllConfigs()
    console.log(`[PromptOptimize] 找到 ${allConfigs.length} 个提示词配置`)

    if (allConfigs.length === 0) {
      return NextResponse.json(
        { error: "没有找到需要优化的提示词配置。请先初始化提示词配置。" },
        { status: 400 }
      )
    }

    const results = {
      total: allConfigs.length,
      optimized: 0,
      failed: 0,
      skipped: 0,
      errors: [] as string[],
      details: [] as Array<{ id: string; name: string; status: string; originalLength: number; optimizedLength: number }>,
    }

    // 逐个优化提示词
    for (const config of allConfigs) {
      try {
        console.log(`[PromptOptimize] 优化提示词: ${config.category}/${config.name}`)
        
        const originalLength = config.content.length
        
        // 调用LLM优化提示词
        const optimizedContent = await optimizePromptWithLLM(
          llmConnection,
          config.content,
          config.category,
          config.name,
          config.description || ""
        )

        const optimizedLength = optimizedContent.length
        const reduction = originalLength - optimizedLength
        const reductionPercent = ((reduction / originalLength) * 100).toFixed(1)

        console.log(`[PromptOptimize] 优化完成: ${config.category}/${config.name}, 长度: ${originalLength} -> ${optimizedLength} (减少 ${reductionPercent}%)`)

        // 更新配置
        await db.promptConfig.update({
          where: { id: config.id },
          data: {
            content: optimizedContent,
            version: config.version + 1,
            updatedBy: user.id,
            updatedAt: new Date(),
          },
        })

        // 清除缓存
        PromptConfigService.clearCache(config.category, config.name)

        results.optimized++
        results.details.push({
          id: config.id,
          name: `${config.category}/${config.name}`,
          status: "优化成功",
          originalLength,
          optimizedLength,
        })
      } catch (error: any) {
        console.error(`[PromptOptimize] 优化失败 ${config.category}/${config.name}:`, error)
        results.failed++
        results.errors.push(`${config.category}/${config.name}: ${error.message}`)
        results.details.push({
          id: config.id,
          name: `${config.category}/${config.name}`,
          status: `失败: ${error.message}`,
          originalLength: config.content.length,
          optimizedLength: config.content.length,
        })
      }
    }

    console.log(`[PromptOptimize] 优化完成: 总计=${results.total}, 成功=${results.optimized}, 失败=${results.failed}`)

    return NextResponse.json({
      message: "提示词优化完成",
      ...results,
    })
  } catch (error: any) {
    console.error("[PromptOptimize] 优化过程出错:", error)
    return NextResponse.json(
      {
        error: "优化提示词失败",
        details: error.message,
      },
      { status: 500 }
    )
  }
}

export const POST = requireAuth(handlePOST)
