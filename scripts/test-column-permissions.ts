import assert from "assert"
import { enforceColumnAccess, SQLPermissionError } from "../lib/sql-permission"
import type { TablePermission } from "../lib/types"

function buildPolicy(tablePermissions: TablePermission[]) {
  const tablePermissionMap = new Map<string, TablePermission>()
  const columnPermissionMap = new Map<
    string,
    Map<string, { accessible: boolean; masked: boolean; maskType?: "hash" | "partial" | "full" }>
  >()

  for (const tp of tablePermissions) {
    const t = tp.tableName.toLowerCase()
    tablePermissionMap.set(t, tp)
    const cm = new Map<string, { accessible: boolean; masked: boolean; maskType?: "hash" | "partial" | "full" }>()
    for (const cp of tp.columnPermissions || []) {
      cm.set(cp.columnName.toLowerCase(), {
        accessible: cp.accessible !== false,
        masked: cp.masked === true,
        maskType: cp.maskType,
      })
    }
    columnPermissionMap.set(t, cm)
  }

  return { tablePermissionMap, columnPermissionMap }
}

function expectBlocked(fn: () => void, msg: RegExp) {
  try {
    fn()
    assert.fail("expected to throw")
  } catch (e: any) {
    assert.ok(e instanceof SQLPermissionError || e?.name === "SQLPermissionError")
    assert.match(String(e.message), msg)
  }
}

function main() {
  const userTP: TablePermission = {
    tableName: "users",
    allowedOperations: ["SELECT"],
    columnPermissions: [
      { columnName: "id", accessible: true, masked: false },
      { columnName: "email", accessible: true, masked: true, maskType: "partial" },
      { columnName: "ssn", accessible: false, masked: false },
    ],
    dataScope: "all",
    enabled: true,
  }

  const orderTP: TablePermission = {
    tableName: "orders",
    allowedOperations: ["SELECT"],
    columnPermissions: [
      { columnName: "id", accessible: true, masked: false },
      { columnName: "user_id", accessible: true, masked: false },
    ],
    dataScope: "all",
    enabled: true,
  }

  const policy = buildPolicy([userTP, orderTP])
  const schema: any[] = [
    { tableName: "users", columns: [{ name: "id" }, { name: "email" }, { name: "ssn" }] },
    { tableName: "orders", columns: [{ name: "id" }, { name: "user_id" }] },
  ]

  // 1) SELECT * 遇到不可访问列必须阻断
  expectBlocked(
    () => enforceColumnAccess({ sql: "SELECT * FROM users", schema, policy }),
    /SELECT \*|不可访问/i
  )

  // 2) 直接选择不可访问列阻断
  expectBlocked(
    () => enforceColumnAccess({ sql: "SELECT ssn FROM users", schema, policy }),
    /ssn/i
  )

  // 3) WHERE 引用不可访问列也阻断
  expectBlocked(
    () => enforceColumnAccess({ sql: "SELECT id FROM users WHERE ssn = 'x'", schema, policy }),
    /ssn/i
  )

  // 4) JOIN ON 引用字段应被解析（这里允许）
  enforceColumnAccess({
    sql: "SELECT u.id FROM users u JOIN orders o ON u.id = o.user_id",
    schema,
    policy,
  })

  // 5) JOIN 场景下引用不可访问列阻断（带别名）
  expectBlocked(
    () =>
      enforceColumnAccess({
        sql: "SELECT u.id FROM users u JOIN orders o ON u.id = o.user_id WHERE u.ssn = 'x'",
        schema,
        policy,
      }),
    /ssn/i
  )

  // 6) 正常查询应通过
  enforceColumnAccess({ sql: "SELECT id, email FROM users WHERE id = 1", schema, policy })

  console.log("[OK] column permission tests passed")
}

main()

