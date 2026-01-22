import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  // JWT is stateless, so logout is handled client-side by removing the token
  // In a production system, you might want to maintain a blacklist of tokens
  return NextResponse.json({ message: "登出成功" })
}

