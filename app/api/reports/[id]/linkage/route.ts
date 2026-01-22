import { NextResponse } from "next/server"
import { requireAuth, AuthenticatedRequest } from "@/lib/middleware"
import { db } from "@/lib/db"
import { ReportLinkageManager } from "@/lib/report-linkage-manager"
import type { ReportLinkage } from "@/lib/report-linkage-manager"

/**
 * 获取报表的联动配置
 */
async function handleGET(
  req: AuthenticatedRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = req.user!
    const { id } = await params

    const report = await db.savedReport.findUnique({
      where: { id },
    })

    if (!report || report.organizationId !== user.organizationId) {
      return NextResponse.json({ error: "报表不存在或无权限" }, { status: 404 })
    }

    // 获取联动配置
    const linkageConfig = (report.linkageConfig as ReportLinkage[]) || []
    const linkages = ReportLinkageManager.getLinkages(id)

    // 合并数据库中的配置和内存中的配置
    const allLinkages = [...linkageConfig, ...linkages]

    return NextResponse.json({
      reportId: id,
      linkages: allLinkages,
      filters: ReportLinkageManager.getFilters(id) || {},
    })
  } catch (error: any) {
    console.error("[Reports] Get linkage error:", error)
    return NextResponse.json({ error: "获取联动配置失败" }, { status: 500 })
  }
}

/**
 * 更新报表的联动配置
 */
async function handlePOST(
  req: AuthenticatedRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = req.user!
    const { id } = await params
    const { linkages, filters } = await req.json()

    const report = await db.savedReport.findUnique({
      where: { id },
    })

    if (!report || report.organizationId !== user.organizationId) {
      return NextResponse.json({ error: "报表不存在或无权限" }, { status: 404 })
    }

    // 更新联动配置
    if (linkages && Array.isArray(linkages)) {
      // 注册到内存管理器
      linkages.forEach((linkage: ReportLinkage) => {
        if (linkage.sourceReportId === id) {
          ReportLinkageManager.registerLinkage(linkage)
        }
      })

      // 保存到数据库
      await db.savedReport.update({
        where: { id },
        data: {
          linkageConfig: linkages,
        },
      })
    }

    // 更新筛选条件
    if (filters && typeof filters === "object") {
      ReportLinkageManager.updateFilters(id, filters)

      // 保存到数据库
      await db.savedReport.update({
        where: { id },
        data: {
          filters: filters,
        },
      })
    }

    return NextResponse.json({
      success: true,
      message: "联动配置已更新",
    })
  } catch (error: any) {
    console.error("[Reports] Update linkage error:", error)
    return NextResponse.json({ error: "更新联动配置失败" }, { status: 500 })
  }
}

/**
 * 应用联动筛选（当源报表筛选条件变化时调用）
 */
async function handlePUT(
  req: AuthenticatedRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = req.user!
    const { id } = await params
    const { filters } = await req.json()

    const report = await db.savedReport.findUnique({
      where: { id },
    })

    if (!report || report.organizationId !== user.organizationId) {
      return NextResponse.json({ error: "报表不存在或无权限" }, { status: 404 })
    }

    if (!filters || typeof filters !== "object") {
      return NextResponse.json({ error: "筛选条件格式错误" }, { status: 400 })
    }

    // 更新筛选条件（会自动传播到关联报表）
    ReportLinkageManager.updateFilters(id, filters)

    // 保存到数据库
    await db.savedReport.update({
      where: { id },
      data: {
        filters: filters,
      },
    })

    // 获取受影响的关联报表
    const linkages = ReportLinkageManager.getLinkages(id)
    const affectedReports = linkages
      .filter(l => l.enabled)
      .map(l => ({
        reportId: l.targetReportId,
        filters: ReportLinkageManager.getFilters(l.targetReportId),
      }))

    return NextResponse.json({
      success: true,
      message: "筛选条件已应用",
      affectedReports,
    })
  } catch (error: any) {
    console.error("[Reports] Apply linkage error:", error)
    return NextResponse.json({ error: "应用联动筛选失败" }, { status: 500 })
  }
}

export const GET = requireAuth(handleGET)
export const POST = requireAuth(handlePOST)
export const PUT = requireAuth(handlePUT)
