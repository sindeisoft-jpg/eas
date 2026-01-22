import mysql from "mysql2/promise"
import pg from "pg"
import { DatabaseConnection } from "./types"
import { SQLValidator } from "./sql-validator"
import { translateColumnName } from "./utils"

export interface QueryResult {
  columns: string[]
  /**
   * 原始字段名（未翻译，用于列级权限/脱敏对齐）
   */
  originalColumns?: string[]
  /**
   * 字段名映射：original -> display（翻译后）
   */
  columnNameMap?: Record<string, string>
  rows: Record<string, any>[]
  rowCount: number
  executionTime: number
  error?: string
}

export class SQLExecutor {
  private static connections: Map<string, any> = new Map()

  static async executeQuery(connection: DatabaseConnection, sql: string, allowAllOperations: boolean = false): Promise<QueryResult> {
    const startTime = Date.now()

    // 验证 SQL 安全性
    const validation = SQLValidator.validate(sql, allowAllOperations)
    if (!validation.valid) {
      throw new Error(validation.error || "SQL 验证失败")
    }

    try {
      switch (connection.type) {
        case "mysql":
          return await this.executeMySQL(connection, sql, startTime)
        case "postgresql":
          return await this.executePostgreSQL(connection, sql, startTime)
        case "sqlite":
          return await this.executeSQLite(connection, sql, startTime)
        case "sqlserver":
          return await this.executeSQLServer(connection, sql, startTime)
        default:
          throw new Error(`不支持的数据库类型: ${connection.type}`)
      }
    } catch (error: any) {
      throw new Error(`SQL 执行错误: ${error.message}`)
    }
  }

  private static async executeMySQL(connection: DatabaseConnection, sql: string, startTime: number): Promise<QueryResult> {
    const conn = await mysql.createConnection({
      host: connection.host,
      port: connection.port,
      user: connection.username,
      password: connection.password,
      database: connection.database,
      ssl: connection.ssl ? {} : undefined,
    })

    try {
      const [rows] = await conn.execute(sql)
      const executionTime = Date.now() - startTime

      // MySQL returns array of arrays for rows
      const rowArray = rows as any[]
      if (rowArray.length === 0) {
        await conn.end()
        return {
          columns: [],
          rows: [],
          rowCount: 0,
          executionTime,
        }
      }

      // Get column names from first row keys
      const originalColumns = Object.keys(rowArray[0])
      // 将所有字段名转换为中文
      const translatedColumns = originalColumns.map(col => translateColumnName(col))
      
      // 创建字段名映射（原始字段名 -> 中文字段名）
      const columnMap = new Map<string, string>()
      originalColumns.forEach((orig, idx) => {
        columnMap.set(orig, translatedColumns[idx])
      })
      const columnNameMap: Record<string, string> = {}
      originalColumns.forEach((orig, idx) => {
        columnNameMap[orig] = translatedColumns[idx]
      })
      
      const formattedRows = rowArray.map((row) => {
        const obj: Record<string, any> = {}
        originalColumns.forEach((origCol) => {
          const translatedCol = columnMap.get(origCol) || origCol
          obj[translatedCol] = row[origCol]
        })
        return obj
      })

      await conn.end()
      return {
        columns: translatedColumns,
        originalColumns,
        columnNameMap,
        rows: formattedRows,
        rowCount: formattedRows.length,
        executionTime,
      }
    } catch (error) {
      await conn.end()
      throw error
    }
  }

  private static async executePostgreSQL(connection: DatabaseConnection, sql: string, startTime: number): Promise<QueryResult> {
    const client = new pg.Client({
      host: connection.host,
      port: connection.port,
      user: connection.username,
      password: connection.password,
      database: connection.database,
      ssl: connection.ssl ? { rejectUnauthorized: false } : false,
    })

    try {
      await client.connect()
      const result = await client.query(sql)
      const executionTime = Date.now() - startTime

      await client.end()

      // 获取原始字段名
      const originalColumns = result.fields.map((f) => f.name)
      // 将所有字段名转换为中文
      const translatedColumns = originalColumns.map(col => translateColumnName(col))
      
      // 创建字段名映射（原始字段名 -> 中文字段名）
      const columnMap = new Map<string, string>()
      originalColumns.forEach((orig, idx) => {
        columnMap.set(orig, translatedColumns[idx])
      })
      const columnNameMap: Record<string, string> = {}
      originalColumns.forEach((orig, idx) => {
        columnNameMap[orig] = translatedColumns[idx]
      })
      
      // 更新 rows 中的字段名为中文
      const translatedRows = result.rows.map((row) => {
        const newRow: Record<string, any> = {}
        originalColumns.forEach((origCol) => {
          const translatedCol = columnMap.get(origCol) || origCol
          newRow[translatedCol] = row[origCol]
        })
        return newRow
      })

      return {
        columns: translatedColumns,
        originalColumns,
        columnNameMap,
        rows: translatedRows,
        rowCount: result.rowCount || 0,
        executionTime,
      }
    } catch (error) {
      await client.end()
      throw error
    }
  }

  private static async executeSQLite(connection: DatabaseConnection, sql: string, startTime: number): Promise<QueryResult> {
    // SQLite support would require sql.js or better-sqlite3
    // For now, throw an error
    throw new Error("SQLite 支持尚未实现")
  }

  private static async executeSQLServer(connection: DatabaseConnection, sql: string, startTime: number): Promise<QueryResult> {
    // SQL Server support would require tedious
    // For now, throw an error
    throw new Error("SQL Server 支持尚未实现")
  }

  static async testConnection(connection: DatabaseConnection): Promise<boolean> {
    try {
      switch (connection.type) {
        case "mysql":
          const mysqlConn = await mysql.createConnection({
            host: connection.host,
            port: connection.port,
            user: connection.username,
            password: connection.password,
            database: connection.database,
            ssl: connection.ssl ? {} : undefined,
          })
          await mysqlConn.execute("SELECT 1")
          await mysqlConn.end()
          return true
        case "postgresql":
          const pgClient = new pg.Client({
            host: connection.host,
            port: connection.port,
            user: connection.username,
            password: connection.password,
            database: connection.database,
            ssl: connection.ssl ? { rejectUnauthorized: false } : false,
          })
          await pgClient.connect()
          await pgClient.query("SELECT 1")
          await pgClient.end()
          return true
        default:
          throw new Error(`不支持的数据库类型: ${connection.type}`)
      }
    } catch (error) {
      return false
    }
  }
}