import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { generateToken } from "@/lib/auth"

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ error: "邮箱和密码不能为空" }, { status: 400 })
    }

    const user = await db.user.findUnique({
      where: { email },
      include: { organization: true },
    })

    if (!user) {
      return NextResponse.json({ error: "邮箱或密码错误" }, { status: 401 })
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash)
    if (!isValidPassword) {
      return NextResponse.json({ error: "邮箱或密码错误" }, { status: 401 })
    }

    // Update last login time
    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    })

    const token = generateToken({
      userId: user.id,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role,
    })

    const { passwordHash, ...userWithoutPassword } = user

    return NextResponse.json({
      token,
      user: {
        ...userWithoutPassword,
        passwordHash: undefined,
      },
    })
  } catch (error: any) {
    console.error("[Auth] Login error:", error)
    console.error("[Auth] Error stack:", error.stack)
    
    // Check for common issues
    let errorMessage = "登录失败"
    
    if (error.message?.includes("PrismaClient") || error.message?.includes("Cannot find module")) {
      errorMessage = "数据库客户端未初始化。请运行: pnpm db:generate"
    } else if (error.message?.includes("P1001") || error.message?.includes("Can't reach database")) {
      errorMessage = "无法连接到数据库。请检查 DATABASE_URL 配置和 MySQL 服务是否运行"
    } else if (error.message?.includes("P2002") || error.message?.includes("Unique constraint")) {
      errorMessage = "数据库约束错误"
    } else if (error.message?.includes("P2025") || error.message?.includes("Record to update not found")) {
      errorMessage = "记录不存在"
    } else if (process.env.NODE_ENV === "development") {
      errorMessage = `登录失败: ${error.message || error.toString()}`
    }
    
    return NextResponse.json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === "development" ? error.message : undefined
    }, { status: 500 })
  }
}
