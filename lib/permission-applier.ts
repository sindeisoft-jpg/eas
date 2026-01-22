/**
 * 权限应用服务
 * 在SQL查询时自动应用数据权限规则，确保用户只能访问被授权的数据
 */

import { DataPermission, TablePermission, User } from "./types"
import { db } from "./db"

export interface PermissionContext {
  user: User
  databaseConnectionId: string
  organizationId: string
}

export interface AppliedPermission {
  originalSQL: string
  modifiedSQL: string
  appliedFilters: string[]
  restrictedTables: string[]
  /**
   * 用于下游列级权限/脱敏（避免重复查库）
   * 注意：这是DB中的JSON字段，运行时可能不完全符合类型定义，需要调用方做空值兜底
   */
  permission?: DataPermission | null
}

export interface CompiledPermission {
  isAdmin: boolean
  permission: DataPermission | null
  /**
   * 非管理员：仅包含 enabled 的表（lowercase）
   * 管理员：不用于表限制（可能为空）
   */
  allowedTables: Set<string>
  /**
   * table(lowercase) -> TablePermission
   */
  tablePermissionMap: Map<string, TablePermission>
  /**
   * table(lowercase) -> column(lowercase) -> ColumnPermission
   */
  columnPermissionMap: Map<string, Map<string, { accessible: boolean; masked: boolean; maskType?: "hash" | "partial" | "full" }>>
}

export class PermissionApplier {
  /**
   * 获取用户对指定数据库的权限配置
   */
  static async getUserPermissions(
    context: PermissionContext
  ): Promise<DataPermission | null> {
    try {
      const permission = await db.dataPermission.findFirst({
        where: {
          organizationId: context.organizationId,
          databaseConnectionId: context.databaseConnectionId,
          role: context.user.role,
        },
        orderBy: {
          updatedAt: "desc",
        },
      })

      return permission as DataPermission | null
    } catch (error) {
      console.error("[PermissionApplier] Error fetching permissions:", error)
      return null
    }
  }

  /**
   * 编译权限配置为运行时易用结构（表/列策略）
   * 生产默认策略：
   * - 非管理员：Deny by Default（未配置则拒绝）
   * - 列级：仅对显式 accessible=false 做阻断；masked=true 做结果脱敏
   * - 管理员：不做表/列阻断（避免“管理员被锁死”），但如果配置了 masked，则仍可应用脱敏
   */
  static async compilePermissions(context: PermissionContext): Promise<CompiledPermission> {
    const isAdmin = context.user.role === "admin"

    const permission = await this.getUserPermissions(context)

    // 非管理员：未配置权限即拒绝（Deny by Default）
    if (!isAdmin && !permission) {
      throw new Error("未配置数据访问权限。请联系管理员配置相应权限。")
    }

    const allowedTables = new Set<string>()
    const tablePermissionMap = new Map<string, TablePermission>()
    const columnPermissionMap = new Map<
      string,
      Map<string, { accessible: boolean; masked: boolean; maskType?: "hash" | "partial" | "full" }>
    >()

    const tablePermissions: TablePermission[] = (permission?.tablePermissions || []) as any
    for (const tp of tablePermissions) {
      if (!tp || !tp.tableName) continue
      if (tp.enabled === false) continue

      const tableKey = String(tp.tableName).toLowerCase()
      allowedTables.add(tableKey)
      tablePermissionMap.set(tableKey, tp)

      const colMap = new Map<string, { accessible: boolean; masked: boolean; maskType?: "hash" | "partial" | "full" }>()
      const cps = (tp as any).columnPermissions as any[] | undefined
      if (Array.isArray(cps)) {
        for (const cp of cps) {
          if (!cp || !cp.columnName) continue
          const colKey = String(cp.columnName).toLowerCase()
          colMap.set(colKey, {
            accessible: cp.accessible !== false,
            masked: cp.masked === true,
            maskType: cp.maskType,
          })
        }
      }
      columnPermissionMap.set(tableKey, colMap)
    }

    return {
      isAdmin,
      permission: permission || null,
      allowedTables,
      tablePermissionMap,
      columnPermissionMap,
    }
  }

  /**
   * 过滤 schema：非管理员只保留允许表，并移除不可访问列（accessible=false）
   * 管理员默认不做过滤（避免影响排障/运维），但仍可在执行与返回阶段应用脱敏策略
   */
  static filterSchemaForUser(schema: any[], compiled: CompiledPermission): any[] {
    if (!schema || !Array.isArray(schema)) return []
    if (compiled.isAdmin) return schema

    const result: any[] = []
    for (const table of schema) {
      const tableName = (table?.tableName || table?.name || "") as string
      if (!tableName) continue
      const tableKey = tableName.toLowerCase()
      if (!compiled.allowedTables.has(tableKey)) continue

      const colPolicy = compiled.columnPermissionMap.get(tableKey)
      const cols = Array.isArray(table?.columns) ? table.columns : []

      // 如果没有列策略配置，默认允许所有列（避免老数据配置被“锁死”）
      const filteredColumns = !colPolicy || colPolicy.size === 0
        ? cols
        : cols.filter((col: any) => {
            const colName =
              col?.name ||
              col?.columnName ||
              col?.COLUMN_NAME ||
              col?.column_name
            if (!colName) return true
            const key = String(colName).toLowerCase()
            const cp = colPolicy.get(key)
            return cp ? cp.accessible !== false : true
          })

      result.push({
        ...table,
        tableName: table?.tableName || table?.name || tableName,
        columns: filteredColumns,
      })
    }

    return result
  }

  /**
   * 应用权限规则到SQL查询
   * 安全策略：默认拒绝（Deny by Default）
   * - 管理员：允许所有访问
   * - 非管理员：必须明确配置权限才能访问，未配置的表一律拒绝
   */
  static async applyPermissions(
    sql: string,
    context: PermissionContext
  ): Promise<AppliedPermission> {
    // 管理员有全部权限
    if (context.user.role === "admin") {
      return {
        originalSQL: sql,
        modifiedSQL: sql,
        appliedFilters: [],
        restrictedTables: [],
        permission: await this.getUserPermissions(context),
      }
    }

    // 解析SQL，提取涉及的表
    const tables = this.extractTables(sql)
    
    // 如果没有表，直接返回（可能是无效SQL）
    if (tables.length === 0) {
      return {
        originalSQL: sql,
        modifiedSQL: sql,
        appliedFilters: [],
        restrictedTables: [],
      }
    }

    const permission = await this.getUserPermissions(context)

    // 🔒 安全策略：默认拒绝
    // 如果没有权限配置，拒绝所有访问（防止未授权访问敏感数据）
    if (!permission) {
      throw new Error(
        `未配置数据访问权限。您无权访问以下表: ${tables.join(", ")}。请联系管理员配置相应权限。`
      )
    }

    const appliedFilters: string[] = []
    const restrictedTables: string[] = []

    // 对每个表应用权限规则
    let modifiedSQL = sql
    for (const table of tables) {
      const tablePermission = permission.tablePermissions.find(
        (tp) => tp.tableName.toLowerCase() === table.toLowerCase() && tp.enabled
      )

      if (!tablePermission) {
        // 🔒 如果表不在权限列表中，阻止访问（默认拒绝策略）
        restrictedTables.push(table)
        continue
      }

      // 检查操作权限
      const operation = this.extractOperation(sql)
      if (!tablePermission.allowedOperations.includes(operation)) {
        restrictedTables.push(table)
        continue
      }

      // 应用行级过滤（如果配置了数据范围限制）
      if (tablePermission.dataScope === "user_related") {
        const filter = this.buildRowLevelFilter(tablePermission, context.user, table)
        if (filter) {
          modifiedSQL = this.applyFilterToSQL(modifiedSQL, table, filter)
          appliedFilters.push(`${table}: ${filter}`)
        }
      }
    }

    // 如果有被限制的表，抛出错误
    if (restrictedTables.length > 0) {
      throw new Error(
        `无权限访问以下表: ${restrictedTables.join(", ")}。请联系管理员配置相应权限。`
      )
    }

    return {
      originalSQL: sql,
      modifiedSQL,
      appliedFilters,
      restrictedTables: [],
      permission,
    }
  }

  /**
   * 从SQL中提取表名
   */
  private static extractTables(sql: string): string[] {
    const tables: string[] = []
    const upperSQL = sql.toUpperCase()

    // 简单的表名提取（支持 FROM, JOIN 等）
    const fromMatch = sql.match(/\bFROM\s+([`"]?)(\w+)\1/gi)
    const joinMatch = sql.match(/\bJOIN\s+([`"]?)(\w+)\1/gi)

    if (fromMatch) {
      fromMatch.forEach((match) => {
        const table = match.replace(/\bFROM\s+/i, "").replace(/[`"]/g, "").trim()
        if (table && !tables.includes(table)) {
          tables.push(table)
        }
      })
    }

    if (joinMatch) {
      joinMatch.forEach((match) => {
        const table = match.replace(/\bJOIN\s+/i, "").replace(/[`"]/g, "").trim()
        if (table && !tables.includes(table)) {
          tables.push(table)
        }
      })
    }

    return tables
  }

  /**
   * 从SQL中提取操作类型
   */
  private static extractOperation(sql: string): "SELECT" | "INSERT" | "UPDATE" | "DELETE" {
    const upperSQL = sql.trim().toUpperCase()
    if (upperSQL.startsWith("SELECT")) return "SELECT"
    if (upperSQL.startsWith("INSERT")) return "INSERT"
    if (upperSQL.startsWith("UPDATE")) return "UPDATE"
    if (upperSQL.startsWith("DELETE")) return "DELETE"
    return "SELECT" // 默认为SELECT
  }

  /**
   * 构建行级过滤条件
   */
  private static buildRowLevelFilter(
    tablePermission: TablePermission,
    user: User,
    tableName: string
  ): string | null {
    // 如果提供了自定义的行级过滤条件
    if (tablePermission.rowLevelFilter) {
      return this.replaceUserPlaceholders(tablePermission.rowLevelFilter, user)
    }

    // 如果提供了用户关联字段映射，自动生成过滤条件
    if (tablePermission.userRelationFields) {
      const conditions: string[] = []

      if (tablePermission.userRelationFields.userId && user.id) {
        conditions.push(
          `${tableName}.${tablePermission.userRelationFields.userId} = '${user.id}'`
        )
      }

      if (tablePermission.userRelationFields.userEmail && user.email) {
        conditions.push(
          `${tableName}.${tablePermission.userRelationFields.userEmail} = '${user.email}'`
        )
      }

      if (tablePermission.userRelationFields.userName && user.name) {
        conditions.push(
          `${tableName}.${tablePermission.userRelationFields.userName} = '${user.name}'`
        )
      }

      return conditions.length > 0 ? conditions.join(" OR ") : null
    }

    return null
  }

  /**
   * 替换用户占位符
   */
  private static replaceUserPlaceholders(filter: string, user: User): string {
    return filter
      .replace(/\{\{user_id\}\}/g, user.id)
      .replace(/\{\{user_email\}\}/g, user.email)
      .replace(/\{\{user_name\}\}/g, user.name)
      .replace(/\{\{user_role\}\}/g, user.role)
  }

  /**
   * 将过滤条件应用到SQL查询
   */
  private static applyFilterToSQL(sql: string, tableName: string, filter: string): string {
    const upperSQL = sql.toUpperCase()
    const tableRegex = new RegExp(`\\b${tableName}\\b`, "gi")

    // 检查是否已经有WHERE子句
    const whereIndex = upperSQL.indexOf("WHERE")
    const groupByIndex = upperSQL.indexOf("GROUP BY")
    const orderByIndex = upperSQL.indexOf("ORDER BY")
    const limitIndex = upperSQL.indexOf("LIMIT")

    // 找到WHERE子句的结束位置
    let whereEndIndex = sql.length
    if (groupByIndex !== -1) whereEndIndex = Math.min(whereEndIndex, groupByIndex)
    if (orderByIndex !== -1) whereEndIndex = Math.min(whereEndIndex, orderByIndex)
    if (limitIndex !== -1) whereEndIndex = Math.min(whereEndIndex, limitIndex)

    if (whereIndex !== -1) {
      // 已有WHERE子句，追加AND条件
      const beforeWhere = sql.substring(0, whereEndIndex)
      const afterWhere = sql.substring(whereEndIndex)
      return `${beforeWhere} AND (${filter})${afterWhere}`
    } else {
      // 没有WHERE子句，添加WHERE子句
      const insertIndex = whereEndIndex
      const before = sql.substring(0, insertIndex)
      const after = sql.substring(insertIndex)
      return `${before} WHERE (${filter})${after}`
    }
  }

  /**
   * 检查用户是否有权限访问指定的表和操作
   */
  static async checkPermission(
    context: PermissionContext,
    tableName: string,
    operation: "SELECT" | "INSERT" | "UPDATE" | "DELETE"
  ): Promise<boolean> {
    // 管理员有全部权限
    if (context.user.role === "admin") {
      return true
    }

    const permission = await this.getUserPermissions(context)
    if (!permission) {
      return false
    }

    const tablePermission = permission.tablePermissions.find(
      (tp) => tp.tableName.toLowerCase() === tableName.toLowerCase() && tp.enabled
    )

    if (!tablePermission) {
      return false
    }

    return tablePermission.allowedOperations.includes(operation)
  }

  /**
   * 获取用户可访问的表列表
   */
  static async getAccessibleTables(context: PermissionContext): Promise<string[]> {
    // 管理员可以访问所有表
    if (context.user.role === "admin") {
      return [] // 空数组表示无限制
    }

    const permission = await this.getUserPermissions(context)
    if (!permission) {
      return []
    }

    return permission.tablePermissions
      .filter((tp) => tp.enabled)
      .map((tp) => tp.tableName)
  }
}
