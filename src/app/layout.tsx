import "./globals.css";
import type { Metadata } from "next";
import ThemeHeader from "@/components/ThemeHeader";

export const metadata: Metadata = {
  title: "Drama Chat - 현실 밀착형 AI 드라마",
  description: "당신의 가치관이 만드는 시뮬레이션",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (localStorage.theme === 'light') {
                  document.documentElement.classList.remove('dark')
                } else {
                  document.documentElement.classList.add('dark')
                }
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body className="bg-stone-50 text-stone-900 dark:bg-zinc-950 dark:text-zinc-50 antialiased min-h-screen transition-colors duration-300">
        <ThemeHeader />
        {children}
      </body>
    </html>
  );
}