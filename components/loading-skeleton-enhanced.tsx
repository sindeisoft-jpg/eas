"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

interface LoadingSkeletonEnhancedProps {
  type?: "message" | "chart" | "table" | "card" | "list"
  count?: number
}

export function LoadingSkeletonEnhanced({
  type = "card",
  count = 1,
}: LoadingSkeletonEnhancedProps) {
  const renderSkeleton = () => {
    switch (type) {
      case "message":
        return (
          <div className="space-y-4">
            {Array.from({ length: count }).map((_, i) => (
              <div key={i} className="flex gap-4 animate-fade-in">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-[250px]" />
                  <Skeleton className="h-4 w-[200px]" />
                  <Skeleton className="h-4 w-[150px]" />
                </div>
              </div>
            ))}
          </div>
        )

      case "chart":
        return (
          <Card className="p-6">
            <div className="space-y-4">
              <Skeleton className="h-6 w-[200px]" />
              <Skeleton className="h-[400px] w-full" />
            </div>
          </Card>
        )

      case "table":
        return (
          <Card className="p-6">
            <div className="space-y-4">
              <Skeleton className="h-8 w-full" />
              {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="flex gap-4">
                  <Skeleton className="h-12 flex-1" />
                  <Skeleton className="h-12 flex-1" />
                  <Skeleton className="h-12 flex-1" />
                  <Skeleton className="h-12 flex-1" />
                </div>
              ))}
            </div>
          </Card>
        )

      case "list":
        return (
          <div className="space-y-2">
            {Array.from({ length: count }).map((_, i) => (
              <Card key={i} className="p-4">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-[200px]" />
                    <Skeleton className="h-3 w-[150px]" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )

      default:
        return (
          <Card className="p-6">
            <div className="space-y-4">
              <Skeleton className="h-6 w-[200px]" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </Card>
        )
    }
  }

  return (
    <div className="animate-fade-in">
      {renderSkeleton()}
    </div>
  )
}

// 脉冲动画骨架屏（用于数据加载）
export function PulseSkeleton({ className }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-lg ${className}`}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <Skeleton className="h-full w-full" />
    </div>
  )
}

// 数字递增动画组件
export function AnimatedNumber({
  value,
  duration = 1000,
  className,
}: {
  value: number
  duration?: number
  className?: string
}) {
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    const startTime = Date.now()
    const startValue = displayValue
    const endValue = value

    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      
      // 使用easeOut缓动函数
      const easeOut = 1 - Math.pow(1 - progress, 3)
      const current = Math.floor(startValue + (endValue - startValue) * easeOut)
      
      setDisplayValue(current)

      if (progress < 1) {
        requestAnimationFrame(animate)
      } else {
        setDisplayValue(endValue)
      }
    }

    requestAnimationFrame(animate)
  }, [value, duration])

  return <span className={className}>{displayValue.toLocaleString()}</span>
}
