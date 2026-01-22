"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useAuth } from "@/lib/auth-context"
import { storage } from "@/lib/storage"
import type { DatabaseConnection, LLMConnection, Agent } from "@/lib/types"
import { toast } from "@/components/ui/use-toast"
import dynamic from "next/dynamic"

// 懒加载大型组件
const ChatInterface = dynamic(
  () => import("@/components/chat-interface").then((mod) => ({ default: mod.ChatInterface })),
  {
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    ),
    ssr: false,
  }
)

const Onboarding = dynamic(
  () => import("@/components/onboarding").then((mod) => ({ default: mod.Onboarding })),
  {
    ssr: false,
  }
)

export default function DashboardPage() {
  const { user } = useAuth()
  const [connections, setConnections] = useState<DatabaseConnection[]>([])
  const [llmConnections, setLlmConnections] = useState<LLMConnection[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  
  // 使用 ref 来存储防抖定时器
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const lastLoadTimeRef = useRef<number>(0)
  const LOAD_DEBOUNCE_MS = 500 // 防抖延迟 500ms
  const MIN_LOAD_INTERVAL_MS = 2000 // 最小加载间隔 2秒

  const loadData = useCallback(async () => {
    if (!user) return
    
    // 防抖：如果距离上次加载时间太短，取消本次加载
    const now = Date.now()
    if (now - lastLoadTimeRef.current < MIN_LOAD_INTERVAL_MS) {
      return
    }
    
    try {
      // 加载数据库连接 - 只显示已配置的
      const allConnections = await storage.dbConnections.getAll()
      const userConnections = allConnections.filter(
        (conn) => conn.organizationId === user.organizationId && conn.status !== "error"
      )
      setConnections(userConnections)

      // 加载 LLM 模型连接 - 只显示已配置且激活的
      const allModels = await storage.llmConnections.getAll()
      const activeModels = allModels.filter(
        (model) => model.organizationId === user.organizationId && model.status === "active"
      )
      setLlmConnections(activeModels)

      // 加载智能体 - 只显示已激活的
      const allAgents = await storage.agents.getAll()
      const activeAgents = allAgents.filter(
        (agent) => agent.organizationId === user.organizationId && agent.status === "active"
      )
      setAgents(activeAgents)
      
      lastLoadTimeRef.current = now
    } catch (error) {
      // 在生产环境中，应该使用更好的错误处理机制
      if (process.env.NODE_ENV === "development") {
        console.error("Failed to load data:", error)
      }
    }
  }, [user])

  useEffect(() => {
    if (user) {
      loadData()
    }
  }, [user, loadData])

  // 当页面重新获得焦点时，刷新智能体列表（确保使用最新的配置）
  useEffect(() => {
    if (!user) return

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // 清除之前的定时器
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current)
        }
        // 防抖：延迟执行加载
        debounceTimerRef.current = setTimeout(() => {
          loadData()
        }, LOAD_DEBOUNCE_MS)
      }
    }

    const handleFocus = () => {
      // 清除之前的定时器
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      // 防抖：延迟执行加载
      debounceTimerRef.current = setTimeout(() => {
        loadData()
      }, LOAD_DEBOUNCE_MS)
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("focus", handleFocus)

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("focus", handleFocus)
    }
  }, [user, loadData])

  const handleSaveReport = useCallback(async (sql: string, result: any, title: string) => {
    try {
      const report = {
        title,
        sql,
        databaseConnectionId: connections[0]?.id || "",
        isPublic: false,
        tags: [],
      }
      await storage.reports.save(report as any)
      toast({
        title: "成功",
        description: "报表保存成功！",
      })
    } catch (error) {
      // 在生产环境中，应该使用更好的错误处理机制
      if (process.env.NODE_ENV === "development") {
        console.error("Failed to save report:", error)
      }
      toast({
        title: "错误",
        description: "报表保存失败",
        variant: "destructive",
      })
    }
  }, [connections])

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Onboarding />
      <ChatInterface
        connections={connections}
        llmConnections={llmConnections}
        agents={agents}
        userId={user ? user.id : ""}
        organizationId={user ? user.organizationId : ""}
        onSaveReport={handleSaveReport}
      />
    </div>
  )
}
