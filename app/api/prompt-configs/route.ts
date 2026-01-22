import { NextResponse } from "next/server"
import { requireAuth, AuthenticatedRequest } from "@/lib/middleware"
import { db } from "@/lib/db"
import { PromptConfigService } from "@/lib/prompt-config-service"

async function handleGET(req: AuthenticatedRequest) {
  try {
    const user = req.user!
    if (user.role !== "admin") {
      return NextResponse.json({ error: "无权限" }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const category = searchParams.get("category")

    console.log("[PromptConfigs] GET request:", { category, userId: user.id, role: user.role })

    let configs
    try {
      if (category) {
        configs = await PromptConfigService.getConfigsByCategory(category)
        console.log(`[PromptConfigs] Loaded ${configs.length} configs for category: ${category}`)
      } else {
        configs = await PromptConfigService.getAllConfigs()
        console.log(`[PromptConfigs] Loaded ${configs.length} total configs`)
      }
    } catch (dbError: any) {
      console.error("[PromptConfigs] Database query error:", dbError)
      // 如果是数据库表不存在的错误，提供更友好的提示
      if (dbError.code === 'P2021' || dbError.message?.includes('does not exist') || dbError.message?.includes('Unknown table')) {
        return NextResponse.json(
          {
            error: "数据库表不存在",
            details: "PromptConfig表尚未创建，请先执行数据库迁移",
            hint: "运行: npx prisma migrate dev"
          },
          { status: 500 }
        )
      }
      // 重新抛出其他数据库错误，让外层catch处理
      throw dbError
    }

    return NextResponse.json({ configs })
  } catch (error: any) {
    console.error("[PromptConfigs] GET error:", error)
    console.error("[PromptConfigs] Error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
    })
    return NextResponse.json(
      { 
        error: "获取提示词配置失败",
        details: error.message,
      },
      { status: 500 }
    )
  }
}

export const GET = requireAuth(handleGET)
// POST 方法已移除：提示词配置只能通过初始化脚本创建，不允许用户新建
