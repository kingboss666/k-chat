import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'K Chat',
  description: 'Next.js Route Handler chat demo',
}

interface RootLayoutProps {
  readonly children: React.ReactNode
}

function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}

export default RootLayout
