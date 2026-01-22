"use client"

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Keyboard } from "lucide-react"

interface ShortcutsHelpProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ShortcutsHelp({ open, onOpenChange }: ShortcutsHelpProps) {
  const shortcuts = [
    {
      category: "输入",
      items: [
        { key: "Enter", description: "发送消息" },
        { key: "Shift + Enter", description: "换行" },
        { key: "↑ / ↓", description: "浏览输入历史" },
        { key: "Esc", description: "清空输入" },
      ],
    },
    {
      category: "导航",
      items: [
        { key: "⌘K / Ctrl+K", description: "打开搜索" },
        { key: "⌘/ / Ctrl+/", description: "显示快捷键帮助" },
      ],
    },
    {
      category: "消息操作",
      items: [
        { key: "点击消息", description: "显示操作菜单" },
        { key: "👍 / 👎", description: "快速反馈" },
      ],
    },
    {
      category: "图表",
      items: [
        { key: "点击图表元素", description: "查看详细数据（钻取）" },
      ],
    },
  ]

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="搜索快捷键..." />
      <CommandList>
        <CommandEmpty>没有找到相关快捷键</CommandEmpty>
        {shortcuts.map((category) => (
          <CommandGroup key={category.category} heading={category.category}>
            {category.items.map((item, index) => (
              <CommandItem
                key={index}
                className="flex items-center justify-between cursor-default"
                onSelect={() => {}}
              >
                <span className="text-sm">{item.description}</span>
                <kbd className="ml-auto px-2 py-1 text-xs font-semibold text-muted-foreground bg-muted rounded border border-border">
                  {item.key}
                </kbd>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  )
}
