import crypto from "crypto"

export type MaskType = "hash" | "partial" | "full"

function getSalt(): string {
  return process.env.MASKING_SALT || process.env.NEXT_PUBLIC_MASKING_SALT || "default-masking-salt"
}

export function maskValue(value: any, maskType: MaskType): any {
  if (value === null || value === undefined) return value

  // 统一把非字符串/数字的值也转成字符串处理（避免泄露）
  const str = typeof value === "string" ? value : typeof value === "number" ? String(value) : JSON.stringify(value)

  if (maskType === "full") {
    return "***"
  }

  if (maskType === "hash") {
    const h = crypto.createHash("sha256")
    h.update(getSalt())
    h.update("|")
    h.update(str)
    return h.digest("hex").slice(0, 12) // 短hash，稳定但不可逆
  }

  // partial（尽量通用，但偏安全）
  const emailMatch = str.match(/^([^@]{1,})@(.+)$/)
  if (emailMatch) {
    const local = emailMatch[1]
    const domain = emailMatch[2]
    const head = local.slice(0, 1)
    return `${head}***@${domain}`
  }

  // 手机/电话：保留前3后2
  const digits = str.replace(/\D/g, "")
  if (digits.length >= 7 && digits.length <= 20) {
    return `${digits.slice(0, 3)}****${digits.slice(-2)}`
  }

  if (str.length <= 2) {
    return "*".repeat(str.length)
  }

  return `${str.slice(0, 1)}***${str.slice(-1)}`
}

/**
 * 从权限配置中提取“需要脱敏”的列策略（按列名聚合，保守：任意表要求脱敏则脱敏）
 * 返回 originalColumnLower -> maskType（更强优先：full > hash > partial）
 */
export function buildMaskedColumnMap(permission: any): Map<string, MaskType> {
  const result = new Map<string, MaskType>()
  const tablePermissions: any[] = permission?.tablePermissions || []

  const strength: Record<MaskType, number> = { partial: 1, hash: 2, full: 3 }

  for (const tp of tablePermissions) {
    const cps: any[] = tp?.columnPermissions || []
    for (const cp of cps) {
      if (!cp?.columnName) continue
      if (cp.accessible === false) continue
      if (cp.masked !== true) continue
      const key = String(cp.columnName).toLowerCase()
      const mt: MaskType = (cp.maskType as MaskType) || "partial"
      const existing = result.get(key)
      if (!existing || strength[mt] > strength[existing]) {
        result.set(key, mt)
      }
    }
  }

  return result
}

/**
 * 对查询结果应用脱敏（基于 SQLExecutor 返回的 columnNameMap/originalColumns）
 */
export function applyMaskingToQueryResult(queryResult: any, permission: any): any {
  if (!queryResult || !queryResult.rows || !Array.isArray(queryResult.rows)) return queryResult
  if (!permission) return queryResult

  const maskedMap = buildMaskedColumnMap(permission)
  if (maskedMap.size === 0) return queryResult

  const columnNameMap: Record<string, string> = queryResult.columnNameMap || {}

  const rows = queryResult.rows.map((row: any) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return row
    const newRow: any = { ...row }
    for (const [origLower, maskType] of maskedMap.entries()) {
      // 尝试找到原始列名（大小写不敏感）在映射中的key
      const origKey = Object.keys(columnNameMap).find((k) => k.toLowerCase() === origLower)
      const displayName = origKey ? columnNameMap[origKey] : undefined
      // 优先按 displayName 命中（SQLExecutor已翻译）
      if (displayName && Object.prototype.hasOwnProperty.call(newRow, displayName)) {
        newRow[displayName] = maskValue(newRow[displayName], maskType)
        continue
      }
      // 兜底：如果结果未翻译/或列名本身是中文
      const fallbackKey = Object.keys(newRow).find((k) => k.toLowerCase() === origLower)
      if (fallbackKey) {
        newRow[fallbackKey] = maskValue(newRow[fallbackKey], maskType)
      }
    }
    return newRow
  })

  return {
    ...queryResult,
    rows,
  }
}

