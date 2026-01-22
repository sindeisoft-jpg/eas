"use client"

import * as React from "react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { 
  MessageSquare, 
  Database, 
  BarChart3, 
  Bot, 
  ChevronRight,
  CheckCircle2,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface OnboardingStep {
  id: string
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  action?: {
    label: string
    href: string
  }
}

const onboardingSteps: OnboardingStep[] = [
  {
    id: "welcome",
    title: "欢迎使用 BI 系统",
    description: "这是一个智能数据分析平台，您可以使用自然语言查询数据，生成可视化图表和报告。",
    icon: MessageSquare,
  },
  {
    id: "database",
    title: "配置数据库连接",
    description: "首先，您需要添加至少一个数据库连接。系统支持 MySQL、PostgreSQL、SQL Server 等多种数据库。",
    icon: Database,
    action: {
      label: "添加数据库连接",
      href: "/dashboard/databases",
    },
  },
  {
    id: "query",
    title: "开始查询数据",
    description: "在智能对话页面，您可以使用自然语言提问，系统会自动生成 SQL 查询并返回结果。",
    icon: BarChart3,
    action: {
      label: "开始查询",
      href: "/dashboard",
    },
  },
  {
    id: "agents",
    title: "创建智能体",
    description: "智能体可以帮助您自动化数据分析任务，创建报告生成智能体来自动生成分析报告。",
    icon: Bot,
    action: {
      label: "创建智能体",
      href: "/dashboard/agents",
    },
  },
]

interface OnboardingProps {
  onComplete?: () => void
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    // 检查是否已经完成过引导
    const hasCompletedOnboarding = localStorage.getItem("hasCompletedOnboarding")
    if (!hasCompletedOnboarding) {
      setIsOpen(true)
    }
  }, [])

  const handleNext = () => {
    if (currentStep < onboardingSteps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      handleComplete()
    }
  }

  const handleSkip = () => {
    handleComplete()
  }

  const handleComplete = () => {
    localStorage.setItem("hasCompletedOnboarding", "true")
    setIsOpen(false)
    onComplete?.()
  }

  const handleAction = (href: string) => {
    handleComplete()
    router.push(href)
  }

  const currentStepData = onboardingSteps[currentStep]
  const progress = ((currentStep + 1) / onboardingSteps.length) * 100

  if (!isOpen) {
    return null
  }

  const Icon = currentStepData.icon

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[600px] p-0 gap-0">
        <div className="p-8 space-y-6">
          {/* 进度条 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>步骤 {currentStep + 1} / {onboardingSteps.length}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSkip}
                className="h-7 text-xs"
              >
                跳过引导
              </Button>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* 步骤内容 */}
          <div className="flex flex-col items-center text-center space-y-4 py-8">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <Icon className="w-10 h-10 text-primary" />
            </div>
            <DialogHeader>
              <DialogTitle className="text-2xl">{currentStepData.title}</DialogTitle>
              <DialogDescription className="text-base pt-2">
                {currentStepData.description}
              </DialogDescription>
            </DialogHeader>

            {currentStepData.action && (
              <Button
                onClick={() => handleAction(currentStepData.action!.href)}
                className="mt-4"
              >
                {currentStepData.action.label}
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>

          {/* 步骤指示器 */}
          <div className="flex items-center justify-center gap-2">
            {onboardingSteps.map((step, index) => (
              <div
                key={step.id}
                className={cn(
                  "w-2 h-2 rounded-full transition-all",
                  index === currentStep
                    ? "w-8 bg-primary"
                    : index < currentStep
                    ? "bg-primary/50"
                    : "bg-muted"
                )}
              />
            ))}
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center justify-between pt-4 border-t">
            <Button
              variant="outline"
              onClick={handleSkip}
              disabled={currentStep === 0}
            >
              跳过
            </Button>
            <div className="flex gap-2">
              {currentStep > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setCurrentStep(currentStep - 1)}
                >
                  上一步
                </Button>
              )}
              <Button onClick={handleNext}>
                {currentStep === onboardingSteps.length - 1 ? (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    完成
                  </>
                ) : (
                  <>
                    下一步
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
