import { NextResponse } from "next/server"
import { requireAuth, AuthenticatedRequest } from "@/lib/middleware"
import mysql from "mysql2/promise"
import pg from "pg"

/**
 * 获取数据库服务器上的所有数据库列表
 * 用于测试连接后选择数据库
 */
async function handlePOST(req: AuthenticatedRequest) {
  try {
    const user = req.user!
    const { type, host, port, username, password, ssl } = await req.json()

    if (!type || !host || !username || !password) {
      return NextResponse.json({ error: "缺少必要的连接参数" }, { status: 400 })
    }

    let databases: string[] = []

    try {
      if (type === "mysql") {
        const connection = await mysql.createConnection({
          host,
          port: port || 3306,
          user: username,
          password,
          ssl: ssl ? {} : undefined,
        })

        const [rows] = await connection.execute("SHOW DATABASES")
        await connection.end()

        databases = (rows as any[]).map((row: any) => row.Database).filter((db: string) => {
          // 过滤掉系统数据库
          return !["information_schema", "performance_schema", "mysql", "sys"].includes(db)
        })
      } else if (type === "postgresql") {
        const client = new pg.Client({
          host,
          port: port || 5432,
          user: username,
          password,
          database: "postgres", // 连接到默认数据库以获取列表
          ssl: ssl ? { rejectUnauthorized: false } : false,
        })

        await client.connect()
        const result = await client.query(
          "SELECT datname FROM pg_database WHERE datistemplate = false AND datname != 'postgres'"
        )
        await client.end()

        databases = result.rows.map((row: any) => row.datname)
      } else {
        return NextResponse.json({ error: `获取 ${type} 数据库列表尚未实现` }, { status: 501 })
      }

      return NextResponse.json({
        success: true,
        message: `成功连接到数据库服务器，找到 ${databases.length} 个数据库`,
        databases,
      })
    } catch (error: any) {
      console.error("[Databases] List databases error:", error)
      return NextResponse.json(
        {
          success: false,
          error: "连接失败",
          message: error.message || "无法连接到数据库服务器",
          databases: [],
        },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error("[Databases] List databases error:", error)
    return NextResponse.json({ error: "获取数据库列表失败" }, { status: 500 })
  }
}

export const POST = requireAuth(handlePOST)

