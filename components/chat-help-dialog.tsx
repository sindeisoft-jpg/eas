"use client"

import React from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  BookOpen,
  Lightbulb,
  Code,
  BarChart3,
  FileText,
  MessageSquare,
  Sparkles,
  TrendingUp,
} from "lucide-react"

interface ChatHelpDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ChatHelpDialog({ open, onOpenChange }: ChatHelpDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden" style={{ maxWidth: '90vw' }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <BookOpen className="w-6 h-6 text-primary" />
            使用教程与示例
          </DialogTitle>
          <DialogDescription>
            了解如何使用对话式报表生成功能，快速上手数据分析
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="tutorial" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="tutorial">使用教程</TabsTrigger>
            <TabsTrigger value="examples">示例提示词</TabsTrigger>
            <TabsTrigger value="features">功能说明</TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[60vh] mt-4 pr-4">
            <TabsContent value="tutorial" className="space-y-4 mt-4">
              <Card className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold">快速开始</h3>
                </div>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    1. <strong className="text-foreground">选择智能体</strong>：在顶部工具栏选择已配置的智能体
                  </p>
                  <p>
                    2. <strong className="text-foreground">输入问题</strong>：用自然语言描述您的数据分析需求
                  </p>
                  <p>
                    3. <strong className="text-foreground">自动生成</strong>：系统会自动识别需求并生成报表
                  </p>
                  <p>
                    4. <strong className="text-foreground">查看结果</strong>：在对话中查看报表预览，点击查看完整报表
                  </p>
                </div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <MessageSquare className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold">触发报表生成</h3>
                </div>
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="font-medium text-foreground mb-2">方式一：自动检测</p>
                    <p className="text-muted-foreground">
                      当您的问题包含"分析"、"汇总"、"统计"、"业绩"等关键词时，系统会自动检测并提示生成报表。
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground mb-2">方式二：显式命令</p>
                    <p className="text-muted-foreground">
                      直接说"生成报表"、"创建报告"等明确指令，系统会立即开始生成。
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground mb-2">方式三：快捷命令</p>
                    <p className="text-muted-foreground mb-2">
                      使用命令指定输出类型，支持以下命令：
                    </p>
                    <div className="space-y-2 mt-2">
                      <div className="flex items-center gap-2">
                        <code className="px-2 py-1 bg-muted rounded text-xs">@报表</code>
                        <span className="text-xs text-muted-foreground">或</span>
                        <code className="px-2 py-1 bg-muted rounded text-xs">@report</code>
                        <span className="text-xs text-muted-foreground">- 生成报表</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="px-2 py-1 bg-muted rounded text-xs">@图表</code>
                        <span className="text-xs text-muted-foreground">或</span>
                        <code className="px-2 py-1 bg-muted rounded text-xs">@chart</code>
                        <span className="text-xs text-muted-foreground">- 生成图表（自动推断类型）</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="px-2 py-1 bg-muted rounded text-xs">@表格</code>
                        <span className="text-xs text-muted-foreground">或</span>
                        <code className="px-2 py-1 bg-muted rounded text-xs">@table</code>
                        <span className="text-xs text-muted-foreground">- 生成表格</span>
                      </div>
                      <div className="pt-2 border-t border-border/30">
                        <div className="text-xs font-medium text-foreground mb-2">具体图表类型命令：</div>
                        <div className="grid grid-cols-2 gap-1.5 text-xs">
                          <div><code className="px-1.5 py-0.5 bg-muted rounded">@柱状图</code></div>
                          <div><code className="px-1.5 py-0.5 bg-muted rounded">@折线图</code></div>
                          <div><code className="px-1.5 py-0.5 bg-muted rounded">@饼图</code></div>
                          <div><code className="px-1.5 py-0.5 bg-muted rounded">@面积图</code></div>
                          <div><code className="px-1.5 py-0.5 bg-muted rounded">@散点图</code></div>
                          <div><code className="px-1.5 py-0.5 bg-muted rounded">@雷达图</code></div>
                          <div><code className="px-1.5 py-0.5 bg-muted rounded">@堆叠柱状图</code></div>
                          <div><code className="px-1.5 py-0.5 bg-muted rounded">@横向柱状图</code></div>
                          <div><code className="px-1.5 py-0.5 bg-muted rounded">@仪表盘</code></div>
                          <div><code className="px-1.5 py-0.5 bg-muted rounded">@漏斗图</code></div>
                          <div><code className="px-1.5 py-0.5 bg-muted rounded">@热力图</code></div>
                          <div><code className="px-1.5 py-0.5 bg-muted rounded">@桑基图</code></div>
                        </div>
                        <div className="text-xs text-muted-foreground mt-2">
                          支持所有 ECharts 图表类型，输入 @ 符号自动弹出命令菜单
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        命令可以放在问题开头或末尾，例如："列出所有客户 @表格" 或 "@图表 销售趋势分析"
                      </p>
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold">报表类型</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="font-medium text-sm mb-1">销售趋势报表</p>
                    <p className="text-xs text-muted-foreground">分析销售额随时间的变化趋势</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="font-medium text-sm mb-1">销售漏斗分析</p>
                    <p className="text-xs text-muted-foreground">分析销售机会在各阶段的转化情况</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="font-medium text-sm mb-1">收入分析报告</p>
                    <p className="text-xs text-muted-foreground">全面分析公司收入情况</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="font-medium text-sm mb-1">客户分析报告</p>
                    <p className="text-xs text-muted-foreground">分析客户行为和价值</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="font-medium text-sm mb-1">产品分析报告</p>
                    <p className="text-xs text-muted-foreground">分析产品销售情况</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="font-medium text-sm mb-1">自定义报表</p>
                    <p className="text-xs text-muted-foreground">根据您的需求动态生成</p>
                  </div>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="examples" className="space-y-4 mt-4">
              <Card className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Lightbulb className="w-5 h-5 text-yellow-500" />
                  <h3 className="text-lg font-semibold">基础查询示例</h3>
                </div>
                <div className="space-y-3">
                  <div className="p-3 bg-muted/50 rounded-lg border-l-4 border-primary">
                    <p className="text-sm font-medium mb-1">查询数据</p>
                    <code className="text-xs text-muted-foreground block">
                      "查询一下最近三个月的销售订单"
                    </code>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg border-l-4 border-primary">
                    <p className="text-sm font-medium mb-1">统计数据</p>
                    <code className="text-xs text-muted-foreground block">
                      "统计一下每个产品的销售数量"
                    </code>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg border-l-4 border-primary">
                    <p className="text-sm font-medium mb-1">对比分析</p>
                    <code className="text-xs text-muted-foreground block">
                      "对比一下今年和去年的销售数据"
                    </code>
                  </div>
                </div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold">报表生成示例</h3>
                </div>
                <div className="space-y-3">
                  <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-xs">自动检测</Badge>
                      <span className="text-xs text-muted-foreground">会弹出确认对话框</span>
                    </div>
                    <code className="text-xs text-foreground block">
                      "帮我分析一下最近三个月的销售趋势"
                    </code>
                  </div>
                  <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-xs">显式命令</Badge>
                      <span className="text-xs text-muted-foreground">直接生成</span>
                    </div>
                    <code className="text-xs text-foreground block">
                      "生成销售趋势报表"
                    </code>
                  </div>
                  <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-xs">快捷命令</Badge>
                      <span className="text-xs text-muted-foreground">使用 /报表</span>
                    </div>
                    <code className="text-xs text-foreground block">
                      "/报表 汇总一下合同和报价的业绩数据"
                    </code>
                  </div>
                  <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-xs">图表命令</Badge>
                      <span className="text-xs text-muted-foreground">使用 /图表</span>
                    </div>
                    <code className="text-xs text-foreground block">
                      "销售趋势分析 @图表"
                    </code>
                  </div>
                  <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-xs">具体图表类型</Badge>
                      <span className="text-xs text-muted-foreground">使用 @柱状图、@饼图等</span>
                    </div>
                    <code className="text-xs text-foreground block">
                      "销售数据分析 @柱状图"
                    </code>
                    <code className="text-xs text-foreground block mt-1">
                      "转化率分析 @漏斗图"
                    </code>
                  </div>
                  <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-xs">表格命令</Badge>
                      <span className="text-xs text-muted-foreground">使用 @表格</span>
                    </div>
                    <code className="text-xs text-foreground block">
                      "列出所有客户 @表格"
                    </code>
                  </div>
                  <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-xs">业绩分析</Badge>
                      <span className="text-xs text-muted-foreground">自动触发</span>
                    </div>
                    <code className="text-xs text-foreground block">
                      "查询一下合同和报价相关的业绩数据"
                    </code>
                  </div>
                </div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="w-5 h-5 text-green-500" />
                  <h3 className="text-lg font-semibold">高级示例</h3>
                </div>
                <div className="space-y-3">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-sm font-medium mb-1">复杂分析</p>
                    <code className="text-xs text-muted-foreground block">
                      "分析一下我们的销售漏斗，看看哪个阶段转化率最低，并给出优化建议"
                    </code>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-sm font-medium mb-1">多维度分析</p>
                    <code className="text-xs text-muted-foreground block">
                      "对比一下今年和去年的销售数据，找出关键差异点"
                    </code>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-sm font-medium mb-1">深度洞察</p>
                    <code className="text-xs text-muted-foreground block">
                      "分析客户留存率，识别流失原因，并提供改进方案"
                    </code>
                  </div>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="features" className="space-y-4 mt-4">
              <Card className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold">核心功能</h3>
                </div>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium text-sm mb-2">智能意图识别</h4>
                    <p className="text-sm text-muted-foreground">
                      系统会自动识别您的查询意图，判断是否需要生成报表。当检测到分析、汇总、统计等需求时，会自动提示生成报表。
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium text-sm mb-2">报表预览卡片</h4>
                    <p className="text-sm text-muted-foreground">
                      报表生成后，会在对话中显示预览卡片，包含报表摘要、关键指标和操作按钮，方便快速了解报表内容。
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium text-sm mb-2">弹窗查看器</h4>
                    <p className="text-sm text-muted-foreground">
                      点击"查看完整报表"按钮，可以在弹窗中查看完整的报表内容，支持全屏模式、章节导航等功能。
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium text-sm mb-2">导出功能</h4>
                    <p className="text-sm text-muted-foreground">
                      支持将报表导出为 Markdown 或 JSON 格式，方便保存和分享。
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium text-sm mb-2">快捷命令</h4>
                    <p className="text-sm text-muted-foreground">
                      支持使用命令快速指定输出类型：
                      <ul className="list-disc list-inside mt-2 space-y-1 text-xs text-muted-foreground">
                        <li><code className="px-1.5 py-0.5 bg-muted rounded">@报表</code> 或 <code className="px-1.5 py-0.5 bg-muted rounded">@report</code> - 生成报表</li>
                        <li><code className="px-1.5 py-0.5 bg-muted rounded">@图表</code> 或 <code className="px-1.5 py-0.5 bg-muted rounded">@chart</code> - 生成图表（自动推断类型）</li>
                        <li><code className="px-1.5 py-0.5 bg-muted rounded">@表格</code> 或 <code className="px-1.5 py-0.5 bg-muted rounded">@table</code> - 生成表格</li>
                      </ul>
                      <div className="mt-2 pt-2 border-t border-border/30">
                        <div className="text-xs font-medium text-foreground mb-1">具体图表类型命令：</div>
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          <div>基础类型：<code className="px-1 py-0.5 bg-muted rounded">@柱状图</code> <code className="px-1 py-0.5 bg-muted rounded">@折线图</code> <code className="px-1 py-0.5 bg-muted rounded">@饼图</code> <code className="px-1 py-0.5 bg-muted rounded">@面积图</code> <code className="px-1 py-0.5 bg-muted rounded">@散点图</code> <code className="px-1 py-0.5 bg-muted rounded">@雷达图</code></div>
                          <div>高级类型：<code className="px-1 py-0.5 bg-muted rounded">@堆叠柱状图</code> <code className="px-1 py-0.5 bg-muted rounded">@横向柱状图</code> <code className="px-1 py-0.5 bg-muted rounded">@组合图</code></div>
                          <div>特殊类型：<code className="px-1 py-0.5 bg-muted rounded">@仪表盘</code> <code className="px-1 py-0.5 bg-muted rounded">@漏斗图</code> <code className="px-1 py-0.5 bg-muted rounded">@热力图</code> <code className="px-1 py-0.5 bg-muted rounded">@桑基图</code> <code className="px-1 py-0.5 bg-muted rounded">@K线图</code> 等</div>
                        </div>
                        <div className="text-xs text-muted-foreground mt-2">
                          💡 输入 <code className="px-1 py-0.5 bg-muted rounded">@</code> 符号会自动弹出命令菜单，方便选择
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        命令可以放在问题开头或末尾，例如："列出所有客户 @表格" 或 "@柱状图 销售趋势分析"
                      </p>
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Code className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold">使用技巧</h3>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex items-start gap-2">
                    <span className="text-primary font-bold">•</span>
                    <p className="text-muted-foreground">
                      <strong className="text-foreground">明确需求</strong>：描述越详细，生成的报表越准确
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-primary font-bold">•</span>
                    <p className="text-muted-foreground">
                      <strong className="text-foreground">使用关键词</strong>：包含"分析"、"汇总"、"统计"等词更容易触发报表生成
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-primary font-bold">•</span>
                    <p className="text-muted-foreground">
                      <strong className="text-foreground">查看进度</strong>：报表生成过程中可以查看实时进度
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-primary font-bold">•</span>
                    <p className="text-muted-foreground">
                      <strong className="text-foreground">导出保存</strong>：重要报表建议导出保存，方便后续查看
                    </p>
                  </div>
                </div>
              </Card>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
