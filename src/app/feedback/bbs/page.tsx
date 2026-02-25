"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseClient";

type Feedback = {
  id: string;
  handle: string;
  age: string;
  major: string;
  mbti: string;
  review: string;
  feature: string;
  phone: string;
  created_at: string;
};

export default function FeedbackBBSPage() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabaseBrowser
        .from("feedback")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (data) setFeedbacks(data);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-24">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-4xl p-6 pt-8 pb-24 min-h-screen">
      <h1 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mb-2">피드백 수신함 (BBS)</h1>
      <p className="text-sm text-stone-500 dark:text-zinc-400 mb-8">
        사용자들이 남긴 피드백과 플레이어 정보를 확인할 수 있는 관리자 전용 페이지입니다.
      </p>

      <div className="space-y-5">
        {feedbacks.map((fb) => (
          <div key={fb.id} className="bg-white dark:bg-white/5 border border-stone-200 dark:border-white/10 rounded-2xl p-6 shadow-sm transition-colors">
            
            {/* 상단: 유저 메타 정보 */}
            <div className="flex flex-wrap items-center gap-2 border-b border-stone-100 dark:border-white/5 pb-4 mb-4">
              <span className="font-bold text-stone-800 dark:text-zinc-200 text-lg mr-2">
                ID: {fb.handle || "익명"}
              </span>
              <span className="text-xs bg-stone-100 dark:bg-white/10 text-stone-600 dark:text-zinc-300 px-2.5 py-1 rounded-md font-medium">
                {fb.age ? `${fb.age}세` : "나이모름"}
              </span>
              <span className="text-xs bg-stone-100 dark:bg-white/10 text-stone-600 dark:text-zinc-300 px-2.5 py-1 rounded-md font-medium">
                {fb.major || "학과모름"}
              </span>
              <span className="text-xs bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 px-2.5 py-1 rounded-md font-bold">
                {fb.mbti || "MBTI모름"}
              </span>
              
              <span className="text-[11px] text-stone-400 ml-auto pt-1">
                {new Date(fb.created_at).toLocaleString('ko-KR')}
              </span>
            </div>

            {/* 하단: 피드백 텍스트 정보 */}
            <div className="space-y-4">
              <div>
                <span className="text-[11px] font-bold text-stone-400 dark:text-zinc-500 uppercase tracking-wider block mb-1">
                  플레이 후기
                </span>
                <p className="text-sm text-stone-800 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed">
                  {fb.review}
                </p>
              </div>

              {fb.feature && (
                <div className="bg-stone-50 dark:bg-black/20 p-4 rounded-xl border border-stone-100 dark:border-white/5">
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-500 uppercase tracking-wider block mb-1">
                    추가 기능 제안
                  </span>
                  <p className="text-sm text-stone-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                    {fb.feature}
                  </p>
                </div>
              )}

              {fb.phone && (
                <div>
                  <span className="text-[11px] font-bold text-stone-400 dark:text-zinc-500 uppercase tracking-wider block mb-1">
                    연락처 (쿠폰용)
                  </span>
                  <p className="text-sm text-stone-700 dark:text-zinc-300 font-mono">
                    {fb.phone}
                  </p>
                </div>
              )}
            </div>
          </div>
        ))}

        {feedbacks.length === 0 && (
          <div className="text-center text-stone-500 p-12 bg-stone-50 dark:bg-white/5 rounded-2xl border border-dashed border-stone-200 dark:border-white/10">
            아직 등록된 피드백이 없습니다.
          </div>
        )}
      </div>
    </main>
  );
}