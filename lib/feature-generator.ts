/**
 * 功能生成器
 * 通过LLM分析数据库结构（schema），动态生成系统可以提供的功能列表
 * 类似于 n8n 的功能，能够根据数据结构推断系统能力
 */

import { DatabaseSchema } from "./types"
import { formatDatabaseSchema } from "./template-engine"
import { PromptConfigService } from "./prompt-config-service"

export interface SystemFeature {
  category: string // 功能分类（如：数据查询、统计分析、数据管理）
  name: string // 功能名称
  description: string // 功能描述
  examples: string[] // 使用示例
  relatedTables: string[] // 相关表
}

export class FeatureGenerator {
  /**
   * 通过LLM分析数据库结构，生成功能列表
   * @param schema 数据库结构
   * @param llmConnection LLM连接配置
   * @returns 功能列表文本
   */
  static async generateFeaturesWithLLM(
    schema: DatabaseSchema[],
    llmConnection: any
  ): Promise<string> {
    if (!schema || schema.length === 0) {
      return "数据库中没有表，无法生成功能列表。"
    }

    // 格式化数据库结构
    const formattedSchema = formatDatabaseSchema(schema)
    
    // 从配置服务获取提示词
    let prompt = await PromptConfigService.getConfigWithVariables(
      "feature_list",
      "generate_features_prompt",
      {
        formattedSchema,
      }
    )

    // 如果配置不存在，使用默认值（向后兼容）
    if (!prompt) {
      prompt = `你是一个智能体（AI Agent），专门帮助用户通过自然语言查询和分析数据库。

请根据以下数据库结构信息，从智能体的角度分析并生成你可以为用户提供的功能列表。

# 数据库结构信息

${formattedSchema}

# 任务要求

作为智能体，请仔细分析上述数据库结构，包括：
1. 表名和表的作用（根据表名和字段推断业务含义）
2. 字段类型和含义（根据字段名和类型推断功能）
3. 表之间的关系（根据外键等推断关联功能）

然后从智能体的角度，生成一份详细的功能列表，告诉用户你可以帮助他们做什么。包括：

1. **功能分类**：根据表的作用将功能分类（如：客户管理、订单管理、数据分析等）
2. **功能名称**：每个功能的名称
3. **功能描述**：详细说明作为智能体，你可以帮助用户做什么
4. **使用示例**：提供2-3个具体的使用示例（用自然语言描述，如"查询所有客户"）

# 输出格式

请使用Markdown格式输出，格式如下：

## 我可以为您提供的功能

根据数据库结构分析，作为智能体，我可以帮助您完成以下操作：

### [功能分类1]

**功能名称1**
作为智能体，我可以帮助您...（功能描述）

使用示例：
- 示例1
- 示例2

**功能名称2**
作为智能体，我可以帮助您...（功能描述）

使用示例：
- 示例1
- 示例2

### [功能分类2]

...

# 注意事项

1. **以智能体的身份**：从"我可以帮助您"的角度来描述功能，而不是"系统可以"
2. **只基于提供的数据库结构**：不要编造不存在的表或字段
3. **功能描述要具体、实用**：说明作为智能体，你可以帮助用户做什么
4. **使用示例要用自然语言**：用户可以直接使用这些示例来提问
5. **推断业务含义**：如果表名是英文，可以推断其业务含义（如 customers → 客户管理）
6. **根据字段类型推断功能**：如包含 status 字段 → 状态查询和分析，包含 amount/price → 金额统计

请开始分析并生成功能列表：`
    }

    return prompt
  }
}
