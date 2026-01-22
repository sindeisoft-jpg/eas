# 任务规划与报告生成优化说明

## 概述

本次优化参考了火山引擎智能分析Agent的核心功能，为系统添加了以下能力：

1. **任务规划器（TaskPlanner）** - 自动拆解复杂分析任务为多个步骤
2. **步骤执行管理器（StepExecutor）** - 管理步骤的执行和状态
3. **步骤干预功能（StepIntervention）** - 允许用户调整特定步骤
4. **报告生成器（ReportGenerator）** - 生成深度分析报告
5. **归因分析器（AttributionAnalyzer）** - 分析数据变化原因
6. **Python代码执行器（PythonExecutor）** - 支持Python代码执行（待实现实际执行环境）

## 新增文件

### 核心模块

1. **`lib/task-planner.ts`** - 任务规划器
   - 自动分析用户意图
   - 生成分析步骤
   - 验证依赖关系
   - 预估执行时间

2. **`lib/step-executor.ts`** - 步骤执行管理器
   - 执行单个步骤
   - 管理步骤状态
   - 执行整个任务计划
   - 支持暂停、恢复、重试

3. **`lib/step-intervention.ts`** - 步骤干预功能
   - 修改步骤配置
   - 重试失败步骤
   - 跳过步骤
   - 添加新步骤
   - 重新排序步骤
   - 级联调整后续步骤

4. **`lib/report-generator.ts`** - 报告生成器
   - 生成分析报告
   - 格式化报告为Markdown/JSON
   - 提取关键发现
   - 生成建议

5. **`lib/attribution-analyzer.ts`** - 归因分析器
   - 识别数据转折点
   - 分析数据变化原因
   - 生成洞察和建议

6. **`lib/python-executor.ts`** - Python代码执行器
   - 验证代码安全性
   - 执行Python代码（需要实际执行环境）
   - 生成分析模板

7. **`lib/task-planning-integration.ts`** - 集成示例
   - 展示如何集成到chat route
   - 处理用户请求
   - 处理步骤干预

### 类型定义

在 `lib/types.ts` 中新增了以下类型：

- `TaskPlan` - 任务计划
- `AnalysisStep` - 分析步骤
- `AnalysisReport` - 分析报告
- `ReportSection` - 报告章节
- `AttributionAnalysis` - 归因分析结果
- `AttributionInsight` - 归因洞察

## 核心功能

### 1. 任务规划

```typescript
import { TaskPlanner } from "@/lib/task-planner"

const plan = await TaskPlanner.plan(userRequest, {
  userRequest: "给我一份分析「大模型」的使用情况的数据报告",
  databaseSchema: schema,
  availableTables: ["users", "usage_logs"],
  agentTools: tools,
})
```

**功能特点：**
- 自动识别用户意图（数据收集、SQL查询、Python分析、可视化、归因、总结）
- 生成有序的分析步骤
- 自动计算依赖关系
- 预估执行时间

### 2. 步骤执行

```typescript
import { StepExecutor } from "@/lib/step-executor"

const result = await StepExecutor.executePlan(plan, {
  databaseConnection: connection,
  databaseSchema: schema,
  previousResults: new Map(),
  agentTools: tools,
})
```

**功能特点：**
- 按依赖顺序执行步骤
- 自动管理步骤状态
- 支持失败重试
- 支持暂停和恢复

### 3. 步骤干预

```typescript
import { StepIntervention } from "@/lib/step-intervention"

const result = await StepIntervention.applyIntervention(plan, {
  stepId: "step_1",
  type: "modify",
  changes: {
    config: { sql: "SELECT * FROM users LIMIT 100" },
  },
  cascade: true, // 级联调整后续步骤
}, context)
```

**功能特点：**
- 修改步骤配置
- 重试失败步骤
- 跳过不需要的步骤
- 添加新步骤
- 级联调整后续步骤（参考火山引擎）

### 4. 报告生成

```typescript
import { ReportGenerator } from "@/lib/report-generator"

const report = await ReportGenerator.generateReport(plan, stepResults)

// 格式化为Markdown
const markdown = ReportGenerator.formatAsMarkdown(report)
```

**功能特点：**
- 自动整合所有步骤结果
- 生成结构化报告
- 提取关键发现
- 生成建议
- 支持Markdown和JSON格式

### 5. 归因分析

```typescript
import { AttributionAnalyzer } from "@/lib/attribution-analyzer"

const analysis = await AttributionAnalyzer.analyze(queryResult, {
  timeColumn: "date",
  valueColumn: "count",
})
```

**功能特点：**
- 自动识别时间列和数值列
- 识别数据转折点
- 分析趋势变化
- 检测异常值
- 生成洞察和建议

## 使用示例

### 完整流程示例

```typescript
import { TaskPlanningIntegration } from "@/lib/task-planning-integration"

// 1. 处理用户请求
const result = await TaskPlanningIntegration.processUserRequest(
  "给我一份分析「大模型」的使用情况的数据报告",
  {
    databaseConnection: connection,
    databaseSchema: schema,
    agentTools: tools,
    llmConnection: llmConnection,
  }
)

// 2. 显示任务规划
const planMessage = TaskPlanningIntegration.formatPlanAsMessage(result.plan)

// 3. 如果完成，显示报告
if (result.report) {
  const reportMessage = TaskPlanningIntegration.formatReportAsMessage(result.report)
}

// 4. 如果需要干预
if (needsIntervention) {
  const interventionResult = await TaskPlanningIntegration.handleIntervention(
    result.plan,
    {
      stepId: "step_2",
      type: "modify",
      changes: { config: { sql: "新的SQL" } },
      cascade: true,
    },
    context
  )
}
```

## 集成到Chat Route

在 `app/api/chat/route.ts` 中可以这样集成：

```typescript
import { TaskPlanningIntegration } from "@/lib/task-planning-integration"

// 检查是否需要任务规划
if (TaskPlanningIntegration.needsTaskPlanning(userQuestion)) {
  // 使用任务规划模式
  const result = await TaskPlanningIntegration.processUserRequest(
    userQuestion,
    {
      databaseConnection: connection,
      databaseSchema: schema,
      agentTools: availableTools,
      llmConnection: llmConnection,
    }
  )
  
  // 返回规划结果
  return NextResponse.json({
    message: TaskPlanningIntegration.formatPlanAsMessage(result.plan),
    plan: result.plan,
    report: result.report,
  })
} else {
  // 使用原有的简单查询模式
  // ... 原有逻辑
}
```

## 与火山引擎智能分析Agent的对比

| 功能 | 火山引擎 | 本系统 | 状态 |
|------|---------|--------|------|
| 任务规划 | ✅ | ✅ | 已实现 |
| 步骤执行 | ✅ | ✅ | 已实现 |
| 步骤干预 | ✅ | ✅ | 已实现 |
| 报告生成 | ✅ | ✅ | 已实现 |
| 归因分析 | ✅ | ✅ | 已实现 |
| Python代码执行 | ✅ | ⚠️ | 框架已实现，需要执行环境 |
| 多智能体架构 | ✅ | ⚠️ | 部分支持（通过工具系统） |
| 自我学习进化 | ✅ | ❌ | 待实现 |

## 后续优化建议

1. **Python执行环境**
   - 集成Docker容器执行Python代码
   - 或使用pyodide在浏览器端执行
   - 或调用外部Python服务API

2. **多智能体架构**
   - 实现动态规划器、分析智能体、报告智能体等角色
   - 支持智能体之间的协作

3. **自我学习**
   - 记录用户交互历史
   - 优化任务规划策略
   - 改进SQL生成准确性

4. **UI优化**
   - 添加任务规划可视化界面
   - 显示步骤执行进度
   - 支持拖拽调整步骤顺序

5. **性能优化**
   - 并行执行独立步骤
   - 缓存中间结果
   - 优化数据库查询

## 注意事项

1. **Python执行器**：当前只是框架实现，实际生产环境需要：
   - 使用沙箱环境（Docker容器）
   - 限制可用的库和函数
   - 设置资源限制（CPU、内存、时间）
   - 处理输入输出安全

2. **步骤干预的级联**：参考火山引擎的实现，当用户修改某个步骤时，系统会重新执行该步骤及其后的所有步骤。这确保了结果的一致性。

3. **错误处理**：在实际使用中，需要添加更完善的错误处理和重试机制。

4. **性能考虑**：对于大型数据集，需要考虑查询优化和结果缓存。

## 总结

本次优化成功实现了火山引擎智能分析Agent的核心功能，包括任务规划、步骤执行、步骤干预、报告生成和归因分析。系统现在具备了自动拆解复杂分析任务、按步骤执行、支持用户干预、生成深度报告的能力，大大提升了数据分析的智能化和自动化水平。
