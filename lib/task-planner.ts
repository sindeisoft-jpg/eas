/**
 * 任务规划器
 * 参考火山引擎智能分析Agent的任务规划能力
 * 自动拆解复杂分析任务为多个步骤，并规划执行顺序
 */

export interface AnalysisStep {
  id: string
  type: "data_collection" | "data_analysis" | "sql_query" | "python_code" | "visualization" | "summary" | "attribution"
  title: string
  description: string
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped"
  dependencies: string[] // 依赖的其他步骤ID
  config?: {
    sql?: string
    pythonCode?: string
    targetTables?: string[]
    analysisType?: string
    parameters?: Record<string, any>
  }
  result?: any
  error?: string
  executionTime?: number
  canIntervene?: boolean // 是否允许用户干预
}

export interface TaskPlan {
  id: string
  userRequest: string
  goal: string
  steps: AnalysisStep[]
  status: "planning" | "executing" | "completed" | "failed" | "paused"
  currentStepIndex: number
  createdAt: string
  updatedAt: string
  estimatedTime?: number // 预估总时间（秒）
}

export interface PlanningContext {
  userRequest: string
  databaseSchema: any[]
  availableTables: string[]
  previousResults?: any[]
  agentTools?: any[]
}

export class TaskPlanner {
  /**
   * 规划分析任务
   * 根据用户请求自动拆解为多个步骤
   */
  static async plan(
    userRequest: string,
    context: PlanningContext
  ): Promise<TaskPlan> {
    const planId = `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    // 分析用户意图，确定需要哪些类型的步骤
    const intent = this.analyzeIntent(userRequest, context)
    
    // 生成步骤列表
    const steps = this.generateSteps(intent, context)
    
    // 计算预估时间
    const estimatedTime = this.estimateTime(steps)
    
    const plan: TaskPlan = {
      id: planId,
      userRequest,
      goal: this.extractGoal(userRequest),
      steps,
      status: "planning",
      currentStepIndex: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      estimatedTime,
    }
    
    return plan
  }

  /**
   * 分析用户意图
   */
  private static analyzeIntent(
    request: string,
    context: PlanningContext
  ): {
    needsDataCollection: boolean
    needsSQLQueries: boolean
    needsPythonAnalysis: boolean
    needsVisualization: boolean
    needsSummary: boolean
    needsAttribution: boolean
    targetTables: string[]
    analysisType?: string
  } {
    const lowerRequest = request.toLowerCase()
    
    // 识别目标表
    const targetTables = this.identifyTargetTables(lowerRequest, context.availableTables)
    
    // 判断是否需要数据收集
    const needsDataCollection = 
      targetTables.length === 0 || // 未指定表，需要探索
      lowerRequest.includes("所有") ||
      lowerRequest.includes("全部") ||
      lowerRequest.includes("探索") ||
      lowerRequest.includes("了解")
    
    // 判断是否需要SQL查询
    const needsSQLQueries = 
      lowerRequest.includes("查询") ||
      lowerRequest.includes("统计") ||
      lowerRequest.includes("汇总") ||
      lowerRequest.includes("有多少") ||
      lowerRequest.includes("显示") ||
      lowerRequest.includes("列出")
    
    // 判断是否需要Python分析
    const needsPythonAnalysis =
      lowerRequest.includes("分析") ||
      lowerRequest.includes("计算") ||
      lowerRequest.includes("预测") ||
      lowerRequest.includes("模型") ||
      lowerRequest.includes("机器学习")
    
    // 判断是否需要可视化
    const needsVisualization =
      lowerRequest.includes("图表") ||
      lowerRequest.includes("可视化") ||
      lowerRequest.includes("趋势") ||
      lowerRequest.includes("分布")
    
    // 判断是否需要总结
    const needsSummary =
      lowerRequest.includes("报告") ||
      lowerRequest.includes("总结") ||
      lowerRequest.includes("概述") ||
      lowerRequest.includes("结论")
    
    // 判断是否需要归因分析
    const needsAttribution =
      lowerRequest.includes("原因") ||
      lowerRequest.includes("为什么") ||
      lowerRequest.includes("归因") ||
      lowerRequest.includes("影响") ||
      lowerRequest.includes("转折")
    
    // 识别分析类型
    let analysisType: string | undefined
    if (lowerRequest.includes("趋势")) {
      analysisType = "trend"
    } else if (lowerRequest.includes("对比") || lowerRequest.includes("比较")) {
      analysisType = "comparison"
    } else if (lowerRequest.includes("分布")) {
      analysisType = "distribution"
    } else if (lowerRequest.includes("关联") || lowerRequest.includes("关系")) {
      analysisType = "correlation"
    }
    
    return {
      needsDataCollection,
      needsSQLQueries,
      needsPythonAnalysis,
      needsVisualization,
      needsSummary,
      needsAttribution,
      targetTables,
      analysisType,
    }
  }

  /**
   * 生成分析步骤
   */
  private static generateSteps(
    intent: ReturnType<typeof TaskPlanner.analyzeIntent>,
    context: PlanningContext
  ): AnalysisStep[] {
    const steps: AnalysisStep[] = []
    let stepIndex = 0
    
    // 步骤1: 数据收集（如果需要）
    if (intent.needsDataCollection) {
      steps.push({
        id: `step_${stepIndex++}`,
        type: "data_collection",
        title: "明确关键指标口径",
        description: intent.targetTables.length > 0
          ? `收集 ${intent.targetTables.join(", ")} 表的数据结构信息`
          : "探索数据库结构，识别相关表和字段",
        status: "pending",
        dependencies: [],
        config: {
          targetTables: intent.targetTables,
        },
        canIntervene: true,
      })
    }
    
    // 步骤2: SQL查询（如果需要）
    if (intent.needsSQLQueries) {
      steps.push({
        id: `step_${stepIndex++}`,
        type: "sql_query",
        title: "执行数据查询",
        description: "根据用户需求生成并执行SQL查询，获取所需数据",
        status: "pending",
        dependencies: intent.needsDataCollection ? [steps[steps.length - 1]?.id].filter(Boolean) : [],
        config: {
          targetTables: intent.targetTables,
        },
        canIntervene: true,
      })
    }
    
    // 步骤3: Python分析（如果需要）
    if (intent.needsPythonAnalysis) {
      steps.push({
        id: `step_${stepIndex++}`,
        type: "python_code",
        title: "执行深度分析",
        description: "使用Python进行数据分析和计算",
        status: "pending",
        dependencies: intent.needsSQLQueries 
          ? [steps[steps.length - 1]?.id].filter(Boolean)
          : intent.needsDataCollection 
            ? [steps[steps.length - 1]?.id].filter(Boolean)
            : [],
        config: {
          analysisType: intent.analysisType,
        },
        canIntervene: true,
      })
    }
    
    // 步骤4: 可视化（如果需要）
    if (intent.needsVisualization) {
      steps.push({
        id: `step_${stepIndex++}`,
        type: "visualization",
        title: "生成数据图表",
        description: "根据分析结果生成可视化图表",
        status: "pending",
        dependencies: steps.length > 0 ? [steps[steps.length - 1]?.id] : [],
        canIntervene: true,
      })
    }
    
    // 步骤5: 归因分析（如果需要）
    if (intent.needsAttribution) {
      steps.push({
        id: `step_${stepIndex++}`,
        type: "attribution",
        title: "执行归因分析",
        description: "分析数据变化的原因和影响因素",
        status: "pending",
        dependencies: steps.length > 0 ? [steps[steps.length - 1]?.id] : [],
        canIntervene: true,
      })
    }
    
    // 步骤6: 总结报告（如果需要）
    if (intent.needsSummary) {
      steps.push({
        id: `step_${stepIndex++}`,
        type: "summary",
        title: "生成分析报告",
        description: "整合所有分析结果，生成完整的分析报告",
        status: "pending",
        dependencies: steps.map(s => s.id),
        canIntervene: true,
      })
    }
    
    // 如果没有生成任何步骤，至少添加一个SQL查询步骤
    if (steps.length === 0) {
      steps.push({
        id: `step_${stepIndex++}`,
        type: "sql_query",
        title: "执行数据查询",
        description: "根据用户需求执行数据查询",
        status: "pending",
        dependencies: [],
        canIntervene: true,
      })
    }
    
    return steps
  }

  /**
   * 识别目标表
   */
  private static identifyTargetTables(
    request: string,
    availableTables: string[]
  ): string[] {
    const tables: string[] = []
    
    for (const table of availableTables) {
      const tableLower = table.toLowerCase()
      if (
        request.includes(tableLower) ||
        request.includes(tableLower.replace(/_/g, " ")) ||
        request.includes(tableLower.replace(/_/g, ""))
      ) {
        tables.push(table)
      }
    }
    
    return tables
  }

  /**
   * 提取目标
   */
  private static extractGoal(request: string): string {
    // 简化版本：直接使用用户请求作为目标
    // 可以后续用LLM优化
    return request
  }

  /**
   * 预估执行时间
   */
  private static estimateTime(steps: AnalysisStep[]): number {
    const timePerStep: Record<AnalysisStep["type"], number> = {
      data_collection: 2,
      sql_query: 3,
      python_code: 5,
      visualization: 2,
      attribution: 4,
      summary: 3,
      data_analysis: 3,
    }
    
    return steps.reduce((total, step) => {
      return total + (timePerStep[step.type] || 3)
    }, 0)
  }

  /**
   * 验证步骤依赖关系
   */
  static validateDependencies(plan: TaskPlan): { valid: boolean; errors: string[] } {
    const errors: string[] = []
    const stepIds = new Set(plan.steps.map(s => s.id))
    
    for (const step of plan.steps) {
      for (const depId of step.dependencies) {
        if (!stepIds.has(depId)) {
          errors.push(`步骤 ${step.id} 依赖的步骤 ${depId} 不存在`)
        }
      }
    }
    
    // 检查循环依赖
    const visited = new Set<string>()
    const visiting = new Set<string>()
    
    const hasCycle = (stepId: string): boolean => {
      if (visiting.has(stepId)) {
        return true
      }
      if (visited.has(stepId)) {
        return false
      }
      
      visiting.add(stepId)
      const step = plan.steps.find(s => s.id === stepId)
      if (step) {
        for (const depId of step.dependencies) {
          if (hasCycle(depId)) {
            return true
          }
        }
      }
      visiting.delete(stepId)
      visited.add(stepId)
      return false
    }
    
    for (const step of plan.steps) {
      if (hasCycle(step.id)) {
        errors.push(`检测到循环依赖，涉及步骤 ${step.id}`)
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
    }
  }

  /**
   * 获取可执行的步骤（所有依赖都已完成）
   */
  static getExecutableSteps(plan: TaskPlan): AnalysisStep[] {
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
}
