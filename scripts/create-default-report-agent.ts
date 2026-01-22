/**
 * 创建默认报告生成智能体的脚本
 * 用于在系统中创建预配置的报告生成智能体
 */

import { ReportAgentGenerator } from "../lib/report-agent-generator"

/**
 * 使用示例：
 * 
 * import { storage } from "@/lib/storage"
 * import { ReportAgentGenerator } from "@/lib/report-agent-generator"
 * 
 * // 创建报告生成智能体
 * const agent = ReportAgentGenerator.createDefaultReportAgent(
 *   llmConnectionId,  // LLM连接ID
 *   databaseConnectionId  // 数据库连接ID（可选）
 * )
 * 
 * // 保存智能体
 * const savedAgent = await storage.agents.save({
 *   ...agent,
 *   id: `agent_${Date.now()}`,
 *   organizationId: user.organizationId,
 *   createdBy: user.id,
 *   createdAt: new Date().toISOString(),
 *   updatedAt: new Date().toISOString(),
 * })
 */

export { ReportAgentGenerator }
