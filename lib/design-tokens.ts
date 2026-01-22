/**
 * 设计令牌 - 统一的设计系统常量
 * 用于确保整个应用的视觉一致性
 */

export const designTokens = {
  // 间距系统 (基于 4px 网格)
  spacing: {
    xs: "0.25rem",    // 4px
    sm: "0.5rem",     // 8px
    md: "1rem",       // 16px
    lg: "1.5rem",     // 24px
    xl: "2rem",       // 32px
    "2xl": "3rem",    // 48px
    "3xl": "4rem",    // 64px
  },

  // 圆角系统
  radius: {
    none: "0",
    sm: "0.375rem",   // 6px
    md: "0.5rem",     // 8px
    lg: "0.75rem",    // 12px
    xl: "1rem",       // 16px
    full: "9999px",
  },

  // 字体大小系统
  fontSize: {
    xs: "0.75rem",    // 12px
    sm: "0.875rem",   // 14px
    base: "1rem",     // 16px
    lg: "1.125rem",   // 18px
    xl: "1.25rem",    // 20px
    "2xl": "1.5rem",  // 24px
    "3xl": "1.875rem", // 30px
    "4xl": "2.25rem", // 36px
  },

  // 字重系统
  fontWeight: {
    normal: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
  },

  // 行高系统
  lineHeight: {
    tight: "1.25",
    snug: "1.375",
    normal: "1.5",
    relaxed: "1.625",
    loose: "2",
  },

  // 阴影系统
  shadow: {
    sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
    md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
    lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
    xl: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
  },

  // 过渡时间
  transition: {
    fast: "150ms",
    normal: "200ms",
    slow: "300ms",
  },

  // 层级 (z-index)
  zIndex: {
    base: 0,
    dropdown: 1000,
    sticky: 1020,
    fixed: 1030,
    modalBackdrop: 1040,
    modal: 1050,
    popover: 1060,
    tooltip: 1070,
  },
} as const

/**
 * 获取标准化的类名
 */
export const getStandardClasses = {
  // 卡片
  card: "rounded-lg border border-border/50 bg-card shadow-sm",
  cardHover: "hover:shadow-md transition-shadow duration-200",
  
  // 按钮
  button: "rounded-lg font-medium transition-all duration-200",
  buttonPrimary: "shadow-sm hover:shadow-md",
  buttonOutline: "border-border/50 hover:bg-muted/50",
  
  // 输入框
  input: "rounded-lg border border-border/50 focus:ring-2 focus:ring-primary/20",
  
  // 标题
  h1: "text-3xl font-bold tracking-tight",
  h2: "text-2xl font-semibold tracking-tight",
  h3: "text-xl font-semibold",
  h4: "text-lg font-semibold",
  
  // 正文
  body: "text-sm text-foreground",
  bodyLarge: "text-base text-foreground",
  bodySmall: "text-xs text-foreground",
  
  // 辅助文字
  muted: "text-xs text-muted-foreground",
  mutedSmall: "text-[10px] text-muted-foreground",
  
  // 间距
  sectionSpacing: "mb-8",
  cardSpacing: "mb-6",
  itemSpacing: "mb-4",
} as const
