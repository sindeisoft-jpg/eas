#!/bin/bash

# 数据库初始化脚本
# 这个脚本会创建数据库并运行迁移

set -e

echo "🚀 开始初始化数据库..."

# 检查 .env 文件
if [ ! -f .env ]; then
    echo "❌ 未找到 .env 文件，正在创建..."
    cat > .env << EOF
DATABASE_URL="mysql://root:root@127.0.0.1:3306/enterprise_ai_bi"
JWT_SECRET="your-secret-key-change-this-in-production-$(date +%s)"
NODE_ENV="development"
EOF
    echo "✅ .env 文件已创建"
fi

# 从 .env 文件中提取数据库信息
source .env
DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')
DB_USER=$(echo $DATABASE_URL | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
DB_PASS=$(echo $DATABASE_URL | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
DB_HOST=$(echo $DATABASE_URL | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_PORT=$(echo $DATABASE_URL | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')

echo "📊 数据库配置:"
echo "   主机: $DB_HOST"
echo "   端口: $DB_PORT"
echo "   用户: $DB_USER"
echo "   数据库: $DB_NAME"

# 创建数据库（如果不存在）
echo ""
echo "📦 创建数据库（如果不存在）..."
mysql -h$DB_HOST -P$DB_PORT -u$DB_USER -p$DB_PASS -e "CREATE DATABASE IF NOT EXISTS $DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null || {
    echo "⚠️  无法自动创建数据库，请手动在 MySQL 中运行:"
    echo "   CREATE DATABASE IF NOT EXISTS $DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    read -p "按 Enter 继续..."
}

echo "✅ 数据库准备完成"

# 生成 Prisma Client
echo ""
echo "🔧 生成 Prisma Client..."
pnpm db:generate

# 运行数据库迁移
echo ""
echo "📝 运行数据库迁移..."
pnpm db:migrate

# 运行种子数据
echo ""
echo "🌱 运行种子数据..."
pnpm db:seed

echo ""
echo "✅ 数据库初始化完成！"
echo ""
echo "📋 演示账号:"
echo "   管理员: admin@demo.com / admin123"
echo "   分析师: analyst@demo.com / analyst123"


# 数据库初始化脚本
# 这个脚本会创建数据库并运行迁移

set -e

echo "🚀 开始初始化数据库..."

# 检查 .env 文件
if [ ! -f .env ]; then
    echo "❌ 未找到 .env 文件，正在创建..."
    cat > .env << EOF
DATABASE_URL="mysql://root:root@127.0.0.1:3306/enterprise_ai_bi"
JWT_SECRET="your-secret-key-change-this-in-production-$(date +%s)"
NODE_ENV="development"
EOF
    echo "✅ .env 文件已创建"
fi

# 从 .env 文件中提取数据库信息
source .env
DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')
DB_USER=$(echo $DATABASE_URL | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
DB_PASS=$(echo $DATABASE_URL | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
DB_HOST=$(echo $DATABASE_URL | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_PORT=$(echo $DATABASE_URL | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')

echo "📊 数据库配置:"
echo "   主机: $DB_HOST"
echo "   端口: $DB_PORT"
echo "   用户: $DB_USER"
echo "   数据库: $DB_NAME"

# 创建数据库（如果不存在）
echo ""
echo "📦 创建数据库（如果不存在）..."
mysql -h$DB_HOST -P$DB_PORT -u$DB_USER -p$DB_PASS -e "CREATE DATABASE IF NOT EXISTS $DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null || {
    echo "⚠️  无法自动创建数据库，请手动在 MySQL 中运行:"
    echo "   CREATE DATABASE IF NOT EXISTS $DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    read -p "按 Enter 继续..."
}

echo "✅ 数据库准备完成"

# 生成 Prisma Client
echo ""
echo "🔧 生成 Prisma Client..."
pnpm db:generate

# 运行数据库迁移
echo ""
echo "📝 运行数据库迁移..."
pnpm db:migrate

# 运行种子数据
echo ""
echo "🌱 运行种子数据..."
pnpm db:seed

echo ""
echo "✅ 数据库初始化完成！"
echo ""
echo "📋 演示账号:"
echo "   管理员: admin@demo.com / admin123"
echo "   分析师: analyst@demo.com / analyst123"

