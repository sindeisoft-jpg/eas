/**
 * 实体提取和识别模块
 * 负责从用户输入中提取实体名称，识别实体类型，并在数据库中查找匹配的实体
 */

import type { DatabaseSchema, DatabaseConnection, QueryResult } from "./types"
import { SQLExecutor } from "./sql-executor"

export type EntityType = 'customer' | 'product' | 'order' | 'account' | 'contact' | 'opportunity' | 'unknown'

export interface EntityInfo {
  entityName: string
  entityType: EntityType
  entityId: any
  tableName: string
  matchedField: string
}

/**
 * 实体提取器
 */
export class EntityExtractor {
  /**
   * 从用户输入中提取实体名称
   * 支持格式：
   * - "客户张三的报告" → "张三"
   * - "产品A的报告" → "A"
   * - "订单12345的报告" → "12345"
   * - "@报告 客户张三" → "张三"
   */
  static extractEntityName(question: string): string | null {
    if (!question || typeof question !== 'string') {
      return null
    }

    const trimmed = question.trim()

    // 模式1: xxx的报告
    const pattern1 = /^(.+?)(?:的)?报告$/i
    const match1 = trimmed.match(pattern1)
    if (match1 && match1[1]) {
      return match1[1].trim()
    }

    // 模式2: @报告 xxx 或 /报告 xxx
    const pattern2 = /^[@/]报告\s+(.+)$/i
    const match2 = trimmed.match(pattern2)
    if (match2 && match2[1]) {
      return match2[1].trim()
    }

    // 模式3: 生成一个报告，关于xxx
    const pattern3 = /(?:生成|创建|制作).*报告.*(?:关于|针对|的)(.+?)(?:[，,。.]|$)/i
    const match3 = trimmed.match(pattern3)
    if (match3 && match3[1]) {
      return match3[1].trim()
    }

    // 模式4: xxx的报告（更宽松的匹配）
    const pattern4 = /(.+?)(?:的)?报告/i
    const match4 = trimmed.match(pattern4)
    if (match4 && match4[1] && match4[1].length > 0 && match4[1].length < 50) {
      return match4[1].trim()
    }

    return null
  }

  /**
   * 识别实体类型
   * 基于关键词和数据库schema推断实体类型
   */
  static async identifyEntityType(
    entityName: string,
    question: string,
    schema: DatabaseSchema[]
  ): Promise<EntityType> {
    const lowerQuestion = question.toLowerCase()
    const lowerEntityName = entityName.toLowerCase()

    // 基于关键词识别
    const keywordMap: Record<string, EntityType> = {
      '客户': 'customer',
      'customer': 'customer',
      '客户名称': 'customer',
      '客户名': 'customer',
      '联系人': 'contact',
      'contact': 'contact',
      '产品': 'product',
      'product': 'product',
      '商品': 'product',
      '订单': 'order',
      'order': 'order',
      '订单号': 'order',
      '商机': 'opportunity',
      'opportunity': 'opportunity',
      '机会': 'opportunity',
      '账户': 'account',
      'account': 'account',
      '公司': 'account',
    }

    // 检查问题中是否包含类型关键词
    for (const [keyword, type] of Object.entries(keywordMap)) {
      if (lowerQuestion.includes(keyword)) {
        return type
      }
    }

    // 基于数据库schema识别
    if (schema && schema.length > 0) {
      const tableNameMap: Record<string, EntityType> = {
        'customers': 'customer',
        'customer': 'customer',
        'contacts': 'contact',
        'contact': 'contact',
        'products': 'product',
        'product': 'product',
        'orders': 'order',
        'order': 'order',
        'opportunities': 'opportunity',
        'opportunity': 'opportunity',
        'accounts': 'account',
        'account': 'account',
      }

      for (const table of schema) {
        const lowerTableName = table.tableName.toLowerCase()
        if (tableNameMap[lowerTableName]) {
          // 检查表名是否匹配实体类型
          return tableNameMap[lowerTableName]
        }
      }
    }

    // 基于实体名称格式推断
    // 如果实体名称是纯数字，可能是订单号或ID
    if (/^\d+$/.test(entityName)) {
      return 'order'
    }

    // 默认返回 unknown，让查询生成器尝试所有可能的表
    return 'unknown'
  }

  /**
   * 在数据库中查找匹配的实体
   */
  static async findEntityInDatabase(
    entityName: string,
    entityType: EntityType,
    schema: DatabaseSchema[],
    connection: DatabaseConnection
  ): Promise<EntityInfo | null> {
    if (!schema || schema.length === 0) {
      return null
    }

    // 根据实体类型确定要搜索的表
    const tablesToSearch = this.getTablesForEntityType(entityType, schema)

    // 尝试在每个表中查找实体
    for (const table of tablesToSearch) {
      const entityInfo = await this.searchInTable(
        entityName,
        table,
        connection
      )
      if (entityInfo) {
        return entityInfo
      }
    }

    return null
  }

  /**
   * 根据实体类型获取要搜索的表
   */
  private static getTablesForEntityType(
    entityType: EntityType,
    schema: DatabaseSchema[]
  ): DatabaseSchema[] {
    const typeTableMap: Record<EntityType, string[]> = {
      customer: ['customers', 'customer', '客户', '客户表'],
      contact: ['contacts', 'contact', '联系人', '联系人表'],
      product: ['products', 'product', '产品', '产品表', '商品', '商品表'],
      order: ['orders', 'order', '订单', '订单表'],
      opportunity: ['opportunities', 'opportunity', '商机', '商机表', '机会', '机会表'],
      account: ['accounts', 'account', '账户', '账户表', '公司', '公司表'],
      unknown: [], // 未知类型，搜索所有表
    }

    const targetTableNames = typeTableMap[entityType] || []

    if (entityType === 'unknown') {
      // 未知类型，返回所有表
      return schema
    }

    // 查找匹配的表
    const matchedTables = schema.filter(table => {
      const lowerTableName = table.tableName.toLowerCase()
      return targetTableNames.some(target => 
        lowerTableName.includes(target.toLowerCase()) || 
        target.toLowerCase().includes(lowerTableName)
      )
    })

    // 如果找到匹配的表，返回；否则返回所有表（尝试搜索）
    return matchedTables.length > 0 ? matchedTables : schema
  }

  /**
   * 在指定表中搜索实体
   */
  private static async searchInTable(
    entityName: string,
    table: DatabaseSchema,
    connection: DatabaseConnection
  ): Promise<EntityInfo | null> {
    try {
      // 查找可能包含实体名称的字段（名称字段、ID字段等）
      const nameFields = table.columns.filter(col => {
        const lowerName = col.name.toLowerCase()
        return (
          lowerName.includes('name') ||
          lowerName.includes('名称') ||
          lowerName.includes('title') ||
          lowerName.includes('标题') ||
          lowerName.includes('code') ||
          lowerName.includes('编号')
        )
      })

      const idFields = table.columns.filter(col => {
        const lowerName = col.name.toLowerCase()
        return (
          lowerName.includes('id') ||
          lowerName === 'id' ||
          col.isPrimaryKey
        )
      })

      // 尝试在名称字段中搜索
      for (const field of nameFields) {
        // 转义特殊字符，防止SQL注入
        const escapedEntityName = entityName.replace(/'/g, "''").replace(/\\/g, "\\\\")
        const query = `SELECT * FROM \`${table.tableName}\` WHERE \`${field.name}\` LIKE '%${escapedEntityName}%' LIMIT 1`
        const result = await SQLExecutor.executeQuery(
          connection,
          query,
          false
        )

        if (result && result.rows && result.rows.length > 0) {
          const row = result.rows[0]
          const idField = idFields[0] || table.columns.find(col => col.isPrimaryKey)
          return {
            entityName: entityName,
            entityType: this.inferEntityTypeFromTable(table.tableName),
            entityId: idField ? row[idField.name] : null,
            tableName: table.tableName,
            matchedField: field.name,
          }
        }
      }

      // 如果实体名称是数字，尝试在ID字段中搜索
      if (/^\d+$/.test(entityName)) {
        for (const field of idFields) {
          // 数字ID，直接使用
          const query = `SELECT * FROM \`${table.tableName}\` WHERE \`${field.name}\` = ${entityName} LIMIT 1`
          const result = await SQLExecutor.executeQuery(
            connection,
            query,
            false
          )

          if (result && result.rows && result.rows.length > 0) {
            const row = result.rows[0]
            return {
              entityName: entityName,
              entityType: this.inferEntityTypeFromTable(table.tableName),
              entityId: row[field.name],
              tableName: table.tableName,
              matchedField: field.name,
            }
          }
        }
      }
    } catch (error) {
      console.error(`[EntityExtractor] Error searching in table ${table.tableName}:`, error)
    }

    return null
  }

  /**
   * 从表名推断实体类型
   */
  private static inferEntityTypeFromTable(tableName: string): EntityType {
    const lowerTableName = tableName.toLowerCase()
    
    if (lowerTableName.includes('customer') || lowerTableName.includes('客户')) {
      return 'customer'
    }
    if (lowerTableName.includes('contact') || lowerTableName.includes('联系人')) {
      return 'contact'
    }
    if (lowerTableName.includes('product') || lowerTableName.includes('产品') || lowerTableName.includes('商品')) {
      return 'product'
    }
    if (lowerTableName.includes('order') || lowerTableName.includes('订单')) {
      return 'order'
    }
    if (lowerTableName.includes('opportunity') || lowerTableName.includes('商机') || lowerTableName.includes('机会')) {
      return 'opportunity'
    }
    if (lowerTableName.includes('account') || lowerTableName.includes('账户') || lowerTableName.includes('公司')) {
      return 'account'
    }

    return 'unknown'
  }
}
