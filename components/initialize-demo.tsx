"use client"

import { useEffect } from "react"
import { initializeDemoData } from "@/lib/storage"

export function InitializeDemo() {
  useEffect(() => {
    initializeDemoData()
  }, [])

  return null
}
