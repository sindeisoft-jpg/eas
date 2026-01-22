import { NextResponse } from "next/server"
import { requireAuth, AuthenticatedRequest } from "@/lib/middleware"
import { db } from "@/lib/db"
import { PromptConfigService } from "@/lib/prompt-config-service"

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
    console.log("[PromptConfigs] PUT request:", { id, userId: user.id })

    const { description, content, variables, isActive } = await req.json()
    
    console.log("[PromptConfigs] Update data:", {
      id,
      hasDescription: description !== undefined,
      hasContent: content !== undefined,
      hasVariables: variables !== undefined,
      hasIsActive: isActive !== undefined,
    })

    // 获取现有配置
    const existing = await db.promptConfig.findUnique({
      where: { id },
    })

    if (!existing) {
      console.error("[PromptConfigs] Config not found:", id)
      return NextResponse.json({ error: "配置不存在" }, { status: 404 })
    }

    // 更新配置
    const config = await db.promptConfig.update({
      where: { id },
      data: {
        description: description !== undefined ? description : existing.description,
        content: content !== undefined ? content : existing.content,
        variables: variables !== undefined ? variables : existing.variables,
        isActive: isActive !== undefined ? isActive : existing.isActive,
        version: existing.version + 1,
        updatedBy: user.id,
      },
    })

    console.log("[PromptConfigs] Config updated successfully:", {
      id: config.id,
      category: config.category,
      name: config.name,
      version: config.version,
    })

    // 清除缓存
    PromptConfigService.clearCache(config.category, config.name)

    return NextResponse.json({ config })
  } catch (error: any) {
    console.error("[PromptConfigs] PUT error:", error)
    console.error("[PromptConfigs] Error details:", {
      message: error.message,
      stack: error.stack,
      code: error.code,
    })
    return NextResponse.json(
      {
        error: "更新提示词配置失败",
        details: error.message,
      },
      { status: 500 }
    )
  }
}

export const PUT = requireAuth(handlePUT)
// DELETE 方法已移除：提示词配置不允许删除，只能编辑
