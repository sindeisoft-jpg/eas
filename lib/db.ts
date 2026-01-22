import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db

// 验证 Prisma Client 是否正确加载了所有模型
// 只在服务器端执行（Node.js 环境）
if (typeof window === "undefined" && process.env.NODE_ENV === "development" && typeof db.promptConfig === "undefined") {
  console.error("[DB] ⚠️ 警告: db.promptConfig 未定义，Prisma Client 可能未正确生成")
  console.error("[DB] 请运行: npx prisma generate")
  console.error("[DB] 然后重启 Next.js 开发服务器")
}

