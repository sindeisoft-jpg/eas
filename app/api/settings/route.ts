import { NextResponse } from "next/server"
import { requireAuth, AuthenticatedRequest } from "@/lib/middleware"
import { db } from "@/lib/db"

async function handleGET(req: AuthenticatedRequest) {
  try {
    const user = req.user!
    if (user.role !== "admin") {
      return NextResponse.json({ error: "无权限" }, { status: 403 })
    }

    let settings = await db.systemSettings.findUnique({
      where: { organizationId: user.organizationId },
    })

    // Create default settings if not exists
    if (!settings) {
      settings = await db.systemSettings.create({
        data: {
          organizationId: user.organizationId,
          queryCache: {
            enabled: true,
            ttl: 300,
            maxSize: 100,
          },
          performance: {
            maxConcurrentQueries: 5,
            defaultTimeout: 30,
            enableQueryOptimization: true,
          },
          security: {
            enableSQLValidation: true,
            requireApprovalForDangerousOps: true,
            enableAuditLog: true,
            sessionTimeout: 60,
          },
          alerts: {
            enabled: true,
            slowQueryThreshold: 10,
            errorRateThreshold: 5,
            notificationChannels: ["email"],
          },
          updatedBy: user.id,
        },
      })
    }

    return NextResponse.json({ settings })
  } catch (error: any) {
    console.error("[Settings] Get error:", error)
    return NextResponse.json({ error: "获取系统设置失败" }, { status: 500 })
  }
}

async function handlePUT(req: AuthenticatedRequest) {
  try {
    const user = req.user!
    if (user.role !== "admin") {
      return NextResponse.json({ error: "无权限" }, { status: 403 })
    }

    const { queryCache, performance, security, alerts } = await req.json()

    const existingSettings = await db.systemSettings.findUnique({
      where: { organizationId: user.organizationId },
    })

    const updateData: any = {
      updatedBy: user.id,
    }
    if (queryCache) updateData.queryCache = queryCache
    if (performance) updateData.performance = performance
    if (security) updateData.security = security
    if (alerts) updateData.alerts = alerts

    let settings
    if (existingSettings) {
      settings = await db.systemSettings.update({
        where: { organizationId: user.organizationId },
        data: updateData,
      })
    } else {
      settings = await db.systemSettings.create({
        data: {
          organizationId: user.organizationId,
          queryCache: queryCache || {
            enabled: true,
            ttl: 300,
            maxSize: 100,
          },
          performance: performance || {
            maxConcurrentQueries: 5,
            defaultTimeout: 30,
            enableQueryOptimization: true,
          },
          security: security || {
            enableSQLValidation: true,
            requireApprovalForDangerousOps: true,
            enableAuditLog: true,
            sessionTimeout: 60,
          },
          alerts: alerts || {
            enabled: true,
            slowQueryThreshold: 10,
            errorRateThreshold: 5,
            notificationChannels: ["email"],
          },
          updatedBy: user.id,
        },
      })
    }

    return NextResponse.json({ settings })
  } catch (error: any) {
    console.error("[Settings] Update error:", error)
    return NextResponse.json({ error: "更新系统设置失败" }, { status: 500 })
  }
}

export const GET = requireAuth(handleGET)
export const PUT = requireAuth(handlePUT)

