import { Loader2Icon } from 'lucide-react'

import { cn } from '@/lib/utils'

function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  return (
    <Loader2Icon
      role="status"
      aria-label="Loading"
      className={cn('size-4 animate-spin', className)}
      {...props}
    />
  )
}

// 更美观的加载动画组件
function LoadingSpinner({ 
  size = 'md', 
  variant = 'default',
  className 
}: { 
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'pulse' | 'dots' | 'wave'
  className?: string 
}) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  }

  if (variant === 'pulse') {
    return (
      <div className={cn('flex items-center justify-center', className)}>
        <div className={cn(
          'rounded-full bg-primary/60 animate-pulse',
          sizeClasses[size]
        )} />
      </div>
    )
  }

  if (variant === 'dots') {
    return (
      <div className={cn('flex items-center gap-1.5', className)}>
        <div className={cn(
          'rounded-full bg-primary animate-bounce',
          size === 'sm' ? 'w-1.5 h-1.5' : size === 'md' ? 'w-2 h-2' : 'w-2.5 h-2.5'
        )} style={{ animationDelay: '0ms', animationDuration: '1.4s' }} />
        <div className={cn(
          'rounded-full bg-primary animate-bounce',
          size === 'sm' ? 'w-1.5 h-1.5' : size === 'md' ? 'w-2 h-2' : 'w-2.5 h-2.5'
        )} style={{ animationDelay: '160ms', animationDuration: '1.4s' }} />
        <div className={cn(
          'rounded-full bg-primary animate-bounce',
          size === 'sm' ? 'w-1.5 h-1.5' : size === 'md' ? 'w-2 h-2' : 'w-2.5 h-2.5'
        )} style={{ animationDelay: '320ms', animationDuration: '1.4s' }} />
      </div>
    )
  }

  if (variant === 'wave') {
    return (
      <div className={cn('flex items-center gap-1', className)}>
        <div className={cn(
          'bg-primary rounded-sm animate-[wave_1.4s_ease-in-out_infinite]',
          size === 'sm' ? 'w-1 h-3' : size === 'md' ? 'w-1.5 h-4' : 'w-2 h-5'
        )} style={{ animationDelay: '0ms' }} />
        <div className={cn(
          'bg-primary rounded-sm animate-[wave_1.4s_ease-in-out_infinite]',
          size === 'sm' ? 'w-1 h-3' : size === 'md' ? 'w-1.5 h-4' : 'w-2 h-5'
        )} style={{ animationDelay: '200ms' }} />
        <div className={cn(
          'bg-primary rounded-sm animate-[wave_1.4s_ease-in-out_infinite]',
          size === 'sm' ? 'w-1 h-3' : size === 'md' ? 'w-1.5 h-4' : 'w-2 h-5'
        )} style={{ animationDelay: '400ms' }} />
        <div className={cn(
          'bg-primary rounded-sm animate-[wave_1.4s_ease-in-out_infinite]',
          size === 'sm' ? 'w-1 h-3' : size === 'md' ? 'w-1.5 h-4' : 'w-2 h-5'
        )} style={{ animationDelay: '600ms' }} />
      </div>
    )
  }

  // default variant - 改进的旋转动画
  return (
    <div className={cn('flex items-center justify-center', className)}>
      <div className="relative">
        <Loader2Icon
          role="status"
          aria-label="Loading"
          className={cn(
            'animate-spin text-primary',
            sizeClasses[size]
          )}
        />
        <div className={cn(
          'absolute inset-0 rounded-full border-2 border-primary/20',
          sizeClasses[size]
        )} />
        <div className={cn(
          'absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin',
          sizeClasses[size]
        )} style={{ animationDuration: '0.8s' }} />
      </div>
    </div>
  )
}

export { Spinner, LoadingSpinner }
