import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Drama Chat Prototype",
  description: "AI chat drama prototype with happiness stat",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-zinc-950 text-zinc-50">
        {/* Global banner/header */}
        <header className="sticky top-0 z-50 border-b border-white/10 bg-zinc-950/80 backdrop-blur">
          <div className="mx-auto max-w-md px-4 py-3 flex items-center justify-between">
            <Link href="/" className="font-semibold tracking-tight">
              Drama Chat
            </Link>
            <Link
              href="/"
              className="text-xs text-zinc-300 border border-white/10 rounded-full px-3 py-1 hover:bg-white/5"
            >
              메인으로
            </Link>
          </div>
        </header>

        {children}
      </body>
    </html>
  );
}
