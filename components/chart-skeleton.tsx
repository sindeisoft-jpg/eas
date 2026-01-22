"use client"

import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { ChartConfig } from "@/lib/types"

interface ChartSkeletonProps {
  type: ChartConfig["type"]
  className?: string
}

export function ChartSkeleton({ type, className }: ChartSkeletonProps) {
  const renderSkeleton = () => {
    switch (type) {
      case "bar":
      case "bar-horizontal":
      case "bar-stacked":
        return (
          <div className="w-full h-[450px] flex flex-col justify-end gap-2 px-4 pb-4">
            {/* X轴骨架 */}
            <div className="h-4 flex items-center gap-2 mb-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-3 bg-muted rounded animate-shimmer"
                  style={{
                    width: `${60 + Math.random() * 40}px`,
                    animationDelay: `${i * 100}ms`,
                  }}
                />
              ))}
            </div>
            {/* 柱状图骨架 */}
            <div className="flex-1 flex items-end gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 flex flex-col items-center gap-2"
                  style={{ animationDelay: `${i * 150}ms` }}
                >
                  <div
                    className="w-full bg-gradient-to-t from-primary/30 to-primary/10 rounded-t-lg animate-pulse-ripple"
                    style={{
                      height: `${30 + Math.random() * 70}%`,
                      animationDelay: `${i * 150}ms`,
                    }}
                  />
                  <div className="h-3 w-12 bg-muted rounded animate-shimmer" />
                </div>
              ))}
            </div>
          </div>
        )

      case "line":
      case "area":
      case "area-stacked":
        return (
          <div className="w-full h-[450px] relative p-4">
            {/* 网格线骨架 */}
            <div className="absolute inset-0 flex flex-col justify-between">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-px bg-muted/30 animate-pulse"
                  style={{ animationDelay: `${i * 200}ms` }}
                />
              ))}
            </div>
            {/* 折线图骨架 */}
            <div className="relative h-full">
              <svg className="w-full h-full" viewBox="0 0 400 400">
                <path
                  d="M 20 300 Q 100 200, 180 150 T 380 50"
                  fill="none"
                  stroke="hsl(var(--primary) / 0.3)"
                  strokeWidth="3"
                  strokeDasharray="5,5"
                  className="animate-pulse"
                />
                {Array.from({ length: 8 }).map((_, i) => (
                  <circle
                    key={i}
                    cx={20 + (i * 360) / 7}
                    cy={50 + Math.random() * 250}
                    r="6"
                    fill="hsl(var(--primary) / 0.5)"
                    className="animate-pulse-ripple"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </svg>
            </div>
            {/* X轴标签 */}
            <div className="absolute bottom-0 left-0 right-0 h-4 flex justify-between px-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-3 w-12 bg-muted rounded animate-shimmer"
                  style={{ animationDelay: `${i * 100}ms` }}
                />
              ))}
            </div>
          </div>
        )

      case "pie":
        return (
          <div className="w-full h-[450px] flex items-center justify-center">
            <div className="relative w-[300px] h-[300px]">
              {/* 饼图骨架 */}
              <div className="absolute inset-0 rounded-full border-8 border-muted/30 animate-pulse-ripple" />
              <div
                className="absolute inset-8 rounded-full border-8 border-primary/20 animate-pulse-ripple"
                style={{ animationDelay: "200ms" }}
              />
              <div
                className="absolute inset-16 rounded-full border-8 border-primary/30 animate-pulse-ripple"
                style={{ animationDelay: "400ms" }}
              />
              {/* 中心圆 */}
              <div className="absolute inset-24 rounded-full bg-muted/50 animate-shimmer" />
              {/* 标签骨架 */}
              <div className="absolute -right-20 top-1/2 -translate-y-1/2 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2"
                    style={{ animationDelay: `${i * 150}ms` }}
                  >
                    <div className="w-4 h-4 rounded bg-primary/30 animate-pulse-ripple" />
                    <div className="h-3 w-20 bg-muted rounded animate-shimmer" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )

      case "scatter":
        return (
          <div className="w-full h-[450px] relative p-4">
            {/* 网格骨架 */}
            <div className="absolute inset-0">
              <div className="h-full flex flex-col justify-between">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-px bg-muted/30 animate-pulse"
                    style={{ animationDelay: `${i * 100}ms` }}
                  />
                ))}
              </div>
              <div className="absolute inset-0 flex justify-between">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-px bg-muted/30 animate-pulse"
                    style={{ animationDelay: `${i * 100}ms` }}
                  />
                ))}
              </div>
            </div>
            {/* 散点骨架 */}
            <div className="relative h-full">
              {Array.from({ length: 20 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute w-3 h-3 rounded-full bg-primary/40 animate-pulse-ripple"
                  style={{
                    left: `${Math.random() * 90}%`,
                    top: `${Math.random() * 90}%`,
                    animationDelay: `${i * 100}ms`,
                  }}
                />
              ))}
            </div>
          </div>
        )

      case "radar":
        return (
          <div className="w-full h-[450px] flex items-center justify-center">
            <div className="relative w-[350px] h-[350px]">
              {/* 雷达图网格骨架 */}
              <svg className="w-full h-full" viewBox="0 0 400 400">
                {/* 同心圆 */}
                {Array.from({ length: 4 }).map((_, i) => (
                  <circle
                    key={i}
                    cx="200"
                    cy="200"
                    r={50 + i * 50}
                    fill="none"
                    stroke="hsl(var(--muted) / 0.3)"
                    strokeWidth="1"
                    className="animate-pulse"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
                {/* 轴线 */}
                {Array.from({ length: 6 }).map((_, i) => {
                  const angle = (i * 360) / 6 - 90
                  const rad = (angle * Math.PI) / 180
                  return (
                    <line
                      key={i}
                      x1="200"
                      y1="200"
                      x2={200 + 150 * Math.cos(rad)}
                      y2={200 + 150 * Math.sin(rad)}
                      stroke="hsl(var(--muted) / 0.3)"
                      strokeWidth="1"
                      className="animate-pulse"
                      style={{ animationDelay: `${i * 100}ms` }}
                    />
                  )
                })}
                {/* 数据点骨架 */}
                <polygon
                  points="200,150 280,180 250,250 150,250 120,180"
                  fill="hsl(var(--primary) / 0.1)"
                  stroke="hsl(var(--primary) / 0.3)"
                  strokeWidth="2"
                  className="animate-pulse-ripple"
                />
              </svg>
            </div>
          </div>
        )

      case "composed":
        return (
          <div className="w-full h-[450px] flex flex-col justify-end gap-2 px-4 pb-4">
            {/* 组合图骨架 - 柱状图 + 折线 */}
            <div className="flex-1 flex items-end gap-3 relative">
              {/* 柱状图部分 */}
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 flex flex-col items-center gap-2"
                  style={{ animationDelay: `${i * 150}ms` }}
                >
                  <div
                    className="w-full bg-gradient-to-t from-primary/30 to-primary/10 rounded-t-lg animate-pulse-ripple"
                    style={{
                      height: `${30 + Math.random() * 50}%`,
                      animationDelay: `${i * 150}ms`,
                    }}
                  />
                </div>
              ))}
              {/* 折线图部分 */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                <path
                  d="M 20 300 Q 100 200, 180 150 T 380 50"
                  fill="none"
                  stroke="hsl(var(--primary) / 0.4)"
                  strokeWidth="3"
                  strokeDasharray="5,5"
                  className="animate-pulse"
                />
              </svg>
            </div>
          </div>
        )

      case "table":
        return (
          <div className="w-full space-y-2">
            {/* 表头骨架 */}
            <div className="flex gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 h-10 bg-muted rounded-lg animate-shimmer"
                  style={{ animationDelay: `${i * 100}ms` }}
                />
              ))}
            </div>
            {/* 表格行骨架 */}
            {Array.from({ length: 5 }).map((_, rowIndex) => (
              <div
                key={rowIndex}
                className="flex gap-2"
                style={{ animationDelay: `${rowIndex * 50}ms` }}
              >
                {Array.from({ length: 4 }).map((_, colIndex) => (
                  <div
                    key={colIndex}
                    className="flex-1 h-8 bg-muted/50 rounded animate-shimmer"
                    style={{
                      animationDelay: `${rowIndex * 50 + colIndex * 30}ms`,
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        )

      default:
        return (
          <div className="w-full h-[450px] flex items-center justify-center">
            <div className="space-y-4">
              <div className="h-8 w-48 bg-muted rounded animate-shimmer mx-auto" />
              <div className="h-64 w-full bg-muted/30 rounded-lg animate-pulse-ripple" />
            </div>
          </div>
        )
    }
  }

  return (
    <Card
      className={cn(
        "p-8 bg-gradient-to-br from-background via-background to-muted/10 border-2 border-border/50 shadow-2xl backdrop-blur-sm",
        className
      )}
    >
      <div className="mb-6 pb-4 border-b border-border/30">
        <div className="h-6 w-32 bg-muted rounded animate-shimmer" />
      </div>
      <div className="relative">{renderSkeleton()}</div>
    </Card>
  )
}
