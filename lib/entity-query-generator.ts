/**
 * 实体查询生成器
 * 负责生成查询实体所有信息的SQL，包括主实体信息、关联数据和统计分析
 */

import type { DatabaseSchema, DatabaseConnection, QueryResult } from "./types"
import { SQLExecutor } from "./sql-executor"
import type { EntityInfo, EntityType } from "./entity-extractor"

export interface EntityQuerySet {
  mainEntityQuery: QueryResult | null
  relatedDataQueries: Array<{ tableName: string; query: QueryResult }>
  statisticsQueries: Array<{ name: string; query: QueryResult }>
}

/**
 * 实体查询生成器
 */
export class EntityQueryGenerator {
  /**
   * 生成实体查询集合
   */
  static async generateEntityQueries(
    entityInfo: EntityInfo,
    schema: DatabaseSchema[],
    connection: DatabaseConnection
  ): Promise<EntityQuerySet> {
    const queries: EntityQuerySet = {
      mainEntityQuery: null,
      relatedDataQueries: [],
      statisticsQueries: [],
    }

    try {
      // 1. 查询主实体信息
      queries.mainEntityQuery = await this.queryMainEntity(
        entityInfo,
        connection
      )

      // 2. 查询关联数据
      queries.relatedDataQueries = await this.queryRelatedData(
        entityInfo,
        schema,
        connection
      )

      // 3. 生成统计分析查询
      queries.statisticsQueries = await this.generateStatisticsQueries(
        entityInfo,
        schema,
        connection
      )
    } catch (error) {
      console.error('[EntityQueryGenerator] Error generating queries:', error)
    }

    return queries
  }

  /**
   * 查询主实体信息
   */
  private static async queryMainEntity(
    entityInfo: EntityInfo,
    connection: DatabaseConnection
  ): Promise<QueryResult | null> {
    try {
      const idField = this.getIdFieldName(entityInfo.tableName, entityInfo.entityId)
      const query = `SELECT * FROM \`${entityInfo.tableName}\` WHERE \`${idField}\` = '${this.escapeSQLValue(entityInfo.entityId)}' LIMIT 1`
      
      const result = await SQLExecutor.executeQuery(connection, query, false)
      return result
    } catch (error) {
      console.error(`[EntityQueryGenerator] Error querying main entity:`, error)
      return null
    }
  }

  /**
   * 查询关联数据
   */
  private static async queryRelatedData(
    entityInfo: EntityInfo,
    schema: DatabaseSchema[],
    connection: DatabaseConnection
  ): Promise<Array<{ tableName: string; query: QueryResult }>> {
    const relatedQueries: Array<{ tableName: string; query: QueryResult }> = []

    try {
      // 查找可能关联的表（通过外键）
      const relatedTables = this.findRelatedTables(entityInfo, schema)

      for (const relatedTable of relatedTables) {
        try {
          // 尝试通过常见的外键字段名匹配
          const foreignKeyFields = this.getForeignKeyFields(entityInfo.tableName, relatedTable.tableName)
          
          for (const fkField of foreignKeyFields) {
            const idField = this.getIdFieldName(entityInfo.tableName, entityInfo.entityId)
            const query = `SELECT * FROM \`${relatedTable.tableName}\` WHERE \`${fkField}\` = '${this.escapeSQLValue(entityInfo.entityId)}' LIMIT 100`
            
            try {
              const result = await SQLExecutor.executeQuery(connection, query, false)
              if (result && result.rows && result.rows.length > 0) {
                relatedQueries.push({
                  tableName: relatedTable.tableName,
                  query: result,
                })
                break // 找到关联数据后，不再尝试其他字段
              }
            } catch (err) {
              // 字段不存在，继续尝试下一个
              continue
            }
          }
        } catch (error) {
          // 查询失败，继续下一个表
          continue
        }
      }
    } catch (error) {
      console.error(`[EntityQueryGenerator] Error querying related data:`, error)
    }

    return relatedQueries
  }

  /**
   * 生成统计分析查询
   */
  private static async generateStatisticsQueries(
    entityInfo: EntityInfo,
    schema: DatabaseSchema[],
    connection: DatabaseConnection
  ): Promise<Array<{ name: string; query: QueryResult }>> {
    const statistics: Array<{ name: string; query: QueryResult }> = []

    try {
      // 查找关联表进行统计
      const relatedTables = this.findRelatedTables(entityInfo, schema)

      for (const relatedTable of relatedTables) {
        const foreignKeyFields = this.getForeignKeyFields(entityInfo.tableName, relatedTable.tableName)
        
        for (const fkField of foreignKeyFields) {
          try {
            // 统计总数
            const countQuery = `SELECT COUNT(*) as total FROM \`${relatedTable.tableName}\` WHERE \`${fkField}\` = '${this.escapeSQLValue(entityInfo.entityId)}'`
            const countResult = await SQLExecutor.executeQuery(connection, countQuery, false)
            
            if (countResult && countResult.rows && countResult.rows.length > 0) {
              statistics.push({
                name: `${relatedTable.tableName}_count`,
                query: countResult,
              })
            }

            // 查找金额/数值字段进行汇总统计
            const amountFields = relatedTable.columns.filter(col => {
              const lowerName = col.name.toLowerCase()
              return (
                lowerName.includes('amount') ||
                lowerName.includes('金额') ||
                lowerName.includes('price') ||
                lowerName.includes('价格') ||
                lowerName.includes('total') ||
                lowerName.includes('总计') ||
                (col.type.includes('decimal') || col.type.includes('int'))
              )
            })

            for (const amountField of amountFields.slice(0, 3)) { // 最多3个字段
              try {
                const sumQuery = `SELECT SUM(\`${amountField.name}\`) as total_sum, AVG(\`${amountField.name}\`) as avg_value, MAX(\`${amountField.name}\`) as max_value, MIN(\`${amountField.name}\`) as min_value FROM \`${relatedTable.tableName}\` WHERE \`${fkField}\` = '${this.escapeSQLValue(entityInfo.entityId)}'`
                const sumResult = await SQLExecutor.executeQuery(connection, sumQuery, false)
                
                if (sumResult && sumResult.rows && sumResult.rows.length > 0) {
                  statistics.push({
                    name: `${relatedTable.tableName}_${amountField.name}_stats`,
                    query: sumResult,
                  })
                }
              } catch (err) {
                // 统计失败，继续下一个字段
                continue
              }
            }

            // 如果有时间字段，生成趋势统计
            const timeFields = relatedTable.columns.filter(col => {
              const lowerName = col.name.toLowerCase()
              return (
                lowerName.includes('date') ||
                lowerName.includes('日期') ||
                lowerName.includes('time') ||
                lowerName.includes('时间') ||
                lowerName.includes('created') ||
                lowerName.includes('updated')
              )
            })

            if (timeFields.length > 0 && amountFields.length > 0) {
              const timeField = timeFields[0]
              const amountField = amountFields[0]
              
              try {
                // 按月统计
                const trendQuery = `SELECT DATE_FORMAT(\`${timeField.name}\`, '%Y-%m') as month, COUNT(*) as count, SUM(\`${amountField.name}\`) as total FROM \`${relatedTable.tableName}\` WHERE \`${fkField}\` = '${this.escapeSQLValue(entityInfo.entityId)}' GROUP BY DATE_FORMAT(\`${timeField.name}\`, '%Y-%m') ORDER BY month DESC LIMIT 12`
                const trendResult = await SQLExecutor.executeQuery(connection, trendQuery, false)
                
                if (trendResult && trendResult.rows && trendResult.rows.length > 0) {
                  statistics.push({
                    name: `${relatedTable.tableName}_trend`,
                    query: trendResult,
                  })
                }
              } catch (err) {
                // 趋势统计失败，继续
                continue
              }
            }

            break // 找到关联表后，不再尝试其他字段
          } catch (err) {
            // 统计查询失败，继续下一个表
            continue
          }
        }
      }
    } catch (error) {
      console.error(`[EntityQueryGenerator] Error generating statistics:`, error)
    }

    return statistics
  }

  /**
   * 查找关联表
   */
  private static findRelatedTables(
    entityInfo: EntityInfo,
    schema: DatabaseSchema[]
  ): DatabaseSchema[] {
    // 根据实体类型推断可能的关联表
    const relatedTableMap: Record<EntityType, string[]> = {
      customer: ['orders', 'order', '订单', 'contacts', 'contact', '联系人', 'opportunities', 'opportunity', '商机'],
      contact: ['accounts', 'account', '账户', 'opportunities', 'opportunity', '商机'],
      product: ['order_items', 'orderitem', '订单项', '订单明细'],
      order: ['order_items', 'orderitem', '订单项', '订单明细'],
      opportunity: ['accounts', 'account', '账户', 'contacts', 'contact', '联系人'],
      account: ['contacts', 'contact', '联系人', 'opportunities', 'opportunity', '商机', 'orders', 'order', '订单'],
      unknown: [], // 未知类型，尝试所有表
    }

    const targetTableNames = relatedTableMap[entityInfo.entityType] || []

    if (entityInfo.entityType === 'unknown') {
      // 未知类型，返回所有其他表
      return schema.filter(table => table.tableName !== entityInfo.tableName)
    }

    // 查找匹配的表
    const matchedTables = schema.filter(table => {
      if (table.tableName === entityInfo.tableName) {
        return false // 排除主表
      }
      const lowerTableName = table.tableName.toLowerCase()
      return targetTableNames.some(target => 
        lowerTableName.includes(target.toLowerCase()) || 
        target.toLowerCase().includes(lowerTableName)
      )
    })

    return matchedTables
  }

  /**
   * 获取外键字段名
   */
  private static getForeignKeyFields(
    mainTableName: string,
    relatedTableName: string
  ): string[] {
    // 常见的外键字段命名模式
    const patterns = [
      `${mainTableName}_id`,
      `${mainTableName}Id`,
      `${mainTableName}ID`,
      `id_${mainTableName}`,
      `ID_${mainTableName}`,
    ]

    // 根据实体类型添加特定模式
    const typePatterns: Record<string, string[]> = {
      customer: ['customer_id', 'customerId', 'customerID', '客户ID', '客户_id'],
      contact: ['contact_id', 'contactId', 'contactID', '联系人ID', '联系人_id'],
      product: ['product_id', 'productId', 'productID', '产品ID', '产品_id'],
      order: ['order_id', 'orderId', 'orderID', '订单ID', '订单_id'],
      opportunity: ['opportunity_id', 'opportunityId', 'opportunityID', '商机ID', '商机_id'],
      account: ['account_id', 'accountId', 'accountID', '账户ID', '账户_id'],
    }

    const allPatterns = [...patterns]
    
    // 从主表名提取实体类型
    const lowerMainTable = mainTableName.toLowerCase()
    for (const [type, typePatterns] of Object.entries(typePatterns)) {
      if (lowerMainTable.includes(type) || lowerMainTable.includes(type === 'customer' ? '客户' : '')) {
        allPatterns.push(...typePatterns)
        break
      }
    }

    return allPatterns
  }

  /**
   * 获取ID字段名
   */
  private static getIdFieldName(tableName: string, entityId: any): string {
    // 尝试常见的ID字段名
    const commonIdFields = ['id', 'ID', 'Id', `${tableName}_id`, `${tableName}Id`]
    
    // 如果实体ID是数字，可能是主键ID
    if (typeof entityId === 'number' || /^\d+$/.test(String(entityId))) {
      return 'id' // 默认使用 id
    }

    return 'id' // 默认返回 id
  }

  /**
   * 转义SQL值
   */
  private static escapeSQLValue(value: any): string {
    if (value === null || value === undefined) {
      return 'NULL'
    }
    
    const str = String(value)
    // 转义单引号
    return str.replace(/'/g, "''").replace(/\\/g, "\\\\")
  }

  /**
   * 合并查询结果为综合数据
   */
  static mergeQueryResults(querySet: EntityQuerySet): QueryResult {
    const allRows: Record<string, any>[] = []
    const allColumns = new Set<string>()

    // 添加主实体数据
    if (querySet.mainEntityQuery && querySet.mainEntityQuery.rows) {
      for (const row of querySet.mainEntityQuery.rows) {
        const enrichedRow: Record<string, any> = {}
        for (const [key, value] of Object.entries(row)) {
          enrichedRow[`main_${key}`] = value
          allColumns.add(`main_${key}`)
        }
        allRows.push(enrichedRow)
      }
    }

    // 添加关联数据
    for (const related of querySet.relatedDataQueries) {
      for (const row of related.query.rows) {
        const enrichedRow: Record<string, any> = {}
        for (const [key, value] of Object.entries(row)) {
          enrichedRow[`${related.tableName}_${key}`] = value
          allColumns.add(`${related.tableName}_${key}`)
        }
        allRows.push(enrichedRow)
      }
    }

    // 添加统计数据
    for (const stat of querySet.statisticsQueries) {
      for (const row of stat.query.rows) {
        const enrichedRow: Record<string, any> = {}
        for (const [key, value] of Object.entries(row)) {
          enrichedRow[`stat_${stat.name}_${key}`] = value
          allColumns.add(`stat_${stat.name}_${key}`)
        }
        allRows.push(enrichedRow)
      }
    }

    return {
      columns: Array.from(allColumns),
      rows: allRows,
      rowCount: allRows.length,
      executionTime: 0,
    }
  }
}
