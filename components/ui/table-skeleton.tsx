"use client"

import { Skeleton } from "./skeleton"
import { Card } from "./card"

interface TableSkeletonProps {
  rows?: number
  columns?: number
  className?: string
}

export function TableSkeleton({ rows = 5, columns = 4, className = "" }: TableSkeletonProps) {
  return (
    <Card className={`rounded-lg border border-border/40 bg-background shadow-premium ${className}`}>
      <div className="p-4 space-y-4">
        {/* 工具栏骨架 */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-64" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-20" />
          </div>
        </div>

        {/* 表格骨架 */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/30">
                {Array.from({ length: columns }).map((_, i) => (
                  <th key={i} className="p-3 text-left">
                    <Skeleton className="h-5 w-24" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rows }).map((_, rowIndex) => (
                <tr key={rowIndex} className="border-b border-border/20">
                  {Array.from({ length: columns }).map((_, colIndex) => (
                    <td key={colIndex} className="p-3">
                      <Skeleton className="h-4 w-full max-w-[120px]" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 分页骨架 */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border/30">
          <Skeleton className="h-4 w-32" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
          </div>
        </div>
      </div>
    </Card>
  )
}

interface CardSkeletonProps {
  count?: number
  className?: string
}

export function CardSkeleton({ count = 3, className = "" }: CardSkeletonProps) {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-12 w-12 rounded-lg" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </Card>
      ))}
    </div>
  )
}

interface ChartSkeletonProps {
  className?: string
}

export function ChartSkeleton({ className = "" }: ChartSkeletonProps) {
  return (
    <Card className={`p-8 ${className} bg-gradient-to-br from-background via-background to-muted/10 border border-border/40 shadow-premium-lg backdrop-blur-sm`}>
      <div className="mb-6 pb-4 border-b border-border/30">
        <Skeleton className="h-6 w-48 mb-2" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-64 w-full rounded-lg" />
        <div className="flex items-center justify-center gap-4">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>
    </Card>
  )
}

interface MessageSkeletonProps {
  count?: number
  className?: string
}

export function MessageSkeleton({ count = 2, className = "" }: MessageSkeletonProps) {
  return (
    <div className={`space-y-4 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex gap-4 animate-fade-in">
          <Skeleton className="h-9 w-9 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-20 w-full rounded-lg" />
            <div className="flex gap-2">
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-6 w-16" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
