"use client"

import * as React from "react"
import { Card } from "./card"
import { Button } from "./button"
import { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
  children?: React.ReactNode
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = "",
  children,
}: EmptyStateProps) {
  return (
    <Card
      className={cn(
        "p-12 md:p-16 text-center rounded-lg border border-border/40 bg-card/50 backdrop-blur-sm shadow-premium",
        className
      )}
    >
      <div className="max-w-md mx-auto space-y-5">
        {Icon && (
          <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
            <Icon className="w-8 h-8 text-primary" />
          </div>
        )}
        <div className="space-y-2">
          <h3 className="text-xl font-semibold text-foreground">{title}</h3>
          {description && (
            <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
          )}
        </div>
        {action && (
          <Button
            onClick={action.onClick}
            className="gap-2 h-10 px-5 rounded-lg font-medium shadow-premium hover:shadow-premium transition-all duration-200"
          >
            {action.label}
          </Button>
        )}
        {children}
      </div>
    </Card>
  )
}

interface EmptyStateWithIllustrationProps extends Omit<EmptyStateProps, "icon"> {
  illustration?: React.ReactNode
}

export function EmptyStateWithIllustration({
  illustration,
  title,
  description,
  action,
  className = "",
  children,
}: EmptyStateWithIllustrationProps) {
  return (
    <Card
      className={cn(
        "p-12 md:p-16 text-center rounded-lg border border-border/40 bg-background/50 backdrop-blur-sm shadow-premium-lg",
        className
      )}
    >
      <div className="max-w-md mx-auto space-y-6">
        {illustration && (
          <div className="flex items-center justify-center">
            {illustration}
          </div>
        )}
        <div className="space-y-2">
          <h3 className="text-2xl font-semibold text-foreground">{title}</h3>
          {description && (
            <p className="text-muted-foreground text-base">{description}</p>
          )}
        </div>
        {action && (
          <Button
            onClick={action.onClick}
            className="gap-2 h-11 px-6 rounded-lg font-medium shadow-premium hover:shadow-premium-lg transition-all duration-200"
          >
            {action.label}
          </Button>
        )}
        {children}
      </div>
    </Card>
  )
}
