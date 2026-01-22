"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight, Home } from "lucide-react"
import { cn } from "@/lib/utils"

interface BreadcrumbItem {
  label: string
  href?: string
}

interface BreadcrumbNavProps {
  items?: BreadcrumbItem[]
  className?: string
}

const routeLabels: Record<string, string> = {
  "/dashboard": "智能对话",
  "/dashboard/databases": "数据库连接",
  "/dashboard/models": "模型管理",
  "/dashboard/agents": "智能体管理",
  "/dashboard/analytics": "数据分析",
  "/dashboard/users": "用户管理",
  "/dashboard/permissions": "权限管理",
  "/dashboard/audit": "审计日志",
  "/dashboard/monitoring": "系统监控",
  "/dashboard/settings": "系统设置",
}

export function BreadcrumbNav({ items, className }: BreadcrumbNavProps) {
  const pathname = usePathname()
  
  const breadcrumbs = React.useMemo(() => {
    if (items) {
      return items
    }

    const paths = pathname.split("/").filter(Boolean)
    const crumbs: BreadcrumbItem[] = []

    // 如果路径就是 /dashboard，只显示首页，不重复添加
    if (pathname === "/dashboard") {
      return [{ label: "首页", href: "/dashboard" }]
    }

    // 添加首页
    crumbs.push({ label: "首页", href: "/dashboard" })

    let currentPath = ""
    paths.forEach((path, index) => {
      currentPath += `/${path}`
      // 跳过 /dashboard，因为已经在首页中显示了
      if (currentPath === "/dashboard") {
        return
      }
      const label = routeLabels[currentPath] || path
      const isLast = index === paths.length - 1
      crumbs.push({
        label,
        href: isLast ? undefined : currentPath,
      })
    })

    return crumbs
  }, [pathname, items])

  if (breadcrumbs.length <= 1) {
    return null
  }

  return (
    <nav
      aria-label="面包屑导航"
      className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}
    >
      {breadcrumbs.map((crumb, index) => {
        const isLast = index === breadcrumbs.length - 1
        // 使用 index 和 href/label 组合确保唯一性
        const uniqueKey = `${index}-${crumb.href || crumb.label}`

        return (
          <React.Fragment key={uniqueKey}>
            {index === 0 ? (
              <Link
                href={crumb.href || "/dashboard"}
                className="flex items-center gap-1 hover:text-foreground transition-colors"
              >
                <Home className="h-4 w-4" />
                <span className="sr-only">首页</span>
              </Link>
            ) : (
              <>
                <ChevronRight className="h-4 w-4" />
                {isLast ? (
                  <span className="text-foreground font-medium">{crumb.label}</span>
                ) : (
                  <Link
                    href={crumb.href || "#"}
                    className="hover:text-foreground transition-colors"
                  >
                    {crumb.label}
                  </Link>
                )}
              </>
            )}
          </React.Fragment>
        )
      })}
    </nav>
  )
}
