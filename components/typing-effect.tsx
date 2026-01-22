"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { cn } from "@/lib/utils"

interface TypingEffectProps {
  text: string
  speed?: number // 每个字符的延迟时间（毫秒）
  onComplete?: () => void
  className?: string
  skipAnimation?: boolean // 是否跳过动画
  onSkip?: () => void // 跳过动画的回调
}

export function TypingEffect({
  text,
  speed = 30,
  onComplete,
  className,
  skipAnimation = false,
  onSkip,
}: TypingEffectProps) {
  const [displayedText, setDisplayedText] = useState("")
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isComplete, setIsComplete] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // 跳过动画
  const skip = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setDisplayedText(text)
    setCurrentIndex(text.length)
    setIsComplete(true)
    onSkip?.()
    onComplete?.()
  }, [text, onSkip, onComplete])

  // 处理点击跳过
  useEffect(() => {
    if (skipAnimation || isComplete) return

    const handleClick = (e: MouseEvent) => {
      if (containerRef.current?.contains(e.target as Node)) {
        skip()
      }
    }

    document.addEventListener("click", handleClick)
    return () => document.removeEventListener("click", handleClick)
  }, [skipAnimation, isComplete, skip])

  // 打字机效果
  useEffect(() => {
    if (skipAnimation) {
      setDisplayedText(text)
      setCurrentIndex(text.length)
      setIsComplete(true)
      onComplete?.()
      return
    }

    if (currentIndex < text.length) {
      timeoutRef.current = setTimeout(() => {
        setDisplayedText((prev) => prev + text[currentIndex])
        setCurrentIndex((prev) => prev + 1)
      }, speed)

      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
        }
      }
    } else if (currentIndex === text.length && !isComplete) {
      setIsComplete(true)
      onComplete?.()
    }
  }, [currentIndex, text, speed, skipAnimation, isComplete, onComplete])

  // 当文本改变时重置
  useEffect(() => {
    setDisplayedText("")
    setCurrentIndex(0)
    setIsComplete(false)
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [text])

  // 渲染文本，为每个字符添加跳动效果
  const renderText = () => {
    return displayedText.split("").map((char, index) => {
      // 跳过空格和换行的动画
      const shouldAnimate = char !== " " && char !== "\n"
      const isNewChar = index === displayedText.length - 1 && !isComplete

      return (
        <span
          key={index}
          className={cn(
            "inline-block",
            shouldAnimate && isNewChar && "animate-bounce-in"
          )}
          style={{
            animationDelay: shouldAnimate && isNewChar ? "0ms" : undefined,
          }}
        >
          {char === "\n" ? <br /> : char}
        </span>
      )
    })
  }

  return (
    <div
      ref={containerRef}
      className={cn("inline", className)}
      style={{ cursor: isComplete ? "default" : "pointer" }}
      title={isComplete ? undefined : "点击跳过动画"}
    >
      {renderText()}
    </div>
  )
}
