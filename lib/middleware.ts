import { NextRequest, NextResponse } from "next/server"
import { verifyToken, extractTokenFromHeader } from "./auth"
import { db } from "./db"
import { getCachedUser, setCachedUser } from "./user-cache"

export interface AuthenticatedRequest extends NextRequest {
  user?: {
    id: string
    email: string
    organizationId: string
    role: string
  }
}

export async function authenticateRequest(
  request: NextRequest
): Promise<{ user: AuthenticatedRequest["user"]; error: null } | { user: null; error: NextResponse }> {
  const authHeader = request.headers.get("authorization")
  const token = extractTokenFromHeader(authHeader)

  if (!token) {
    return {
      user: null,
      error: NextResponse.json({ 
        error: "未授权，请先登录",
        code: "AUTH_REQUIRED",
        hint: "请先登录系统，然后再尝试此操作"
      }, { status: 401 }),
    }
  }

  try {
    const payload = verifyToken(token)
    
    // 先尝试从缓存获取用户信息
    let user = getCachedUser(payload.userId)
    
    // 如果缓存中没有，从数据库查询
    if (!user) {
      const dbUser = await db.user.findUnique({
        where: { id: payload.userId },
        select: {
          id: true,
          email: true,
          organizationId: true,
          role: true,
        },
      })

      if (!dbUser) {
        return {
          user: null,
          error: NextResponse.json({ 
            error: "用户不存在或已被删除",
            code: "USER_NOT_FOUND",
            hint: "请重新登录或联系管理员"
          }, { status: 401 }),
        }
      }
      
      // 缓存用户信息
      user = {
        ...dbUser,
        cachedAt: Date.now(),
      }
      setCachedUser(user)
    }

    return { user, error: null }
  } catch (error: any) {
    // Log database errors but still return 401 for security
    if (error.message?.includes("PrismaClient") || error.message?.includes("Cannot find module")) {
      console.error("[Auth] Database client not initialized:", error)
    } else if (error.message?.includes("P1001") || error.message?.includes("Can't reach database")) {
      console.error("[Auth] Database connection error:", error)
    }
    let errorMessage = "无效的 token"
    let errorCode = "INVALID_TOKEN"
    let errorHint = "请重新登录"
    
    if (error.message?.includes("expired") || error.message?.includes("过期")) {
      errorMessage = "登录已过期，请重新登录"
      errorCode = "TOKEN_EXPIRED"
      errorHint = "您的登录会话已过期，请重新登录"
    } else if (error.message?.includes("Invalid") || error.message?.includes("无效")) {
      errorMessage = "无效的认证令牌"
      errorCode = "INVALID_TOKEN"
      errorHint = "请重新登录获取新的认证令牌"
    }
    
    return {
      user: null,
      error: NextResponse.json({ 
        error: errorMessage,
        code: errorCode,
        hint: errorHint
      }, { status: 401 }),
    }
  }
}

export function requireAuth(handler: (req: AuthenticatedRequest, context?: any) => Promise<NextResponse>) {
  return async (req: NextRequest, context?: any) => {
    const authResult = await authenticateRequest(req)
    if (authResult.error) {
      return authResult.error
    }

    const authenticatedReq = req as AuthenticatedRequest
    authenticatedReq.user = authResult.user!

    return handler(authenticatedReq, context)
  }
}