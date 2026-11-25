// Next.js 16 request interception (plan 5.10). A convenience only: an early redirect to /login for the
// protected pages, without rendering them. It protects nothing by itself — every protected page still
// calls requirePageAuth() and every mutating handler still calls requireApiAuth().
import { getIronSession, nextProxyCookies } from 'iron-session'
import { NextResponse, type NextRequest } from 'next/server'
import { getAuthConfig } from '@/lib/auth/config'
import { safeNextPath } from '@/lib/auth/origin'
import { isSessionValid, sessionOptions, type SessionData } from '@/lib/auth/session-options'

export const config = {
  matcher: ['/import/:path*', '/entry/new', '/entry/:slug/edit'],
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const response = NextResponse.next()
  try {
    const auth = getAuthConfig()
    if (auth.ok) {
      const session = await getIronSession<SessionData>(nextProxyCookies(request, response), sessionOptions(auth.sessionSecret))
      if (isSessionValid(session, auth.pw)) return response
    }
  } catch {
    // Unreadable cookie or any other failure: treated as logged out.
  }
  const login = new URL('/login', request.url)
  login.searchParams.set('next', safeNextPath(request.nextUrl.pathname))
  return NextResponse.redirect(login)
}
