import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Specwright",
  description: "Turn an app idea into a reviewed PRD, a feature map and coding tasks.",
};

// Every page reads the local database, so nothing is prerendered at build time.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      {/* Browser extensions (e.g. Grammarly) add attributes to <body> before hydration. */}
      <body className="flex min-h-full flex-col font-sans" suppressHydrationWarning>
        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden className="text-accent">
                <circle cx="5" cy="12" r="2.5" fill="currentColor" />
                <circle cx="19" cy="5" r="2.5" fill="currentColor" />
                <circle cx="19" cy="19" r="2.5" fill="currentColor" />
                <path d="M7 12h4m0 0 6-6m-6 6 6 6" stroke="currentColor" strokeWidth="1.8" fill="none" />
              </svg>
              Specwright
            </Link>
            <nav className="flex gap-5 text-sm text-muted">
              <Link href="/" className="hover:text-text">Projects</Link>
              <Link href="/settings" className="hover:text-text">Models</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
