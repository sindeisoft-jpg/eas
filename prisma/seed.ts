import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  console.log("开始初始化数据库...")

  // Create demo organization
  const org = await prisma.organization.upsert({
    where: { slug: "demo-org" },
    update: {},
    create: {
      id: "org_demo",
      name: "Demo Organization",
      slug: "demo-org",
      plan: "pro",
      settings: {
        maxDatabaseConnections: 10,
        maxUsers: 50,
      },
    },
  })

  console.log("创建组织:", org.name)

  // Create demo users
  const adminPassword = await bcrypt.hash("admin123", 10)
  const analystPassword = await bcrypt.hash("analyst123", 10)

  const admin = await prisma.user.upsert({
    where: { email: "admin@demo.com" },
    update: {},
    create: {
      id: "user_admin",
      email: "admin@demo.com",
      passwordHash: adminPassword,
      name: "Admin User",
      role: "admin",
      organizationId: org.id,
    },
  })

  const analyst = await prisma.user.upsert({
    where: { email: "analyst@demo.com" },
    update: {},
    create: {
      id: "user_analyst",
      email: "analyst@demo.com",
      passwordHash: analystPassword,
      name: "Data Analyst",
      role: "analyst",
      organizationId: org.id,
    },
  })

  console.log("创建用户:", admin.email, analyst.email)

  // Create demo database connection
  const dbConnection = await prisma.databaseConnection.upsert({
    where: { id: "db_demo" },
    update: {},
    create: {
      id: "db_demo",
      name: "Sales Database",
      type: "mysql",
      host: "127.0.0.1",
      port: 3306,
      database: "test",
      username: "root",
      password: "root",
      ssl: false,
      organizationId: org.id,
      createdBy: admin.id,
      status: "disconnected",
      metadata: {
        tables: ["customers", "orders", "products", "sales"],
        schemas: [
          {
            tableName: "customers",
            columns: [
              { name: "id", type: "integer", nullable: false, isPrimaryKey: true, isForeignKey: false },
              { name: "name", type: "varchar", nullable: false, isPrimaryKey: false, isForeignKey: false },
              { name: "email", type: "varchar", nullable: false, isPrimaryKey: false, isForeignKey: false },
              { name: "country", type: "varchar", nullable: true, isPrimaryKey: false, isForeignKey: false },
            ],
          },
          {
            tableName: "orders",
            columns: [
              { name: "id", type: "integer", nullable: false, isPrimaryKey: true, isForeignKey: false },
              { name: "customer_id", type: "integer", nullable: false, isPrimaryKey: false, isForeignKey: true },
              { name: "total_amount", type: "decimal", nullable: false, isPrimaryKey: false, isForeignKey: false },
              { name: "order_date", type: "timestamp", nullable: false, isPrimaryKey: false, isForeignKey: false },
            ],
          },
        ],
      },
    },
  })

  console.log("创建数据库连接:", dbConnection.name)

  console.log("数据库初始化完成！")
  console.log("\n演示账号:")
  console.log("管理员: admin@demo.com / admin123")
  console.log("分析师: analyst@demo.com / analyst123")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })


