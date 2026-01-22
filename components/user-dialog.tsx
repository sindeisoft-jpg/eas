"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Database, Shield, AlertCircle } from "lucide-react"
import type { User, DataPermission, DatabaseConnection } from "@/lib/types"
import { storage } from "@/lib/storage"
import { apiClient } from "@/lib/api-client"

interface UserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: User | null
  onSuccess: () => void
}

export function UserDialog({ open, onOpenChange, user, onSuccess }: UserDialogProps) {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "viewer" as "admin" | "analyst" | "viewer",
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [permissions, setPermissions] = useState<DataPermission[]>([])
  const [databases, setDatabases] = useState<DatabaseConnection[]>([])
  const [loadingPermissions, setLoadingPermissions] = useState(false)

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name,
        email: user.email,
        password: "",
        confirmPassword: "",
        role: user.role,
      })
    } else {
      setFormData({
        name: "",
        email: "",
        password: "",
        confirmPassword: "",
        role: "viewer",
      })
    }
    setErrors({})
  }, [user, open])

  // 加载权限规则和数据库连接
  useEffect(() => {
    if (open) {
      loadPermissionsAndDatabases()
    }
  }, [open, formData.role])

  const loadPermissionsAndDatabases = async () => {
    setLoadingPermissions(true)
    try {
      const [permissionsData, databasesData] = await Promise.all([
        apiClient.getPermissions().then((r) => r.permissions || []),
        storage.dbConnections.getAll(),
      ])
      
      // 根据用户角色过滤权限规则
      const filteredPermissions = permissionsData.filter(
        (p: DataPermission) => p.role === formData.role
      )
      
      setPermissions(filteredPermissions)
      setDatabases(databasesData)
    } catch (error) {
      console.error("Failed to load permissions:", error)
    } finally {
      setLoadingPermissions(false)
    }
  }

  const getDatabaseName = (dbId: string) => {
    return databases.find((d) => d.id === dbId)?.name || dbId
  }

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.name.trim()) {
      newErrors.name = "用户名不能为空"
    }

    if (!formData.email.trim()) {
      newErrors.email = "邮箱地址不能为空"
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "邮箱格式不正确"
    }

    // 创建用户时，密码必填
    if (!user) {
      if (!formData.password) {
        newErrors.password = "密码不能为空"
      } else if (formData.password.length < 6) {
        newErrors.password = "密码长度至少6位"
      }

      if (!formData.confirmPassword) {
        newErrors.confirmPassword = "请确认密码"
      } else if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = "两次输入的密码不一致"
      }
    } else {
      // 编辑用户时，如果填写了密码，需要验证
      if (formData.password) {
        if (formData.password.length < 6) {
          newErrors.password = "密码长度至少6位"
        }
        if (formData.password !== formData.confirmPassword) {
          newErrors.confirmPassword = "两次输入的密码不一致"
        }
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    try {
      // 构建用户数据
      const userData: any = {
        name: formData.name,
        email: formData.email,
        role: formData.role,
      }

      // 创建用户时，必须包含密码
      if (!user) {
        userData.password = formData.password
        // 创建用户，直接调用 API
        await apiClient.createUser(userData)
      } else {
        // 编辑用户时，如果填写了密码，才更新密码
        if (formData.password) {
          userData.password = formData.password
        }
        // 更新用户，直接调用 API
        await apiClient.updateUser(user.id, userData)
      }

      onSuccess()
      onOpenChange(false)
    } catch (error: any) {
      console.error("Failed to save user:", error)
      const errorMessage = error.message || error.error || "保存用户失败"
      setErrors({ submit: errorMessage })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh]" style={{ maxWidth: '600px', width: 'calc(100% - 2rem)' }}>
        <DialogHeader>
          <DialogTitle>{user ? "编辑用户" : "添加新用户"}</DialogTitle>
          <DialogDescription>
            {user ? "修改用户信息，留空密码字段则不更新密码" : "创建新用户，请设置初始密码"}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[calc(90vh-200px)] pr-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">用户名</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="请输入用户名"
                required
              />
              {errors.name && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.name}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">邮箱地址</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="请输入邮箱地址"
                required
              />
              {errors.email && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.email}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">
                密码 {!user && <span className="text-destructive">*</span>}
              </Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder={user ? "留空则不修改密码" : "请输入密码（至少6位）"}
                required={!user}
              />
              {errors.password && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.password}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">
                确认密码 {!user && <span className="text-destructive">*</span>}
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                placeholder={user ? "留空则不修改密码" : "请再次输入密码"}
                required={!user}
              />
              {errors.confirmPassword && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.confirmPassword}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">角色</Label>
              <Select value={formData.role} onValueChange={(value: any) => setFormData({ ...formData, role: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">管理员 - 完整权限</SelectItem>
                  <SelectItem value="analyst">分析师 - 查询和分析</SelectItem>
                  <SelectItem value="viewer">查看者 - 仅查看</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {errors.submit && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                <p className="text-sm text-destructive flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {errors.submit}
                </p>
              </div>
            )}

            {/* 权限清单 */}
            <Separator className="my-6" />
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-muted-foreground" />
                <Label className="text-base font-semibold">权限清单</Label>
                <Badge variant="outline" className="ml-auto">
                  {permissions.length} 条规则
                </Badge>
              </div>
              
              {loadingPermissions ? (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  加载权限规则中...
                </div>
              ) : permissions.length === 0 ? (
                <Card className="p-4 bg-muted/30">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <AlertCircle className="w-4 h-4" />
                    <span>该角色暂无关联的权限规则</span>
                  </div>
                </Card>
              ) : (
                <div className="space-y-2">
                  {permissions.map((permission) => (
                    <Card key={permission.id} className="p-3 border-border/50">
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-medium text-sm">{permission.name}</h4>
                              <Badge variant="secondary" className="text-xs">
                                {permission.role === "admin" ? "管理员" : 
                                 permission.role === "analyst" ? "分析师" : "查看者"}
                              </Badge>
                            </div>
                            {permission.description && (
                              <p className="text-xs text-muted-foreground line-clamp-2">
                                {permission.description}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Database className="w-3 h-3" />
                            <span>{getDatabaseName(permission.databaseConnectionId)}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Shield className="w-3 h-3" />
                            <span>
                              {permission.tablePermissions?.length || 0} 个表权限
                            </span>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4 pb-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button type="submit">{user ? "保存更改" : "添加用户"}</Button>
            </div>
          </form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
