"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { storage } from "@/lib/storage"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Plus, X } from "lucide-react"
import type { SQLSecurityPolicy, SQLOperation } from "@/lib/types"

interface SQLPolicyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  policy: SQLSecurityPolicy | null
  onSuccess: () => void
}

export function SQLPolicyDialog({ open, onOpenChange, policy, onSuccess }: SQLPolicyDialogProps) {
  const allOperations = ["SELECT", "INSERT", "UPDATE", "DELETE", "CREATE", "DROP", "ALTER", "TRUNCATE"]
  const [formData, setFormData] = useState({
    name: "",
    allowedOperations: ["SELECT"] as string[],
    blockedKeywords: [] as string[],
    maxExecutionTime: 30,
    maxRowsReturned: 10000,
    requiresApproval: false,
  })
  const [newKeyword, setNewKeyword] = useState("")

  useEffect(() => {
    if (policy) {
      setFormData({
        name: policy.name,
        allowedOperations: policy.allowedOperations,
        blockedKeywords: policy.blockedKeywords,
        maxExecutionTime: policy.maxExecutionTime,
        maxRowsReturned: policy.maxRowsReturned,
        requiresApproval: policy.requiresApproval,
      })
    } else {
      setFormData({
        name: "",
        allowedOperations: ["SELECT"],
        blockedKeywords: [],
        maxExecutionTime: 30,
        maxRowsReturned: 10000,
        requiresApproval: false,
      })
    }
  }, [policy, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const policyData: SQLSecurityPolicy = {
      id: policy?.id || `policy_${Date.now()}`,
      name: formData.name,
      allowedOperations: formData.allowedOperations as SQLSecurityPolicy["allowedOperations"],
      blockedKeywords: formData.blockedKeywords,
      maxExecutionTime: formData.maxExecutionTime,
      maxRowsReturned: formData.maxRowsReturned,
      requiresApproval: formData.requiresApproval,
      organizationId: "org_demo",
      createdBy: "user_admin",
      createdAt: policy?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    try {
      await storage.sqlPolicies.save(policyData)
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      console.error("Failed to save policy:", error)
    }
  }

  const toggleOperation = (op: string) => {
    if (formData.allowedOperations.includes(op)) {
      setFormData({ ...formData, allowedOperations: formData.allowedOperations.filter((o) => o !== op) })
    } else {
      setFormData({ ...formData, allowedOperations: [...formData.allowedOperations, op] })
    }
  }

  const addKeyword = () => {
    if (newKeyword.trim() && !formData.blockedKeywords.includes(newKeyword.trim())) {
      setFormData({ ...formData, blockedKeywords: [...formData.blockedKeywords, newKeyword.trim().toUpperCase()] })
      setNewKeyword("")
    }
  }

  const removeKeyword = (kw: string) => {
    setFormData({ ...formData, blockedKeywords: formData.blockedKeywords.filter((k) => k !== kw) })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh]" style={{ maxWidth: '560px', width: 'calc(100% - 2rem)' }}>
        <DialogHeader>
          <DialogTitle>{policy ? "编辑安全策略" : "添加安全策略"}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <form onSubmit={handleSubmit} className="space-y-4 pr-4">
            <div className="space-y-2">
              <Label htmlFor="name">策略名称</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="例如：标准安全策略"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>允许的SQL操作</Label>
              <Card className="p-3">
                <div className="grid grid-cols-2 gap-2">
                  {allOperations.map((op) => (
                    <div key={op} className="flex items-center gap-2">
                      <Checkbox
                        checked={formData.allowedOperations.includes(op)}
                        onCheckedChange={() => toggleOperation(op)}
                      />
                      <Label className="text-sm">{op}</Label>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="maxExecutionTime">最大执行时间（秒）</Label>
                <Input
                  id="maxExecutionTime"
                  type="number"
                  value={formData.maxExecutionTime}
                  onChange={(e) => setFormData({ ...formData, maxExecutionTime: Number(e.target.value) })}
                  min={1}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxRowsReturned">最大返回行数</Label>
                <Input
                  id="maxRowsReturned"
                  type="number"
                  value={formData.maxRowsReturned}
                  onChange={(e) => setFormData({ ...formData, maxRowsReturned: Number(e.target.value) })}
                  min={1}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>阻止关键词</Label>
              <div className="flex gap-2">
                <Input
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  placeholder="输入关键词"
                  onKeyPress={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      addKeyword()
                    }
                  }}
                />
                <Button type="button" onClick={addKeyword} size="sm">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {formData.blockedKeywords.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.blockedKeywords.map((kw) => (
                    <Badge key={kw} variant="destructive" className="gap-1">
                      {kw}
                      <button type="button" onClick={() => removeKeyword(kw)} className="ml-1">
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                checked={formData.requiresApproval}
                onCheckedChange={(checked) => setFormData({ ...formData, requiresApproval: checked as boolean })}
              />
              <Label className="text-sm">危险操作需要管理员审批</Label>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button type="submit">{policy ? "保存更改" : "添加策略"}</Button>
            </div>
          </form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
