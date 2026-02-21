"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function ThemeHeader() {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    // 초기 로드 시 로컬 스토리지 확인
    const theme = localStorage.getItem("theme");
    if (theme === "light") {
      setIsDark(false);
      document.documentElement.classList.remove("dark");
    } else {
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
    <header className="sticky top-0 z-50 border-b border-stone-200 dark:border-white/10 bg-stone-50/90 dark:bg-zinc-950/90 backdrop-blur transition-colors duration-300">
      <div className="mx-auto max-w-md px-4 py-3 flex items-center justify-between">
        <Link href="/" className="font-semibold tracking-tight text-stone-900 dark:text-zinc-50">
          Drama Chat
        </Link>
        <div className="flex gap-2">
          <button
            onClick={toggleTheme}
            className="text-[11px] font-medium text-stone-600 dark:text-zinc-300 border border-stone-300 dark:border-white/10 rounded-full px-3 py-1.5 hover:bg-stone-200 dark:hover:bg-white/5 transition-colors"
          >
            {isDark ? "☀️ 일반모드" : "🌙 나이트모드"}
          </button>
          <Link
            href="/"
            className="text-[11px] font-medium text-stone-600 dark:text-zinc-300 border border-stone-300 dark:border-white/10 rounded-full px-3 py-1.5 hover:bg-stone-200 dark:hover:bg-white/5 transition-colors"
          >
            메인으로
          </Link>
        </div>
      </div>
    </header>
  );
}