import { NextResponse } from "next/server"
import { requireAuth, AuthenticatedRequest } from "@/lib/middleware"
import { PromptConfigService } from "@/lib/prompt-config-service"

async function handleGET(
  req: AuthenticatedRequest,
  { params }: { params: Promise<{ category: string; name: string }> }
) {
  try {
    // 这个接口不需要管理员权限，因为代码中需要读取配置
    const { category, name } = await params
    const content = await PromptConfigService.getConfig(category, name)

    if (!content) {
      return NextResponse.json({ error: "配置不存在" }, { status: 404 })
    }

    return NextResponse.json({ content })
  } catch (error: any) {
    console.error("[PromptConfigs] GET by category/name error:", error)
    return NextResponse.json({ error: "获取提示词配置失败" }, { status: 500 })
  }
}

export const GET = requireAuth(handleGET)
