/**
 * 提示词配置服务
 * 提供配置读取、变量替换和缓存功能
 */

import { db } from "./db"

// 内存缓存，提升性能
const configCache = new Map<string, { content: string; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5分钟缓存

interface PromptConfig {
  id: string
  category: string
  name: string
  description: string | null
  content: string
  variables: string[]
  isActive: boolean
  version: number
  createdAt: Date
  updatedAt: Date
  updatedBy: string | null
}

export class PromptConfigService {
  /**
   * 获取配置（带缓存）
   * @param category 配置分类
   * @param name 配置名称
   * @returns 配置内容
   */
  static async getConfig(category: string, name: string): Promise<string> {
    const cacheKey = `${category}:${name}`
    
    // 检查缓存
    const cached = configCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.content
    }

    try {
      const config = await db.promptConfig.findUnique({
        where: {
          category_name: {
            category,
            name,
          },
        },
      })

      if (!config || !config.isActive) {
        // 如果配置不存在或未激活，返回空字符串
        // 调用方应该处理这种情况，回退到默认值
        return ""
      }

      // 更新缓存
      configCache.set(cacheKey, {
        content: config.content,
        timestamp: Date.now(),
      })

      return config.content
    } catch (error) {
      console.error(`[PromptConfigService] 获取配置失败 ${category}/${name}:`, error)
      return ""
    }
  }

  /**
   * 获取配置（支持变量替换）
   * @param category 配置分类
   * @param name 配置名称
   * @param variables 变量映射
   * @returns 替换变量后的配置内容
   */
  static async getConfigWithVariables(
    category: string,
    name: string,
    variables: Record<string, string>
  ): Promise<string> {
    let content = await this.getConfig(category, name)

    if (!content) {
      return ""
    }

    // 替换变量
    for (const [key, value] of Object.entries(variables)) {
      // 支持 {{variable}} 和 {variable} 两种格式
      const patterns = [
        new RegExp(`\\{\\{${key}\\}\\}`, "g"),
        new RegExp(`\\{${key}\\}`, "g"),
      ]

      for (const pattern of patterns) {
        content = content.replace(pattern, value || "")
      }
    }

    return content
  }

  /**
   * 获取分类下的所有配置
   * @param category 配置分类
   * @returns 配置列表
   */
  static async getConfigsByCategory(category: string): Promise<PromptConfig[]> {
    try {
      if (typeof db.promptConfig === "undefined") {
        throw new Error("Prisma Client 未正确初始化: db.promptConfig 不存在。请运行 npx prisma generate 并重启服务器")
      }
      
      console.log(`[PromptConfigService] Fetching configs for category: ${category}`)
      const configs = await db.promptConfig.findMany({
        where: {
          category,
          isActive: true,
        },
        orderBy: {
          name: "asc",
        },
      })

      console.log(`[PromptConfigService] Found ${configs.length} configs for category: ${category}`)

      return configs.map((config) => ({
        id: config.id,
        category: config.category,
        name: config.name,
        description: config.description,
        content: config.content,
        variables: (config.variables as string[]) || [],
        isActive: config.isActive,
        version: config.version,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
        updatedBy: config.updatedBy,
      }))
    } catch (error: any) {
      console.error(`[PromptConfigService] 获取分类配置失败 ${category}:`, error)
      console.error(`[PromptConfigService] Error details:`, {
        message: error.message,
        stack: error.stack,
        code: error.code,
      })
      throw error // 重新抛出错误，让调用方处理
    }
  }

  /**
   * 获取所有配置
   * @returns 配置列表
   */
  static async getAllConfigs(): Promise<PromptConfig[]> {
    try {
      if (typeof db.promptConfig === "undefined") {
        throw new Error("Prisma Client 未正确初始化: db.promptConfig 不存在。请运行 npx prisma generate 并重启服务器")
      }
      
      console.log("[PromptConfigService] Fetching all configs from database...")
      const configs = await db.promptConfig.findMany({
        where: {
          isActive: true,
        },
        orderBy: [
          { category: "asc" },
          { name: "asc" },
        ],
      })

      console.log(`[PromptConfigService] Found ${configs.length} active configs`)
      
      return configs.map((config) => ({
        id: config.id,
        category: config.category,
        name: config.name,
        description: config.description,
        content: config.content,
        variables: (config.variables as string[]) || [],
        isActive: config.isActive,
        version: config.version,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
        updatedBy: config.updatedBy,
      }))
    } catch (error: any) {
      console.error("[PromptConfigService] 获取所有配置失败:", error)
      console.error("[PromptConfigService] Error details:", {
        message: error.message,
        stack: error.stack,
        code: error.code,
      })
      throw error // 重新抛出错误，让调用方处理
    }
  }

  /**
   * 清除缓存
   * @param category 可选，指定分类
   * @param name 可选，指定名称
   */
  static clearCache(category?: string, name?: string): void {
    if (category && name) {
      // 清除特定配置的缓存
      const cacheKey = `${category}:${name}`
      configCache.delete(cacheKey)
    } else if (category) {
      // 清除分类下的所有缓存
      for (const key of configCache.keys()) {
        if (key.startsWith(`${category}:`)) {
          configCache.delete(key)
        }
      }
    } else {
      // 清除所有缓存
      configCache.clear()
    }
  }

  /**
   * 获取配置的默认值（用于向后兼容）
   * 当数据库中没有配置时，返回硬编码的默认值
   */
  static getDefaultConfig(category: string, name: string): string {
    // 这里可以返回硬编码的默认值
    // 为了简化，暂时返回空字符串，调用方应该处理
    return ""
  }
}
