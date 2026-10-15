import type React from "react"
import type { Metadata } from "next"
import { Suspense } from "react"
import { Inter } from "next/font/google"
import "./globals.css"
import { ToasterWrapper } from "@/components/toaster-wrapper"
import { TooltipProvider } from "@/components/ui/tooltip"
import { SwrProvider } from "@/features/shell"

// 1health design system typeface. `variable` feeds --font-inter, which
// globals.css maps onto Tailwind's font-sans (see @theme inline).
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})

// Every page renders per request so Next can stamp the per-request CSP nonce
// (set by proxy.ts) on its scripts; a prerendered page would have none (AD-21).
// This also keeps PHI pages out of any cache (AD-18).
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Personal Profile",
  description: "Manage your 1health personal profile",
  icons: {
    icon: "/favicon.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // To enable the command-center dark theme, add `dark` to this className.
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <SwrProvider>
          <TooltipProvider>
            <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
              {children}
            </Suspense>
          </TooltipProvider>
          <ToasterWrapper />
        </SwrProvider>
      </body>
    </html>
  )
}
