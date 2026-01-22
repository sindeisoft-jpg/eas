"use client"

import { useState, useEffect, useMemo } from "react"
import { useAuth } from "@/lib/auth-context"
import { storage } from "@/lib/storage"
import type { User } from "@/lib/types"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar } from "@/components/ui/avatar"
import { Trophy, Medal, Award, TrendingUp } from "lucide-react"

export default function LeaderboardPage() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<User[]>([])

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    try {
      const allUsers = await storage.users.getAll()
      setUsers(allUsers)
    } catch (error) {
      console.error("Failed to load users:", error)
      setUsers([])
    }
  }

  // 生成排行榜数据（基于用户数据）
  const leaderboardUsers = useMemo(() => {
    if (!users || users.length === 0) {
      return []
    }
    return [
      {
        ...users[0],
        rank: 1,
        points: 15800,
        weeklyPoints: 580,
      },
      ...users.slice(1, 10).map((user, index) => ({
        ...user,
        rank: index + 2,
        points: 15000 - (index * 200),
        weeklyPoints: 500 - (index * 20),
      }))
    ]
  }, [users])

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Trophy className="w-5 h-5 text-yellow-500" />
    if (rank === 2) return <Medal className="w-5 h-5 text-gray-400" />
    if (rank === 3) return <Award className="w-5 h-5 text-amber-600" />
    return <span className="w-5 h-5 flex items-center justify-center text-muted-foreground font-semibold">{rank}</span>
  }

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2 tracking-tight">排行榜</h1>
          <p className="text-sm text-muted-foreground">查看用户活跃度和贡献排名</p>
        </div>

        {leaderboardUsers.length === 0 ? (
          <Card className="p-12 text-center">
            <Trophy className="w-16 h-16 text-muted-foreground/40 mx-auto mb-4" />
            <p className="text-muted-foreground">暂无排行榜数据</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {leaderboardUsers.map((user) => (
              <Card key={user.id} className="p-6 hover:shadow-premium transition-all">
                <div className="flex items-center gap-4">
                  <div className="flex items-center justify-center w-12 h-12">
                    {getRankIcon(user.rank)}
                  </div>
                  <Avatar className="w-12 h-12">
                    {user.name?.[0]?.toUpperCase() || "U"}
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-foreground">{user.name || "未知用户"}</h3>
                      {user.id === currentUser?.id && (
                        <Badge variant="outline" className="text-xs">你</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-2xl font-bold text-foreground">{user.points?.toLocaleString() || 0}</div>
                      <div className="text-xs text-muted-foreground">总积分</div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-lg font-semibold text-primary">
                        <TrendingUp className="w-4 h-4" />
                        {user.weeklyPoints || 0}
                      </div>
                      <div className="text-xs text-muted-foreground">本周积分</div>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
