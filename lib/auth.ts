import jwt from "jsonwebtoken"
import { config } from "./config"

export interface JWTPayload {
  userId: string
  email: string
  organizationId: string
  role: string
}

export function generateToken(payload: JWTPayload): string {
  const secret: string = String(config.jwt.secret || "your-secret-key-change-this-in-production")
  const expiresIn: string = String(config.jwt.expiresIn || "7d")
  return jwt.sign(payload, secret, {
    expiresIn: expiresIn,
  })
}

export function verifyToken(token: string): JWTPayload {
  try {
    const decoded = jwt.verify(token, config.jwt.secret as string) as JWTPayload
    return decoded
  } catch (error) {
    throw new Error("Invalid or expired token")
  }
}

export function extractTokenFromHeader(authHeader: string | null): string | null {
  if (!authHeader) return null
  if (!authHeader.startsWith("Bearer ")) return null
  return authHeader.substring(7)
}
