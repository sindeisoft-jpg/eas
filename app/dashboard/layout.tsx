"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import {
  Database,
  MessageSquare,
  LogOut,
  BarChart3,
  Brain,
  Users,
  Shield,
  Settings,
  FileSearch,
  Activity,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  User,
  Mail,
  Search,
  Bot,
  FileText,
} from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Avatar } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useTheme } from "next-themes"
import { Logo } from "@/components/logo"
import { useIsMobile } from "@/hooks/use-mobile"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Menu } from "lucide-react"
import { searchItems, type SearchResult } from "@/lib/search-utils"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { BreadcrumbNav } from "@/components/breadcrumb-nav"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, isLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const isMobile = useIsMobile()
  
  const searchResults = searchItems(searchQuery, user?.role)

  // 所有 Hooks 必须在早期返回之前调用
  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login")
    }
  }, [user, isLoading, router])

  // 移动端自动折叠侧边栏
  useEffect(() => {
    if (isMobile) {
      setIsCollapsed(true)
    }
  }, [isMobile])

  // 键盘快捷键监听
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // 检查当前焦点是否在输入框中（textarea、input等）
      const activeElement = document.activeElement
      const isInputFocused = activeElement && (
        activeElement.tagName === "TEXTAREA" ||
        activeElement.tagName === "INPUT" ||
        activeElement.getAttribute("contenteditable") === "true" ||
        activeElement.closest("[contenteditable]")
      )
      
      // 如果焦点在输入框中，不触发搜索快捷键
      if (isInputFocused) {
        return
      }
      
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setSearchOpen((open) => !open)
      }
      if (e.key === "/" && !searchOpen) {
        e.preventDefault()
        setSearchOpen(true)
      }
    }

    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [searchOpen])

  // 早期返回必须在所有 Hooks 之后
  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted">加载中...</div>
      </div>
    )
  }

  const navigation = [
    { name: "智能对话", href: "/dashboard", icon: MessageSquare },
    { name: "数据库连接", href: "/dashboard/databases", icon: Database },
    { name: "模型管理", href: "/dashboard/models", icon: Brain },
    { name: "智能体管理", href: "/dashboard/agents", icon: Bot },
    { name: "数据分析", href: "/dashboard/analytics", icon: BarChart3 },
    ...(user?.role === "admin"
      ? [
          { name: "用户管理", href: "/dashboard/users", icon: Users },
          { name: "权限管理", href: "/dashboard/permissions", icon: Shield },
          { name: "审计日志", href: "/dashboard/audit", icon: FileSearch },
          { name: "系统监控", href: "/dashboard/monitoring", icon: Activity },
          { name: "系统设置", href: "/dashboard/settings", icon: Settings },
        ]
      : []),
  ]

  const SidebarContent = () => (
    <>
        <div className="h-14 flex items-center px-3 border-b border-border/50">
        <div className="flex items-center gap-2 w-full justify-center">
          {isCollapsed && !isMobile ? (
            <Button
              variant="ghost"
              className="h-9 w-full rounded-lg hover:bg-primary/10 hover:text-primary transition-all flex items-center justify-center"
              onClick={() => setIsCollapsed(!isCollapsed)}
              title="展开侧边栏"
            >
              <span
                className="font-bold text-base tracking-tight"
                style={{
                  background: "linear-gradient(135deg, #9333ea 0%, #a855f7 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                紫
              </span>
            </Button>
          ) : (
            <>
              {!isMobile && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-lg hover:bg-primary/10 hover:text-primary transition-all"
                  onClick={() => setIsCollapsed(!isCollapsed)}
                >
                  <ChevronLeft className="w-5 h-5 text-muted-foreground" />
                </Button>
              )}
              <div className="flex items-center gap-2">
                <Logo size="sm" showText={false} />
                <span className="font-bold text-foreground text-lg tracking-tight gradient-text">BI系统</span>
              </div>
            </>
          )}
        </div>
      </div>

      {(!isCollapsed || isMobile) && (
        <div 
          className="p-3 border-b border-primary/20"
          style={{
            minHeight: '60px',
            boxSizing: 'border-box',
          }}
        >
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/60 z-10" />
              <input
                type="text"
                placeholder="搜索功能或页面..."
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-background/50 backdrop-blur-sm border border-primary/20 focus:border-primary focus:ring-2 focus:ring-primary/20 text-sm transition-all shadow-sm cursor-pointer placeholder:text-muted-foreground/60"
                onClick={() => setSearchOpen(true)}
                readOnly
                aria-label="搜索"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs text-muted-foreground/50 pointer-events-none">
                <kbd className="px-1.5 py-0.5 rounded bg-muted/50 border border-border/50 text-[10px]">⌘K</kbd>
              </div>
            </div>
        </div>
      )}

      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => isMobile && setMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 relative group ${
                isActive
                  ? "bg-primary/10 text-primary font-semibold shadow-sm"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
              title={isCollapsed && !isMobile ? item.name : undefined}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />
              )}
              <item.icon className={`w-4 h-4 flex-shrink-0 transition-colors ${isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
              {(!isCollapsed || isMobile) && <span className="text-sm font-medium leading-none">{item.name}</span>}
            </Link>
          )
        })}
      </nav>

      <div className="p-3 border-t border-border/50">
        {(!isCollapsed || isMobile) ? (
          <>
            <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors">
              <Avatar className="w-9 h-9 bg-gradient-to-br from-primary to-primary-light text-white flex items-center justify-center text-xs font-semibold ring-1 ring-primary/20">
                {user.name.charAt(0)}
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate leading-tight">{user.name}</div>
                <div className="text-xs text-muted-foreground truncate capitalize leading-tight">{user.role}</div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Avatar className="w-9 h-9 bg-gradient-to-br from-primary to-primary-light text-white flex items-center justify-center text-xs font-semibold ring-1 ring-primary/20">
              {user.name.charAt(0)}
            </Avatar>
          </div>
        )}
      </div>
    </>
  )

  return (
    <div className="min-h-screen bg-background relative">
      {/* Premium gradient overlay */}
      <div className="fixed inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/3 pointer-events-none" />
      
      {/* Mobile Sidebar - Drawer */}
      {isMobile ? (
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="fixed top-4 left-4 z-50 h-9 w-9 rounded-lg hover:bg-primary/10 hover:text-primary transition-all md:hidden"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0 bg-sidebar/90 backdrop-blur-xl border-r border-primary/20">
            <SidebarContent />
          </SheetContent>
        </Sheet>
      ) : (
        /* Desktop Sidebar - Fixed */
        <aside
          className={`fixed left-0 top-0 h-screen bg-sidebar/90 backdrop-blur-xl border-r border-primary/20 flex flex-col transition-all duration-300 ease-in-out shadow-premium-lg z-40 ${
            isCollapsed ? "w-16" : "w-72"
          }`}
        >
          <SidebarContent />
        </aside>
      )}

      {/* Main content with header */}
      <div className={`transition-all duration-300 flex flex-col h-screen ${isMobile ? "ml-0" : isCollapsed ? "ml-16" : "ml-72"}`}>
        {/* Top header bar - Premium Purple Theme */}
        <header className="sticky top-0 z-50 w-full bg-background/95 backdrop-blur-xl supports-[backdrop-filter]:bg-background/90 border-b border-border/50 relative flex-shrink-0">
          <div className="flex h-14 items-center justify-between px-4 md:px-6 gap-4">
            {/* 面包屑导航 */}
            <div className="flex items-center gap-4 flex-1 min-w-0">
              {isMobile && (
                <div className="flex items-center gap-2.5 flex-shrink-0">
                  <Logo size="sm" showText={false} />
                  <span className="font-bold text-foreground text-base tracking-tight gradient-text">BI系统</span>
                </div>
              )}
              <BreadcrumbNav className="hidden md:flex" />
              {!isMobile && !isCollapsed && (
                <div className="text-sm font-medium text-muted-foreground ml-2 hidden lg:block">历史记录</div>
              )}
            </div>

            <div className="flex items-center gap-1 ml-auto">
              {/* Theme toggle */}
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-lg hover:bg-primary/10 hover:text-primary transition-all"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  // 使用 resolvedTheme 来判断当前实际主题，如果未解析则使用 theme
                  const currentTheme = resolvedTheme || theme
                  // 点击切换：深色变浅色，浅色变深色
                  setTheme(currentTheme === "dark" ? "light" : "dark")
                }}
              >
                {mounted ? (
                  (resolvedTheme || theme) === "dark" ? (
                    <Sun className="h-4 w-4" />
                  ) : (
                    <Moon className="h-4 w-4" />
                  )
                ) : (
                  <Sun className="h-4 w-4" />
                )}
                <span className="sr-only">切换主题</span>
              </Button>

              {/* User menu */}
              <DropdownMenu open={userMenuOpen} onOpenChange={setUserMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="relative h-9 w-9 rounded-lg hover:bg-primary/10 transition-all p-0"
                  >
                    <Avatar className="h-9 w-9 bg-gradient-to-br from-primary to-primary-light text-white flex items-center justify-center text-sm font-bold ring-2 ring-primary/30 shadow-premium">
                      {user.name.charAt(0)}
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56 rounded-lg border border-border/50 bg-card/95 backdrop-blur-xl shadow-lg" align="end">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{user.name}</p>
                      <p className="text-xs leading-none text-muted-foreground flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {user.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/settings" className="cursor-pointer rounded-lg hover:bg-primary/5">
                      <Settings className="mr-2 h-4 w-4" />
                      <span>系统设置</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={async () => {
                      await logout()
                      router.push("/login")
                    }}
                    className="cursor-pointer rounded-lg hover:bg-destructive/10 hover:text-destructive"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>退出登录</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className={`flex-1 overflow-y-auto min-h-0 ${pathname === "/dashboard" ? "" : "pl-[50px]"}`}>{children}</main>
      </div>

      {/* 全局搜索对话框 */}
      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
        <CommandInput 
          placeholder="搜索页面、功能..." 
          value={searchQuery}
          onValueChange={setSearchQuery}
        />
        <CommandList>
          <CommandEmpty>没有找到结果</CommandEmpty>
          <CommandGroup heading="页面">
            {searchResults
              .filter((item) => item.type === "page")
              .map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.title}
                  onSelect={() => {
                    if (item.href) {
                      router.push(item.href)
                      setSearchOpen(false)
                      setSearchQuery("")
                    }
                  }}
                  className="flex items-center gap-3"
                >
                  <span className="text-sm font-medium">{item.title}</span>
                  {item.description && (
                    <span className="text-xs text-muted-foreground ml-auto">
                      {item.description}
                    </span>
                  )}
                </CommandItem>
              ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>

    </div>
  )
}
