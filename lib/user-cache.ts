/**
 * 用户信息缓存
 * 减少重复的 Prisma 查询
 */

interface CachedUser {
  id: string
  email: string
  organizationId: string
  role: string
  cachedAt: number
}

// 内存缓存（生产环境建议使用 Redis）
const userCache = new Map<string, CachedUser>()
const CACHE_TTL = 5 * 60 * 1000 // 5 分钟缓存时间

/**
 * 从缓存获取用户信息
 */
export function getCachedUser(userId: string): CachedUser | null {
  const cached = userCache.get(userId)
  
  if (!cached) {
    return null
  }
  
  // 检查缓存是否过期
  const now = Date.now()
  if (now - cached.cachedAt > CACHE_TTL) {
    userCache.delete(userId)
    return null
  }
  
  return cached
}

/**
 * 缓存用户信息
 */
export function setCachedUser(user: CachedUser): void {
  userCache.set(user.id, {
    ...user,
    cachedAt: Date.now(),
  })
}

/**
 * 清除用户缓存
 */
export function clearUserCache(userId?: string): void {
  if (userId) {
    userCache.delete(userId)
  } else {
    userCache.clear()
  }
}

/**
 * 获取缓存统计
 */
export function getCacheStats() {
  return {
    size: userCache.size,
    keys: Array.from(userCache.keys()),
  }
}
