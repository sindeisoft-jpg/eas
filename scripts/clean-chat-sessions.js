#!/usr/bin/env node

/**
 * 清理所有聊天记录脚本
 * 使用方法: node scripts/clean-chat-sessions.js
 */

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function cleanChatSessions() {
  try {
    console.log('开始清理聊天记录...')
    
    // 先删除所有聊天消息
    console.log('删除所有聊天消息...')
    const deletedMessages = await prisma.chatMessage.deleteMany({})
    console.log(`已删除 ${deletedMessages.count} 条消息`)
    
    // 再删除所有聊天会话
    console.log('删除所有聊天会话...')
    const deletedSessions = await prisma.chatSession.deleteMany({})
    console.log(`已删除 ${deletedSessions.count} 个会话`)
    
    // 验证删除结果
    const remainingSessions = await prisma.chatSession.count()
    const remainingMessages = await prisma.chatMessage.count()
    
    console.log('\n清理完成！')
    console.log(`剩余会话数: ${remainingSessions}`)
    console.log(`剩余消息数: ${remainingMessages}`)
    
    if (remainingSessions === 0 && remainingMessages === 0) {
      console.log('✅ 所有聊天记录已成功清理')
    } else {
      console.log('⚠️  仍有部分记录未清理')
    }
  } catch (error) {
    console.error('清理失败:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

cleanChatSessions()
