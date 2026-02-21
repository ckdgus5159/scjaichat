"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseClient";

type Msg = { role: "user" | "assistant"; content: string; happinessDelta?: number };
type Stats = { money: number; relationship: number; reputation: number; health: number; };
type PageProps = { params: Promise<{ gameId: string }>; };

function clamp01to100(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function mergeStats(prev: Stats, next: any): Stats {
  if (!next || typeof next !== "object") return prev;
  return {
    money: clamp01to100(next.money ?? prev.money),
    relationship: clamp01to100(next.relationship ?? prev.relationship),
    reputation: clamp01to100(next.reputation ?? prev.reputation),
    health: clamp01to100(next.health ?? prev.health),
  };
}

function StatChip(props: { label: string; value: number; emphasize?: boolean }) {
  const { label, value, emphasize } = props;
  const v = clamp01to100(value);
  const tone = emphasize ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-white/10 bg-white/5 text-white";

  return (
    <div className={["flex-1 rounded-xl border px-2 py-1.5 text-center", tone].join(" ")}>
      <div className="text-[10px] text-zinc-400 uppercase font-bold">{label}</div>
      <div className="text-xs font-bold">{v}</div>
    </div>
  );
}

export default function PlayPage({ params }: PageProps) {
  const { gameId } = React.use(params);
  const [happiness, setHappiness] = useState(0);
  const [stats, setStats] = useState<Stats>({ money: 50, relationship: 50, reputation: 50, health: 50 });
  const [status, setStatus] = useState<"active" | "finished">("active");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, loading, sending]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: sessionData } = await supabaseBrowser.auth.getSession();
        if (!sessionData.session) return;
        const accessToken = sessionData.session.access_token;
        const r = await fetch(`/api/chat?gameId=${encodeURIComponent(gameId)}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!r.ok) return;
        const data = await r.json();
        setHappiness(clamp01to100(data.happiness ?? 0));
        setStatus(data.status === "finished" ? "finished" : "active");
        setMessages(data.messages || []);
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
      setMessages(prev => [...prev, { role: "assistant", content: data.assistantText || "응답 오류", happinessDelta: data.happinessDelta }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "오류가 발생했습니다." }]);
    } finally {
      setSending(false);
    }
  }

  // 메시지 텍스트에서 상태변화 라인 제거 및 첫 문구 변환 로직
  const formatContent = (content: string) => {
    return content
      .replace("[당신의 상황]:", "🎬 **당신의 상황**\n")
      .replace("당신의 상황:", "🎬 **당신의 상황**\n")
      .replace(/\[상태변화\]: .*\n?/, "")
      .replace(/상태변화: .*\n?/, "")
      .replace("[다음상황]:", "\n📍 **상황**\n")
      .replace("[예시 명령]:", "\n💡 **선택지**\n");
  };

  return (
    <main className="mx-auto max-w-md p-4 pb-32 bg-zinc-950 min-h-screen text-zinc-50">
      {/* 5. 슬림화된 상단 바 (상태변화 텍스트 제거) */}
      <div className="sticky top-[56px] z-10 bg-zinc-950/90 backdrop-blur border-b border-white/5 p-3 rounded-xl mb-4">
        <div className="grid grid-cols-5 gap-1.5">
          <StatChip label="경제" value={stats.money} />
          <StatChip label="관계" value={stats.relationship} />
          <StatChip label="행복" value={happiness} emphasize />
          <StatChip label="평판" value={stats.reputation} />
          <StatChip label="건강" value={stats.health} />
        </div>
      </div>

      <div className="space-y-4">
        {messages.map((m, i) => {
          const isUser = m.role === "user";
          return (
            <div key={i} className={`rounded-2xl p-4 border ${isUser ? "ml-8 bg-white/5 border-white/10" : "mr-8 bg-emerald-500/5 border-emerald-500/10"}`}>
              <div className="text-[10px] font-bold text-zinc-500 mb-1 uppercase">{isUser ? "Player" : "GM"}</div>
              
              {/* GM 대화창 내 현재 스탯 요약 고정 표시 */}
              {!isUser && (
                <div className="mb-2 flex flex-wrap gap-2 text-[10px] text-emerald-400 font-mono border-b border-emerald-500/10 pb-1">
                  <span>💰 {stats.money}</span>
                  <span>🤝 {stats.relationship}</span>
                  <span>⭐ {happiness}</span>
                  <span>🏆 {stats.reputation}</span>
                  <span>💪 {stats.health}</span>
                </div>
              )}

              <div className="text-sm leading-relaxed whitespace-pre-wrap">{isUser ? m.content : formatContent(m.content)}</div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-zinc-950/90 backdrop-blur border-t border-white/10">
        <div className="mx-auto max-w-md p-3 flex gap-2">
          <input className="flex-1 rounded-xl bg-white/5 border border-white/10 px-3 py-3 outline-none focus:border-emerald-500"
            placeholder={status === "finished" ? "시나리오가 종료되었습니다." : "명령 입력..."}
            value={input} onChange={(e) => setInput(e.target.value)} disabled={sending || status === "finished"} />
          <button className="rounded-xl bg-emerald-400 px-4 py-3 text-zinc-950 font-bold disabled:opacity-40"
            onClick={send} disabled={sending || status === "finished" || !input.trim()}>실행</button>
        </div>
      </div>
    </main>
  );
}