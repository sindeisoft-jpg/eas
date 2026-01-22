"use client"

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from "react"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Send, Mic, X, History, ArrowUp, BarChart3, PieChart, TrendingUp, Gauge, Filter, Grid3x3, FileText } from "lucide-react"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { getAvailableChartTypeCommands } from "@/lib/command-parser"

interface EnhancedInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: (e?: React.FormEvent) => void | Promise<void>
  placeholder?: string
  disabled?: boolean
  isLoading?: boolean
  onFileUpload?: (files: File[]) => void
}

export function EnhancedInput({
  value,
  onChange,
  onSubmit,
  placeholder = "输入您的问题...",
  disabled = false,
  isLoading = false,
  onFileUpload,
}: EnhancedInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [inputHistory, setInputHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [isRecording, setIsRecording] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showCommandMenu, setShowCommandMenu] = useState(false)
  const [commandMenuPosition, setCommandMenuPosition] = useState({ top: 0, left: 0 })
  const [commandSearchText, setCommandSearchText] = useState("")
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0)
  const commandMenuRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  
  // 获取所有可用的图表类型命令
  const chartCommands = getAvailableChartTypeCommands()
  
  // 通用命令列表
  const generalCommands = [
    { command: '@报表', description: '生成报表', icon: FileText },
    { command: '@图表', description: '生成图表（自动推断类型）', icon: BarChart3 },
    { command: '@表格', description: '生成表格', icon: Grid3x3 },
  ]
  
  // 过滤后的命令列表
  const filteredGeneralCommands = generalCommands.filter(cmd => 
    !commandSearchText || 
    cmd.command.toLowerCase().includes(commandSearchText) ||
    cmd.description.toLowerCase().includes(commandSearchText)
  )
  
  const filteredChartCommands = chartCommands.filter(cmd => 
    !commandSearchText || 
    cmd.command.toLowerCase().includes(commandSearchText) ||
    cmd.description.toLowerCase().includes(commandSearchText)
  )
  
  // 所有可用的命令（用于键盘导航）
  const allFilteredCommands = [
    ...filteredGeneralCommands.map(cmd => ({ ...cmd, isGeneral: true })),
    ...filteredChartCommands.slice(0, 15).map(cmd => ({ ...cmd, isGeneral: false }))
  ]

  // 加载输入历史
  useEffect(() => {
    const history = localStorage.getItem("chat-input-history")
    if (history) {
      try {
        setInputHistory(JSON.parse(history))
      } catch (e) {
        // 忽略解析错误
      }
    }
  }, [])

  // 保存输入历史
  const saveToHistory = (text: string) => {
    if (!text.trim()) return
    
    const newHistory = [text, ...inputHistory.filter((h) => h !== text)].slice(0, 50)
    setInputHistory(newHistory)
    localStorage.setItem("chat-input-history", JSON.stringify(newHistory))
  }

  // 处理快捷命令
  const handleShortcutCommand = (text: string): string => {
    // 使用新的命令解析器
    try {
      const { parseCommand } = require("@/lib/command-parser")
      const parsed = parseCommand(text)
      
      if (parsed.command) {
        // 命令已解析，返回清理后的问题（命令信息会在chat-interface中处理）
        return parsed.question
      }
    } catch (error) {
      console.warn("[EnhancedInput] Failed to parse command:", error)
    }
    
    // 保留原有的 /report 处理逻辑（向后兼容）
    if (text.startsWith("/report") || text.startsWith("/报表")) {
      const rest = text.replace(/^\/report\s*|\/报表\s*/i, "").trim()
      if (rest) {
        return `生成报表：${rest}`
      }
      return "生成报表"
    }
    
    // 处理 @报表 命令
    if (text.startsWith("@报表") || text.startsWith("@report")) {
      const rest = text.replace(/^@报表\s*|@report\s*/i, "").trim()
      if (rest) {
        return `生成报表：${rest}`
      }
      return "生成报表"
    }
    
    return text
  }

  // 检测命令输入并显示菜单
  useEffect(() => {
    if (!textareaRef.current) {
      setShowCommandMenu(false)
      return
    }
    
    // 如果输入框为空，关闭菜单
    if (!value || value.trim() === '') {
      setShowCommandMenu(false)
      return
    }
    
    const textarea = textareaRef.current
    const cursorPosition = textarea.selectionStart || 0
    const textBeforeCursor = value.substring(0, cursorPosition)
    
    // 检测是否输入了 "@" 且后面没有空格或换行
    const lastAtIndex = textBeforeCursor.lastIndexOf('@')
    
    if (lastAtIndex >= 0) {
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1)
      
      // 检查 "@" 后面是否有空格或换行，如果有则关闭菜单
      if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
        // 显示命令菜单
        const rect = textarea.getBoundingClientRect()
        const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 20
        const lines = textBeforeCursor.split('\n')
        const currentLine = lines.length - 1
        
        // 计算菜单位置（使用fixed定位，相对于视口）
        const scrollY = window.scrollY || window.pageYOffset
        const scrollX = window.scrollX || window.pageXOffset
        const top = rect.top + scrollY + (currentLine * lineHeight) + lineHeight + 8
        const left = rect.left + scrollX
        
        console.log("[EnhancedInput] Showing command menu", {
          lastAtIndex,
          textAfterAt,
          top,
          left,
          rectTop: rect.top,
          scrollY
        })
        
        setCommandMenuPosition({ top, left })
        setCommandSearchText(textAfterAt.toLowerCase())
        setSelectedCommandIndex(0) // 重置选中索引
        setShowCommandMenu(true)
        return
      }
    }
    
    // 如果没有匹配到 @ 符号，关闭菜单
    if (showCommandMenu) {
      console.log("[EnhancedInput] Hiding command menu")
      setShowCommandMenu(false)
    }
  }, [value, showCommandMenu])
  
  // 点击外部关闭菜单
  useEffect(() => {
    if (!showCommandMenu) return
    
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        commandMenuRef.current &&
        !commandMenuRef.current.contains(target) &&
        textareaRef.current &&
        !textareaRef.current.contains(target)
      ) {
        console.log("[EnhancedInput] Click outside, closing menu")
        setShowCommandMenu(false)
      }
    }
    
    // 使用捕获阶段，确保能捕获到所有点击
    document.addEventListener('mousedown', handleClickOutside, true)
    return () => document.removeEventListener('mousedown', handleClickOutside, true)
  }, [showCommandMenu])
  
  // 插入命令到输入框
  const insertCommand = useCallback((command: string) => {
    if (!textareaRef.current) {
      console.warn("[EnhancedInput] Cannot insert command: textarea ref is null")
      return
    }
    
    const cursorPosition = textareaRef.current.selectionStart || 0
    const textBeforeCursor = value.substring(0, cursorPosition)
    const lastAtIndex = textBeforeCursor.lastIndexOf('@')
    const textAfterCursor = value.substring(cursorPosition)
    
    if (lastAtIndex >= 0) {
      const newValue = 
        value.substring(0, lastAtIndex) + 
        command + 
        ' ' + 
        textAfterCursor
      
      console.log("[EnhancedInput] Inserting command", {
        command,
        lastAtIndex,
        newValue: newValue.substring(0, 50) + '...'
      })
      
      onChange(newValue)
      setShowCommandMenu(false)
      setSelectedCommandIndex(0)
      
      // 使用 requestAnimationFrame 确保 DOM 更新后再设置光标位置
      requestAnimationFrame(() => {
        const newCursorPos = lastAtIndex + command.length + 1
        textareaRef.current?.setSelectionRange(newCursorPos, newCursorPos)
        textareaRef.current?.focus()
      })
    } else {
      console.warn("[EnhancedInput] Cannot insert command: @ symbol not found")
    }
  }, [value, onChange])

  // 处理键盘事件
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // 如果命令菜单打开，处理导航
    if (showCommandMenu && allFilteredCommands.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        e.stopPropagation()
        setSelectedCommandIndex(prev => 
          prev < allFilteredCommands.length - 1 ? prev + 1 : 0
        )
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        e.stopPropagation()
        setSelectedCommandIndex(prev => 
          prev > 0 ? prev - 1 : allFilteredCommands.length - 1
        )
        return
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        const selectedCommand = allFilteredCommands[selectedCommandIndex]
        if (selectedCommand) {
          insertCommand(selectedCommand.command)
        }
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        setShowCommandMenu(false)
        return
      }
      if (e.key === "Tab") {
        e.preventDefault()
        e.stopPropagation()
        const selectedCommand = allFilteredCommands[selectedCommandIndex]
        if (selectedCommand) {
          insertCommand(selectedCommand.command)
        }
        return
      }
    }
    
    // 阻止事件冒泡，避免触发全局快捷键（如搜索窗口）
    // 特别是当输入 "@" 时，不应该触发全局搜索
    if (e.key === "@" || e.key === "k") {
      e.stopPropagation()
    }
    
    // Shift + Enter: 换行
    if (e.key === "Enter" && e.shiftKey) {
      return
    }

    // Enter: 发送
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      e.stopPropagation() // 阻止冒泡
      if (value.trim() && !disabled && !isLoading) {
        const processedValue = handleShortcutCommand(value.trim())
        if (processedValue !== value.trim()) {
          onChange(processedValue)
        }
        saveToHistory(value)
        onSubmit()
      }
      return
    }

    // Escape: 清除输入
    if (e.key === "Escape") {
      e.stopPropagation() // 阻止冒泡
      onChange("")
      setHistoryIndex(-1)
      return
    }

    // 上箭头: 历史记录
    if (e.key === "ArrowUp" && !value && inputHistory.length > 0) {
      e.preventDefault()
      e.stopPropagation() // 阻止冒泡
      setHistoryIndex(0)
      onChange(inputHistory[0])
      return
    }

    // 下箭头: 历史记录
    if (e.key === "ArrowDown" && historyIndex >= 0) {
      e.preventDefault()
      e.stopPropagation() // 阻止冒泡
      if (historyIndex < inputHistory.length - 1) {
        const nextIndex = historyIndex + 1
        setHistoryIndex(nextIndex)
        onChange(inputHistory[nextIndex])
      } else {
        setHistoryIndex(-1)
        onChange("")
      }
      return
    }

    // Ctrl/Cmd + K: 打开历史记录
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault()
      e.stopPropagation() // 阻止冒泡，避免触发全局搜索
      setShowHistory(true)
    }
  }

  // 自动调整高度
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }, [value])

  // 语音输入
  const startRecording = () => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      alert("您的浏览器不支持语音输入")
      return
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
    const recognition = new SpeechRecognition()
    
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = "zh-CN"

    recognition.onstart = () => {
      setIsRecording(true)
    }

    recognition.onresult = (event: any) => {
      let interimTranscript = ""
      let finalTranscript = ""

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalTranscript += transcript
        } else {
          interimTranscript += transcript
        }
      }

      onChange(value + finalTranscript + interimTranscript)
    }

    recognition.onerror = (event: any) => {
      console.error("语音识别错误:", event.error)
      setIsRecording(false)
    }

    recognition.onend = () => {
      setIsRecording(false)
    }

    recognition.start()
    recognitionRef.current = recognition
  }

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setIsRecording(false)
  }

  // 文件上传
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0 && onFileUpload) {
      onFileUpload(files)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0 && onFileUpload) {
      onFileUpload(files)
    }
  }

  return (
    <div className="relative">
      <div
        className="relative flex items-end gap-2 p-4 bg-background border-t border-border/50"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* 文件上传输入（隐藏） */}
        <input
          type="file"
          id="file-upload"
          className="hidden"
          multiple
          onChange={handleFileSelect}
        />

        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              onChange(e.target.value)
              setHistoryIndex(-1)
              // 重置命令菜单搜索文本
              const cursorPosition = e.target.selectionStart
              const textBeforeCursor = e.target.value.substring(0, cursorPosition)
              const lastAtIndex = textBeforeCursor.lastIndexOf('@')
              if (lastAtIndex >= 0) {
                setCommandSearchText(textBeforeCursor.substring(lastAtIndex + 1).toLowerCase())
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || isLoading}
            className="min-h-[44px] max-h-[200px] resize-none pr-20 rounded-lg border-border/50 focus:border-primary/50 transition-all"
            rows={1}
          />
          
          {/* 输入提示 */}
          <div className="absolute bottom-2 right-2 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="hidden sm:inline">Shift+Enter 换行，Enter 发送</span>
            <span className="hidden md:inline">↑↓ 历史记录</span>
            <span className="hidden lg:inline">输入 @ 查看命令</span>
          </div>
          
          {/* 命令选择菜单 */}
          {showCommandMenu && (
            <div
              ref={commandMenuRef}
              className="fixed z-[9999] w-80 bg-popover border border-border rounded-lg shadow-lg max-h-[400px] overflow-hidden"
              style={{
                top: `${commandMenuPosition.top}px`,
                left: `${commandMenuPosition.left}px`,
                maxWidth: 'calc(100vw - 20px)',
              }}
            >
              <div className="p-2 border-b border-border">
                <div className="text-xs font-medium text-muted-foreground px-2 py-1">选择命令</div>
              </div>
              <div 
                className="max-h-[350px] overflow-y-auto"
                ref={(el) => {
                  // 自动滚动到选中项
                  if (el && allFilteredCommands.length > 0 && selectedCommandIndex >= 0) {
                    requestAnimationFrame(() => {
                      const selectedElement = el.querySelector(`[data-command-index="${selectedCommandIndex}"]`)
                      if (selectedElement) {
                        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
                      }
                    })
                  }
                }}
              >
                {/* 通用命令 */}
                {filteredGeneralCommands.length > 0 && (
                  <div className="p-1">
                    <div className="text-xs font-semibold text-muted-foreground px-2 py-1.5">通用命令</div>
                    {filteredGeneralCommands.map((cmd, index) => {
                      const Icon = cmd.icon
                      const globalIndex = index
                      const isSelected = selectedCommandIndex === globalIndex
                      return (
                        <button
                          key={cmd.command}
                          data-command-index={globalIndex}
                          type="button"
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm transition-colors ${
                            isSelected 
                              ? 'bg-accent text-accent-foreground' 
                              : 'hover:bg-accent/50'
                          }`}
                          onClick={() => insertCommand(cmd.command)}
                          onMouseEnter={() => setSelectedCommandIndex(globalIndex)}
                        >
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <div className="flex-1">
                            <div className="font-medium">{cmd.command}</div>
                            <div className="text-xs text-muted-foreground">{cmd.description}</div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
                
                {/* 图表类型命令 */}
                {filteredChartCommands.length > 0 && (
                  <div className={`p-1 ${filteredGeneralCommands.length > 0 ? 'border-t border-border/50' : ''}`}>
                    <div className="text-xs font-semibold text-muted-foreground px-2 py-1.5">图表类型</div>
                    {filteredChartCommands.slice(0, 15).map((cmd, index) => {
                      // 根据图表类型选择图标
                      let Icon = BarChart3
                      if (cmd.type === 'pie') Icon = PieChart
                      else if (cmd.type === 'line') Icon = TrendingUp
                      else if (cmd.type === 'gauge') Icon = Gauge
                      else if (cmd.type === 'funnel') Icon = Filter
                      else Icon = BarChart3
                      
                      const globalIndex = filteredGeneralCommands.length + index
                      const isSelected = selectedCommandIndex === globalIndex
                      
                      return (
                        <button
                          key={cmd.command}
                          data-command-index={globalIndex}
                          type="button"
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm transition-colors ${
                            isSelected 
                              ? 'bg-accent text-accent-foreground' 
                              : 'hover:bg-accent/50'
                          }`}
                          onClick={() => insertCommand(cmd.command)}
                          onMouseEnter={() => setSelectedCommandIndex(globalIndex)}
                        >
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <div className="flex-1">
                            <div className="font-medium">{cmd.command}</div>
                            <div className="text-xs text-muted-foreground">{cmd.description}</div>
                          </div>
                        </button>
                      )
                    })}
                    {filteredChartCommands.length > 15 && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        还有 {filteredChartCommands.length - 15} 个图表类型...
                      </div>
                    )}
                  </div>
                )}
                
                {/* 没有匹配结果 */}
                {allFilteredCommands.length === 0 && (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    没有找到匹配的命令
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* 语音输入按钮 */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-lg"
            onClick={isRecording ? stopRecording : startRecording}
            disabled={disabled || isLoading}
          >
            <Mic className={`h-4 w-4 ${isRecording ? "text-destructive animate-pulse" : ""}`} />
          </Button>

          {/* 历史记录按钮 */}
          {inputHistory.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-lg"
              onClick={() => setShowHistory(true)}
              disabled={disabled || isLoading}
            >
              <History className="h-4 w-4" />
            </Button>
          )}

          {/* 发送按钮 */}
          <Button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              if (value.trim() && !disabled && !isLoading) {
                const processedValue = handleShortcutCommand(value.trim())
                if (processedValue !== value.trim()) {
                  onChange(processedValue)
                  // 等待状态更新后再提交
                  setTimeout(() => {
                    saveToHistory(value)
                    onSubmit(e)
                  }, 0)
                } else {
                  saveToHistory(value)
                  onSubmit(e)
                }
              }
            }}
            disabled={!value.trim() || disabled || isLoading}
            className="h-10 px-4 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {isLoading ? (
              <div className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* 历史记录对话框 */}
      <CommandDialog open={showHistory} onOpenChange={setShowHistory}>
        <CommandInput placeholder="搜索历史输入..." />
        <CommandList>
          <CommandEmpty>没有找到历史记录</CommandEmpty>
          <CommandGroup heading="历史输入">
            {inputHistory.map((item, index) => (
              <CommandItem
                key={index}
                value={item}
                onSelect={() => {
                  onChange(item)
                  setShowHistory(false)
                  textareaRef.current?.focus()
                }}
                className="cursor-pointer"
              >
                <History className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="truncate">{item}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  )
}

// 扩展Window类型以支持语音识别
declare global {
  interface Window {
    webkitSpeechRecognition: any
    SpeechRecognition: any
  }
}
