import type { Metadata } from "next"

import "./globals.css"

import { Inter } from "next/font/google"

import { Toaster } from "@/components/ui/sonner"
import { ThemeProvider } from "@/components/theme-provider"

import { SITE_NAME, SITE_URL } from "./site"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: SITE_NAME,
  description: `${SITE_NAME} is a reference B2B SaaS application built using Next.js and Auth0 by Okta.`,
  metadataBase: new URL(SITE_URL),
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>

        <Toaster position="bottom-right" />
      </body>
    </html>
  )
}
