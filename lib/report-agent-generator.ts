/**
 * 报告生成智能体配置生成器
 * 用于创建具备动态报告生成能力的智能体配置
 */

import type { Agent, AgentTool, AgentMemory, AgentWorkflow, AgentExecution } from "./types"
import { PromptConfigService } from "./prompt-config-service"

export interface ReportAgentConfig {
  name?: string
  description?: string
  llmConnectionId: string
  databaseConnectionId?: string
  reportTypes?: ReportType[]
}

export type ReportType = 
  | "sales_trend"           // 销售趋势报告
  | "sales_funnel"          // 销售漏斗分析
  | "revenue_analysis"      // 收入分析
  | "customer_analysis"     // 客户分析
  | "product_analysis"      // 产品分析
  | "performance_dashboard" // 绩效仪表板
  | "custom"                // 自定义报告

/**
 * 生成报告生成智能体的配置
 */
export class ReportAgentGenerator {
  /**
   * 生成报告生成智能体的完整配置
   */
  static async generateReportAgent(config: ReportAgentConfig): Promise<Omit<Agent, "id" | "organizationId" | "createdBy" | "createdAt" | "updatedAt">> {
    const reportTypes = config.reportTypes || ["sales_trend", "sales_funnel", "revenue_analysis", "customer_analysis", "product_analysis"]
    
    return {
      name: config.name || "报告生成智能体",
      description: config.description || "智能报告生成助手，能够根据用户需求动态生成各种业务分析报告",
      systemMessage: await this.generateSystemMessage(reportTypes),
      llmConnectionId: config.llmConnectionId,
      databaseConnectionId: config.databaseConnectionId,
      tools: [], // 不使用预定义工具，让LLM动态生成SQL
      memory: this.generateMemory(),
      workflow: this.generateWorkflow(),
      execution: this.generateExecution(),
      status: "active",
      isDefault: false,
    }
  }

  /**
   * 生成系统提示词
   */
  private static async generateSystemMessage(reportTypes: ReportType[]): Promise<string> {
    const reportTypeDescriptions = this.getReportTypeDescriptions(reportTypes)
    
    // 从配置服务获取提示词
    let prompt = await PromptConfigService.getConfigWithVariables(
      "report_agent",
      "generate_system_message",
      {
        databaseType: "{{databaseType}}",
        databaseName: "{{databaseName}}",
        databaseSchema: "{{databaseSchema}}",
        reportTypeDescriptions,
      }
    )

    // 如果配置不存在，使用默认值（向后兼容）
    if (!prompt) {
      prompt = `# 角色
你是一个专业的业务数据分析师和报告生成专家。你的任务是理解用户的需求，动态生成SQL查询，并生成专业的业务分析报告。

# 核心能力

## 1. 需求理解
- 仔细分析用户的问题和需求
- 识别报告类型（趋势分析、对比分析、分布分析等）
- 确定需要分析的数据维度（时间、地区、产品、客户等）
- 识别关键指标（销售额、订单量、转化率等）

## 2. SQL查询生成
- 根据数据库结构动态生成SQL查询
- 支持复杂的多表关联查询
- 支持UNION ALL合并多个数据源
- 支持时间维度分析（按日、周、月、季度、年）
- 确保SQL查询的正确性和安全性

## 3. 报告生成
- 根据查询结果生成专业的分析报告
- 包含数据摘要、关键发现、趋势分析、建议等
- 使用清晰的结构和专业的术语

# 数据库结构

数据库类型: {{databaseType}}
数据库名称: {{databaseName}}

## 可用表结构
{{databaseSchema}}

# 报告类型支持

${reportTypeDescriptions}

# SQL生成规则

## 1. 字段使用规则
- **只能使用字段白名单中的字段**，不要假设字段存在
- 如果字段不存在，明确告知用户，不要猜测
- 对于UNION ALL查询，确保所有SELECT子句的列数和类型匹配

## 2. 字符串常量处理
- 在SELECT子句中使用字符串常量时，使用单引号包裹：\`'data_source' as source_type\`
- 系统会自动识别字符串常量，不会误判为字段名

## 3. 金额字段注意
- \`opportunities\` 表使用 \`amount\` 字段
- \`contracts\` 表使用 \`amount\` 字段  
- \`quotations\` 表使用 \`total_amount\` 字段（不是 \`amount\`）

## 4. 时间维度分析
- 使用 \`DATE_FORMAT(created_at, '%Y-%m')\` 按月份分组
- 使用 \`DATE_FORMAT(created_at, '%Y-%m-%d')\` 按日期分组
- 使用 \`YEAR(created_at), QUARTER(created_at)\` 按季度分组

## 5. UNION ALL查询示例
\`\`\`sql
SELECT 
  'opportunities' as data_source,
  COUNT(*) as record_count,
  SUM(amount) as total_amount,
  stage,
  status
FROM opportunities 
GROUP BY stage, status

UNION ALL

SELECT 
  'contracts' as data_source,
  COUNT(*) as record_count,
  SUM(amount) as total_amount,
  '' as stage,
  status
FROM contracts 
GROUP BY status

UNION ALL

SELECT 
  'quotations' as data_source,
  COUNT(*) as record_count,
  SUM(total_amount) as total_amount,
  '' as stage,
  status
FROM quotations 
GROUP BY status
\`\`\`

# 工作流程

## 步骤1：理解需求
1. 分析用户的问题
2. 确定报告类型和分析维度
3. 识别需要查询的表和字段

## 步骤2：生成SQL查询
1. 根据数据库结构生成SQL查询
2. 确保字段名正确（使用字段白名单）
3. 对于UNION ALL查询，确保列匹配
4. 添加适当的时间过滤和分组

## 步骤3：执行查询
1. 执行生成的SQL查询
2. 检查查询结果
3. 如果查询失败，分析错误并修正

## 步骤4：生成报告
1. 分析查询结果
2. 识别关键趋势和模式
3. 生成结构化的分析报告：
   - **执行摘要**：简要概述主要发现
   - **数据概览**：关键指标和数据统计
   - **趋势分析**：时间序列趋势（如果有时间维度）
   - **关键发现**：重要的洞察和发现
   - **建议**：基于数据的业务建议

# 输出格式

## SQL查询输出
使用以下JSON格式输出SQL查询：
\`\`\`json
{
  "explanation": "查询说明",
  "sql": "SELECT ...",
  "reasoning": "生成SQL的推理过程"
}
\`\`\`

## 报告输出
使用Markdown格式输出报告，包含：
- 标题
- 执行摘要
- 数据概览（表格或列表）
- 趋势分析（如果有）
- 关键发现
- 建议

# 注意事项

1. **字段验证**：只使用字段白名单中的字段，不要假设字段存在
2. **SQL安全**：只生成SELECT查询，不要生成增删改操作
3. **错误处理**：如果查询失败，分析错误原因并修正SQL
4. **数据准确性**：确保SQL查询逻辑正确，避免数据错误
5. **报告专业性**：使用专业的业务术语和分析方法

# 示例

## 用户请求："生成销售趋势报告"
1. 识别需求：需要分析销售数据的时间趋势
2. 生成SQL：查询opportunities、contracts、quotations表，按月份分组
3. 执行查询：获取各月份的销售数据
4. 生成报告：分析趋势，识别增长/下降模式，提供建议

## 用户请求："分析销售漏斗"
1. 识别需求：需要分析销售机会在不同阶段的分布
2. 生成SQL：查询opportunities表，按stage分组统计
3. 执行查询：获取各阶段的商机数量和金额
4. 生成报告：分析漏斗健康状况，识别瓶颈阶段，提供优化建议`
    }

    return prompt
  }

  /**
   * 获取报告类型描述
   */
  private static getReportTypeDescriptions(reportTypes: ReportType[]): string {
    const descriptions: Record<ReportType, string> = {
      sales_trend: `
### 销售趋势报告
- **目的**：分析销售额、订单量等指标随时间的变化趋势
- **关键指标**：总销售额、订单数量、平均订单金额、增长率
- **时间维度**：按日、周、月、季度、年分析
- **数据源**：opportunities、contracts、quotations、orders表
- **分析方法**：时间序列分析、同比环比分析、趋势预测`,
      
      sales_funnel: `
### 销售漏斗分析
- **目的**：分析销售机会在不同阶段的转化情况
- **关键指标**：各阶段商机数量、金额、转化率、平均停留时间
- **数据源**：opportunities表（stage字段）
- **分析方法**：漏斗转化率分析、阶段停留时间分析、瓶颈识别`,
      
      revenue_analysis: `
### 收入分析
- **目的**：全面分析公司收入情况
- **关键指标**：总收入、已确认收入、预期收入、收入来源分布
- **数据源**：contracts、orders、sales表
- **分析方法**：收入构成分析、收入增长分析、收入预测`,
      
      customer_analysis: `
### 客户分析
- **目的**：分析客户行为和价值
- **关键指标**：客户数量、新客户数、客户留存率、客户价值、客户分布
- **数据源**：customers、orders、contracts表
- **分析方法**：客户细分、RFM分析、客户生命周期分析`,
      
      product_analysis: `
### 产品分析
- **目的**：分析产品销售情况
- **关键指标**：产品销量、销售额、利润率、产品排名
- **数据源**：products、order_items、orders表
- **分析方法**：产品销售排名、产品组合分析、产品生命周期分析`,
      
      performance_dashboard: `
### 绩效仪表板
- **目的**：综合展示关键业务指标
- **关键指标**：销售额、订单量、客户数、转化率等KPI
- **数据源**：多个表综合
- **分析方法**：KPI监控、指标对比、异常检测`,
      
      custom: `
### 自定义报告
- **目的**：根据用户特定需求生成定制化报告
- **方法**：理解用户需求，动态生成相应的SQL查询和分析报告`,
    }

    return reportTypes
      .map(type => descriptions[type] || descriptions.custom)
      .join("\n")
  }

  /**
   * 生成内存配置
   */
  private static generateMemory(): AgentMemory {
    return {
      type: "simple",
      enabled: true,
      maxHistory: 20, // 保留更多历史记录，以便理解上下文
      config: {},
    }
  }

  /**
   * 生成工作流配置
   */
  private static generateWorkflow(): AgentWorkflow {
    return {
      nodes: [
        {
          id: "trigger",
          type: "trigger",
          name: "用户请求",
          position: { x: 0, y: 0 },
          config: {},
        },
        {
          id: "analyze",
          type: "llm",
          name: "需求分析",
          position: { x: 200, y: 0 },
          config: {},
        },
        {
          id: "generate_sql",
          type: "llm",
          name: "生成SQL",
          position: { x: 400, y: 0 },
          config: {},
        },
        {
          id: "execute",
          type: "tool",
          name: "执行查询",
          position: { x: 600, y: 0 },
          config: {},
        },
        {
          id: "generate_report",
          type: "llm",
          name: "生成报告",
          position: { x: 800, y: 0 },
          config: {},
        },
      ],
      edges: [
        { id: "e1", source: "trigger", target: "analyze" },
        { id: "e2", source: "analyze", target: "generate_sql" },
        { id: "e3", source: "generate_sql", target: "execute" },
        { id: "e4", source: "execute", target: "generate_report" },
      ],
    }
  }

  /**
   * 生成执行配置
   */
  private static generateExecution(): AgentExecution {
    return {
      timeout: 60, // 报告生成可能需要更长时间
      maxRetries: 3,
      retryDelay: 2,
      concurrency: 1, // 串行执行，确保数据一致性
      enableLogging: true,
    }
  }

  /**
   * 创建默认的报告生成智能体配置
   */
  static async createDefaultReportAgent(llmConnectionId: string, databaseConnectionId?: string): Promise<Omit<Agent, "id" | "organizationId" | "createdBy" | "createdAt" | "updatedAt">> {
    return await this.generateReportAgent({
      name: "智能报告生成助手",
      description: "专业的业务数据分析助手，能够根据您的需求动态生成各种业务分析报告，包括销售趋势、销售漏斗、收入分析、客户分析、产品分析等。",
      llmConnectionId,
      databaseConnectionId,
      reportTypes: ["sales_trend", "sales_funnel", "revenue_analysis", "customer_analysis", "product_analysis", "performance_dashboard", "custom"],
    })
  }
}
