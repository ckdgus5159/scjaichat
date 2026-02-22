"use client";

import React, { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseClient";
import Link from "next/link";

export default function SummaryPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = React.use(params);
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data: sessionData } = await supabaseBrowser.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) return;

        const r = await fetch("/api/summary", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ gameId })
        });
        const data = await r.json();
        setSummary(data.summary || "회고록을 불러오는 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    })();
  }, [gameId]);

  return (
    <main className="mx-auto max-w-md p-6 min-h-screen pb-24 flex flex-col">
      <h1 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mb-2 mt-4">나의 캠퍼스 라이프 회고록</h1>
      <p className="text-sm text-stone-500 dark:text-zinc-400 mb-8">수많은 선택들이 모여 만들어진 당신만의 이야기입니다.</p>

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center py-20">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-6"></div>
          <p className="text-sm text-stone-600 dark:text-zinc-400 animate-pulse text-center leading-relaxed">
            AI 작가가 당신의 발자취를 되짚으며<br/>아름다운 자서전을 엮어내고 있습니다...
          </p>
        </div>
      ) : (
        <div className="flex-1 bg-white dark:bg-white/5 border border-stone-200 dark:border-white/10 rounded-3xl p-6 shadow-sm leading-loose text-stone-800 dark:text-zinc-200 whitespace-pre-wrap text-[14px]">
          {summary}
        </div>
      )}

      {!loading && (
        <div className="mt-8 flex flex-col gap-3">
          <Link href="/feedback" className="w-full text-center rounded-xl bg-emerald-500 text-white dark:bg-emerald-400 py-4 font-bold dark:text-zinc-950 shadow-md hover:bg-emerald-600 transition-colors">
            📝 피드백&후기 남기기 (커피 쿠폰 이벤트)
          </Link>
          <Link href="/" className="w-full text-center rounded-xl border border-stone-300 dark:border-white/20 bg-stone-50 text-stone-700 dark:bg-transparent dark:text-zinc-300 py-4 font-bold hover:bg-stone-100 dark:hover:bg-white/5 transition-colors">
            메인으로 돌아가기
          </Link>
        </div>
      )}
    </main>
  );
}