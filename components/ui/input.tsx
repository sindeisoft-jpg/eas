import * as React from 'react'

import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/40 border-border/50 h-9 w-full min-w-0 rounded-lg border bg-background/50 backdrop-blur-sm px-3 py-1 text-base shadow-xs transition-all duration-200 outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:border-primary/40 focus-visible:ring-primary/15 focus-visible:ring-2 focus-visible:shadow-premium focus-visible:bg-background',
        'hover:border-primary/30 hover:bg-background/70',
        'aria-invalid:ring-destructive/15 dark:aria-invalid:ring-destructive/30 aria-invalid:border-destructive/50',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
