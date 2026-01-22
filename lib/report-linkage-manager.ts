/**
 * 报表联动管理器
 * 管理报表间的关联关系，实现筛选条件共享和钻取功能
 */

import type { SavedReport } from "./types"

export interface ReportLinkage {
  sourceReportId: string // 源报表ID
  targetReportId: string // 目标报表ID
  linkageType: "filter" | "drill_down" | "cross_filter" // 联动类型
  filterMapping: {
    sourceField: string // 源报表字段
    targetField: string // 目标报表字段
    operator?: "equals" | "contains" | "in" | "range" // 操作符
  }[]
  enabled: boolean // 是否启用
}

export interface FilterState {
  reportId: string
  filters: Record<string, any> // 字段名 -> 筛选值
  timestamp: number
}

export class ReportLinkageManager {
  private static filterStates: Map<string, FilterState> = new Map()
  private static linkages: Map<string, ReportLinkage[]> = new Map()

  /**
   * 注册报表联动关系
   */
  static registerLinkage(linkage: ReportLinkage): void {
    const key = linkage.sourceReportId
    if (!this.linkages.has(key)) {
      this.linkages.set(key, [])
    }
    this.linkages.get(key)!.push(linkage)
  }

  /**
   * 获取报表的所有联动关系
   */
  static getLinkages(reportId: string): ReportLinkage[] {
    return this.linkages.get(reportId) || []
  }

  /**
   * 更新报表的筛选条件
   */
  static updateFilters(reportId: string, filters: Record<string, any>): void {
    this.filterStates.set(reportId, {
      reportId,
      filters,
      timestamp: Date.now(),
    })

    // 通知关联的报表更新
    this.propagateFilters(reportId, filters)
  }

  /**
   * 传播筛选条件到关联报表
   */
  private static propagateFilters(sourceReportId: string, filters: Record<string, any>): void {
    const linkages = this.getLinkages(sourceReportId)
    
    for (const linkage of linkages) {
      if (!linkage.enabled) {
        continue
      }

      // 根据联动类型处理
      switch (linkage.linkageType) {
        case "filter":
          // 直接过滤：将源报表的筛选条件应用到目标报表
          this.applyFiltersToReport(linkage.targetReportId, filters, linkage.filterMapping)
          break

        case "drill_down":
          // 钻取：从汇总到明细，需要特殊处理
          this.applyDrillDown(linkage.targetReportId, filters, linkage.filterMapping)
          break

        case "cross_filter":
          // 交叉过滤：多个报表相互影响
          this.applyCrossFilter(linkage.targetReportId, filters, linkage.filterMapping)
          break
      }
    }
  }

  /**
   * 应用筛选条件到报表
   */
  private static applyFiltersToReport(
    targetReportId: string,
    sourceFilters: Record<string, any>,
    filterMapping: ReportLinkage["filterMapping"]
  ): void {
    const targetFilters: Record<string, any> = {}

    for (const mapping of filterMapping) {
      const sourceValue = sourceFilters[mapping.sourceField]
      if (sourceValue !== undefined && sourceValue !== null) {
        // 根据操作符转换值
        switch (mapping.operator) {
          case "equals":
            targetFilters[mapping.targetField] = sourceValue
            break
          case "contains":
            targetFilters[mapping.targetField] = { $like: `%${sourceValue}%` }
            break
          case "in":
            targetFilters[mapping.targetField] = Array.isArray(sourceValue) ? sourceValue : [sourceValue]
            break
          case "range":
            if (Array.isArray(sourceValue) && sourceValue.length === 2) {
              targetFilters[mapping.targetField] = {
                $gte: sourceValue[0],
                $lte: sourceValue[1],
              }
            }
            break
          default:
            targetFilters[mapping.targetField] = sourceValue
        }
      }
    }

    if (Object.keys(targetFilters).length > 0) {
      this.updateFilters(targetReportId, targetFilters)
    }
  }

  /**
   * 应用钻取操作
   */
  private static applyDrillDown(
    targetReportId: string,
    sourceFilters: Record<string, any>,
    filterMapping: ReportLinkage["filterMapping"]
  ): void {
    // 钻取通常需要更精确的筛选条件
    const targetFilters: Record<string, any> = {}

    for (const mapping of filterMapping) {
      const sourceValue = sourceFilters[mapping.sourceField]
      if (sourceValue !== undefined && sourceValue !== null) {
        // 钻取使用精确匹配
        targetFilters[mapping.targetField] = sourceValue
      }
    }

    if (Object.keys(targetFilters).length > 0) {
      this.updateFilters(targetReportId, targetFilters)
    }
  }

  /**
   * 应用交叉过滤
   */
  private static applyCrossFilter(
    targetReportId: string,
    sourceFilters: Record<string, any>,
    filterMapping: ReportLinkage["filterMapping"]
  ): void {
    // 交叉过滤类似于普通过滤，但可能涉及多个报表
    this.applyFiltersToReport(targetReportId, sourceFilters, filterMapping)
  }

  /**
   * 获取报表的当前筛选条件
   */
  static getFilters(reportId: string): Record<string, any> | null {
    const state = this.filterStates.get(reportId)
    return state ? state.filters : null
  }

  /**
   * 清除报表的筛选条件
   */
  static clearFilters(reportId: string): void {
    this.filterStates.delete(reportId)
  }

  /**
   * 根据报表配置自动推断联动关系
   */
  static inferLinkages(reports: SavedReport[]): ReportLinkage[] {
    const linkages: ReportLinkage[] = []

    // 简单的推断逻辑：如果两个报表有相同的字段，可能有关联
    for (let i = 0; i < reports.length; i++) {
      for (let j = i + 1; j < reports.length; j++) {
        const reportA = reports[i]
        const reportB = reports[j]

        // 从SQL中提取表名和字段（简化处理）
        const tablesA = this.extractTablesFromSQL(reportA.sql)
        const tablesB = this.extractTablesFromSQL(reportB.sql)

        // 如果有共同表，创建联动关系
        const commonTables = tablesA.filter(t => tablesB.includes(t))
        if (commonTables.length > 0) {
          linkages.push({
            sourceReportId: reportA.id,
            targetReportId: reportB.id,
            linkageType: "cross_filter",
            filterMapping: [], // 需要根据实际字段配置
            enabled: true,
          })
        }
      }
    }

    return linkages
  }

  /**
   * 从SQL中提取表名
   */
  private static extractTablesFromSQL(sql: string): string[] {
    const tables: string[] = []
    const tableRegex = /FROM\s+[`"]?(\w+)[`"]?/gi
    let match

    while ((match = tableRegex.exec(sql)) !== null) {
      tables.push(match[1])
    }

    // 也提取JOIN中的表
    const joinRegex = /JOIN\s+[`"]?(\w+)[`"]?/gi
    while ((match = joinRegex.exec(sql)) !== null) {
      tables.push(match[1])
    }

    return [...new Set(tables)] // 去重
  }

  /**
   * 构建联动SQL（在源报表筛选条件基础上修改目标报表SQL）
   */
  static buildLinkedSQL(
    targetReport: SavedReport,
    sourceFilters: Record<string, any>,
    filterMapping: ReportLinkage["filterMapping"]
  ): string {
    let sql = targetReport.sql

    // 构建WHERE条件
    const whereConditions: string[] = []

    for (const mapping of filterMapping) {
      const sourceValue = sourceFilters[mapping.sourceField]
      if (sourceValue !== undefined && sourceValue !== null) {
        let condition = ""

        switch (mapping.operator) {
          case "equals":
            condition = `\`${mapping.targetField}\` = ${this.formatSQLValue(sourceValue)}`
            break
          case "contains":
            condition = `\`${mapping.targetField}\` LIKE '%${this.escapeSQLString(String(sourceValue))}%'`
            break
          case "in":
            const values = Array.isArray(sourceValue) ? sourceValue : [sourceValue]
            const formattedValues = values.map(v => this.formatSQLValue(v)).join(", ")
            condition = `\`${mapping.targetField}\` IN (${formattedValues})`
            break
          case "range":
            if (Array.isArray(sourceValue) && sourceValue.length === 2) {
              condition = `\`${mapping.targetField}\` BETWEEN ${this.formatSQLValue(sourceValue[0])} AND ${this.formatSQLValue(sourceValue[1])}`
            }
            break
          default:
            condition = `\`${mapping.targetField}\` = ${this.formatSQLValue(sourceValue)}`
        }

        if (condition) {
          whereConditions.push(condition)
        }
      }
    }

    if (whereConditions.length > 0) {
      // 检查SQL中是否已有WHERE子句
      if (/WHERE/i.test(sql)) {
        // 在现有WHERE后添加AND条件
        sql = sql.replace(/WHERE\s+/i, `WHERE ${whereConditions.join(" AND ")} AND `)
      } else {
        // 添加WHERE子句
        // 找到合适的位置（在FROM之后，GROUP BY/ORDER BY/LIMIT之前）
        const insertPosition = sql.search(/(GROUP\s+BY|ORDER\s+BY|LIMIT)/i)
        if (insertPosition > 0) {
          sql = sql.slice(0, insertPosition) + ` WHERE ${whereConditions.join(" AND ")} ` + sql.slice(insertPosition)
        } else {
          sql += ` WHERE ${whereConditions.join(" AND ")}`
        }
      }
    }

    return sql
  }

  /**
   * 格式化SQL值
   */
  private static formatSQLValue(value: any): string {
    if (typeof value === "string") {
      return `'${this.escapeSQLString(value)}'`
    }
    if (typeof value === "number") {
      return String(value)
    }
    if (value instanceof Date) {
      return `'${value.toISOString()}'`
    }
    return `'${String(value)}'`
  }

  /**
   * 转义SQL字符串
   */
  private static escapeSQLString(str: string): string {
    return str.replace(/'/g, "''")
  }
}
