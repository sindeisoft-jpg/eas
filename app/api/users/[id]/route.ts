import { NextResponse } from "next/server"
import { requireAuth, AuthenticatedRequest } from "@/lib/middleware"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"

async function handleGET(req: AuthenticatedRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = req.user!
    const { id: userId } = await params

    const user = await db.user.findUnique({
      where: { id: userId },
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

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 })
    }

    if (user.organizationId !== currentUser.organizationId) {
      return NextResponse.json({ error: "无权限" }, { status: 403 })
    }

    return NextResponse.json({ user })
  } catch (error: any) {
    console.error("[Users] Get error:", error)
    return NextResponse.json({ error: "获取用户失败" }, { status: 500 })
  }
}

async function handlePUT(req: AuthenticatedRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = req.user!
    const { id: userId } = await params

    if (currentUser.role !== "admin" && currentUser.id !== userId) {
      return NextResponse.json({ error: "无权限" }, { status: 403 })
    }

    const { email, name, role, avatar, password } = await req.json()

    const existingUser = await db.user.findUnique({
      where: { id: userId },
    })

    if (!existingUser) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 })
    }

    if (existingUser.organizationId !== currentUser.organizationId) {
      return NextResponse.json({ error: "无权限" }, { status: 403 })
    }

    const updateData: any = {}
    if (email) updateData.email = email
    if (name) updateData.name = name
    if (avatar !== undefined) updateData.avatar = avatar
    if (currentUser.role === "admin" && role) updateData.role = role
    if (password) updateData.passwordHash = await bcrypt.hash(password, 10)

    const updatedUser = await db.user.update({
      where: { id: userId },
      data: updateData,
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

    return NextResponse.json({ user: updatedUser })
  } catch (error: any) {
    console.error("[Users] Update error:", error)
    return NextResponse.json({ error: "更新用户失败" }, { status: 500 })
  }
}

async function handleDELETE(req: AuthenticatedRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = req.user!
    const { id: userId } = await params

    if (currentUser.role !== "admin") {
      return NextResponse.json({ error: "无权限" }, { status: 403 })
    }

    if (currentUser.id === userId) {
      return NextResponse.json({ error: "不能删除自己" }, { status: 400 })
    }

    const user = await db.user.findUnique({
      where: { id: userId },
    })

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 })
    }

    if (user.organizationId !== currentUser.organizationId) {
      return NextResponse.json({ error: "无权限" }, { status: 403 })
    }

    await db.user.delete({
      where: { id: userId },
    })

    return NextResponse.json({ message: "用户已删除" })
  } catch (error: any) {
    console.error("[Users] Delete error:", error)
    return NextResponse.json({ error: "删除用户失败" }, { status: 500 })
  }
}

export const GET = requireAuth(handleGET)
export const PUT = requireAuth(handlePUT)
export const DELETE = requireAuth(handleDELETE)
