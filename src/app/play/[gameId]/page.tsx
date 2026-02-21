"use client";

import React, { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseClient";

type Msg = { role: "user" | "assistant"; content: string };
type Stats = { money: number; relationship: number; reputation: number; health: number; };
type PageProps = { params: Promise<{ gameId: string }>; };

function clamp01to100(n: number) {
  return Math.max(0, Math.min(100, Math.round(n || 0)));
}

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
  const tone = emphasize ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-white/10 bg-white/5 text-white";

  return (
    <div className={["flex-1 rounded-xl border px-1 py-1.5 flex flex-col items-center justify-center", tone].join(" ")}>
      <div className="text-sm mb-0.5">{icon}</div>
      <div className="text-[9px] text-zinc-400 uppercase font-bold">{label}</div>
      <div className="text-xs font-bold">{v}</div>
    </div>
  );
}

export default function PlayPage({ params }: PageProps) {
  const { gameId } = React.use(params);
  const [happiness, setHappiness] = useState(0);
  const [stats, setStats] = useState<Stats>({ money: 50, relationship: 50, reputation: 50, health: 50 });
  const [valuesSummary, setValuesSummary] = useState<string>("");
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
      setMessages(prev => [...prev, { role: "assistant", content: data.assistantText || "오류" }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "서버 응답 오류" }]);
    } finally {
      setSending(false);
    }
  }

  const formatContent = (content: string) => {
    return content
      .replace(/캐릭터 소개:?/g, "👤 **프로필**\n")
      .replace(/시간의 흐름:?/g, "⏳ **시간이 흘러...**\n")
      .replace(/결과:?/g, "📝 **결과**\n")
      .replace(/당신의 상황:?/g, "🎬 **당신의 상황**\n")
      .replace(/상태변화:?.*\n?/g, "") // 상태변화 텍스트 숨김
      .replace(/다음상황:?/g, "\n📍 **다음 상황**\n")
      .replace(/예시명령:?/g, "\n💡 **선택지**\n");
  };

  return (
    <main className="mx-auto max-w-md p-4 pb-32 bg-zinc-950 min-h-screen text-zinc-50 flex flex-col">
      <div className="sticky top-[56px] z-10 bg-zinc-950/90 backdrop-blur border-b border-white/5 p-3 rounded-xl mb-4 shadow-lg">
        {valuesSummary && (
          <div className="text-[10px] text-emerald-300/80 text-center mb-2 font-medium tracking-wide">
            가치관: {valuesSummary}
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
          return (
            <div key={i} className={`rounded-2xl p-4 border shadow-sm ${isUser ? "ml-8 bg-white/5 border-white/10" : "mr-8 bg-emerald-500/5 border-emerald-500/10"}`}>
              <div className="text-[10px] font-bold text-zinc-500 mb-1 uppercase tracking-wide">{isUser ? "Player" : "GM"}</div>
              {!isUser && (
                <div className="mb-2 flex flex-wrap gap-2 text-[10px] text-emerald-400 font-mono border-b border-emerald-500/10 pb-1.5">
                  <span>💰{stats.money}</span> <span>🤝{stats.relationship}</span> <span>⭐{happiness}</span> <span>🏆{stats.reputation}</span> <span>💪{stats.health}</span>
                </div>
              )}
              <div className="text-sm leading-relaxed whitespace-pre-wrap text-zinc-200">{isUser ? m.content : formatContent(m.content)}</div>
            </div>
          );
        })}

        {sending && (
          <div className="rounded-2xl p-4 border mr-8 bg-emerald-500/5 border-emerald-500/10 w-24">
            <div className="text-[10px] font-bold text-zinc-500 mb-2 uppercase">GM</div>
            <div className="flex gap-1.5 justify-center py-1">
              <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-zinc-950/90 backdrop-blur border-t border-white/10">
        <div className="mx-auto max-w-md p-3 flex gap-2">
          <input className="flex-1 rounded-xl bg-white/5 border border-white/10 px-4 py-3 outline-none focus:border-emerald-500 text-sm"
            placeholder={status === "finished" ? "시나리오가 종료되었습니다." : "행동을 입력하세요..."}
            value={input} onChange={(e) => setInput(e.target.value)} disabled={sending || status === "finished"} 
            onKeyDown={(e) => { if (e.key === "Enter") send(); }} />
          <button className="rounded-xl bg-emerald-400 px-5 py-3 text-zinc-950 font-bold disabled:opacity-40"
            onClick={send} disabled={sending || status === "finished" || !input.trim()}>전송</button>
        </div>
      </div>
    </main>
  );
}