import type React from "react"
import type { Metadata } from "next"
import { Suspense } from "react"
import { Inter } from "next/font/google"
import "./globals.css"
import { ToasterWrapper } from "@/components/toaster-wrapper"

// 1health design system typeface. `variable` feeds --font-inter, which
// globals.css maps onto Tailwind's font-sans (see @theme inline).
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Personal Profile",
  description: "Manage your personal profile in 1health.",
  icons: {
    icon: "/favicon.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Light theme is the default; dark mode is opt-in via `dark` on <html>.
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
          {children}
        </Suspense>
        <ToasterWrapper />
      </body>
    </html>
  )
}
