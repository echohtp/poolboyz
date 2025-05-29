import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Link from 'next/link'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'DLMM Liquidity Analyzer',
  description: 'Analyze Meteora DLMM pool liquidity distribution in real-time',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <nav className="bg-black/20 backdrop-blur-lg border-b border-white/10">
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between h-16">
              <div className="text-white font-bold text-xl">DeFi Analyzer</div>
              <div className="flex space-x-4">
                <Link 
                  href="/" 
                  className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  DLMM Liquidity
                </Link>
                <Link 
                  href="/jupiter" 
                  className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Jupiter Orders
                </Link>
              </div>
            </div>
          </div>
        </nav>
      <body className={inter.className}>{children}</body>
    </html>
  )
}