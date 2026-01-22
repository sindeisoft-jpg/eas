import type { DatabaseSchema, TablePermission } from "./types"
import { SQLValidator } from "./sql-validator"

export class SQLPermissionError extends Error {
  public readonly blockedColumns: Array<{ table?: string; column: string }>
  public readonly reason: string

  constructor(message: string, reason: string, blockedColumns: Array<{ table?: string; column: string }>) {
    super(message)
    this.name = "SQLPermissionError"
    this.reason = reason
    this.blockedColumns = blockedColumns
  }
}

export interface ColumnPolicyInput {
  /**
   * table(lowercase) -> TablePermission（用于查 columnPermissions）
   */
  tablePermissionMap: Map<string, TablePermission>
  /**
   * table(lowercase) -> column(lowercase) -> { accessible, masked, maskType }
   */
  columnPermissionMap: Map<
    string,
    Map<string, { accessible: boolean; masked: boolean; maskType?: "hash" | "partial" | "full" }>
  >
}

function buildSchemaColumnIndex(schema: DatabaseSchema[] | any[]): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>()
  if (!schema || !Array.isArray(schema)) return index
  for (const t of schema) {
    const tableName = String((t as any).tableName || (t as any).name || "").trim()
    if (!tableName) continue
    const tableKey = tableName.toLowerCase()
    const set = new Set<string>()
    const cols = Array.isArray((t as any).columns) ? (t as any).columns : []
    for (const c of cols) {
      const cn = String(
        (c as any).name ||
          (c as any).columnName ||
          (c as any).COLUMN_NAME ||
          (c as any).column_name ||
          ""
      ).trim()
      if (!cn) continue
      set.add(cn.toLowerCase())
    }
    index.set(tableKey, set)
  }
  return index
}

function hasExplicitDeniedColumns(tp: TablePermission | undefined, colMap: Map<string, any> | undefined): boolean {
  if (colMap && colMap.size > 0) {
    for (const v of colMap.values()) {
      if (v && v.accessible === false) return true
    }
  }
  const cps = (tp as any)?.columnPermissions as any[] | undefined
  if (Array.isArray(cps)) {
    return cps.some((cp) => cp && cp.accessible === false)
  }
  return false
}

/**
 * 列级权限强制校验（生产安全优先）
 * - accessible=false：只要 SQL 在任意位置引用到（SELECT/WHERE/JOIN/GROUP/ORDER/HAVING），直接阻断
 * - SELECT * / t.*：如果该表存在任意 accessible=false 列，则阻断（要求显式选择列）
 *
 * 说明：
 * - 对于多表且未加表前缀的列名，需要 schema 来消歧；无 schema 时采用保守策略：
 *   - 若列名在多个表可能出现且存在任意表对该列禁止访问，则阻断并要求显式加前缀或别名
 */
export function enforceColumnAccess(params: {
  sql: string
  schema?: DatabaseSchema[] | any[]
  policy: ColumnPolicyInput
  /**
   * 参与该 SQL 的表名（lowercase），用于限制候选表
   * 如果不提供，将使用 SQLValidator.extractTableNamesForPermission 推导
   */
  referencedTables?: string[]
}): void {
  const { sql, schema, policy } = params
  const cleanedSql = sql

  const referencedTables =
    params.referencedTables?.map((t) => t.toLowerCase()) ||
    SQLValidator.extractTableNamesForPermission(cleanedSql).map((t) => t.toLowerCase())

  const schemaIndex = buildSchemaColumnIndex(schema || [])

  // 1) 处理 SELECT * / t.*
  const selectItems = SQLValidator.extractSelectItemsForPermission(cleanedSql)
  const starItems = selectItems
    .map((s) => s.trim())
    .filter((s) => s === "*" || /\.\*$/.test(s))

  if (starItems.length > 0) {
    const blocked: Array<{ table?: string; column: string }> = []

    for (const item of starItems) {
      if (item === "*") {
        // SELECT *：覆盖所有 FROM/JOIN 的表
        for (const tableKey of referencedTables) {
          const tp = policy.tablePermissionMap.get(tableKey)
          const colMap = policy.columnPermissionMap.get(tableKey)
          if (hasExplicitDeniedColumns(tp, colMap)) {
            blocked.push({ table: tableKey, column: "*" })
          }
        }
      } else {
        // t.*
        const tableOrAlias = item.split(".")[0].replace(/[`"'\[\]]/g, "").trim()
        if (!tableOrAlias) continue
        const resolved =
          SQLValidator.resolveTableAliasForPermission(cleanedSql, tableOrAlias) || tableOrAlias
        const tableKey = resolved.toLowerCase()
        const tp = policy.tablePermissionMap.get(tableKey)
        const colMap = policy.columnPermissionMap.get(tableKey)
        if (hasExplicitDeniedColumns(tp, colMap)) {
          blocked.push({ table: tableKey, column: "*" })
        }
      }
    }

    if (blocked.length > 0) {
      throw new SQLPermissionError(
        "查询包含 SELECT *（或 t.*）且涉及不可访问列。请显式选择允许访问的字段后重试。",
        "select_star_blocked",
        blocked
      )
    }
  }

  // 2) 提取字段引用（包含 JOIN ON）
  const { references, aliases, lastSelectAliases } = SQLValidator.extractColumnReferencesForPermission(cleanedSql)
  const aliasSet = new Set<string>([...aliases, ...lastSelectAliases].map((a) => a.toLowerCase()))

  const blockedCols: Array<{ table?: string; column: string }> = []

  const resolveTableForRef = (refTable: string | null, column: string): string[] => {
    const colLower = column.toLowerCase()
    // 2.1 带表前缀：可能是别名
    if (refTable) {
      const resolved = SQLValidator.resolveTableAliasForPermission(cleanedSql, refTable) || refTable
      return [resolved.toLowerCase()]
    }

    // 2.2 单表查询：直接归属该表
    if (referencedTables.length === 1) {
      return [referencedTables[0]]
    }

    // 2.3 多表且无前缀：用 schema 消歧（推荐）
    const candidates: string[] = []
    for (const t of referencedTables) {
      const cols = schemaIndex.get(t)
      if (cols && cols.has(colLower)) {
        candidates.push(t)
      }
    }

    // 无 schema 或无法定位：保守策略——把所有表都当候选（后续取最严格）
    if (candidates.length === 0) {
      return referencedTables.slice()
    }

    return candidates
  }

  for (const ref of references) {
    const col = ref.column?.trim()
    if (!col) continue

    // 跳过 SELECT 别名（ORDER BY/HAVING 等可引用别名）
    if (aliasSet.has(col.toLowerCase())) {
      continue
    }

    const candidateTables = resolveTableForRef(ref.table, col)
    const colKey = col.toLowerCase()

    // 如果任一候选表明确禁止该列访问，则阻断（安全优先）
    let shouldBlock = false
    for (const t of candidateTables) {
      const tableKey = t.toLowerCase()
      const colMap = policy.columnPermissionMap.get(tableKey)
      const cp = colMap?.get(colKey)
      if (cp && cp.accessible === false) {
        shouldBlock = true
        blockedCols.push({ table: tableKey, column: col })
      }
    }

    // 如果无法消歧（候选表>1）且存在任何表对该列有显式禁止，也会在上面命中
    // 这里不做额外处理
    if (shouldBlock) {
      continue
    }
  }

  if (blockedCols.length > 0) {
    const distinct = new Map<string, { table?: string; column: string }>()
    for (const b of blockedCols) {
      distinct.set(`${b.table || ""}.${b.column}`, b)
    }
    const list = [...distinct.values()]
    const human = list
      .map((b) => (b.table ? `${b.table}.${b.column}` : b.column))
      .join(", ")
    throw new SQLPermissionError(
      `查询引用了不可访问的字段：${human}。请移除这些字段，或联系管理员调整列权限。`,
      "column_access_blocked",
      list
    )
  }
}

