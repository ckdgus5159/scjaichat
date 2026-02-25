"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseClient";

export default function FeedbackPage() {
  const router = useRouter();
  const [review, setReview] = useState("");
  const [feature, setFeature] = useState("");
  const [phone, setPhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitFeedback = async () => {
    if (!review.trim()) return alert("후기를 작성해주세요!");
    
    setIsSubmitting(true);

    try {
      // 1. 현재 접속한 아이디(handle) 가져오기
      const handle = localStorage.getItem("dc_handle") || "알수없음";

      // 2. 해당 아이디의 최신 게임 정보를 불러와 캐릭터 정보 추출
      let age = "알수없음", major = "알수없음", mbti = "알수없음";
      
      const { data: gameData } = await supabaseBrowser
        .from("games")
        .select("protagonist")
        .eq("handle", handle)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (gameData?.protagonist) {
        const oneLine = gameData.protagonist.oneLine || "";
        const mbtiMatch = oneLine.match(/\(([A-Z]{4})\)/);
        if (mbtiMatch) mbti = mbtiMatch[1];
        
        const ageMatch = oneLine.match(/(\d+)세/);
        if (ageMatch) age = ageMatch[1];

        const subInfo = gameData.protagonist.subInfo || "";
        const majorMatch = subInfo.match(/^(.*?) \d학년/);
        if (majorMatch) major = majorMatch[1];
      }

      // 3. 추출된 캐릭터 정보와 함께 피드백 저장
      const { error } = await supabaseBrowser
        .from("feedback")
        .insert([{ 
          review, 
          feature, 
          phone, 
          handle, 
          age, 
          major, 
          mbti 
        }]);

      if (error) throw error;

      alert("소중한 의견 정말 감사합니다!\n보내주신 피드백은 더 나은 서비스를 만드는 데 큰 힘이 됩니다.\n커피 쿠폰 당첨 시 남겨주신 번호로 연락드리겠습니다.");
      router.push("/");
    } catch (error) {
      console.error("피드백 전송 오류:", error);
      alert("피드백 전송 중 문제가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="mx-auto max-w-md p-6 min-h-[90vh] flex flex-col justify-center">
      <div className="bg-white dark:bg-zinc-900/50 border border-stone-200 dark:border-white/10 rounded-3xl p-6 shadow-md transition-colors">
        <h2 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mb-2">소중한 의견을 들려주세요! ☕</h2>
        <p className="text-[13px] text-stone-600 dark:text-zinc-400 mb-6 leading-relaxed">
          게임을 플레이해주셔서 진심으로 감사합니다.<br/>
          아쉬웠던 점, 좋았던 점 등 구체적인 피드백을 남겨주신 <strong>10분을 선정하여 커피 쿠폰</strong>을 보내드립니다!
        </p>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-stone-500 dark:text-zinc-500 uppercase mb-2 block">플레이 후기 (필수)</label>
            <textarea value={review} onChange={e => setReview(e.target.value)} rows={4} placeholder="재밌었던 점, 아쉬웠던 점을 자유롭게 적어주세요." className="w-full bg-stone-50 border border-stone-200 dark:bg-black/40 dark:border-white/10 rounded-xl p-3 outline-none focus:border-emerald-500 dark:text-white resize-none text-sm" disabled={isSubmitting} />
          </div>
          <div>
            <label className="text-xs font-bold text-stone-500 dark:text-zinc-500 uppercase mb-2 block">피드백: 추가하면 좋을 기능 (선택)</label>
            <textarea value={feature} onChange={e => setFeature(e.target.value)} rows={2} placeholder="이런 기능이 있다면 더 좋을 것 같아요!" className="w-full bg-stone-50 border border-stone-200 dark:bg-black/40 dark:border-white/10 rounded-xl p-3 outline-none focus:border-emerald-500 dark:text-white resize-none text-sm" disabled={isSubmitting} />
          </div>
          <div>
            <label className="text-xs font-bold text-stone-500 dark:text-zinc-500 uppercase mb-2 block">연락드릴 번호 (쿠폰 발송용)</label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="010-0000-0000" className="w-full bg-stone-50 border border-stone-200 dark:bg-black/40 dark:border-white/10 rounded-xl p-3 outline-none focus:border-emerald-500 dark:text-white text-sm" disabled={isSubmitting} />
          </div>
          
          <button onClick={submitFeedback} disabled={isSubmitting} className="w-full mt-4 rounded-xl bg-emerald-500 text-white dark:bg-emerald-400 py-4 font-bold shadow-md hover:bg-emerald-600 transition-colors disabled:opacity-50">
            {isSubmitting ? "제출 중..." : "피드백 제출하기"}
          </button>
        </div>
        <p className="text-xs text-center text-stone-400 dark:text-zinc-600 mt-5">도와주셔서 진심으로 감사합니다!</p>
      </div>
    </main>
  );
}