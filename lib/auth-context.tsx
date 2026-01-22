"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import type { User } from "./types"
import { apiClient } from "./api-client"

interface AuthContextType {
  user: User | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Load user from API on mount
    const loadUser = async () => {
      try {
        const token = localStorage.getItem("auth_token")
        if (!token) {
          setIsLoading(false)
          return
        }
        const data = await apiClient.getMe()
        setUser(data.user)
      } catch (error: any) {
        // Not logged in or token expired - clear token
        if (error.message === "NOT_AUTHENTICATED" || error.message?.includes("401")) {
          localStorage.removeItem("auth_token")
        }
        setUser(null)
      } finally {
        setIsLoading(false)
      }
    }
    loadUser()
  }, [])

  const login = async (email: string, password: string) => {
    try {
      const data = await apiClient.login(email, password)
      setUser(data.user)
    } catch (error: any) {
      // Re-throw the error so the login page can display it
      throw error
    }
  }

  const logout = async () => {
    try {
      await apiClient.logout()
    } catch (error) {
      // Ignore logout errors
    }
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, login, logout, isLoading }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
