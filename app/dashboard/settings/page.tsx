"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Settings, Database, Shield, Bell, Zap, Loader2, Eye, EyeOff } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { apiClient } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"

export default function SettingsPage() {
  const { user } = useAuth()
  const [settings, setSettings] = useState({
    queryCache: {
      enabled: true,
      ttl: 300,
      maxSize: 100,
    },
    performance: {
      maxConcurrentQueries: 5,
      defaultTimeout: 30,
      enableQueryOptimization: true,
    },
    security: {
      enableSQLValidation: true,
      requireApprovalForDangerousOps: true,
      enableAuditLog: true,
      sessionTimeout: 60,
    },
    alerts: {
      enabled: true,
      slowQueryThreshold: 10,
      errorRateThreshold: 5,
      notificationChannels: ["email"],
    },
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  
  // 用户界面设置（存储在 localStorage）
  const [uiSettings, setUiSettings] = useState({
    showSqlDetails: typeof window !== "undefined" 
      ? localStorage.getItem("chat_show_sql_details") !== "false" 
      : true,
  })

  useEffect(() => {
    const loadSettings = async () => {
      if (user?.role !== "admin") {
        setIsLoading(false)
        return
      }
      try {
        const data = await apiClient.getSettings()
        if (data.settings) {
          setSettings({
            queryCache: data.settings.queryCache as any,
            performance: data.settings.performance as any,
            security: data.settings.security as any,
            alerts: data.settings.alerts as any,
          })
        }
      } catch (error) {
        console.error("Failed to load settings:", error)
      } finally {
        setIsLoading(false)
      }
    }
    loadSettings()
  }, [user])

  const handleSave = async () => {
    if (user?.role !== "admin") {
      alert("无权限")
      return
    }
    setIsSaving(true)
    try {
      await apiClient.updateSettings(settings)
      alert("设置已保存")
    } catch (error: any) {
      console.error("Failed to save settings:", error)
      alert("保存设置失败: " + (error.message || "未知错误"))
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    )
  }

  if (user?.role !== "admin") {
    return (
      <div className="p-8">
        <div className="max-w-4xl mx-auto">
          <Card className="p-8 text-center">
            <h2 className="text-xl font-semibold mb-2">无权限</h2>
            <p className="text-muted">只有管理员可以访问系统设置</p>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">系统设置</h1>
            <p className="text-muted mt-1">配置系统性能、安全性和告警规则</p>
          </div>
          <Button onClick={handleSave} className="gap-2" disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <Settings className="w-4 h-4" />
                保存设置
              </>
            )}
          </Button>
        </div>

        <Tabs defaultValue="ui" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="ui" className="gap-2">
              <Eye className="w-4 h-4" />
              界面
            </TabsTrigger>
            <TabsTrigger value="performance" className="gap-2">
              <Zap className="w-4 h-4" />
              性能
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-2">
              <Shield className="w-4 h-4" />
              安全
            </TabsTrigger>
            <TabsTrigger value="cache" className="gap-2">
              <Database className="w-4 h-4" />
              缓存
            </TabsTrigger>
            <TabsTrigger value="alerts" className="gap-2">
              <Bell className="w-4 h-4" />
              告警
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ui">
            <Card className="p-6 space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-4">界面设置</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base">显示 SQL 查询详细信息</Label>
                      <p className="text-sm text-muted">
                        在聊天界面中显示 SQL 查询的完整信息，包括 explanation、sql 和 reasoning 字段
                      </p>
                    </div>
                    <Switch
                      checked={uiSettings.showSqlDetails}
                      onCheckedChange={(checked) => {
                        const newSettings = { ...uiSettings, showSqlDetails: checked }
                        setUiSettings(newSettings)
                        if (typeof window !== "undefined") {
                          localStorage.setItem("chat_show_sql_details", String(checked))
                          // 触发自定义事件，通知其他组件设置已更改
                          window.dispatchEvent(new CustomEvent("chatSettingsChanged", { 
                            detail: { showSqlDetails: checked } 
                          }))
                        }
                      }}
                    />
                  </div>
                  <div className="bg-muted/30 border border-border/50 rounded-none p-4">
                    <p className="text-sm text-muted-foreground">
                      {uiSettings.showSqlDetails ? (
                        <>
                          <Eye className="w-4 h-4 inline mr-2" />
                          当前显示模式：<strong>详细模式</strong> - 将显示完整的 SQL 查询信息，包括查询说明、SQL 语句和推理过程
                        </>
                      ) : (
                        <>
                          <EyeOff className="w-4 h-4 inline mr-2" />
                          当前显示模式：<strong>简洁模式</strong> - 只显示查询说明，隐藏 SQL 语句和推理过程
                        </>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="performance">
            <Card className="p-6 space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-4">性能配置</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base">启用查询优化</Label>
                      <p className="text-sm text-muted">自动优化SQL查询以提高性能</p>
                    </div>
                    <Switch
                      checked={settings.performance.enableQueryOptimization}
                      onCheckedChange={(checked) =>
                        setSettings({
                          ...settings,
                          performance: { ...settings.performance, enableQueryOptimization: checked },
                        })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="maxConcurrentQueries">最大并发查询数</Label>
                    <Input
                      id="maxConcurrentQueries"
                      type="number"
                      value={settings.performance.maxConcurrentQueries}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          performance: { ...settings.performance, maxConcurrentQueries: Number(e.target.value) },
                        })
                      }
                      min={1}
                      max={20}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="defaultTimeout">默认查询超时时间（秒）</Label>
                    <Input
                      id="defaultTimeout"
                      type="number"
                      value={settings.performance.defaultTimeout}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          performance: { ...settings.performance, defaultTimeout: Number(e.target.value) },
                        })
                      }
                      min={5}
                      max={300}
                    />
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="security">
            <Card className="p-6 space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-4">安全配置</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base">启用SQL验证</Label>
                      <p className="text-sm text-muted">在执行前验证SQL安全性</p>
                    </div>
                    <Switch
                      checked={settings.security.enableSQLValidation}
                      onCheckedChange={(checked) =>
                        setSettings({
                          ...settings,
                          security: { ...settings.security, enableSQLValidation: checked },
                        })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base">危险操作需要审批</Label>
                      <p className="text-sm text-muted">DROP、DELETE等操作需要管理员审批</p>
                    </div>
                    <Switch
                      checked={settings.security.requireApprovalForDangerousOps}
                      onCheckedChange={(checked) =>
                        setSettings({
                          ...settings,
                          security: { ...settings.security, requireApprovalForDangerousOps: checked },
                        })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base">启用审计日志</Label>
                      <p className="text-sm text-muted">记录所有数据库操作</p>
                    </div>
                    <Switch
                      checked={settings.security.enableAuditLog}
                      onCheckedChange={(checked) =>
                        setSettings({
                          ...settings,
                          security: { ...settings.security, enableAuditLog: checked },
                        })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="sessionTimeout">会话超时时间（分钟）</Label>
                    <Input
                      id="sessionTimeout"
                      type="number"
                      value={settings.security.sessionTimeout}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          security: { ...settings.security, sessionTimeout: Number(e.target.value) },
                        })
                      }
                      min={5}
                      max={480}
                    />
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="cache">
            <Card className="p-6 space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-4">缓存配置</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base">启用查询缓存</Label>
                      <p className="text-sm text-muted">缓存查询结果以提高响应速度</p>
                    </div>
                    <Switch
                      checked={settings.queryCache.enabled}
                      onCheckedChange={(checked) =>
                        setSettings({
                          ...settings,
                          queryCache: { ...settings.queryCache, enabled: checked },
                        })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cacheTTL">缓存过期时间（秒）</Label>
                    <Input
                      id="cacheTTL"
                      type="number"
                      value={settings.queryCache.ttl}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          queryCache: { ...settings.queryCache, ttl: Number(e.target.value) },
                        })
                      }
                      min={60}
                      max={3600}
                      disabled={!settings.queryCache.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="maxCacheSize">最大缓存大小（MB）</Label>
                    <Input
                      id="maxCacheSize"
                      type="number"
                      value={settings.queryCache.maxSize}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          queryCache: { ...settings.queryCache, maxSize: Number(e.target.value) },
                        })
                      }
                      min={10}
                      max={1000}
                      disabled={!settings.queryCache.enabled}
                    />
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="alerts">
            <Card className="p-6 space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-4">告警配置</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base">启用告警</Label>
                      <p className="text-sm text-muted">系统异常时发送通知</p>
                    </div>
                    <Switch
                      checked={settings.alerts.enabled}
                      onCheckedChange={(checked) =>
                        setSettings({
                          ...settings,
                          alerts: { ...settings.alerts, enabled: checked },
                        })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="slowQueryThreshold">慢查询阈值（秒）</Label>
                    <Input
                      id="slowQueryThreshold"
                      type="number"
                      value={settings.alerts.slowQueryThreshold}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          alerts: { ...settings.alerts, slowQueryThreshold: Number(e.target.value) },
                        })
                      }
                      min={1}
                      max={60}
                      disabled={!settings.alerts.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="errorRateThreshold">错误率阈值（%）</Label>
                    <Input
                      id="errorRateThreshold"
                      type="number"
                      value={settings.alerts.errorRateThreshold}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          alerts: { ...settings.alerts, errorRateThreshold: Number(e.target.value) },
                        })
                      }
                      min={1}
                      max={50}
                      disabled={!settings.alerts.enabled}
                    />
                  </div>

                  <div>
                    <Label className="text-base mb-2 block">通知渠道</Label>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">邮件</Badge>
                      <Badge variant="outline">钉钉（未配置）</Badge>
                      <Badge variant="outline">企业微信（未配置）</Badge>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
