import type { DatabaseSchema } from "./types"

export interface CrossTableDetectionResult {
  /**
   * 是否需要跨表/多表（JOIN）查询
   */
  needsJoin: boolean
  /**
   * 可能涉及的表（尽量收敛；不确定则可能为空）
   */
  candidateTables: string[]
  /**
   * 命中信号（用于调试/可观测）
   */
  signals: string[]
}

function normalizeText(input: string): string {
  return String(input || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

function tableNameVariants(tableName: string): string[] {
  const raw = String(tableName || "").trim()
  if (!raw) return []
  const lower = raw.toLowerCase()
  const noUnderscore = lower.replace(/_/g, "")
  const underscoreToSpace = lower.replace(/_/g, " ")

  const variants = new Set<string>([lower, noUnderscore, underscoreToSpace])

  // 简单单复数变体：customers <-> customer
  if (lower.endsWith("s") && lower.length > 2) {
    variants.add(lower.slice(0, -1))
  } else {
    variants.add(lower + "s")
  }

  return [...variants].filter(Boolean)
}

function detectMentionedTables(questionLower: string, tableNames: string[]): string[] {
  const mentioned: string[] = []
  for (const t of tableNames || []) {
    const variants = tableNameVariants(t)
    if (variants.some((v) => v && questionLower.includes(v))) {
      mentioned.push(t)
    }
  }
  return [...new Set(mentioned)]
}

type EntityKey =
  | "customer"
  | "order"
  | "product"
  | "account"
  | "contact"
  | "opportunity"

function detectEntityKeys(questionLower: string): Set<EntityKey> {
  const keys = new Set<EntityKey>()

  const map: Record<EntityKey, string[]> = {
    customer: ["客户", "customer"],
    order: ["订单", "order"],
    product: ["产品", "商品", "product"],
    account: ["账户", "公司", "account"],
    contact: ["联系人", "contact"],
    opportunity: ["商机", "机会", "opportunity"],
  }

  for (const [k, words] of Object.entries(map) as Array<[EntityKey, string[]]>) {
    if (words.some((w) => questionLower.includes(w))) {
      keys.add(k)
    }
  }

  return keys
}

/**
 * 识别对话意图中是否存在跨表/多表查询需求。
 * 说明：该模块采用可控启发式（不额外调用 LLM），目标是“高精度识别明显需要 JOIN 的问题”，
 * 对模糊场景保持保守（不强制 needsJoin）。
 */
export function detectCrossTableNeed(params: {
  question: string
  schema?: DatabaseSchema[]
  tableNames?: string[]
}): CrossTableDetectionResult {
  const questionLower = normalizeText(params.question)
  const tableNames =
    params.tableNames && params.tableNames.length > 0
      ? params.tableNames
      : (params.schema || []).map((t) => t.tableName).filter(Boolean)

  const signals: string[] = []

  // 1) 显式跨表关键词
  const explicitJoinKeywords = [
    "跨表",
    "多表",
    "关联",
    "连接",
    "对应",
    "关系",
    "join",
    "left join",
    "inner join",
    "right join",
    "full join",
  ]
  const hasExplicitJoin = explicitJoinKeywords.some((k) => questionLower.includes(k))
  if (hasExplicitJoin) signals.push("keyword_join")

  // 2) 提及多个表名
  const mentionedTables = detectMentionedTables(questionLower, tableNames)
  if (mentionedTables.length >= 2) signals.push("multi_tables_mentioned")

  // 3) 多实体组合（客户+订单、订单+产品等）
  const entityKeys = detectEntityKeys(questionLower)
  if (entityKeys.size >= 2) signals.push("multi_entities")

  // 4) 典型跨表表达：每个X的Y / X对应的Y / X下的Y
  const joinPatterns = [
    /每个.+的.+/,
    /各.+的.+/,
    /对应的/,
    /关联的/,
    /连接的/,
    /属于.+的.+/,
    /(.+)下的(.+)/,
  ]
  const hasJoinPattern = joinPatterns.some((re) => re.test(questionLower))
  if (hasJoinPattern) signals.push("pattern_each_of")

  // needsJoin：明确命中才置 true；避免误触导致强制 JOIN
  const needsJoin = hasExplicitJoin || mentionedTables.length >= 2 || entityKeys.size >= 2 || hasJoinPattern

  // candidateTables：优先使用提及的表名；否则为空（不强迫）
  const candidateTables = mentionedTables.slice(0, 5)

  return {
    needsJoin,
    candidateTables,
    signals,
  }
}

