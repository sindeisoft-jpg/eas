#!/bin/bash

# 清理 Next.js 开发服务器锁文件和进程的脚本

echo "🧹 开始清理 Next.js 开发环境..."

# 1. 终止所有 Next.js 进程
echo "📛 终止 Next.js 进程..."
pkill -9 -f "next dev" 2>/dev/null
pkill -9 -f "next-server" 2>/dev/null
lsof -ti:3000 | xargs kill -9 2>/dev/null

# 2. 删除 .next 目录
echo "🗑️  删除 .next 目录..."
rm -rf .next

# 3. 清理锁文件
echo "🔓 清理锁文件..."
find . -name "*.lock" -path "*/.next/*" -delete 2>/dev/null

# 4. 清理 node_modules 缓存
echo "🧽 清理 node_modules 缓存..."
rm -rf node_modules/.cache 2>/dev/null

echo "✅ 清理完成！现在可以运行 'pnpm dev' 了"


# 清理 Next.js 开发服务器锁文件和进程的脚本

echo "🧹 开始清理 Next.js 开发环境..."

# 1. 终止所有 Next.js 进程
echo "📛 终止 Next.js 进程..."
pkill -9 -f "next dev" 2>/dev/null
pkill -9 -f "next-server" 2>/dev/null
lsof -ti:3000 | xargs kill -9 2>/dev/null

# 2. 删除 .next 目录
echo "🗑️  删除 .next 目录..."
rm -rf .next

# 3. 清理锁文件
echo "🔓 清理锁文件..."
find . -name "*.lock" -path "*/.next/*" -delete 2>/dev/null

# 4. 清理 node_modules 缓存
echo "🧽 清理 node_modules 缓存..."
rm -rf node_modules/.cache 2>/dev/null

echo "✅ 清理完成！现在可以运行 'pnpm dev' 了"

