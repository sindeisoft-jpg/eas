import { NextResponse } from "next/server"
import { requireAuth, AuthenticatedRequest } from "@/lib/middleware"
import { PromptConfigService } from "@/lib/prompt-config-service"

async function handleGET(
  req: AuthenticatedRequest,
  { params }: { params: Promise<{ category: string }> }
) {
  try {
    const user = req.user!
    if (user.role !== "admin") {
      return NextResponse.json({ error: "无权限" }, { status: 403 })
    }

    const { category } = await params
    const configs = await PromptConfigService.getConfigsByCategory(category)

    return NextResponse.json({ configs })
  } catch (error: any) {
    console.error("[PromptConfigs] GET by category error:", error)
    return NextResponse.json({ error: "获取提示词配置失败" }, { status: 500 })
  }
}

export const GET = requireAuth(handleGET)
