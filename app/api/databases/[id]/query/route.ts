import { NextResponse } from "next/server"
import { requireAuth, AuthenticatedRequest } from "@/lib/middleware"
import { db } from "@/lib/db"
import { SQLExecutor } from "@/lib/sql-executor"
import { logAudit } from "@/lib/audit-helper"
import { PermissionApplier } from "@/lib/permission-applier"
import { enforceColumnAccess, SQLPermissionError } from "@/lib/sql-permission"
import { applyMaskingToQueryResult } from "@/lib/data-masking"

async function handlePOST(req: AuthenticatedRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = req.user!
    const { id: connectionId } = await params
    const { sql, skipPermissionCheck } = await req.json()

    if (!sql) {
      return NextResponse.json({ error: "SQL 查询不能为空" }, { status: 400 })
    }

    const connection = await db.databaseConnection.findUnique({
      where: { id: connectionId },
    })

    if (!connection) {
      return NextResponse.json({ error: "数据库连接不存在" }, { status: 404 })
    }

    if (connection.organizationId !== user.organizationId) {
      return NextResponse.json({ error: "无权限" }, { status: 403 })
    }

    let finalSQL = sql
    let appliedFilters: string[] = []
    const allowSkipPermissionCheck = user.role === "admin" && skipPermissionCheck === true

    // 应用权限规则（除非明确跳过，例如管理员或系统内部调用）
    if (!allowSkipPermissionCheck && user.role !== "admin") {
      try {
        const permissionContext = {
          user,
          databaseConnectionId: connectionId,
          organizationId: user.organizationId,
        }

        const applied = await PermissionApplier.applyPermissions(sql, permissionContext)
        finalSQL = applied.modifiedSQL
        appliedFilters = applied.appliedFilters

        if (applied.restrictedTables.length > 0) {
          await logAudit({
            userId: user.id,
            userName: user.email,
            action: "query",
            resourceType: "database",
            resourceId: connectionId,
            details: `权限检查失败：无权限访问表 ${applied.restrictedTables.join(", ")}`,
            sql,
            status: "blocked",
            errorMessage: `无权限访问表: ${applied.restrictedTables.join(", ")}`,
            organizationId: user.organizationId,
          })

          return NextResponse.json(
            {
              error: `无权限访问以下表: ${applied.restrictedTables.join(", ")}。请联系管理员配置相应权限。`,
            },
            { status: 403 }
          )
        }

        // 如果应用了过滤条件，记录日志
        if (appliedFilters.length > 0) {
          console.log("[Permissions] Applied filters:", appliedFilters)
        }
      } catch (error: any) {
        // 权限检查失败，记录并返回错误
        await logAudit({
          userId: user.id,
          userName: user.email,
          action: "query",
          resourceType: "database",
          resourceId: connectionId,
          details: `权限检查失败: ${error.message}`,
          sql,
          status: "blocked",
          errorMessage: error.message,
          organizationId: user.organizationId,
        })

        return NextResponse.json({ error: error.message || "权限检查失败" }, { status: 403 })
      }
    }

    try {
      // 🔒 列级权限校验（非管理员强制）
      if (!allowSkipPermissionCheck && user.role !== "admin") {
        const permissionContext = {
          user,
          databaseConnectionId: connectionId,
          organizationId: user.organizationId,
        }
        const compiled = await PermissionApplier.compilePermissions(permissionContext)
        const schema = (connection.metadata as any)?.schemas || []
        enforceColumnAccess({
          sql: finalSQL,
          schema,
          policy: {
            tablePermissionMap: compiled.tablePermissionMap,
            columnPermissionMap: compiled.columnPermissionMap,
          },
        })
      }

      const result = await SQLExecutor.executeQuery(connection as any, finalSQL)
      const maskedResult = applyMaskingToQueryResult(
        result,
        (await PermissionApplier.compilePermissions({
          user,
          databaseConnectionId: connectionId,
          organizationId: user.organizationId,
        })).permission
      )

      // Log audit
      await logAudit({
        userId: user.id,
        userName: user.email,
        action: "query",
        resourceType: "database",
        resourceId: connectionId,
        details: `执行 SQL 查询${appliedFilters.length > 0 ? ` (已应用权限过滤: ${appliedFilters.join("; ")})` : ""}`,
        sql: finalSQL,
        originalSQL: sql !== finalSQL ? sql : undefined,
        status: "success",
        organizationId: user.organizationId,
      })

      return NextResponse.json({
        result: maskedResult,
        ...(appliedFilters.length > 0 && { appliedFilters }),
      })
    } catch (error: any) {
      // 列级权限阻断 → 403 + blocked
      if (error instanceof SQLPermissionError || error?.name === "SQLPermissionError") {
        await logAudit({
          userId: user.id,
          userName: user.email,
          action: "query",
          resourceType: "database",
          resourceId: connectionId,
          details: `列级权限阻断: ${error.message}`,
          sql: finalSQL,
          originalSQL: sql !== finalSQL ? sql : undefined,
          status: "blocked",
          errorMessage: error.message,
          organizationId: user.organizationId,
        })
        return NextResponse.json({ error: error.message || "列级权限阻断" }, { status: 403 })
      }

      // Log failed audit
      await logAudit({
        userId: user.id,
        userName: user.email,
        action: "query",
        resourceType: "database",
        resourceId: connectionId,
        details: `SQL 查询失败: ${error.message}`,
        sql: finalSQL,
        originalSQL: sql !== finalSQL ? sql : undefined,
        status: "failed",
        errorMessage: error.message,
        organizationId: user.organizationId,
      })

      return NextResponse.json({ error: error.message || "执行 SQL 查询失败" }, { status: 500 })
    }
  } catch (error: any) {
    console.error("[Databases] Query error:", error)
    return NextResponse.json({ error: "查询失败" }, { status: 500 })
  }
}

export const POST = requireAuth(handlePOST)

