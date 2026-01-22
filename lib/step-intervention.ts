/**
 * 步骤干预功能
 * 参考火山引擎智能分析Agent的步骤干预能力
 * 允许用户在任务执行过程中调整特定步骤
 */

import type { TaskPlan, AnalysisStep } from "./task-planner"
import { StepExecutor } from "./step-executor"
import type { ExecutionContext } from "./step-executor"

export interface StepIntervention {
  stepId: string
  type: "modify" | "retry" | "skip" | "add" | "reorder"
  changes?: {
    config?: Partial<AnalysisStep["config"]>
    description?: string
    title?: string
  }
  cascade?: boolean // 是否级联调整后续步骤
}

export interface InterventionResult {
  success: boolean
  affectedSteps: string[] // 受影响的步骤ID列表
  message: string
  plan: TaskPlan
}

export class StepIntervention {
  /**
   * 应用步骤干预
   * 参考火山引擎：用户可以调整某个步骤，系统会重新分析此步骤及其后的所有步骤
   */
  static async applyIntervention(
    plan: TaskPlan,
    intervention: StepIntervention,
    context: ExecutionContext
  ): Promise<InterventionResult> {
    const affectedSteps: string[] = []
    
    try {
      const step = plan.steps.find(s => s.id === intervention.stepId)
      if (!step) {
        throw new Error(`步骤 ${intervention.stepId} 不存在`)
      }
      
      switch (intervention.type) {
        case "modify":
          return await this.modifyStep(plan, step, intervention, context, affectedSteps)
          
        case "retry":
          return await this.retryStep(plan, step, context, affectedSteps)
          
        case "skip":
          return await this.skipStep(plan, step, affectedSteps)
          
        case "add":
          return await this.addStep(plan, intervention, context, affectedSteps)
          
        case "reorder":
          return await this.reorderSteps(plan, intervention, affectedSteps)
          
        default:
          throw new Error(`未知的干预类型: ${intervention.type}`)
      }
    } catch (error: any) {
      return {
        success: false,
        affectedSteps,
        message: error.message,
        plan,
      }
    }
  }

  /**
   * 修改步骤
   */
  private static async modifyStep(
    plan: TaskPlan,
    step: AnalysisStep,
    intervention: StepIntervention,
    context: ExecutionContext,
    affectedSteps: string[]
  ): Promise<InterventionResult> {
    // 应用修改
    if (intervention.changes?.config) {
      step.config = {
        ...step.config,
        ...intervention.changes.config,
      }
    }
    
    if (intervention.changes?.description) {
      step.description = intervention.changes.description
    }
    
    if (intervention.changes?.title) {
      step.title = intervention.changes.title
    }
    
    affectedSteps.push(step.id)
    
    // 如果启用级联，需要重新执行此步骤及其后的所有步骤
    if (intervention.cascade !== false) {
      // 找到此步骤的索引
      const stepIndex = plan.steps.findIndex(s => s.id === step.id)
      
      // 重置此步骤及其后所有步骤的状态
      for (let i = stepIndex; i < plan.steps.length; i++) {
        const laterStep = plan.steps[i]
        if (laterStep.status === "completed" || laterStep.status === "in_progress") {
          laterStep.status = "pending"
          laterStep.result = undefined
          laterStep.error = undefined
          affectedSteps.push(laterStep.id)
        }
      }
      
      // 重新执行此步骤
      await StepExecutor.executeStep(step, plan, context)
      
      // 继续执行后续步骤（如果需要）
      if (plan.status === "executing") {
        const remainingResults = await StepExecutor.executePlan(plan, context)
        affectedSteps.push(...remainingResults.results.map(r => r.stepId))
      }
    } else {
      // 不级联，只重新执行当前步骤
      await StepExecutor.executeStep(step, plan, context)
    }
    
    plan.updatedAt = new Date().toISOString()
    
    return {
      success: true,
      affectedSteps,
      message: `步骤 ${step.title} 已修改${intervention.cascade !== false ? "，并重新执行了后续步骤" : ""}`,
      plan,
    }
  }

  /**
   * 重试步骤
   */
  private static async retryStep(
    plan: TaskPlan,
    step: AnalysisStep,
    context: ExecutionContext,
    affectedSteps: string[]
  ): Promise<InterventionResult> {
    const result = await StepExecutor.retryStep(plan, step.id, context)
    
    affectedSteps.push(step.id)
    
    // 如果步骤重试成功且启用级联，重新执行后续步骤
    if (result.success && step.canIntervene) {
      const stepIndex = plan.steps.findIndex(s => s.id === step.id)
      
      for (let i = stepIndex + 1; i < plan.steps.length; i++) {
        const laterStep = plan.steps[i]
        if (laterStep.status === "completed") {
          laterStep.status = "pending"
          laterStep.result = undefined
          affectedSteps.push(laterStep.id)
        }
      }
      
      // 继续执行后续步骤
      if (plan.status === "executing") {
        await StepExecutor.executePlan(plan, context)
      }
    }
    
    return {
      success: result.success,
      affectedSteps,
      message: result.success 
        ? `步骤 ${step.title} 重试成功`
        : `步骤 ${step.title} 重试失败: ${result.error}`,
      plan,
    }
  }

  /**
   * 跳过步骤
   */
  private static skipStep(
    plan: TaskPlan,
    step: AnalysisStep,
    affectedSteps: string[]
  ): Promise<InterventionResult> {
    StepExecutor.skipStep(plan, step.id)
    affectedSteps.push(step.id)
    
    return Promise.resolve({
      success: true,
      affectedSteps,
      message: `步骤 ${step.title} 已跳过`,
      plan,
    })
  }

  /**
   * 添加新步骤
   */
  private static async addStep(
    plan: TaskPlan,
    intervention: StepIntervention,
    context: ExecutionContext,
    affectedSteps: string[]
  ): Promise<InterventionResult> {
    if (!intervention.changes?.config) {
      throw new Error("添加步骤需要提供步骤配置")
    }
    
    const newStep: AnalysisStep = {
      id: `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: intervention.changes.config.analysisType as any || "data_analysis",
      title: intervention.changes.title || "新增步骤",
      description: intervention.changes.description || "",
      status: "pending",
      dependencies: [],
      config: intervention.changes.config,
      canIntervene: true,
    }
    
    // 插入到指定位置（默认插入到当前步骤之后）
    const targetStepIndex = plan.steps.findIndex(s => s.id === intervention.stepId)
    if (targetStepIndex >= 0) {
      plan.steps.splice(targetStepIndex + 1, 0, newStep)
    } else {
      plan.steps.push(newStep)
    }
    
    affectedSteps.push(newStep.id)
    
    // 如果计划正在执行，立即执行新步骤
    if (plan.status === "executing") {
      await StepExecutor.executeStep(newStep, plan, context)
    }
    
    plan.updatedAt = new Date().toISOString()
    
    return {
      success: true,
      affectedSteps,
      message: `已添加新步骤: ${newStep.title}`,
      plan,
    }
  }

  /**
   * 重新排序步骤
   */
  private static reorderSteps(
    plan: TaskPlan,
    intervention: StepIntervention,
    affectedSteps: string[]
  ): Promise<InterventionResult> {
    // 重新排序需要提供新的顺序
    // 这里简化实现，实际需要更复杂的逻辑
    if (!intervention.changes?.config?.parameters?.newOrder) {
      throw new Error("重新排序需要提供新的步骤顺序")
    }
    
    const newOrder: string[] = intervention.changes.config.parameters.newOrder
    
    // 验证新顺序包含所有步骤
    const allStepIds = new Set(plan.steps.map(s => s.id))
    const newOrderSet = new Set(newOrder)
    
    if (allStepIds.size !== newOrderSet.size) {
      throw new Error("新顺序必须包含所有步骤")
    }
    
    // 重新排序
    const stepMap = new Map(plan.steps.map(s => [s.id, s]))
    plan.steps = newOrder.map(id => stepMap.get(id)!).filter(Boolean)
    
    // 更新依赖关系（如果需要）
    // 这里简化处理，实际可能需要重新计算依赖
    
    affectedSteps.push(...newOrder)
    plan.updatedAt = new Date().toISOString()
    
    return Promise.resolve({
      success: true,
      affectedSteps,
      message: "步骤顺序已更新",
      plan,
    })
  }

  /**
   * 获取可干预的步骤
   */
  static getIntervenableSteps(plan: TaskPlan): AnalysisStep[] {
    return plan.steps.filter(step => step.canIntervene !== false)
  }

  /**
   * 检查步骤是否可以干预
   */
  static canIntervene(plan: TaskPlan, stepId: string): boolean {
    const step = plan.steps.find(s => s.id === stepId)
    if (!step) {
      return false
    }
    
    // 只有pending、completed或failed状态的步骤可以干预
    return step.canIntervene !== false && 
           (step.status === "pending" || step.status === "completed" || step.status === "failed")
  }
}
