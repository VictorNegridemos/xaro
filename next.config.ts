import type { NextConfig } from 'next'
import path from 'node:path'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // next dev would otherwise write AGENTS.md at the repo root on every start; CLAUDE.md carries the same hint.
  agentRules: false,
  sassOptions: { loadPaths: [path.join(process.cwd(), 'src/styles')] },
  images: { formats: ['image/avif', 'image/webp'], qualities: [60, 75] },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }
      ]
    }]
  }
}
export default nextConfig
