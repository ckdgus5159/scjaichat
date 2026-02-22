"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function ThemeHeader() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const theme = localStorage.getItem("theme");
    if (theme === "light") {
      setIsDark(false);
      document.documentElement.classList.remove("dark");
    } else {
      setIsDark(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggleTheme = () => {
    if (isDark) {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
      setIsDark(false);
    } else {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
      setIsDark(true);
    }
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-stone-200 dark:border-white/10 bg-stone-50/95 dark:bg-zinc-950/95 backdrop-blur transition-colors duration-300">
        <div className="mx-auto max-w-md px-4 py-3 flex items-center justify-between">
          <Link href="/" className="font-semibold tracking-tight text-emerald-600 dark:text-emerald-400">
            Drama Chat
          </Link>
          <div className="flex gap-2 items-center">
            <Link
              href="/feedback"
              className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 rounded-full px-3 py-1.5 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors"
            >
              📝 피드백&후기 남기기
            </Link>
            <button
              onClick={toggleTheme}
              className="text-[11px] font-medium text-stone-600 dark:text-zinc-300 border border-stone-300 dark:border-white/10 rounded-full px-3 py-1.5 hover:bg-stone-200 dark:hover:bg-white/5 transition-colors"
            >
              {isDark ? "☀️" : "🌙"}
            </button>
          </div>
        </div>
      </header>
      <div className="h-[52px]"></div>
    </>
  );
}