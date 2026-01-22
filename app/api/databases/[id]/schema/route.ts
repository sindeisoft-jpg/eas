import { NextResponse } from "next/server"
import { requireAuth, AuthenticatedRequest } from "@/lib/middleware"
import { db } from "@/lib/db"
import { SQLExecutor } from "@/lib/sql-executor"
import type { DatabaseSchema, ColumnInfo } from "@/lib/types"

async function handleGET(req: AuthenticatedRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = req.user!
    const { id: connectionId } = await params

    const connection = await db.databaseConnection.findUnique({
      where: { id: connectionId },
    })

    if (!connection) {
      return NextResponse.json({ error: "数据库连接不存在" }, { status: 404 })
    }

    if (connection.organizationId !== user.organizationId) {
      return NextResponse.json({ error: "无权限" }, { status: 403 })
    }

    try {
      const schemas: DatabaseSchema[] = []

      if (connection.type === "mysql") {
        // Get all tables
        const tablesResult = await SQLExecutor.executeQuery(
          connection as any,
          `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = '${connection.database}'`
        )

        for (const row of tablesResult.rows) {
          const tableName = row.TABLE_NAME as string

          // Get columns for each table
          const columnsResult = await SQLExecutor.executeQuery(
            connection as any,
            `SELECT 
              COLUMN_NAME,
              DATA_TYPE,
              IS_NULLABLE,
              COLUMN_KEY,
              COLUMN_COMMENT
            FROM information_schema.COLUMNS 
            WHERE TABLE_SCHEMA = '${connection.database}' AND TABLE_NAME = '${tableName}'
            ORDER BY ORDINAL_POSITION`
          )

          const columns: ColumnInfo[] = columnsResult.rows.map((col: any) => ({
            name: col.COLUMN_NAME,
            type: col.DATA_TYPE,
            nullable: col.IS_NULLABLE === "YES",
            isPrimaryKey: col.COLUMN_KEY === "PRI",
            isForeignKey: col.COLUMN_KEY === "MUL",
            description: col.COLUMN_COMMENT || undefined,
          }))

          // Get row count
          let rowCount: number | undefined
          try {
            const countResult = await SQLExecutor.executeQuery(
              connection as any,
              `SELECT COUNT(*) as count FROM \`${tableName}\``
            )
            rowCount = parseInt(countResult.rows[0]?.count || "0")
          } catch (error) {
            // Ignore count errors
          }

          schemas.push({
            tableName,
            columns,
            rowCount,
          })
        }
      } else if (connection.type === "postgresql") {
        // Get all tables
        const tablesResult = await SQLExecutor.executeQuery(
          connection as any,
          `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
        )

        for (const row of tablesResult.rows) {
          const tableName = row.table_name as string

          // Get columns for each table
          const columnsResult = await SQLExecutor.executeQuery(
            connection as any,
            `SELECT 
              column_name,
              data_type,
              is_nullable,
              column_default
            FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = '${tableName}'
            ORDER BY ordinal_position`
          )

          // Get primary keys
          const pkResult = await SQLExecutor.executeQuery(
            connection as any,
            `SELECT column_name 
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_schema = 'public' AND tc.table_name = '${tableName}' AND tc.constraint_type = 'PRIMARY KEY'`
          )
          const primaryKeys = new Set(pkResult.rows.map((r: any) => r.column_name))

          // Get foreign keys
          const fkResult = await SQLExecutor.executeQuery(
            connection as any,
            `SELECT column_name 
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_schema = 'public' AND tc.table_name = '${tableName}' AND tc.constraint_type = 'FOREIGN KEY'`
          )
          const foreignKeys = new Set(fkResult.rows.map((r: any) => r.column_name))

          const columns: ColumnInfo[] = columnsResult.rows.map((col: any) => ({
            name: col.column_name,
            type: col.data_type,
            nullable: col.is_nullable === "YES",
            isPrimaryKey: primaryKeys.has(col.column_name),
            isForeignKey: foreignKeys.has(col.column_name),
          }))

          // Get row count
          let rowCount: number | undefined
          try {
            const countResult = await SQLExecutor.executeQuery(
              connection as any,
              `SELECT COUNT(*) as count FROM "${tableName}"`
            )
            rowCount = parseInt(countResult.rows[0]?.count || "0")
          } catch (error) {
            // Ignore count errors
          }

          schemas.push({
            tableName,
            columns,
            rowCount,
          })
        }
      } else {
        return NextResponse.json(
          { error: `获取 ${connection.type} 数据库架构尚未实现` },
          { status: 501 }
        )
      }

      // Update connection metadata
      await db.databaseConnection.update({
        where: { id: connectionId },
        data: {
          metadata: JSON.parse(JSON.stringify({
            tables: schemas.map((s) => s.tableName),
            schemas,
          })),
        },
      })

      return NextResponse.json({ schemas })
    } catch (error: any) {
      console.error("[Databases] Get schema error:", error)
      return NextResponse.json({ error: `获取数据库架构失败: ${error.message}` }, { status: 500 })
    }
  } catch (error: any) {
    console.error("[Databases] Get schema error:", error)
    return NextResponse.json({ error: "获取数据库架构失败" }, { status: 500 })
  }
}

export const GET = requireAuth(handleGET)


