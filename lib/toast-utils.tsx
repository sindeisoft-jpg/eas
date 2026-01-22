import React from "react"
import { toast } from "sonner"

export interface ErrorDetails {
  message: string
  details?: string
  hint?: string
  code?: string
  action?: {
    label: string
    onClick: () => void
  }
}

/**
 * 显示成功提示
 */
export function showSuccess(message: string, description?: string) {
  toast.success(message, {
    description,
    duration: 3000,
  })
}

/**
 * 显示错误提示（带详细信息和解决方案）
 */
export function showError(error: ErrorDetails | string) {
  if (typeof error === "string") {
    toast.error("操作失败", {
      description: error,
      duration: 5000,
    })
    return
  }

  const { message, details, hint, code, action } = error

  toast.error(message, {
    description: (
      <div className="space-y-2">
        {details && <p className="text-sm">{details}</p>}
        {code && (
          <p className="text-xs text-muted-foreground font-mono">
            错误代码: {code}
          </p>
        )}
        {hint && (
          <div className="mt-2 p-2 bg-muted rounded-md">
            <p className="text-xs font-semibold mb-1">💡 解决方案：</p>
            <p className="text-xs">{hint}</p>
          </div>
        )}
      </div>
    ),
    duration: 8000,
    action: action
      ? {
          label: action.label,
          onClick: action.onClick,
        }
      : undefined,
  })
}

/**
 * 显示警告提示
 */
export function showWarning(message: string, description?: string) {
  toast.warning(message, {
    description,
    duration: 4000,
  })
}

/**
 * 显示信息提示
 */
export function showInfo(message: string, description?: string) {
  toast.info(message, {
    description,
    duration: 3000,
  })
}

/**
 * 显示加载提示（返回关闭函数）
 */
export function showLoading(message: string) {
  return toast.loading(message)
}

/**
 * 显示操作确认提示
 */
export function showConfirm(
  message: string,
  description?: string,
  onConfirm?: () => void,
  onCancel?: () => void
): Promise<boolean> {
  return new Promise((resolve) => {
    toast(message, {
      description,
      duration: Infinity,
      action: {
        label: "确认",
        onClick: () => {
          onConfirm?.()
          resolve(true)
        },
      },
      cancel: {
        label: "取消",
        onClick: () => {
          onCancel?.()
          resolve(false)
        },
      },
    })
  })
}

/**
 * 显示危险操作确认（删除等）
 */
export function showDangerConfirm(
  message: string,
  description: string,
  onConfirm: () => void | Promise<void>
): Promise<boolean> {
  return new Promise((resolve) => {
    toast.error(message, {
      description,
      duration: Infinity,
      action: {
        label: "确认删除",
        onClick: async () => {
          try {
            await onConfirm()
            showSuccess("操作成功", "已成功删除")
            resolve(true)
          } catch (error: any) {
            showError({
              message: "删除失败",
              details: error.message || "未知错误",
            })
            resolve(false)
          }
        },
      },
      cancel: {
        label: "取消",
        onClick: () => {
          resolve(false)
        },
      },
    })
  })
}
