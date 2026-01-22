/**
 * 动态数据探索模块
 * 根据意图分析结果，动态采集所需数据
 */

import { SQLExecutor } from "./sql-executor"
import type { DatabaseConnection, DatabaseSchema } from "./types"
import type { IntentAnalysis } from "./intent-analyzer"

export interface ExplorationResult {
  schema: DatabaseSchema[]
  samples: Record<string, any[]> // 表名 -> 样本数据
  statistics: Record<string, TableStatistics> // 表名 -> 统计信息
  relationships: TableRelationship[]
  explorationTime: number
}

export interface TableStatistics {
  rowCount: number
  columnStats: Record<string, ColumnStatistics>
  commonValues: Record<string, any[]> // 列名 -> 常见值
}

export interface ColumnStatistics {
  uniqueCount: number
  nullCount: number
  nullPercentage: number
  min?: number | string
  max?: number | string
  avg?: number
}

export interface TableRelationship {
  fromTable: string
  fromColumn: string
  toTable: string
  toColumn: string
  relationshipType: "foreign_key" | "potential"
}

export class DataExplorer {
  /**
   * 根据意图分析结果，动态探索数据库
   */
  static async explore(
    connection: DatabaseConnection,
    intent: IntentAnalysis,
    existingSchema?: DatabaseSchema[]
  ): Promise<ExplorationResult> {
    const startTime = Date.now()

    // 1. 获取基础结构信息（如果还没有）
    let schema = existingSchema
    if (!schema || schema.length === 0) {
      schema = await this.getSchema(connection)
    }

    const result: ExplorationResult = {
      schema,
      samples: {},
      statistics: {},
      relationships: [],
      explorationTime: 0,
    }

    // 2. 根据意图决定采集策略
    const targetTables = intent.targetTables.length > 0 ? intent.targetTables : schema.map((s) => s.tableName)

    // 3. 采集样本数据（如果需要）
    if (intent.requiresSamples && !intent.requiresFullData) {
      for (const tableName of targetTables) {
        try {
          const samples = await this.getSamples(connection, tableName, 20)
          result.samples[tableName] = samples
        } catch (error) {
          console.warn(`[DataExplorer] Failed to get samples for ${tableName}:`, error)
        }
      }
    }

    // 4. 采集统计信息（如果需要）
    if (intent.requiresStats || intent.intent === "top_n" || intent.intent === "aggregate") {
      for (const tableName of targetTables) {
        try {
          const stats = await this.getStatistics(connection, tableName)
          result.statistics[tableName] = stats
        } catch (error) {
          console.warn(`[DataExplorer] Failed to get statistics for ${tableName}:`, error)
        }
      }
    }

    // 5. 获取表关系（如果需要JOIN）
    if (intent.intent === "join" || targetTables.length > 1) {
      result.relationships = await this.getRelationships(connection, schema)
    }

    result.explorationTime = Date.now() - startTime

    return result
  }

  /**
   * 获取数据库结构
   */
  private static async getSchema(connection: DatabaseConnection): Promise<DatabaseSchema[]> {
    // 这里可以调用现有的 schema API 逻辑
    // 为了简化，我们直接使用 information_schema
    const schemas: DatabaseSchema[] = []

    if (connection.type === "mysql") {
      const tablesResult = await SQLExecutor.executeQuery(
        connection,
        `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = '${connection.database}' AND TABLE_TYPE = 'BASE TABLE'`
      )

      for (const row of tablesResult.rows) {
        const tableName = (row as any).TABLE_NAME
        const columnsResult = await SQLExecutor.executeQuery(
          connection,
          `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_COMMENT
           FROM information_schema.COLUMNS 
           WHERE TABLE_SCHEMA = '${connection.database}' AND TABLE_NAME = '${tableName}'
           ORDER BY ORDINAL_POSITION`
        )

        schemas.push({
          tableName,
          columns: columnsResult.rows.map((col: any) => ({
            name: col.COLUMN_NAME,
            type: col.DATA_TYPE,
            nullable: col.IS_NULLABLE === "YES",
            isPrimaryKey: col.COLUMN_KEY === "PRI",
            isForeignKey: col.COLUMN_KEY === "MUL",
            description: col.COLUMN_COMMENT || undefined,
          })),
        })
      }
    } else if (connection.type === "postgresql") {
      const tablesResult = await SQLExecutor.executeQuery(
        connection,
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
      )

      for (const row of tablesResult.rows) {
        const tableName = (row as any).table_name
        if (!tableName) continue

        const columnsResult = await SQLExecutor.executeQuery(
          connection,
          `SELECT column_name, data_type, is_nullable
           FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = '${String(tableName).replace(/'/g, "''")}'
           ORDER BY ordinal_position`
        )

        const pkResult = await SQLExecutor.executeQuery(
          connection,
          `SELECT kcu.column_name
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
           WHERE tc.table_schema = 'public'
             AND tc.table_name = '${String(tableName).replace(/'/g, "''")}'
             AND tc.constraint_type = 'PRIMARY KEY'`
        )
        const primaryKeys = new Set(pkResult.rows.map((r: any) => r.column_name))

        const fkColsResult = await SQLExecutor.executeQuery(
          connection,
          `SELECT kcu.column_name
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
           WHERE tc.table_schema = 'public'
             AND tc.table_name = '${String(tableName).replace(/'/g, "''")}'
             AND tc.constraint_type = 'FOREIGN KEY'`
        )
        const foreignKeys = new Set(fkColsResult.rows.map((r: any) => r.column_name))

        schemas.push({
          tableName,
          columns: columnsResult.rows.map((col: any) => ({
            name: col.column_name,
            type: col.data_type,
            nullable: col.is_nullable === "YES",
            isPrimaryKey: primaryKeys.has(col.column_name),
            isForeignKey: foreignKeys.has(col.column_name),
          })),
        })
      }
    }

    return schemas
  }

  /**
   * 获取表样本数据
   */
  private static async getSamples(
    connection: DatabaseConnection,
    tableName: string,
    limit: number = 20
  ): Promise<any[]> {
    const escaped = String(tableName).replace(/"/g, '""').replace(/`/g, "``")
    const sql =
      connection.type === "postgresql"
        ? `SELECT * FROM "${escaped}" LIMIT ${limit}`
        : `SELECT * FROM \`${escaped}\` LIMIT ${limit}`
    const result = await SQLExecutor.executeQuery(connection, sql)
    return result.rows
  }

  /**
   * 获取表统计信息
   */
  private static async getStatistics(
    connection: DatabaseConnection,
    tableName: string
  ): Promise<TableStatistics> {
    const stats: TableStatistics = {
      rowCount: 0,
      columnStats: {},
      commonValues: {},
    }

    // 获取行数
    try {
      const escaped = String(tableName).replace(/"/g, '""').replace(/`/g, "``")
      const countSQL =
        connection.type === "postgresql"
          ? `SELECT COUNT(*) as count FROM "${escaped}"`
          : `SELECT COUNT(*) as count FROM \`${escaped}\``
      const countResult = await SQLExecutor.executeQuery(connection, countSQL)
      stats.rowCount = parseInt(countResult.rows[0]?.count || "0")
    } catch (error) {
      console.warn(`[DataExplorer] Failed to get row count for ${tableName}:`, error)
    }

    // 获取列信息
    if (connection.type === "mysql") {
      const columnsResult = await SQLExecutor.executeQuery(
        connection,
        `SELECT COLUMN_NAME, DATA_TYPE 
         FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = '${connection.database}' AND TABLE_NAME = '${tableName}'`
      )

      for (const col of columnsResult.rows) {
        const colName = (col as any).COLUMN_NAME
        const dataType = (col as any).DATA_TYPE

        // 获取唯一值数量
        try {
          const uniqueResult = await SQLExecutor.executeQuery(
            connection,
            `SELECT COUNT(DISTINCT \`${colName}\`) as unique_count FROM \`${tableName}\``
          )
          const uniqueCount = parseInt(uniqueResult.rows[0]?.unique_count || "0")

          // 获取NULL数量
          const nullResult = await SQLExecutor.executeQuery(
            connection,
            `SELECT COUNT(*) as null_count FROM \`${tableName}\` WHERE \`${colName}\` IS NULL`
          )
          const nullCount = parseInt(nullResult.rows[0]?.null_count || "0")
          const nullPercentage = stats.rowCount > 0 ? (nullCount / stats.rowCount) * 100 : 0

          stats.columnStats[colName] = {
            uniqueCount,
            nullCount,
            nullPercentage,
          }

          // 如果是数值类型，获取范围
          if (["int", "bigint", "decimal", "float", "double"].includes(dataType)) {
            try {
              const rangeResult = await SQLExecutor.executeQuery(
                connection,
                `SELECT MIN(\`${colName}\`) as min_val, MAX(\`${colName}\`) as max_val, AVG(\`${colName}\`) as avg_val 
                 FROM \`${tableName}\` WHERE \`${colName}\` IS NOT NULL`
              )
              const row = rangeResult.rows[0] as any
              stats.columnStats[colName].min = row.min_val
              stats.columnStats[colName].max = row.max_val
              stats.columnStats[colName].avg = row.avg_val ? parseFloat(row.avg_val) : undefined
            } catch (error) {
              // 忽略错误
            }
          }

          // 获取常见值（TOP 5）
          try {
            const commonResult = await SQLExecutor.executeQuery(
              connection,
              `SELECT \`${colName}\`, COUNT(*) as cnt 
               FROM \`${tableName}\` 
               WHERE \`${colName}\` IS NOT NULL 
               GROUP BY \`${colName}\` 
               ORDER BY cnt DESC 
               LIMIT 5`
            )
            stats.commonValues[colName] = commonResult.rows.map((r: any) => r[colName])
          } catch (error) {
            // 忽略错误
          }
        } catch (error) {
          console.warn(`[DataExplorer] Failed to get stats for column ${colName}:`, error)
        }
      }
    }

    return stats
  }

  /**
   * 获取表关系
   */
  private static async getRelationships(
    connection: DatabaseConnection,
    schema: DatabaseSchema[]
  ): Promise<TableRelationship[]> {
    const relationships: TableRelationship[] = []

    if (connection.type === "mysql") {
      // 获取外键关系
      const fkResult = await SQLExecutor.executeQuery(
        connection,
        `SELECT 
          TABLE_NAME,
          COLUMN_NAME,
          REFERENCED_TABLE_NAME,
          REFERENCED_COLUMN_NAME
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = '${connection.database}'
          AND REFERENCED_TABLE_NAME IS NOT NULL`
      )

      for (const row of fkResult.rows) {
        relationships.push({
          fromTable: (row as any).TABLE_NAME,
          fromColumn: (row as any).COLUMN_NAME,
          toTable: (row as any).REFERENCED_TABLE_NAME,
          toColumn: (row as any).REFERENCED_COLUMN_NAME,
          relationshipType: "foreign_key",
        })
      }
    } else if (connection.type === "postgresql") {
      // PostgreSQL 外键关系（public schema）
      const fkResult = await SQLExecutor.executeQuery(
        connection,
        `SELECT
          tc.table_name AS table_name,
          kcu.column_name AS column_name,
          ccu.table_name AS referenced_table_name,
          ccu.column_name AS referenced_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
         AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public'`
      )

      for (const row of fkResult.rows) {
        relationships.push({
          fromTable: (row as any).table_name,
          fromColumn: (row as any).column_name,
          toTable: (row as any).referenced_table_name,
          toColumn: (row as any).referenced_column_name,
          relationshipType: "foreign_key",
        })
      }
    }

    return relationships
  }

  /**
   * 格式化探索结果为上下文文本
   */
  static formatForContext(result: ExplorationResult, intent: IntentAnalysis): string {
    const parts: string[] = []

    // 1. 结构信息
    parts.push("## 数据库结构")
    for (const table of result.schema) {
      parts.push(`\n### 表: ${table.tableName}`)
      if (table.rowCount !== undefined) {
        parts.push(`- 总行数: ${table.rowCount}`)
      }
      parts.push("- 列信息:")
      for (const col of table.columns) {
        const colInfo = [
          col.name,
          `类型: ${col.type}`,
          col.isPrimaryKey ? "主键" : "",
          col.isForeignKey ? "外键" : "",
          col.nullable ? "可空" : "非空",
        ]
          .filter(Boolean)
          .join(", ")
        parts.push(`  - ${colInfo}`)
      }
    }

    // 2. 样本数据（如果有）
    if (Object.keys(result.samples).length > 0) {
      parts.push("\n## 数据样本（用于理解数据格式和含义）")
      for (const [tableName, samples] of Object.entries(result.samples)) {
        parts.push(`\n### ${tableName} 表样本（前 ${samples.length} 行）:`)
        if (samples.length > 0) {
          parts.push("```json")
          parts.push(JSON.stringify(samples.slice(0, 5), null, 2)) // 只显示前5行
          parts.push("```")
          if (samples.length > 5) {
            parts.push(`（还有 ${samples.length - 5} 行样本数据）`)
          }
        }
      }
    }

    // 3. 统计信息（如果有）
    if (Object.keys(result.statistics).length > 0) {
      parts.push("\n## 数据统计信息")
      for (const [tableName, stats] of Object.entries(result.statistics)) {
        parts.push(`\n### ${tableName} 表统计:`)
        parts.push(`- 总行数: ${stats.rowCount}`)
        for (const [colName, colStats] of Object.entries(stats.columnStats)) {
          const statParts = [
            `唯一值: ${colStats.uniqueCount}`,
            `NULL比例: ${colStats.nullPercentage.toFixed(1)}%`,
          ]
          if (colStats.min !== undefined) {
            statParts.push(`范围: ${colStats.min} ~ ${colStats.max}`)
          }
          if (colStats.avg !== undefined) {
            statParts.push(`平均值: ${colStats.avg.toFixed(2)}`)
          }
          parts.push(`  - ${colName}: ${statParts.join(", ")}`)
        }
      }
    }

    // 4. 表关系（如果有）
    if (result.relationships.length > 0) {
      parts.push("\n## 表关系")
      for (const rel of result.relationships) {
        parts.push(
          `- ${rel.fromTable}.${rel.fromColumn} → ${rel.toTable}.${rel.toColumn} (${rel.relationshipType})`
        )
      }
    }

    return parts.join("\n")
  }
}

