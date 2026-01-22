"use client"

import { useState, useEffect } from "react"
import { storage } from "@/lib/storage"
import type { DataPermission, DatabaseConnection } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Shield, Plus, AlertTriangle, Lock, Edit2, Trash2, Database, Table, Eye, EyeOff, FileText } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PermissionDialog } from "@/components/permission-dialog"
import { SQLPolicyDialog } from "@/components/sql-policy-dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ChevronDown, ChevronRight } from "lucide-react"
import { apiClient } from "@/lib/api-client"

export default function PermissionsPage() {
  const [permissions, setPermissions] = useState<DataPermission[]>([])
  const [sqlPolicies, setSqlPolicies] = useState<any[]>([])
  const [databases, setDatabases] = useState<DatabaseConnection[]>([])
  const [permDialogOpen, setPermDialogOpen] = useState(false)
  const [policyDialogOpen, setPolicyDialogOpen] = useState(false)
  const [editingPerm, setEditingPerm] = useState<DataPermission | null>(null)
  const [editingPolicy, setEditingPolicy] = useState<any>(null)
  const [expandedPerms, setExpandedPerms] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [permissionsData, policiesData, databasesData] = await Promise.all([
        apiClient.getPermissions().then((r) => r.permissions || []),
        storage.sqlPolicies.getAll(),
        storage.dbConnections.getAll(),
      ])
      setPermissions(permissionsData)
      setSqlPolicies(policiesData)
      setDatabases(databasesData)
    } catch (error) {
      console.error("Failed to load data:", error)
    } finally {
      setLoading(false)
    }
  }

  const togglePermExpanded = (permId: string) => {
    const newExpanded = new Set(expandedPerms)
    if (newExpanded.has(permId)) {
      newExpanded.delete(permId)
    } else {
      newExpanded.add(permId)
    }
    setExpandedPerms(newExpanded)
  }

  const handleDeletePermission = async (perm: DataPermission) => {
    if (!confirm(`确定删除权限规则 "${perm.name}"？此操作不可恢复。`)) {
      return
    }

    try {
      await apiClient.deletePermission(perm.id)
      loadData()
    } catch (error: any) {
      console.error("Failed to delete permission:", error)
      alert(error.message || "删除权限失败")
    }
  }

  const getDatabaseName = (dbId: string) => {
    return databases.find((d) => d.id === dbId)?.name || dbId
  }

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      admin: "管理员",
      analyst: "分析师",
      viewer: "查看者",
    }
    return labels[role] || role
  }

  const getDataScopeLabel = (scope: string) => {
    return scope === "all" ? "全部数据" : "仅用户相关"
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    )
  }

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-3 tracking-tight">权限管理</h1>
            <p className="text-muted-foreground text-base">
              配置数据访问权限和SQL安全策略，确保用户只能访问被授权的数据
            </p>
          </div>
        </div>

        <Tabs defaultValue="data-permissions" className="space-y-6">
          <TabsList className="rounded-none bg-muted/30 p-1">
            <TabsTrigger value="data-permissions" className="gap-2 rounded-none data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Lock className="w-4 h-4" />
              数据权限
            </TabsTrigger>
            <TabsTrigger value="permission-list" className="gap-2 rounded-none data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <FileText className="w-4 h-4" />
              权限清单
            </TabsTrigger>
            <TabsTrigger value="sql-policies" className="gap-2 rounded-none data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Shield className="w-4 h-4" />
              SQL安全策略
            </TabsTrigger>
          </TabsList>

          <TabsContent value="data-permissions" className="space-y-4">
            <Card className="p-6 rounded-none border-border/50 bg-background/50 backdrop-blur-sm shadow-xl">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">数据访问权限</h3>
                  <p className="text-sm text-muted-foreground">
                    配置不同角色对数据表和字段的访问权限，支持行级数据过滤
                  </p>
                </div>
                <Button
                  onClick={() => {
                    setEditingPerm(null)
                    setPermDialogOpen(true)
                  }}
                  className="gap-2 h-11 px-6 rounded-none font-medium shadow-lg hover:shadow-xl transition-all duration-200"
                >
                  <Plus className="w-4 h-4" />
                  添加权限规则
                </Button>
              </div>

              {permissions.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-20 h-20 rounded-none bg-primary/10 flex items-center justify-center mx-auto mb-6">
                    <Shield className="w-10 h-10 text-primary" />
                  </div>
                  <h3 className="text-2xl font-semibold text-foreground mb-3">暂无权限配置</h3>
                  <p className="text-muted-foreground mb-8 text-base">
                    添加数据权限规则来控制用户对敏感数据的访问
                  </p>
                  <Button
                    onClick={() => {
                      setEditingPerm(null)
                      setPermDialogOpen(true)
                    }}
                    className="gap-2 h-11 px-6 rounded-none font-medium shadow-lg hover:shadow-xl transition-all duration-200"
                  >
                    <Plus className="w-4 h-4" />
                    添加第一个权限规则
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {permissions.map((perm) => (
                    <Card
                      key={perm.id}
                      className="p-5 hover:shadow-lg transition-all duration-300 rounded-none border-border/50 bg-background/30 group"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => togglePermExpanded(perm.id)}
                              className="h-6 w-6 p-0"
                            >
                              {expandedPerms.has(perm.id) ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </Button>
                            <h4 className="font-semibold text-foreground">{perm.name}</h4>
                            <Badge variant="outline">{getRoleLabel(perm.role)}</Badge>
                            <Badge variant="secondary">
                              <Database className="w-3 h-3 mr-1" />
                              {getDatabaseName(perm.databaseConnectionId)}
                            </Badge>
                            <Badge variant="secondary">
                              {perm.tablePermissions.filter((tp) => tp.enabled !== false).length} 个表
                            </Badge>
                          </div>
                          {perm.description && (
                            <p className="text-sm text-muted-foreground mb-3 ml-8">{perm.description}</p>
                          )}

                          {expandedPerms.has(perm.id) && (
                            <div className="ml-8 mt-4 space-y-2">
                              {perm.tablePermissions.map((tp, idx) => (
                                <Card key={idx} className="p-3 bg-muted/30">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                      <Table className="w-4 h-4 text-muted-foreground" />
                                      <span className="font-medium text-sm">{tp.tableName}</span>
                                      <Badge variant={tp.enabled !== false ? "default" : "secondary"} className="text-xs">
                                        {tp.enabled !== false ? "已启用" : "已禁用"}
                                      </Badge>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground ml-6">
                                    <div>
                                      <span className="font-medium">操作权限：</span>
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {tp.allowedOperations.map((op) => (
                                          <Badge key={op} variant="outline" className="text-xs">
                                            {op}
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                    <div>
                                      <span className="font-medium">数据范围：</span>
                                      <Badge variant="outline" className="ml-1 text-xs">
                                        {getDataScopeLabel(tp.dataScope || "all")}
                                      </Badge>
                                      {tp.dataScope === "user_related" && (
                                        <div className="mt-1 text-xs">
                                          {tp.userRelationFields?.userId && (
                                            <div>用户ID字段: {tp.userRelationFields.userId}</div>
                                          )}
                                          {tp.userRelationFields?.userEmail && (
                                            <div>用户邮箱字段: {tp.userRelationFields.userEmail}</div>
                                          )}
                                          {tp.userRelationFields?.userName && (
                                            <div>用户名字段: {tp.userRelationFields.userName}</div>
                                          )}
                                          {tp.rowLevelFilter && (
                                            <div className="mt-1 font-mono bg-muted/50 p-1 rounded">
                                              过滤: {tp.rowLevelFilter}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </Card>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingPerm(perm)
                              setPermDialogOpen(true)
                            }}
                            className="rounded-none hover:bg-muted/50"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeletePermission(perm)}
                            className="rounded-none hover:bg-destructive/10 text-destructive"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="permission-list" className="space-y-4">
            <Card className="p-6 rounded-none border-border/50 bg-background/50 backdrop-blur-sm shadow-xl">
              <div className="mb-6">
                <h3 className="text-xl font-semibold text-foreground mb-2">权限清单</h3>
                <p className="text-sm text-muted-foreground">
                  查看所有权限规则的详细配置，按数据库和角色组织
                </p>
              </div>

              {permissions.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">暂无权限配置</p>
                </div>
              ) : (
                <ScrollArea className="h-[600px]">
                  <div className="space-y-6">
                    {databases.map((db) => {
                      const dbPermissions = permissions.filter((p) => p.databaseConnectionId === db.id)
                      if (dbPermissions.length === 0) return null

                      return (
                        <Card key={db.id} className="p-4">
                          <div className="flex items-center gap-2 mb-4">
                            <Database className="w-5 h-5 text-primary" />
                            <h4 className="text-lg font-semibold">{db.name}</h4>
                            <Badge variant="secondary">{dbPermissions.length} 个权限规则</Badge>
                          </div>

                          <div className="space-y-4 ml-7">
                            {dbPermissions.map((perm) => (
                              <Card key={perm.id} className="p-4 bg-muted/20">
                                <div className="flex items-center gap-2 mb-3">
                                  <Lock className="w-4 h-4 text-muted-foreground" />
                                  <span className="font-medium">{perm.name}</span>
                                  <Badge>{getRoleLabel(perm.role)}</Badge>
                                  {perm.description && (
                                    <span className="text-sm text-muted-foreground">- {perm.description}</span>
                                  )}
                                </div>

                                <div className="space-y-2 ml-6">
                                  {perm.tablePermissions
                                    .filter((tp) => tp.enabled !== false)
                                    .map((tp, idx) => (
                                      <div key={idx} className="text-sm border-l-2 border-primary/20 pl-3 py-1">
                                        <div className="flex items-center gap-2 mb-1">
                                          <Table className="w-3 h-3 text-muted-foreground" />
                                          <span className="font-medium">{tp.tableName}</span>
                                        </div>
                                        <div className="ml-5 space-y-1 text-xs text-muted-foreground">
                                          <div>
                                            操作: {tp.allowedOperations.join(", ")} | 数据范围:{" "}
                                            {getDataScopeLabel(tp.dataScope || "all")}
                                          </div>
                                          {tp.dataScope === "user_related" && (
                                            <div className="text-xs">
                                              {tp.userRelationFields?.userId && (
                                                <div>• 用户ID字段: {tp.userRelationFields.userId}</div>
                                              )}
                                              {tp.userRelationFields?.userEmail && (
                                                <div>• 用户邮箱字段: {tp.userRelationFields.userEmail}</div>
                                              )}
                                              {tp.userRelationFields?.userName && (
                                                <div>• 用户名字段: {tp.userRelationFields.userName}</div>
                                              )}
                                              {tp.rowLevelFilter && (
                                                <div className="mt-1 font-mono bg-muted/50 p-1 rounded">
                                                  过滤条件: {tp.rowLevelFilter}
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                </div>
                              </Card>
                            ))}
                          </div>
                        </Card>
                      )
                    })}
                  </div>
                </ScrollArea>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="sql-policies" className="space-y-4">
            <Card className="p-6 rounded-none border-border/50 bg-background/50 backdrop-blur-sm shadow-xl">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">SQL安全策略</h3>
                  <p className="text-sm text-muted-foreground">配置SQL查询的安全限制和危险操作拦截</p>
                </div>
                <Button
                  onClick={() => {
                    setEditingPolicy(null)
                    setPolicyDialogOpen(true)
                  }}
                  className="gap-2 h-11 px-6 rounded-none font-medium shadow-lg hover:shadow-xl transition-all duration-200"
                >
                  <Plus className="w-4 h-4" />
                  添加安全策略
                </Button>
              </div>

              {sqlPolicies.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-20 h-20 rounded-none bg-primary/10 flex items-center justify-center mx-auto mb-6">
                    <AlertTriangle className="w-10 h-10 text-primary" />
                  </div>
                  <h3 className="text-2xl font-semibold text-foreground mb-3">暂无安全策略</h3>
                  <p className="text-muted-foreground mb-8 text-base">
                    添加SQL安全策略来防止危险操作和恶意查询
                  </p>
                  <Button
                    onClick={() => {
                      setEditingPolicy(null)
                      setPolicyDialogOpen(true)
                    }}
                    className="gap-2 h-11 px-6 rounded-none font-medium shadow-lg hover:shadow-xl transition-all duration-200"
                  >
                    <Plus className="w-4 h-4" />
                    添加第一个安全策略
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {sqlPolicies.map((policy) => (
                    <Card
                      key={policy.id}
                      className="p-5 hover:shadow-lg transition-all duration-300 rounded-none border-border/50 bg-background/30 group"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-semibold text-foreground mb-3">{policy.name}</h4>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-muted">允许操作：</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {policy.allowedOperations.map((op: string) => (
                                  <Badge key={op} variant="secondary" className="text-xs">
                                    {op}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                            <div>
                              <span className="text-muted">限制：</span>
                              <div className="space-y-1 mt-1">
                                <div className="text-xs">最大执行时间：{policy.maxExecutionTime}秒</div>
                                <div className="text-xs">最大返回行数：{policy.maxRowsReturned}</div>
                              </div>
                            </div>
                          </div>
                          {policy.blockedKeywords.length > 0 && (
                            <div className="mt-3">
                              <span className="text-sm text-muted">阻止关键词：</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {policy.blockedKeywords.map((kw: string) => (
                                  <Badge key={kw} variant="destructive" className="text-xs">
                                    {kw}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingPolicy(policy)
                              setPolicyDialogOpen(true)
                            }}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              if (confirm("确定删除此安全策略？")) {
                                await storage.sqlPolicies.remove(policy.id)
                                loadData()
                              }
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <PermissionDialog
        open={permDialogOpen}
        onOpenChange={setPermDialogOpen}
        permission={editingPerm}
        onSuccess={loadData}
      />
      <SQLPolicyDialog
        open={policyDialogOpen}
        onOpenChange={setPolicyDialogOpen}
        policy={editingPolicy}
        onSuccess={loadData}
      />
    </div>
  )
}
