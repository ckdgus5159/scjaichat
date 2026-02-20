import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Drama Chat Prototype",
  description: "AI chat drama prototype with happiness stat",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-zinc-950 text-zinc-50">{children}</body>
    </html>
  );
}
