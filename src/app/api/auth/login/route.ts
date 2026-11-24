// POST /api/auth/login — public, throttled. Body { password, next? } (plan 5.8, 5.9).
import { handleLogin } from '@/lib/auth/login-handler'

export async function POST(request: Request): Promise<Response> {
  return handleLogin(request)
}
