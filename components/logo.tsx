"use client"

import React from "react"
import { cn } from "@/lib/utils"

interface LogoProps {
  className?: string
  size?: "sm" | "md" | "lg" | "xl"
  showText?: boolean
}

const sizeMap = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-3xl",
  xl: "text-4xl",
}

export function Logo({ className, size = "md", showText = true }: LogoProps) {
  return (
    <div className={cn("flex items-center justify-center", className)}>
      <span
        className={cn("font-bold tracking-tight", sizeMap[size])}
        style={{
          background: "linear-gradient(135deg, #9333ea 0%, #a855f7 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          color: "transparent",
        }}
      >
        紫鈊
      </span>
      {showText && (
        <span className={cn("ml-1 font-semibold text-foreground", sizeMap[size])}>
          BI
        </span>
      )}
    </div>
  )
}
