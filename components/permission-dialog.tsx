"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plus, Trash2, ChevronDown, ChevronRight, Database, Table, Lock, Eye, EyeOff, Columns } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import type { DataPermission, TablePermission, DatabaseConnection, DatabaseSchema, ColumnPermission } from "@/lib/types"
import { storage } from "@/lib/storage"
import { apiClient } from "@/lib/api-client"

interface PermissionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  permission: DataPermission | null
  onSuccess: () => void
}

export function PermissionDialog({ open, onOpenChange, permission, onSuccess }: PermissionDialogProps) {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    role: "viewer" as "admin" | "analyst" | "viewer",
    databaseConnectionId: "",
    tablePermissions: [] as TablePermission[],
  })
  const [databases, setDatabases] = useState<DatabaseConnection[]>([])
  const [selectedDb, setSelectedDb] = useState<DatabaseConnection | null>(null)
  const [dbSchema, setDbSchema] = useState<DatabaseSchema[]>([])
  const [loadingSchema, setLoadingSchema] = useState(false)
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (permission) {
      setFormData({
        name: permission.name,
        description: permission.description || "",
        role: permission.role,
        databaseConnectionId: permission.databaseConnectionId,
        tablePermissions: permission.tablePermissions.map((tp) => ({
          ...tp,
          enabled: tp.enabled !== undefined ? tp.enabled : true,
          dataScope: tp.dataScope || "all",
        })),
      })
    } else {
      setFormData({
        name: "",
        description: "",
        role: "viewer",
        databaseConnectionId: "",
        tablePermissions: [],
      })
    }
  }, [permission, open])

  useEffect(() => {
    const loadDatabases = async () => {
      try {
        const allDatabases = await storage.dbConnections.getAll()
        setDatabases(allDatabases)
      } catch (error) {
        console.error("Failed to load databases:", error)
      }
    }
    if (open) {
      loadDatabases()
    }
  }, [open])

  useEffect(() => {
    if (formData.databaseConnectionId) {
      const db = databases.find((d) => d.id === formData.databaseConnectionId)
      setSelectedDb(db || null)
      if (db) {
        loadDatabaseSchema(db.id)
      }
    } else {
      setSelectedDb(null)
      setDbSchema([])
    }
  }, [formData.databaseConnectionId, databases])

  const loadDatabaseSchema = async (dbId: string) => {
    setLoadingSchema(true)
    try {
      const schema = await apiClient.getDatabaseSchema(dbId)
      setDbSchema(schema.schemas || [])
    } catch (error) {
      console.error("Failed to load database schema:", error)
    } finally {
      setLoadingSchema(false)
    }
  }

  const toggleTableExpanded = (tableName: string) => {
    const newExpanded = new Set(expandedTables)
    if (newExpanded.has(tableName)) {
      newExpanded.delete(tableName)
    } else {
      newExpanded.add(tableName)
    }
    setExpandedTables(newExpanded)
  }

  // 双击表名展开/收起字段列表
  const handleTableDoubleClick = (tableName: string) => {
    toggleTableExpanded(tableName)
  }

  // 切换表的启用状态
  const toggleTableAccess = (tableName: string) => {
    const existing = formData.tablePermissions.find((tp) => tp.tableName === tableName)
    
    if (existing) {
      // 如果已存在，切换启用状态
      setFormData({
        ...formData,
        tablePermissions: formData.tablePermissions.map((tp) =>
          tp.tableName === tableName ? { ...tp, enabled: !tp.enabled } : tp
        ),
      })
    } else {
      // 如果不存在，添加新权限（默认启用）
      const tableSchema = dbSchema.find((s) => s.tableName === tableName)
      const columnPermissions: ColumnPermission[] = tableSchema?.columns.map((col) => ({
        columnName: col.name,
        accessible: true, // 默认所有字段可访问
        masked: false,
      })) || []

      const newPermission: TablePermission = {
        tableName,
        allowedOperations: ["SELECT"],
        columnPermissions,
        dataScope: "all",
        enabled: true,
      }

      setFormData({
        ...formData,
        tablePermissions: [...formData.tablePermissions, newPermission],
      })
    }
  }

  // 切换字段的访问权限
  const toggleColumnAccess = (tableName: string, columnName: string) => {
    setFormData({
      ...formData,
      tablePermissions: formData.tablePermissions.map((tp) => {
        if (tp.tableName !== tableName) return tp

        const columnPerms = tp.columnPermissions || []
        const existingCol = columnPerms.find((cp) => cp.columnName === columnName)

        if (existingCol) {
          // 切换字段访问权限
          const nextAccessible = !existingCol.accessible
          return {
            ...tp,
            columnPermissions: columnPerms.map((cp) =>
              cp.columnName === columnName
                ? {
                    ...cp,
                    accessible: nextAccessible,
                    // 安全优先：不可访问时强制关闭脱敏配置
                    ...(nextAccessible ? {} : { masked: false, maskType: undefined }),
                  }
                : cp
            ),
          }
        } else {
          // 添加新字段权限（默认可访问）
          return {
            ...tp,
            columnPermissions: [
              ...columnPerms,
              { columnName, accessible: true, masked: false },
            ],
          }
        }
      }),
    })
  }

  // 切换字段脱敏
  const toggleColumnMasked = (tableName: string, columnName: string) => {
    setFormData({
      ...formData,
      tablePermissions: formData.tablePermissions.map((tp) => {
        if (tp.tableName !== tableName) return tp
        const columnPerms = tp.columnPermissions || []
        const existingCol = columnPerms.find((cp) => cp.columnName === columnName)
        if (!existingCol) {
          return {
            ...tp,
            columnPermissions: [
              ...columnPerms,
              { columnName, accessible: true, masked: true, maskType: "partial" },
            ],
          }
        }
        // 不可访问列不允许脱敏开关
        if (existingCol.accessible === false) return tp
        const nextMasked = !existingCol.masked
        return {
          ...tp,
          columnPermissions: columnPerms.map((cp) =>
            cp.columnName === columnName
              ? { ...cp, masked: nextMasked, maskType: nextMasked ? (cp.maskType || "partial") : undefined }
              : cp
          ),
        }
      }),
    })
  }

  // 设置脱敏类型
  const setColumnMaskType = (tableName: string, columnName: string, maskType: "hash" | "partial" | "full") => {
    setFormData({
      ...formData,
      tablePermissions: formData.tablePermissions.map((tp) => {
        if (tp.tableName !== tableName) return tp
        const columnPerms = tp.columnPermissions || []
        return {
          ...tp,
          columnPermissions: columnPerms.map((cp) =>
            cp.columnName === columnName ? { ...cp, maskType } : cp
          ),
        }
      }),
    })
  }

  // 批量选择/取消所有表
  const toggleAllTables = (checked: boolean) => {
    if (checked) {
      // 选择所有表
      const newPermissions: TablePermission[] = dbSchema.map((schema) => {
        const existing = formData.tablePermissions.find((tp) => tp.tableName === schema.tableName)
        if (existing) {
          return { ...existing, enabled: true }
        }

        const columnPermissions: ColumnPermission[] = schema.columns.map((col) => ({
          columnName: col.name,
          accessible: true,
          masked: false,
        }))

        return {
          tableName: schema.tableName,
          allowedOperations: ["SELECT"],
          columnPermissions,
          dataScope: "all",
          enabled: true,
        }
      })

      setFormData({
        ...formData,
        tablePermissions: newPermissions,
      })
    } else {
      // 取消所有表（禁用但不删除）
      setFormData({
        ...formData,
        tablePermissions: formData.tablePermissions.map((tp) => ({ ...tp, enabled: false })),
      })
    }
  }

  const removeTablePermission = (tableName: string) => {
    setFormData({
      ...formData,
      tablePermissions: formData.tablePermissions.filter((tp) => tp.tableName !== tableName),
    })
  }

  const updateTablePermission = (tableName: string, updates: Partial<TablePermission>) => {
    setFormData({
      ...formData,
      tablePermissions: formData.tablePermissions.map((tp) =>
        tp.tableName === tableName ? { ...tp, ...updates } : tp
      ),
    })
  }

  const toggleOperation = (tableName: string, operation: "SELECT" | "INSERT" | "UPDATE" | "DELETE") => {
    const tp = formData.tablePermissions.find((p) => p.tableName === tableName)
    if (!tp) return

    const operations = tp.allowedOperations.includes(operation)
      ? tp.allowedOperations.filter((op) => op !== operation)
      : [...tp.allowedOperations, operation]

    updateTablePermission(tableName, { allowedOperations: operations })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.databaseConnectionId) {
      alert("请选择数据库")
      return
    }

    const enabledPermissions = formData.tablePermissions.filter((tp) => tp.enabled)
    if (enabledPermissions.length === 0) {
      alert("请至少选择一个可访问的表")
      return
    }

    try {
      const { apiClient } = await import("@/lib/api-client")
      const permData = {
        name: formData.name,
        description: formData.description || undefined,
        role: formData.role,
        databaseConnectionId: formData.databaseConnectionId,
        tablePermissions: formData.tablePermissions,
      }

      if (permission) {
        await apiClient.updatePermission(permission.id, permData)
      } else {
        await apiClient.createPermission(permData)
      }

      onSuccess()
      onOpenChange(false)
    } catch (error: any) {
      console.error("Failed to save permission:", error)
      alert(error.message || "保存权限失败")
    }
  }

  const availableTables = dbSchema.map((s) => s.tableName)
  const configuredTables = formData.tablePermissions.map((tp) => tp.tableName)
  const unconfiguredTables = availableTables.filter((t) => !configuredTables.includes(t))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh]" style={{ maxWidth: '1000px', width: 'calc(100% - 2rem)' }}>
        <DialogHeader>
          <DialogTitle>{permission ? "编辑权限规则" : "添加权限规则"}</DialogTitle>
          <DialogDescription>
            配置角色对数据库表的访问权限，包括操作权限和数据访问范围
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-200px)] pr-4">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 基本信息 */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">规则名称 *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="例如：分析师数据访问权限"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">描述</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="描述此权限规则的用途..."
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="role">适用角色 *</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(value: any) => setFormData({ ...formData, role: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">管理员</SelectItem>
                      <SelectItem value="analyst">分析师</SelectItem>
                      <SelectItem value="viewer">查看者</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="database">数据库 *</Label>
                  <Select
                    value={formData.databaseConnectionId}
                    onValueChange={(value) => setFormData({ ...formData, databaseConnectionId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择数据库" />
                    </SelectTrigger>
                    <SelectContent>
                      {databases.map((db) => (
                        <SelectItem key={db.id} value={db.id}>
                          {db.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator />

            {/* 表权限配置 */}
            {formData.databaseConnectionId && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">表权限配置</h3>
                    <p className="text-sm text-muted-foreground">
                      选择可访问的表，双击表名可配置字段权限
                    </p>
                  </div>
                  {dbSchema.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="select-all-tables"
                        checked={dbSchema.length > 0 && dbSchema.every((schema) => {
                          const tablePerm = formData.tablePermissions.find((tp) => tp.tableName === schema.tableName)
                          return tablePerm?.enabled ?? false
                        })}
                        onCheckedChange={(checked) => toggleAllTables(checked === true)}
                      />
                      <Label htmlFor="select-all-tables" className="text-sm cursor-pointer">
                        全选 ({formData.tablePermissions.filter((tp) => tp.enabled).length}/{dbSchema.length})
                      </Label>
                    </div>
                  )}
                </div>

                {loadingSchema && (
                  <div className="text-center py-8 text-muted-foreground">加载表结构...</div>
                )}

                {!loadingSchema && dbSchema.length === 0 && (
                  <Card className="p-8 text-center">
                    <Table className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">该数据库暂无表</p>
                  </Card>
                )}

                {!loadingSchema && dbSchema.length > 0 && (
                  <div className="space-y-2 border rounded-lg p-4 bg-muted/20">
                    {dbSchema.map((schema) => {
                      const tablePerm = formData.tablePermissions.find((tp) => tp.tableName === schema.tableName)
                      const isEnabled = tablePerm?.enabled ?? false
                      const isExpanded = expandedTables.has(schema.tableName)

                      return (
                        <Card key={schema.tableName} className="p-3">
                          <div className="flex items-start gap-3">
                            {/* 表选择复选框 */}
                            <Checkbox
                              id={`table-${schema.tableName}`}
                              checked={isEnabled}
                              onCheckedChange={() => toggleTableAccess(schema.tableName)}
                              className="mt-1"
                            />
                            
                            {/* 表名和展开按钮 */}
                            <div className="flex-1">
                              <div
                                className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-2 rounded -ml-2"
                                onDoubleClick={() => handleTableDoubleClick(schema.tableName)}
                              >
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                  onClick={() => handleTableDoubleClick(schema.tableName)}
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="w-4 h-4" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4" />
                                  )}
                                </Button>
                                <Table className="w-4 h-4 text-muted-foreground" />
                                <Label
                                  htmlFor={`table-${schema.tableName}`}
                                  className="font-medium cursor-pointer flex-1"
                                >
                                  {schema.tableName}
                                </Label>
                                <Badge variant={isEnabled ? "default" : "secondary"} className="text-xs">
                                  {isEnabled ? "已启用" : "未启用"}
                                </Badge>
                                {schema.rowCount !== undefined && (
                                  <Badge variant="outline" className="text-xs">
                                    {schema.rowCount} 行
                                  </Badge>
                                )}
                              </div>

                              {/* 展开的字段列表 */}
                              {isExpanded && isEnabled && tablePerm && (
                                <div className="mt-3 ml-8 space-y-2 border-l-2 border-primary/20 pl-4">
                                  <div className="flex items-center justify-between mb-2">
                                    <Label className="text-sm font-medium flex items-center gap-2">
                                      <Columns className="w-4 h-4" />
                                      字段权限配置
                                    </Label>
                                    <span className="text-xs text-muted-foreground">
                                      {tablePerm.columnPermissions?.filter((cp) => cp.accessible).length || 0} / {schema.columns.length} 个字段可访问
                                    </span>
                                  </div>
                                  
                                  <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                                    {schema.columns.map((column) => {
                                      const colPerm = tablePerm.columnPermissions?.find(
                                        (cp) => cp.columnName === column.name
                                      )
                                      const isColumnAccessible = colPerm?.accessible ?? true
                                      const isMasked = colPerm?.masked ?? false
                                      const maskType = (colPerm?.maskType as any) || "partial"

                                      return (
                                        <div
                                          key={column.name}
                                          className="flex items-center gap-2 p-2 rounded hover:bg-muted/50"
                                        >
                                          <Checkbox
                                            id={`column-${schema.tableName}-${column.name}`}
                                            checked={isColumnAccessible}
                                            onCheckedChange={() =>
                                              toggleColumnAccess(schema.tableName, column.name)
                                            }
                                          />
                                          <Label
                                            htmlFor={`column-${schema.tableName}-${column.name}`}
                                            className="text-sm cursor-pointer flex-1 flex items-center gap-2"
                                          >
                                            <span className="font-mono">{column.name}</span>
                                            <Badge variant="outline" className="text-xs">
                                              {column.type}
                                            </Badge>
                                            {column.isPrimaryKey && (
                                              <Badge variant="secondary" className="text-xs">PK</Badge>
                                            )}
                                          </Label>

                                          {/* 脱敏开关与类型（生产推荐） */}
                                          <div className="flex items-center gap-2">
                                            <div className="flex items-center gap-1">
                                              <Checkbox
                                                id={`mask-${schema.tableName}-${column.name}`}
                                                checked={isMasked}
                                                disabled={!isColumnAccessible}
                                                onCheckedChange={() => toggleColumnMasked(schema.tableName, column.name)}
                                              />
                                              <Label
                                                htmlFor={`mask-${schema.tableName}-${column.name}`}
                                                className={`text-xs cursor-pointer ${!isColumnAccessible ? "text-muted-foreground" : ""}`}
                                              >
                                                脱敏
                                              </Label>
                                            </div>

                                            {isMasked && isColumnAccessible && (
                                              <Select
                                                value={maskType}
                                                onValueChange={(v: any) => setColumnMaskType(schema.tableName, column.name, v)}
                                              >
                                                <SelectTrigger className="h-7 w-[92px]">
                                                  <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  <SelectItem value="partial">部分</SelectItem>
                                                  <SelectItem value="hash">哈希</SelectItem>
                                                  <SelectItem value="full">全遮</SelectItem>
                                                </SelectContent>
                                              </Select>
                                            )}
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* 表的高级配置（当表被启用时显示） */}
                              {isExpanded && isEnabled && tablePerm && (
                                <div className="mt-4 ml-8 space-y-3 border-t pt-3">
                                  {/* 操作权限 */}
                                  <div className="space-y-2">
                                    <Label className="text-sm">允许的操作</Label>
                                    <div className="flex flex-wrap gap-2">
                                      {(["SELECT", "INSERT", "UPDATE", "DELETE"] as const).map((op) => (
                                        <div key={op} className="flex items-center space-x-2">
                                          <Checkbox
                                            id={`${schema.tableName}-${op}`}
                                            checked={tablePerm.allowedOperations.includes(op)}
                                            onCheckedChange={() => toggleOperation(schema.tableName, op)}
                                          />
                                          <Label
                                            htmlFor={`${schema.tableName}-${op}`}
                                            className="text-sm font-normal cursor-pointer"
                                          >
                                            {op}
                                          </Label>
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  {/* 数据访问范围 */}
                                  <div className="space-y-2">
                                    <Label className="text-sm">数据访问范围</Label>
                                    <Select
                                      value={tablePerm.dataScope}
                                      onValueChange={(value: "all" | "user_related") =>
                                        updateTablePermission(schema.tableName, { dataScope: value })
                                      }
                                    >
                                      <SelectTrigger className="h-9">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="all">全部数据</SelectItem>
                                        <SelectItem value="user_related">仅限与用户相关的数据</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground">
                                      {tablePerm.dataScope === "all"
                                        ? "用户可以访问该表的所有数据"
                                        : "用户只能访问与该用户关联的数据（需要配置用户关联字段或过滤条件）"}
                                    </p>
                                  </div>

                                  {/* 用户关联字段（当数据范围为 user_related 时） */}
                                  {tablePerm.dataScope === "user_related" && (
                                    <div className="space-y-3 p-3 bg-muted/50 rounded-md">
                                      <Label className="text-sm">用户关联字段映射</Label>
                                      <p className="text-xs text-muted-foreground mb-2">
                                        指定表中哪些字段用于关联用户（至少配置一个）
                                      </p>
                                      <div className="grid grid-cols-3 gap-2">
                                        <div className="space-y-1">
                                          <Label className="text-xs">用户ID字段</Label>
                                          <Input
                                            placeholder="user_id"
                                            value={tablePerm.userRelationFields?.userId || ""}
                                            onChange={(e) =>
                                              updateTablePermission(schema.tableName, {
                                                userRelationFields: {
                                                  ...tablePerm.userRelationFields,
                                                  userId: e.target.value || undefined,
                                                },
                                              })
                                            }
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <Label className="text-xs">用户邮箱字段</Label>
                                          <Input
                                            placeholder="email"
                                            value={tablePerm.userRelationFields?.userEmail || ""}
                                            onChange={(e) =>
                                              updateTablePermission(schema.tableName, {
                                                userRelationFields: {
                                                  ...tablePerm.userRelationFields,
                                                  userEmail: e.target.value || undefined,
                                                },
                                              })
                                            }
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <Label className="text-xs">用户名字段</Label>
                                          <Input
                                            placeholder="username"
                                            value={tablePerm.userRelationFields?.userName || ""}
                                            onChange={(e) =>
                                              updateTablePermission(schema.tableName, {
                                                userRelationFields: {
                                                  ...tablePerm.userRelationFields,
                                                  userName: e.target.value || undefined,
                                                },
                                              })
                                            }
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {/* 自定义行级过滤条件 */}
                                  {tablePerm.dataScope === "user_related" && (
                                    <div className="space-y-2">
                                      <Label className="text-sm">自定义过滤条件（可选）</Label>
                                      <Textarea
                                        placeholder='例如: user_id = {{user_id}} OR department = "{{user_role}}"'
                                        value={tablePerm.rowLevelFilter || ""}
                                        onChange={(e) =>
                                          updateTablePermission(schema.tableName, {
                                            rowLevelFilter: e.target.value || undefined,
                                          })
                                        }
                                        rows={2}
                                        className="font-mono text-sm"
                                      />
                                      <p className="text-xs text-muted-foreground">
                                        可使用占位符：{" "}
                                        <code className="bg-muted px-1 rounded">{"{{user_id}}"}</code>,{" "}
                                        <code className="bg-muted px-1 rounded">{"{{user_email}}"}</code>,{" "}
                                        <code className="bg-muted px-1 rounded">{"{{user_name}}"}</code>,{" "}
                                        <code className="bg-muted px-1 rounded">{"{{user_role}}"}</code>
                                      </p>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </Card>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button type="submit">{permission ? "保存更改" : "创建权限规则"}</Button>
            </div>
          </form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
