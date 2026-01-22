import { NextResponse } from "next/server"
import { requireAuth, AuthenticatedRequest } from "@/lib/middleware"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"

async function handleGET(req: AuthenticatedRequest) {
  try {
    const user = req.user!
    const users = await db.user.findMany({
      where: {
        organizationId: user.organizationId,
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        organizationId: true,
        createdAt: true,
        lastLoginAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    return NextResponse.json({ users })
  } catch (error: any) {
    console.error("[Users] Get all error:", error)
    return NextResponse.json({ error: "获取用户列表失败" }, { status: 500 })
  }
}

async function handlePOST(req: AuthenticatedRequest) {
  try {
    const currentUser = req.user!
    if (currentUser.role !== "admin") {
      return NextResponse.json({ error: "无权限" }, { status: 403 })
    }

    const { email, password, name, role, avatar } = await req.json()

    if (!email || !password || !name) {
      return NextResponse.json({ error: "邮箱、密码和姓名不能为空" }, { status: 400 })
    }

    const existingUser = await db.user.findUnique({
      where: { email },
    })

    if (existingUser) {
      return NextResponse.json({ error: "邮箱已存在" }, { status: 400 })
    }

    const passwordHash = await bcrypt.hash(password, 10)

    const newUser = await db.user.create({
      data: {
        email,
        passwordHash,
        name,
        role: role || "viewer",
        avatar,
        organizationId: currentUser.organizationId,
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        organizationId: true,
        createdAt: true,
        lastLoginAt: true,
      },
    })

    return NextResponse.json({ user: newUser }, { status: 201 })
  } catch (error: any) {
    console.error("[Users] Create error:", error)
    return NextResponse.json({ error: "创建用户失败" }, { status: 500 })
  }
}

export const GET = requireAuth(handleGET)
export const POST = requireAuth(handlePOST)

