"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { DatabaseConnection } from "@/lib/types"
import { storage } from "@/lib/storage"
import { apiClient } from "@/lib/api-client"
import { Loader2, CheckCircle2, XCircle, Database } from "lucide-react"

interface DatabaseConnectionDialogProps {
  open: boolean
  onClose: () => void
  connection?: DatabaseConnection
  organizationId: string
  userId: string
}

export function DatabaseConnectionDialog({
  open,
  onClose,
  connection,
  organizationId,
  userId,
}: DatabaseConnectionDialogProps) {
  const [formData, setFormData] = useState({
    name: "",
    type: "postgresql" as DatabaseConnection["type"],
    host: "",
    port: 5432,
    database: "",
    username: "",
    password: "",
    ssl: true,
    isDefault: false,
  })
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [availableDatabases, setAvailableDatabases] = useState<string[]>([])
  const [showDatabaseSelect, setShowDatabaseSelect] = useState(false)
  const [originalPasswordLength, setOriginalPasswordLength] = useState<number>(0)
  const [isPasswordModified, setIsPasswordModified] = useState(false)

  useEffect(() => {
    if (connection) {
      const passwordLength = connection.password ? connection.password.length : 0
      setOriginalPasswordLength(passwordLength)
      setIsPasswordModified(false)
      setFormData({
        name: connection.name,
        type: connection.type,
        host: connection.host,
        port: connection.port,
        database: connection.database,
        username: connection.username,
        password: connection.password,
        ssl: connection.ssl,
        isDefault: connection.isDefault || false,
      })
      setShowDatabaseSelect(false)
      setAvailableDatabases([])
    } else {
      setOriginalPasswordLength(0)
      setIsPasswordModified(false)
      setFormData({
        name: "",
        type: "postgresql",
        host: "",
        port: 5432,
        database: "",
        username: "",
        password: "",
        ssl: true,
        isDefault: false,
      })
      setShowDatabaseSelect(false)
      setAvailableDatabases([])
      setTestResult(null)
    }
  }, [connection, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // 如果是新建连接，要求先测试连接
    if (!connection && !testResult?.success) {
      setTestResult({
        success: false,
        message: "请先测试连接，确保连接成功后再保存",
      })
      return
    }

    // 验证必填字段
    if (!formData.name || !formData.type || !formData.host || !formData.database || !formData.username || !formData.password) {
      setTestResult({
        success: false,
        message: "请填写所有必填字段",
      })
      return
    }

    // 如果是新建连接，不传递 id，让后端生成
    const connectionData: any = {
      ...formData,
      organizationId,
      createdBy: userId,
    }

    // 如果是更新连接，需要传递 id
    if (connection?.id) {
      connectionData.id = connection.id
    }

    try {
      if (connection?.id) {
        // 更新现有连接
        await storage.dbConnections.save({
          ...connectionData,
          id: connection.id,
          createdAt: connection.createdAt,
          lastTestedAt: new Date().toISOString(),
          status: testResult?.success ? "connected" : connection.status || "disconnected",
          metadata: connection.metadata || {
            tables: [],
            schemas: [],
          },
        } as DatabaseConnection)
      } else {
        // 创建新连接 - 不传递 id，让后端生成
        await storage.dbConnections.save({
          ...connectionData,
          lastTestedAt: new Date().toISOString(),
          status: testResult?.success ? "connected" : "disconnected",
          metadata: {
            tables: [],
            schemas: [],
          },
        } as DatabaseConnection)
      }
      
      // 重置状态
      setTestResult(null)
      setShowDatabaseSelect(false)
      setAvailableDatabases([])
      onClose()
    } catch (error: any) {
      console.error("Failed to save database connection:", error)
      setTestResult({
        success: false,
        message: error.message || "保存失败，请重试",
      })
    }
  }

  const handleTypeChange = (type: string) => {
    const ports: Record<string, number> = {
      postgresql: 5432,
      mysql: 3306,
      sqlserver: 1433,
      sqlite: 0,
    }
    setFormData({ ...formData, type: type as DatabaseConnection["type"], port: ports[type] || 5432 })
    setTestResult(null)
    setShowDatabaseSelect(false)
    setAvailableDatabases([])
  }

  const handleTestConnection = async () => {
    if (!formData.host || !formData.username || !formData.password) {
      setTestResult({
        success: false,
        message: "请先填写主机地址、用户名和密码",
      })
      return
    }

    setIsTesting(true)
    setTestResult(null)
    setAvailableDatabases([])
    setShowDatabaseSelect(false)

    try {
      const result = await apiClient.testDatabaseConnection({
        type: formData.type,
        host: formData.host,
        port: formData.port,
        username: formData.username,
        password: formData.password,
        ssl: formData.ssl,
        database: formData.database,
      })

      if (result.success || result.databases) {
        setTestResult({
          success: true,
          message: result.message || "连接成功！",
        })

        // 如果返回了数据库列表，显示下拉选择
        if (result.databases && result.databases.length > 0) {
          setAvailableDatabases(result.databases)
          setShowDatabaseSelect(true)
          // 如果当前没有选择数据库，自动选择第一个
          if (!formData.database && result.databases.length > 0) {
            setFormData({ ...formData, database: result.databases[0] })
          }
        }
      } else {
        setTestResult({
          success: false,
          message: result.message || "连接失败",
        })
      }
    } catch (error: any) {
      console.error("Test connection error:", error)
      setTestResult({
        success: false,
        message: error.message || "测试连接失败，请检查连接信息",
      })
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh]" style={{ maxWidth: '680px', width: 'calc(100% - 2rem)' }}>
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold tracking-tight">{connection ? "编辑数据库连接" : "添加数据库连接"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="overflow-y-auto max-h-[calc(90vh-12rem)] pr-2">
          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-2 col-span-2">
              <Label htmlFor="name" className="text-sm font-medium">连接名称</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="生产数据库"
                required
                className="h-11 rounded-xl border-2 focus:border-primary transition-all"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type" className="text-sm font-medium">数据库类型</Label>
              <Select value={formData.type} onValueChange={handleTypeChange}>
                <SelectTrigger className="h-11 rounded-xl border-2 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl z-[101]">
                  <SelectItem value="postgresql">PostgreSQL</SelectItem>
                  <SelectItem value="mysql">MySQL</SelectItem>
                  <SelectItem value="sqlserver">SQL Server</SelectItem>
                  <SelectItem value="sqlite">SQLite</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="host" className="text-sm font-medium">主机地址</Label>
              <Input
                id="host"
                value={formData.host}
                onChange={(e) => {
                  setFormData({ ...formData, host: e.target.value })
                  setTestResult(null)
                  setShowDatabaseSelect(false)
                }}
                placeholder="localhost 或 db.example.com"
                required
                className="h-11 rounded-xl border-2 focus:border-primary transition-all"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="port" className="text-sm font-medium">端口</Label>
              <Input
                id="port"
                type="number"
                value={formData.port}
                onChange={(e) => {
                  setFormData({ ...formData, port: Number.parseInt(e.target.value) })
                  setTestResult(null)
                  setShowDatabaseSelect(false)
                }}
                required
                className="h-11 rounded-xl border-2 focus:border-primary transition-all"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="database" className="text-sm font-medium">数据库名称</Label>
              {showDatabaseSelect && availableDatabases.length > 0 ? (
                <Select
                  value={formData.database}
                  onValueChange={(value) => setFormData({ ...formData, database: value })}
                >
                  <SelectTrigger className="h-11 rounded-xl border-2 w-full">
                    <SelectValue placeholder="选择数据库..." />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl z-[101]">
                    {availableDatabases.map((db) => (
                      <SelectItem key={db} value={db}>
                        <div className="flex items-center gap-2">
                          <Database className="w-4 h-4" />
                          {db}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="database"
                  value={formData.database}
                  onChange={(e) => setFormData({ ...formData, database: e.target.value })}
                  placeholder="my_database 或点击测试连接自动获取"
                  required
                  className="h-11 rounded-xl border-2 focus:border-primary transition-all"
                />
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-medium">用户名</Label>
              <Input
                id="username"
                value={formData.username}
                onChange={(e) => {
                  setFormData({ ...formData, username: e.target.value })
                  setTestResult(null)
                  setShowDatabaseSelect(false)
                }}
                placeholder="db_user"
                required
                className="h-11 rounded-xl border-2 focus:border-primary transition-all"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">密码</Label>
              <Input
                id="password"
                type={connection && !isPasswordModified && originalPasswordLength > 0 ? "text" : "password"}
                value={
                  connection && !isPasswordModified && originalPasswordLength > 0
                    ? "•".repeat(originalPasswordLength)
                    : formData.password
                }
                onChange={(e) => {
                  setIsPasswordModified(true)
                  setFormData({ ...formData, password: e.target.value })
                  setTestResult(null)
                  setShowDatabaseSelect(false)
                }}
                onFocus={(e) => {
                  if (connection && !isPasswordModified && originalPasswordLength > 0) {
                    // 用户聚焦输入框，切换到密码模式并显示实际密码值
                    setIsPasswordModified(true)
                    // 延迟设置以确保输入框类型已更改
                    setTimeout(() => {
                      setFormData({ ...formData, password: connection.password })
                    }, 0)
                  }
                }}
                placeholder="••••••••"
                required
                className="h-11 rounded-xl border-2 focus:border-primary transition-all"
              />
            </div>

            <div className="space-y-2 col-span-2">
              <div className="flex items-center gap-2">
                <input
                  id="ssl"
                  type="checkbox"
                  checked={formData.ssl}
                  onChange={(e) => setFormData({ ...formData, ssl: e.target.checked })}
                  className="w-4 h-4 rounded border-border"
                />
                <Label htmlFor="ssl" className="cursor-pointer">
                  启用 SSL/TLS
                </Label>
              </div>
              <p className="text-xs text-muted">推荐用于生产环境数据库</p>
            </div>

            <div className="space-y-2 col-span-2">
              <div className="flex items-center gap-2">
                <input
                  id="isDefault"
                  type="checkbox"
                  checked={formData.isDefault}
                  onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                  className="w-4 h-4 rounded border-border"
                />
                <Label htmlFor="isDefault" className="cursor-pointer">
                  设为默认数据库
                </Label>
              </div>
              <p className="text-xs text-muted">默认数据库将在对话页面自动被选中</p>
            </div>

            {/* 测试连接结果 */}
            {testResult && (
              <div className="col-span-2">
                <div
                  className={`flex items-center gap-2 p-4 rounded-xl border-2 ${
                    testResult.success
                      ? "bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-400"
                      : "bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-400"
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <XCircle className="w-5 h-5" />
                  )}
                  <span className="text-sm font-medium">{testResult.message}</span>
                </div>
              </div>
            )}
          </div>
          </div>

          <div className="flex justify-between items-center pt-6 border-t border-border/50">
            <Button
              type="button"
              variant="outline"
              onClick={handleTestConnection}
              disabled={isTesting || !formData.host || !formData.username || !formData.password}
              className="rounded-xl border-2 hover:bg-muted/50 transition-all"
            >
              {isTesting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  测试中...
                </>
              ) : (
                "测试连接"
              )}
            </Button>
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={onClose} className="rounded-xl border-2 hover:bg-muted/50 transition-all">
                取消
              </Button>
              <Button 
                type="submit" 
                disabled={!testResult?.success && !connection}
                className="rounded-xl shadow-lg hover:shadow-xl transition-all duration-200"
              >
                {connection ? "更新连接" : "添加连接"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
