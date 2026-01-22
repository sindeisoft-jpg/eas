/**
 * 日志工具
 * 控制日志输出级别，减少生产环境的日志噪音
 */

const isDevelopment = process.env.NODE_ENV === 'development'
const LOG_LEVEL = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'warn')

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  none: 4,
}

const currentLevel = LOG_LEVELS[LOG_LEVEL as keyof typeof LOG_LEVELS] ?? LOG_LEVELS.warn

export const logger = {
  debug: (...args: any[]) => {
    if (currentLevel <= LOG_LEVELS.debug) {
      console.log(...args)
    }
  },
  info: (...args: any[]) => {
    if (currentLevel <= LOG_LEVELS.info) {
      console.log(...args)
    }
  },
  warn: (...args: any[]) => {
    if (currentLevel <= LOG_LEVELS.warn) {
      console.warn(...args)
    }
  },
  error: (...args: any[]) => {
    if (currentLevel <= LOG_LEVELS.error) {
      console.error(...args)
    }
  },
}

// 客户端日志（只在开发环境输出）
export const clientLogger = {
  debug: (...args: any[]) => {
    if (typeof window !== 'undefined' && isDevelopment) {
      console.log(...args)
    }
  },
  info: (...args: any[]) => {
    if (typeof window !== 'undefined' && isDevelopment) {
      console.log(...args)
    }
  },
  warn: (...args: any[]) => {
    if (typeof window !== 'undefined') {
      console.warn(...args)
    }
  },
  error: (...args: any[]) => {
    if (typeof window !== 'undefined') {
      console.error(...args)
    }
  },
}
