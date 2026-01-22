"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Copy, Reply, Edit, Trash2, ThumbsUp, ThumbsDown, Share2, MoreVertical, Check, RotateCw } from "lucide-react"
import { toast } from "@/components/ui/use-toast"

interface MessageActionsProps {
  messageId: string
  content: string
  onReply?: (messageId: string) => void
  onEdit?: (messageId: string, content: string) => void
  onDelete?: (messageId: string) => void
  onShare?: (messageId: string) => void
  onRetry?: (messageId: string, content: string) => void
  canEdit?: boolean
  canDelete?: boolean
  canRetry?: boolean
}

export function MessageActions({
  messageId,
  content,
  onReply,
  onEdit,
  onDelete,
  onShare,
  onRetry,
  canEdit = false,
  canDelete = false,
  canRetry = false,
}: MessageActionsProps) {
  const [copied, setCopied] = useState(false)
  const [reaction, setReaction] = useState<"up" | "down" | null>(null)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      toast({
        title: "已复制",
        description: "消息内容已复制到剪贴板",
      })
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      toast({
        title: "复制失败",
        description: "无法复制到剪贴板",
        variant: "destructive",
      })
    }
  }

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: "分享消息",
        text: content,
      }).catch(() => {
        // 用户取消分享
      })
    } else {
      // 降级方案：复制链接
      const url = `${window.location.origin}/dashboard?message=${messageId}`
      navigator.clipboard.writeText(url)
      toast({
        title: "链接已复制",
        description: "消息链接已复制到剪贴板",
      })
    }
    onShare?.(messageId)
  }

  const handleReaction = (type: "up" | "down") => {
    setReaction(type)
    // TODO: 发送反应到后端
  }

  return (
    <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200">
      {/* 快速反应按钮 - 优化样式 */}
      <div className="flex items-center gap-0.5 bg-white/90 dark:bg-gray-800/90 backdrop-blur-md rounded-full border border-gray-200/50 dark:border-gray-700/50 shadow-sm p-0.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 rounded-full hover:bg-primary/10 dark:hover:bg-primary/20 transition-colors"
          onClick={() => handleReaction("up")}
          title="有用"
        >
          <ThumbsUp className={`h-3.5 w-3.5 ${reaction === "up" ? "text-primary fill-primary" : "text-gray-600 dark:text-gray-400"}`} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 rounded-full hover:bg-destructive/10 dark:hover:bg-destructive/20 transition-colors"
          onClick={() => handleReaction("down")}
          title="无用"
        >
          <ThumbsDown className={`h-3.5 w-3.5 ${reaction === "down" ? "text-destructive fill-destructive" : "text-gray-600 dark:text-gray-400"}`} />
        </Button>
      </div>

      {/* 更多操作菜单 - 优化样式 */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 rounded-full bg-white/90 dark:bg-gray-800/90 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <MoreVertical className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={handleCopy} className="cursor-pointer">
            {copied ? (
              <>
                <Check className="mr-2 h-4 w-4" />
                已复制
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" />
                复制内容
              </>
            )}
          </DropdownMenuItem>
          {onReply && (
            <DropdownMenuItem onClick={() => onReply(messageId)} className="cursor-pointer">
              <Reply className="mr-2 h-4 w-4" />
              引用回复
            </DropdownMenuItem>
          )}
          {canRetry && onRetry && (
            <DropdownMenuItem onClick={() => onRetry(messageId, content)} className="cursor-pointer">
              <RotateCw className="mr-2 h-4 w-4" />
              重新提交
            </DropdownMenuItem>
          )}
          {onShare && (
            <DropdownMenuItem onClick={handleShare} className="cursor-pointer">
              <Share2 className="mr-2 h-4 w-4" />
              分享
            </DropdownMenuItem>
          )}
          {(canEdit || canDelete) && <DropdownMenuSeparator />}
          {canEdit && onEdit && (
            <DropdownMenuItem
              onClick={() => onEdit(messageId, content)}
              className="cursor-pointer"
            >
              <Edit className="mr-2 h-4 w-4" />
              编辑
            </DropdownMenuItem>
          )}
          {canDelete && onDelete && (
            <DropdownMenuItem
              onClick={() => onDelete(messageId)}
              className="cursor-pointer text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              删除
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
