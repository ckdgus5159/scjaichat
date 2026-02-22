"use client";

import React, { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Msg = { role: "user" | "assistant"; content: string; stats?: Stats & { happiness?: number } };
type Stats = { money: number; relationship: number; reputation: number; health: number; };
type PageProps = { params: Promise<{ gameId: string }>; };

function clamp01to100(n: number) { return Math.max(0, Math.min(100, Math.round(n || 0))); }

function mergeStats(prev: Stats, next: any): Stats {
  if (!next) return prev;
  return {
    money: clamp01to100(next.money ?? prev.money),
    relationship: clamp01to100(next.relationship ?? prev.relationship),
    reputation: clamp01to100(next.reputation ?? prev.reputation),
    health: clamp01to100(next.health ?? prev.health),
  };
}

function StatChip(props: { icon: string; label: string; value: number; emphasize?: boolean }) {
  const { icon, label, value, emphasize } = props;
  const v = clamp01to100(value);
  
  const tone = emphasize 
    ? "bg-emerald-100/50 border-emerald-300 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200" 
    : "bg-white border-stone-200 text-stone-800 dark:border-white/10 dark:bg-white/5 dark:text-white";

  return (
    <div className={["flex-1 rounded-xl border px-2 py-1.5 flex flex-row items-center justify-center gap-1.5 transition-colors shadow-sm", tone].join(" ")}>
      <div className="text-base leading-none">{icon}</div>
      <div className="flex flex-col items-start justify-center">
        <div className="text-[9px] uppercase font-bold opacity-70 leading-none mb-[2px]">{label}</div>
        <div className="text-xs font-bold leading-none">{v}</div>
      </div>
    </div>
  );
}

export default function PlayPage({ params }: PageProps) {
  const router = useRouter();
  const { gameId } = React.use(params);
  const [happiness, setHappiness] = useState(0);
  const [stats, setStats] = useState<Stats>({ money: 50, relationship: 50, reputation: 50, health: 50 });
  const [valuesSummary, setValuesSummary] = useState<string>("");
  const [status, setStatus] = useState<"active" | "finished">("active");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // 피드백 팝업 상태
  const [showFeedbackPopup, setShowFeedbackPopup] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length, loading, sending]);

  // ✅ 행복도 100(엔딩) 달성 시 1.5초 후 인생 요약 페이지로 이동
  useEffect(() => {
    if (status === "finished") {
      const timer = setTimeout(() => { router.push(`/summary/${gameId}`); }, 1500);
      return () => clearTimeout(timer);
    }
  }, [status, router, gameId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: sessionData } = await supabaseBrowser.auth.getSession();
        if (!sessionData.session) return;
        const accessToken = sessionData.session.access_token;
        const r = await fetch(`/api/chat?gameId=${encodeURIComponent(gameId)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!r.ok) return;
        const data = await r.json();
        setHappiness(clamp01to100(data.happiness ?? 0));
        setStatus(data.status === "finished" ? "finished" : "active");
        setMessages(data.messages || []);
        if (data.valuesSummary) setValuesSummary(data.valuesSummary);
        if (data.stats) setStats(prev => mergeStats(prev, data.stats));
      } finally {
        setLoading(false);
      }
    })();
  }, [gameId]);

  async function send() {
    const text = input.trim();
    if (!text || sending || status === "finished") return;
    setSending(true); setInput("");
    setMessages(prev => [...prev, { role: "user", content: text }]);
    try {
      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const accessToken = sessionData.session!.access_token;
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ gameId, userText: text }),
      });
      const data = await r.json();
      if (data.happiness !== undefined) setHappiness(clamp01to100(data.happiness));
      if (data.status) setStatus(data.status === "finished" ? "finished" : "active");
      if (data.stats) setStats(prev => mergeStats(prev, data.stats));
      
      const latestStats = { ...mergeStats({} as any, data.stats), happiness: clamp01to100(data.happiness) };
      setMessages(prev => [...prev, { role: "assistant", content: data.assistantText || "오류", stats: latestStats }]);

      // ✅ 8턴째 피드백 팝업 트리거
      const userTurns = messages.filter(m => m.role === "user").length + 1;
      const hasSeenPopup = localStorage.getItem(`feedback_shown_${gameId}`);
      if (userTurns === 8 && !hasSeenPopup) {
        setShowFeedbackPopup(true);
        localStorage.setItem(`feedback_shown_${gameId}`, "true");
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "서버 응답 오류" }]);
    } finally {
      setSending(false);
    }
  }

  const formatContent = (content: string) => {
    const match = content.match(/(?:^|\n)[-\d.\s*]*\[?(캐릭터 소개|당신의 상황|상태변화|다음상황|예시명령|시간의 흐름|결과)\]?:?/);
    let cleaned = match ? content.substring(match.index || 0) : content;
    cleaned = cleaned.replace(/(?:^|\n)[-\d.\s*]*\[?(캐릭터 소개|당신의 상황|상태변화|다음상황|예시명령|시간의 흐름|결과)\]?:?/g, "\n$1:");

    return cleaned
      .replace(/캐릭터 소개:/g, "👤 **프로필**\n")
      .replace(/결과:/g, "📝 **결과**\n")
      .replace(/상태변화:(.*)/g, "\n📊 **스탯 변화**:$1\n") 
      .replace(/당신의 상황:/g, "🎬 **당신의 상황**\n")
      .replace(/시간의 흐름:/g, "\n⏳ **시간이 흘러...**\n")
      .replace(/다음상황:/g, "\n📍 **다음 상황**\n")
      .replace(/예시명령:/g, "\n💡 **명령예시**\n")
      .trim();
  };

  let turnCount = 0;

  return (
    <main className="mx-auto max-w-md p-4 pb-32 min-h-screen flex flex-col relative">
      
      {/* ✅ 피드백 팝업 모달 */}
      {showFeedbackPopup && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 shadow-2xl max-w-sm w-full text-center space-y-4">
            <h3 className="text-xl font-bold text-emerald-600 dark:text-emerald-400">잠깐! 피드백을 남겨주세요 🎁</h3>
            <p className="text-sm text-stone-600 dark:text-zinc-300 leading-relaxed">
              플레이는 재미있으신가요? 더 나은 경험을 위해 여러분의 의견이 필요합니다.<br/>
              정성스러운 피드백을 주신 <strong>10분께 커피 쿠폰</strong>을 드립니다!
            </p>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowFeedbackPopup(false)} className="flex-1 py-3 rounded-xl bg-stone-100 text-stone-600 font-bold dark:bg-white/10 dark:text-zinc-300 hover:bg-stone-200 transition-colors">나중에요</button>
              <Link href="/feedback" target="_blank" onClick={() => setShowFeedbackPopup(false)} className="flex-1 py-3 rounded-xl bg-emerald-500 text-white font-bold dark:bg-emerald-400 dark:text-zinc-900 shadow-md hover:bg-emerald-600 transition-colors block leading-none flex items-center justify-center">작성하러 가기</Link>
            </div>
          </div>
        </div>
      )}

      <div className="sticky top-[52px] z-30 bg-stone-50/95 dark:bg-zinc-950/95 backdrop-blur border-b border-stone-200 dark:border-white/5 p-3 rounded-xl mb-4 shadow-sm transition-colors pt-2">
        {valuesSummary && (
          <div className="text-[11px] text-stone-600 dark:text-emerald-300/80 text-center mb-3 font-medium tracking-wide">
            {valuesSummary}
          </div>
        )}
        <div className="grid grid-cols-5 gap-1.5">
          <StatChip icon="💰" label="경제" value={stats.money} />
          <StatChip icon="🤝" label="관계" value={stats.relationship} />
          <StatChip icon="⭐" label="행복" value={happiness} emphasize />
          <StatChip icon="🏆" label="평판" value={stats.reputation} />
          <StatChip icon="💪" label="건강" value={stats.health} />
        </div>
      </div>

      <div className="space-y-4 flex-1">
        {messages.map((m, i) => {
          const isUser = m.role === "user";
          if (isUser) turnCount++;

          const msgStats = m.stats || {
            money: stats.money, relationship: stats.relationship, reputation: stats.reputation, 
            health: stats.health, happiness: happiness
          };

          return (
            <div key={i} className={`rounded-2xl p-4 border shadow-sm transition-colors ${
              isUser 
              ? "ml-8 bg-white border-stone-200 text-stone-900 dark:bg-white/5 dark:border-white/10 dark:text-zinc-50" 
              : "mr-8 bg-emerald-50/80 border-emerald-100 text-stone-800 dark:bg-emerald-500/5 dark:border-emerald-500/10 dark:text-zinc-200"
            }`}>
              <div className="text-[10px] font-bold text-stone-400 dark:text-zinc-500 mb-1 uppercase tracking-wide">
                {isUser ? `Player (Turn ${turnCount})` : "GM"}
              </div>
              
              {!isUser && (
                <div className="mb-3 flex flex-wrap gap-2 text-[10px] text-emerald-600 dark:text-emerald-400 font-mono border-b border-emerald-200 dark:border-emerald-500/10 pb-1.5 opacity-80">
                  <span>💰{msgStats.money}</span> <span>🤝{msgStats.relationship}</span> <span>⭐{msgStats.happiness}</span> <span>🏆{msgStats.reputation}</span> <span>💪{msgStats.health}</span>
                </div>
              )}
              <div className="text-sm leading-relaxed whitespace-pre-wrap">{isUser ? m.content : formatContent(m.content)}</div>
            </div>
          );
        })}

        {sending && (
          <div className="rounded-2xl p-4 border mr-8 bg-emerald-50/80 border-emerald-100 dark:bg-emerald-500/5 dark:border-emerald-500/10 w-24">
            <div className="text-[10px] font-bold text-stone-400 dark:text-zinc-500 mb-2 uppercase">GM</div>
            <div className="flex gap-1.5 justify-center py-1">
              <div className="w-1.5 h-1.5 bg-emerald-500 dark:bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 bg-emerald-500 dark:bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 bg-emerald-500 dark:bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-stone-50/95 dark:bg-zinc-950/95 backdrop-blur border-t border-stone-200 dark:border-white/10 transition-colors z-40">
        <div className="mx-auto max-w-md p-3 flex gap-2">
          <input className="flex-1 rounded-xl bg-white border border-stone-200 text-stone-900 px-4 py-3 outline-none focus:border-emerald-500 dark:bg-white/5 dark:border-white/10 dark:text-zinc-50"
            placeholder={status === "finished" ? "엔딩을 준비 중입니다..." : "행동 입력 (치트키: //엔딩)"}
            value={input} onChange={(e) => setInput(e.target.value)} disabled={sending || status === "finished"} 
            onKeyDown={(e) => { if (e.key === "Enter") send(); }} />
          <button className="rounded-xl bg-emerald-500 text-white dark:bg-emerald-400 px-5 py-3 dark:text-zinc-950 font-bold disabled:opacity-40"
            onClick={send} disabled={sending || status === "finished" || !input.trim()}>전송</button>
        </div>
      </div>
    </main>
  );
}