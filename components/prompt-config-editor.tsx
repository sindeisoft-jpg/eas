"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Loader2, Save, X, Info, CheckCircle2, Languages } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { apiClient } from "@/lib/api-client"
import { useToast } from "@/hooks/use-toast"

interface PromptConfigEditorProps {
  config: {
    id: string
    category: string
    name: string
    description?: string | null
    content: string
    variables?: string[]
    isActive?: boolean
  }
  onSave: (data: {
    description?: string
    content: string
    variables?: string[]
    isActive?: boolean
  }) => Promise<void>
  onCancel?: () => void
  readOnly?: boolean
}

export function PromptConfigEditor({
  config,
  onSave,
  onCancel,
  readOnly = false,
}: PromptConfigEditorProps) {
  const [description, setDescription] = useState(config.description || "")
  const [content, setContent] = useState(config.content || "")
  const [variables, setVariables] = useState<string[]>(config.variables || [])
  const [isActive, setIsActive] = useState(config.isActive !== undefined ? config.isActive : true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [isTranslating, setIsTranslating] = useState(false)
  const { toast } = useToast()

  // 从内容中提取变量
  const extractVariables = (text: string): string[] => {
    const variablePattern = /\{\{(\w+)\}\}/g
    const matches = new Set<string>()
    let match

    while ((match = variablePattern.exec(text)) !== null) {
      matches.add(match[1])
    }

    return Array.from(matches).sort()
  }

  // 当内容改变时，自动提取变量
  const handleContentChange = (value: string) => {
    setContent(value)
    const extracted = extractVariables(value)
    setVariables(extracted)
  }

  const handleTranslate = async () => {
    if (!content.trim()) {
      toast({
        title: "翻译失败",
        description: "内容不能为空",
        variant: "destructive",
      })
      return
    }

    setIsTranslating(true)
    setError(null)
    try {
      const result = await apiClient.translatePromptContent(content)
      setContent(result.translatedContent)
      // 重新提取变量
      const extracted = extractVariables(result.translatedContent)
      setVariables(extracted)
      
      toast({
        title: "翻译完成",
        description: `内容已翻译成中文（${result.originalLength} → ${result.translatedLength} 字符）`,
      })
    } catch (err: any) {
      const errorMessage = err.message || "翻译失败"
      const errorDetails = err.details || ""
      setError(errorDetails ? `${errorMessage}\n${errorDetails}` : errorMessage)
      toast({
        title: "翻译失败",
        description: errorDetails || errorMessage,
        variant: "destructive",
      })
    } finally {
      setIsTranslating(false)
    }
  }

  const handleSave = async () => {
    setError(null)
    setSaveSuccess(false)

    if (!content.trim()) {
      setError("内容不能为空")
      return
    }

    setIsSaving(true)
    try {
      await onSave({
        description: description.trim() || undefined,
        content: content.trim(),
        variables,
        isActive,
      })
      setSaveSuccess(true)
      // 2秒后自动隐藏成功提示
      setTimeout(() => {
        setSaveSuccess(false)
      }, 2000)
    } catch (err: any) {
      setError(err.message || "保存失败")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card className="p-6 space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b pb-4">
            <div>
              <h3 className="text-lg font-semibold">编辑提示词配置</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {config.category} / {config.name}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {onCancel && (
                <Button variant="outline" onClick={onCancel}>
                  取消
                </Button>
              )}
              <Button onClick={handleSave} disabled={isSaving} className="min-w-[120px]">
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    保存中...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    保存
                  </>
                )}
              </Button>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {saveSuccess && (
            <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <AlertDescription className="text-green-800 dark:text-green-200">
                  配置已成功保存！
                </AlertDescription>
              </div>
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">分类</Label>
              <Input
                id="category"
                value={config.category}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">分类不可修改</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">名称</Label>
              <Input
                id="name"
                value={config.name}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">名称不可修改</p>
            </div>
          </div>

        <div className="space-y-2">
          <Label htmlFor="description">描述</Label>
          <Input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={readOnly}
            placeholder="配置项的简要说明"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="content">提示词内容 *</Label>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Info className="w-3 h-3" />
                <span>使用 {"{{变量名}}"} 来定义变量</span>
              </div>
              {!readOnly && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTranslate}
                  disabled={isTranslating || !content.trim()}
                  className="h-7 text-xs"
                  title="使用AI将当前内容翻译成中文"
                >
                  {isTranslating ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                      翻译中...
                    </>
                  ) : (
                    <>
                      <Languages className="w-3 h-3 mr-1.5" />
                      翻译成中文
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
          <Textarea
            id="content"
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            disabled={readOnly}
            placeholder="输入提示词内容..."
            className="font-mono text-sm min-h-[500px] resize-y"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              提示词内容，支持使用 {"{{变量名}}"} 格式的变量
            </p>
            <p className="text-xs text-muted-foreground">
              字符数: {content.length}
            </p>
          </div>
        </div>

        {variables.length > 0 && (
          <div className="space-y-2">
            <Label>检测到的变量</Label>
            <div className="flex flex-wrap gap-2">
              {variables.map((variable) => (
                <Badge key={variable} variant="secondary">
                  {"{{" + variable + "}}"}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              这些变量会在使用时被替换为实际值
            </p>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="isActive">启用</Label>
            <p className="text-xs text-muted-foreground">只有启用的配置才会被使用</p>
          </div>
          <Switch
            id="isActive"
            checked={isActive}
            onCheckedChange={setIsActive}
            disabled={readOnly}
          />
        </div>

        {!readOnly && (
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={onCancel} disabled={isSaving}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={isSaving} size="lg" className="min-w-[140px]">
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  保存更改
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}
