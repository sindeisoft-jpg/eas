import { db } from "./db"
import type { AuditLog } from "./types"

export async function logAudit(params: {
  userId: string
  userName: string
  action: "query" | "create" | "update" | "delete" | "login" | "export" | "agent_execution"
  resourceType?: "database" | "report" | "model" | "permission" | "agent"
  resourceId?: string
  details: string
  sql?: string
  /**
   * 原始SQL（如被权限过滤/改写），用于审计留痕（会被追加到 details 中）
   */
  originalSQL?: string
  status: "success" | "failed" | "blocked"
  errorMessage?: string
  organizationId: string
  ipAddress?: string
  userAgent?: string
}) {
  try {
    const finalDetails =
      params.originalSQL && params.sql && params.originalSQL !== params.sql
        ? `${params.details}\n\n[Original SQL]\n${String(params.originalSQL).slice(0, 2000)}`
        : params.details

    await db.auditLog.create({
      data: {
        userId: params.userId,
        userName: params.userName,
        action: params.action,
        resourceType: params.resourceType || null,
        resourceId: params.resourceId || null,
        details: finalDetails,
        sql: params.sql || null,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
        status: params.status,
        errorMessage: params.errorMessage || null,
        organizationId: params.organizationId,
      },
    })
  } catch (error) {
    console.error("[Audit] Failed to log audit:", error)
    // Don't throw - audit logging should not break the main flow
  }
}
