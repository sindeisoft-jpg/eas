"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { storage } from "@/lib/storage"
import type { User } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Plus, Search, MoreVertical, Mail, Calendar, Shield, Trash2, Edit2 } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { Avatar } from "@/components/ui/avatar"
import { UserDialog } from "@/components/user-dialog"

export default function UsersPage() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    try {
      const allUsers = await storage.users.getAll()
      setUsers(allUsers)
    } catch (error) {
      console.error("Failed to load users:", error)
    }
  }

  const handleDelete = async (userId: string) => {
    if (userId === currentUser?.id) {
      alert("无法删除当前登录用户")
      return
    }
    if (confirm("确定要删除此用户吗？")) {
      try {
        await storage.users.remove(userId)
        loadUsers()
      } catch (error) {
        console.error("Failed to delete user:", error)
        alert("删除失败")
      }
    }
  }

  const handleEdit = (user: User) => {
    setEditingUser(user)
    setDialogOpen(true)
  }

  const handleAddNew = () => {
    setEditingUser(null)
    setDialogOpen(true)
  }

  const filteredUsers = users.filter(
    (user) =>
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "admin":
        return "destructive"
      case "analyst":
        return "default"
      default:
        return "secondary"
    }
  }

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "admin":
        return "管理员"
      case "analyst":
        return "分析师"
      default:
        return "查看者"
    }
  }

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-3 tracking-tight">用户管理</h1>
            <p className="text-muted-foreground text-base">管理系统用户和访问权限</p>
          </div>
          <Button 
            onClick={handleAddNew} 
            className="gap-2 h-11 px-6 rounded-none font-medium shadow-lg hover:shadow-xl transition-all duration-200"
          >
            <Plus className="w-4 h-4" />
            添加用户
          </Button>
        </div>

        <Card className="p-6 rounded-none border-border/50 bg-background/50 backdrop-blur-sm shadow-xl">
          <div className="flex items-center gap-4 mb-6">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="搜索用户名或邮箱..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-11 h-11 rounded-none border-2 focus:border-primary transition-all bg-background"
              />
            </div>
            <Badge variant="outline" className="px-4 py-2 rounded-none">
              共 {users.length} 个用户
            </Badge>
          </div>

          <div className="space-y-3">
            {filteredUsers.map((user) => (
              <Card key={user.id} className="p-5 hover:shadow-lg transition-all duration-300 rounded-none border-border/50 bg-background/30 group">
                <div className="flex items-center gap-4">
                  <Avatar className="w-14 h-14 bg-primary text-primary-foreground flex items-center justify-center text-lg font-semibold ring-2 ring-primary/20 group-hover:ring-primary/40 transition-all">
                    {user.name.charAt(0)}
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-foreground text-base">{user.name}</h3>
                      <Badge variant={getRoleBadgeVariant(user.role)} className="rounded-none">{getRoleLabel(user.role)}</Badge>
                      {user.id === currentUser?.id && (
                        <Badge variant="outline" className="text-xs rounded-none">
                          当前用户
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5" />
                        {user.email}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        加入时间：{new Date(user.createdAt).toLocaleDateString("zh-CN")}
                      </div>
                      {user.lastLoginAt && (
                        <div className="flex items-center gap-1.5">
                          <Shield className="w-3.5 h-3.5" />
                          最后登录：{new Date(user.lastLoginAt).toLocaleDateString("zh-CN")}
                        </div>
                      )}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="rounded-none hover:bg-muted/50">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="rounded-none border-border/50">
                      <DropdownMenuItem onClick={() => handleEdit(user)} className="rounded-none">
                        <Edit2 className="w-4 h-4 mr-2" />
                        编辑
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDelete(user.id)}
                        disabled={user.id === currentUser?.id}
                        className="text-destructive rounded-none"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        删除
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </Card>
            ))}
          </div>

          {filteredUsers.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">未找到匹配的用户</p>
            </div>
          )}
        </Card>
      </div>

      <UserDialog open={dialogOpen} onOpenChange={setDialogOpen} user={editingUser} onSuccess={loadUsers} />
    </div>
  )
}
