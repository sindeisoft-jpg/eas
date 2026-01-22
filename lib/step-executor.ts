/**
 * 步骤执行管理器
 * 管理任务规划中各个步骤的执行和状态
 * 参考火山引擎智能分析Agent的步骤执行能力
 */

import type { TaskPlan, AnalysisStep } from "./task-planner"
import { SQLExecutor } from "./sql-executor"
import type { DatabaseConnection, QueryResult } from "./types"

export interface StepExecutionResult {
  stepId: string
  success: boolean
  result?: any
  error?: string
  executionTime: number
  metadata?: Record<string, any>
}

export interface ExecutionContext {
  databaseConnection: DatabaseConnection
  databaseSchema: any[]
  previousResults: Map<string, any> // stepId -> result
  agentTools?: any[]
  llmConnection?: any
}

export class StepExecutor {
  /**
   * 执行单个步骤
   */
  static async executeStep(
    step: AnalysisStep,
    plan: TaskPlan,
    context: ExecutionContext
  ): Promise<StepExecutionResult> {
    const startTime = Date.now()
    
    try {
      // 更新步骤状态为执行中
      step.status = "in_progress"
      
      let result: any
      
      switch (step.type) {
        case "data_collection":
          result = await this.executeDataCollection(step, context)
          break
          
        case "sql_query":
          result = await this.executeSQLQuery(step, context)
          break
          
        case "python_code":
          result = await this.executePythonCode(step, context)
          break
          
        case "visualization":
          result = await this.executeVisualization(step, context)
          break
          
        case "attribution":
          result = await this.executeAttribution(step, context)
          break
          
        case "summary":
          result = await this.executeSummary(step, plan, context)
          break
          
        default:
          throw new Error(`未知的步骤类型: ${step.type}`)
      }
      
      const executionTime = Date.now() - startTime
      
      // 更新步骤结果
      step.result = result
      step.status = "completed"
      step.executionTime = executionTime
      
      // 保存结果到上下文
      context.previousResults.set(step.id, result)
      
      return {
        stepId: step.id,
        success: true,
        result,
        executionTime,
      }
    } catch (error: any) {
      const executionTime = Date.now() - startTime
      
      step.status = "failed"
      step.error = error.message
      step.executionTime = executionTime
      
      return {
        stepId: step.id,
        success: false,
        error: error.message,
        executionTime,
      }
    }
  }

  /**
   * 执行数据收集步骤
   */
  private static async executeDataCollection(
    step: AnalysisStep,
    context: ExecutionContext
  ): Promise<any> {
    const targetTables = step.config?.targetTables || []
    
    // 如果已经提供了数据库结构，直接返回
    if (context.databaseSchema && context.databaseSchema.length > 0) {
      return {
        schema: context.databaseSchema,
        tables: targetTables.length > 0 
          ? targetTables 
          : context.databaseSchema.map((s: any) => s.tableName),
        message: "数据库结构信息已获取",
      }
    }
    
    // 否则需要查询数据库结构
    // 这里可以调用现有的schema查询逻辑
    return {
      schema: context.databaseSchema,
      tables: targetTables,
      message: "数据收集完成",
    }
  }

  /**
   * 执行SQL查询步骤
   */
  private static async executeSQLQuery(
    step: AnalysisStep,
    context: ExecutionContext
  ): Promise<QueryResult> {
    if (!step.config?.sql) {
      throw new Error("SQL查询步骤缺少SQL语句配置")
    }
    
    const result = await SQLExecutor.executeQuery(
      context.databaseConnection,
      step.config.sql,
      true // 允许所有操作
    )
    
    return result
  }

  /**
   * 执行Python代码步骤
   */
  private static async executePythonCode(
    step: AnalysisStep,
    context: ExecutionContext
  ): Promise<any> {
    // 这里需要集成Python执行器
    // 暂时返回占位符
    if (!step.config?.pythonCode) {
      throw new Error("Python代码步骤缺少代码配置")
    }
    
    // TODO: 实现Python代码执行
    // 可以使用类似 pyodide 或调用外部Python服务
    return {
      message: "Python代码执行功能待实现",
      code: step.config.pythonCode,
    }
  }

  /**
   * 执行可视化步骤
   */
  private static async executeVisualization(
    step: AnalysisStep,
    context: ExecutionContext
  ): Promise<any> {
    // 从依赖步骤获取数据
    const dataSteps = step.dependencies
      .map(depId => context.previousResults.get(depId))
      .filter(Boolean)
    
    if (dataSteps.length === 0) {
      throw new Error("可视化步骤缺少数据源")
    }
    
    // 生成图表配置
    // 这里可以集成图表生成逻辑
    return {
      charts: dataSteps.map((data, index) => ({
        id: `chart_${index}`,
        type: "line", // 默认折线图
        data: data,
        config: {
          title: `图表 ${index + 1}`,
        },
      })),
      message: "图表生成完成",
    }
  }

  /**
   * 执行归因分析步骤
   */
  private static async executeAttribution(
    step: AnalysisStep,
    context: ExecutionContext
  ): Promise<any> {
    // 从依赖步骤获取数据
    const dataSteps = step.dependencies
      .map(depId => context.previousResults.get(depId))
      .filter(Boolean)
    
    if (dataSteps.length === 0) {
      throw new Error("归因分析步骤缺少数据源")
    }
    
    // 这里可以调用归因分析器
    // 暂时返回占位符
    return {
      message: "归因分析完成",
      insights: [
        "识别到数据变化的转折点",
        "分析影响因素",
      ],
      data: dataSteps[0],
    }
  }

  /**
   * 执行总结报告步骤
   */
  private static async executeSummary(
    step: AnalysisStep,
    plan: TaskPlan,
    context: ExecutionContext
  ): Promise<any> {
    // 收集所有已完成步骤的结果
    const allResults = plan.steps
      .filter(s => s.status === "completed" && s.result)
      .map(s => ({
        stepId: s.id,
        title: s.title,
        result: s.result,
      }))
    
    // 生成报告
    // 这里可以调用LLM生成报告内容
    return {
      report: {
        title: `分析报告: ${plan.goal}`,
        summary: "基于以上分析步骤，生成完整的分析报告",
        sections: allResults.map(r => ({
          title: r.title,
          content: JSON.stringify(r.result, null, 2),
        })),
        generatedAt: new Date().toISOString(),
      },
      message: "报告生成完成",
    }
  }

  /**
   * 执行整个任务计划
   */
  static async executePlan(
    plan: TaskPlan,
    context: ExecutionContext
  ): Promise<{
    plan: TaskPlan
    results: StepExecutionResult[]
    success: boolean
  }> {
    plan.status = "executing"
    const results: StepExecutionResult[] = []
    
    try {
      while (plan.currentStepIndex < plan.steps.length) {
        // 获取可执行的步骤
        const executableSteps = this.getExecutableSteps(plan)
        
        if (executableSteps.length === 0) {
          // 没有可执行的步骤，检查是否有失败的步骤
          const failedSteps = plan.steps.filter(s => s.status === "failed")
          if (failedSteps.length > 0) {
            plan.status = "failed"
            break
          }
          
          // 所有步骤都已完成或跳过
          if (plan.steps.every(s => s.status === "completed" || s.status === "skipped")) {
            plan.status = "completed"
            break
          }
          
          // 等待依赖完成（在实际实现中可能需要异步等待）
          break
        }
        
        // 执行第一个可执行的步骤
        const stepToExecute = executableSteps[0]
        const result = await this.executeStep(stepToExecute, plan, context)
        results.push(result)
        
        if (!result.success) {
          // 步骤执行失败，根据策略决定是否继续
          // 可以配置为继续执行或停止
          console.warn(`步骤 ${stepToExecute.id} 执行失败:`, result.error)
        }
        
        plan.currentStepIndex = plan.steps.findIndex(s => s.id === stepToExecute.id) + 1
        plan.updatedAt = new Date().toISOString()
      }
      
      if (plan.status === "executing") {
        plan.status = plan.steps.every(s => s.status === "completed" || s.status === "skipped")
          ? "completed"
          : "failed"
      }
      
      return {
        plan,
        results,
        success: plan.status === "completed",
      }
    } catch (error: any) {
      plan.status = "failed"
      return {
        plan,
        results,
        success: false,
      }
    }
  }

  /**
   * 获取可执行的步骤
   */
  private static getExecutableSteps(plan: TaskPlan): AnalysisStep[] {
    const completedStepIds = new Set(
      plan.steps
        .filter(s => s.status === "completed")
        .map(s => s.id)
    )
    
    return plan.steps.filter(step => {
      if (step.status !== "pending") {
        return false
      }
      
      // 检查所有依赖是否都已完成
      return step.dependencies.every(depId => completedStepIds.has(depId))
    })
  }

  /**
   * 暂停任务执行
   */
  static pausePlan(plan: TaskPlan): void {
    if (plan.status === "executing") {
      plan.status = "paused"
      plan.updatedAt = new Date().toISOString()
    }
  }

  /**
   * 恢复任务执行
   */
  static resumePlan(plan: TaskPlan): void {
    if (plan.status === "paused") {
      plan.status = "executing"
      plan.updatedAt = new Date().toISOString()
    }
  }

  /**
   * 跳过步骤
   */
  static skipStep(plan: TaskPlan, stepId: string): void {
    const step = plan.steps.find(s => s.id === stepId)
    if (step && step.status === "pending") {
      step.status = "skipped"
      plan.updatedAt = new Date().toISOString()
    }
  }

  /**
   * 重试失败的步骤
   */
  static async retryStep(
    plan: TaskPlan,
    stepId: string,
    context: ExecutionContext
  ): Promise<StepExecutionResult> {
    const step = plan.steps.find(s => s.id === stepId)
    if (!step) {
      throw new Error(`步骤 ${stepId} 不存在`)
    }
    
    if (step.status !== "failed") {
      throw new Error(`步骤 ${stepId} 不是失败状态，无法重试`)
    }
    
    // 重置步骤状态
    step.status = "pending"
    step.error = undefined
    step.result = undefined
    
    // 重新执行
    return await this.executeStep(step, plan, context)
  }
}
