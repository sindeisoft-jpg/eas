/**
 * 任务规划集成示例
 * 展示如何在chat route中集成任务规划和报告生成功能
 * 参考火山引擎智能分析Agent的实现
 */

import { TaskPlanner } from "./task-planner"
import { StepExecutor } from "./step-executor"
import { StepIntervention } from "./step-intervention"
import { ReportGenerator } from "./report-generator"
import { AttributionAnalyzer } from "./attribution-analyzer"
import type { TaskPlan, AnalysisStep } from "./task-planner"
import type { DatabaseConnection, DatabaseSchema } from "./types"

/**
 * 集成任务规划到聊天流程
 */
export class TaskPlanningIntegration {
  /**
   * 处理用户请求，自动规划并执行任务
   */
  static async processUserRequest(
    userRequest: string,
    context: {
      databaseConnection: DatabaseConnection
      databaseSchema: DatabaseSchema[]
      agentTools?: any[]
      llmConnection?: any
    }
  ): Promise<{
    plan: TaskPlan
    executionResults: any[]
    report?: any
    success: boolean
  }> {
    // 1. 规划任务
    const plan = await TaskPlanner.plan(userRequest, {
      userRequest,
      databaseSchema: context.databaseSchema,
      availableTables: context.databaseSchema.map(s => s.tableName),
      agentTools: context.agentTools,
    })
    
    // 2. 验证计划
    const validation = TaskPlanner.validateDependencies(plan)
    if (!validation.valid) {
      throw new Error(`任务规划验证失败: ${validation.errors.join(", ")}`)
    }
    
    // 3. 执行计划
    const executionContext = {
      databaseConnection: context.databaseConnection,
      databaseSchema: context.databaseSchema,
      previousResults: new Map<string, any>(),
      agentTools: context.agentTools,
      llmConnection: context.llmConnection,
    }
    
    const executionResult = await StepExecutor.executePlan(plan, executionContext)
    
    // 4. 生成报告（如果所有步骤都完成）
    let report = undefined
    if (executionResult.success && plan.status === "completed") {
      report = await ReportGenerator.generateReport(plan, executionContext.previousResults)
    }
    
    return {
      plan,
      executionResults: executionResult.results,
      report,
      success: executionResult.success,
    }
  }

  /**
   * 处理步骤干预请求
   */
  static async handleIntervention(
    plan: TaskPlan,
    intervention: {
      stepId: string
      type: "modify" | "retry" | "skip" | "add" | "reorder"
      changes?: {
        config?: Partial<AnalysisStep["config"]>
        description?: string
        title?: string
      }
      cascade?: boolean
    },
    context: {
      databaseConnection: DatabaseConnection
      databaseSchema: DatabaseSchema[]
      agentTools?: any[]
      llmConnection?: any
    }
  ): Promise<{
    result: any
    updatedPlan: TaskPlan
    report?: any
  }> {
    const executionContext = {
      databaseConnection: context.databaseConnection,
      databaseSchema: context.databaseSchema,
      previousResults: new Map<string, any>(),
      agentTools: context.agentTools,
      llmConnection: context.llmConnection,
    }
    
    // 恢复之前的结果
    for (const step of plan.steps) {
      if (step.status === "completed" && step.result) {
        executionContext.previousResults.set(step.id, step.result)
      }
    }
    
    // 应用干预
    const interventionResult = await StepIntervention.applyIntervention(
      plan,
      intervention,
      executionContext
    )
    
    // 如果干预成功且计划完成，重新生成报告
    let report = undefined
    if (interventionResult.success && plan.status === "completed") {
      report = await ReportGenerator.generateReport(plan, executionContext.previousResults)
    }
    
    return {
      result: interventionResult,
      updatedPlan: plan,
      report,
    }
  }

  /**
   * 执行归因分析
   */
  static async performAttributionAnalysis(
    queryResult: any
  ): Promise<any> {
    return await AttributionAnalyzer.analyze(queryResult)
  }

  /**
   * 格式化任务计划为用户友好的消息
   */
  static formatPlanAsMessage(plan: TaskPlan): string {
    const parts: string[] = []
    
    parts.push(`📋 **分析任务规划**\n`)
    parts.push(`**目标**: ${plan.goal}\n`)
    parts.push(`**预计执行时间**: ${plan.estimatedTime || 0} 秒\n`)
    parts.push(`**步骤列表**:\n`)
    
    plan.steps.forEach((step, index) => {
      const statusEmoji = {
        pending: "⏳",
        in_progress: "🔄",
        completed: "✅",
        failed: "❌",
        skipped: "⏭️",
      }[step.status] || "❓"
      
      parts.push(`${index + 1}. ${statusEmoji} **${step.title}**`)
      parts.push(`   ${step.description}`)
      
      if (step.dependencies.length > 0) {
        parts.push(`   依赖: ${step.dependencies.join(", ")}`)
      }
      
      if (step.status === "completed" && step.executionTime) {
        parts.push(`   执行时间: ${(step.executionTime / 1000).toFixed(2)} 秒`)
      }
      
      if (step.status === "failed" && step.error) {
        parts.push(`   错误: ${step.error}`)
      }
      
      parts.push("")
    })
    
    return parts.join("\n")
  }

  /**
   * 格式化报告为消息
   */
  static formatReportAsMessage(report: any): string {
    return ReportGenerator.formatAsMarkdown(report)
  }

  /**
   * 检查用户请求是否需要任务规划
   */
  static needsTaskPlanning(userRequest: string): boolean {
    const lowerRequest = userRequest.toLowerCase()
    
    // 复杂分析请求通常需要任务规划
    const complexKeywords = [
      "分析报告",
      "深度分析",
      "完整分析",
      "详细报告",
      "综合分析",
      "全面分析",
      "分析...的使用情况",
      "生成报告",
    ]
    
    return complexKeywords.some(keyword => lowerRequest.includes(keyword))
  }
}
