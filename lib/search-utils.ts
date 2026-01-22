import { useRouter } from "next/navigation"

export interface SearchResult {
  id: string
  type: "page" | "feature" | "action"
  title: string
  description?: string
  href?: string
  icon?: string
  keywords?: string[]
}

// 定义可搜索的页面和功能
export const searchableItems: SearchResult[] = [
  {
    id: "chat",
    type: "page",
    title: "智能对话",
    description: "使用自然语言查询数据",
    href: "/dashboard",
    icon: "MessageSquare",
    keywords: ["对话", "聊天", "查询", "提问", "chat"],
  },
  {
    id: "databases",
    type: "page",
    title: "数据库连接",
    description: "管理数据库连接配置",
    href: "/dashboard/databases",
    icon: "Database",
    keywords: ["数据库", "连接", "配置", "database", "db"],
  },
  {
    id: "models",
    type: "page",
    title: "模型管理",
    description: "配置AI模型连接",
    href: "/dashboard/models",
    icon: "Brain",
    keywords: ["模型", "AI", "LLM", "model", "ai"],
  },
  {
    id: "agents",
    type: "page",
    title: "智能体管理",
    description: "创建和管理AI智能体",
    href: "/dashboard/agents",
    icon: "Bot",
    keywords: ["智能体", "agent", "机器人", "bot"],
  },
  {
    id: "analytics",
    type: "page",
    title: "数据分析",
    description: "查看数据分析活动",
    href: "/dashboard/analytics",
    icon: "BarChart3",
    keywords: ["分析", "数据", "统计", "analytics", "stats"],
  },
  {
    id: "users",
    type: "page",
    title: "用户管理",
    description: "管理系统用户",
    href: "/dashboard/users",
    icon: "Users",
    keywords: ["用户", "user", "成员", "member"],
  },
  {
    id: "permissions",
    type: "page",
    title: "权限管理",
    description: "管理用户权限",
    href: "/dashboard/permissions",
    icon: "Shield",
    keywords: ["权限", "permission", "角色", "role"],
  },
  {
    id: "audit",
    type: "page",
    title: "审计日志",
    description: "查看系统操作日志",
    href: "/dashboard/audit",
    icon: "FileSearch",
    keywords: ["审计", "日志", "audit", "log"],
  },
  {
    id: "monitoring",
    type: "page",
    title: "系统监控",
    description: "监控系统性能",
    href: "/dashboard/monitoring",
    icon: "Activity",
    keywords: ["监控", "monitoring", "性能", "performance"],
  },
  {
    id: "settings",
    type: "page",
    title: "系统设置",
    description: "系统配置和设置",
    href: "/dashboard/settings",
    icon: "Settings",
    keywords: ["设置", "settings", "配置", "config"],
  },
]

/**
 * 搜索功能
 */
export function searchItems(query: string, userRole?: string): SearchResult[] {
  if (!query.trim()) {
    return []
  }

  const lowerQuery = query.toLowerCase().trim()
  
  // 过滤结果（根据用户角色）
  let filteredItems = searchableItems.filter((item) => {
    // 管理员可以看到所有页面
    if (userRole === "admin") {
      return true
    }
    // 普通用户只能看到非管理员页面
    if (item.id === "users" || item.id === "permissions" || item.id === "audit" || item.id === "monitoring" || item.id === "settings") {
      return false
    }
    return true
  })

  // 搜索匹配
  const results = filteredItems
    .map((item) => {
      const titleMatch = item.title.toLowerCase().includes(lowerQuery)
      const descMatch = item.description?.toLowerCase().includes(lowerQuery)
      const keywordMatch = item.keywords?.some((kw) => kw.toLowerCase().includes(lowerQuery))
      
      let score = 0
      if (item.title.toLowerCase() === lowerQuery) {
        score = 100 // 完全匹配标题
      } else if (item.title.toLowerCase().startsWith(lowerQuery)) {
        score = 80 // 标题开头匹配
      } else if (titleMatch) {
        score = 60 // 标题包含
      } else if (keywordMatch) {
        score = 40 // 关键词匹配
      } else if (descMatch) {
        score = 20 // 描述匹配
      }

      return { item, score }
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item)

  return results
}
