"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseClient";

type Msg = { role: "user" | "assistant"; content: string; happinessDelta?: number };

type Stats = {
  money: number;
  relationship: number;
  reputation: number;
  health: number;
};

type PageProps = {
  params: Promise<{ gameId: string }>;
};

function extractStatusLine(gmText: string): string | null {
  const m = gmText.match(/^\s*상태변화\s*:\s*(.+)\s*$/m);
  return m ? m[1].trim() : null;
}

function clamp01to100(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

// 서버가 stats를 부분만 내려줘도 안전하게 병합
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

  // 간단 컬러코딩: 낮음/보통/높음
  const tone =
    v < 20
      ? "border-rose-400/30 bg-rose-400/10 text-rose-200"
      : v >= 80
        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
        : emphasize
          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
          : "border-white/10 bg-white/5 text-white";

  return (
    <div className={["flex-1 rounded-xl border px-3 py-2", tone].join(" ")}>
      <div className="text-[11px] text-zinc-300">{label}</div>
      <div className="mt-0.5 text-sm font-semibold">
        {v}
        <span className="text-zinc-400 font-normal">/100</span>
      </div>
    </div>
  );
}

export default function PlayPage({ params }: PageProps) {
  const { gameId } = React.use(params);

  const [happiness, setHappiness] = useState(0);
  const [stats, setStats] = useState<Stats>({
    money: 50,
    relationship: 50,
    reputation: 50,
    health: 50,
  });

  const [status, setStatus] = useState<"active" | "finished">("active");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // gameId 바뀌거나, 빠르게 이동/뒤로가기 할 때 오래된 응답이 state를 덮어쓰는 것 방지
  const loadSeqRef = useRef(0);
  const sendSeqRef = useRef(0);

  const lastGM = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i];
    }
    return null;
  }, [messages]);

  const lastStatusLine = useMemo(() => (lastGM ? extractStatusLine(lastGM.content) : null), [lastGM]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, loading, sending]);

  useEffect(() => {
    (async () => {
      const seq = ++loadSeqRef.current;
      setLoading(true);

      try {
        const { data: sessionData } = await supabaseBrowser.auth.getSession();
        if (seq !== loadSeqRef.current) return;
        if (!sessionData.session) {
          // 세션이 없으면 UI만 로딩 해제 (무한 로딩 방지)
          setMessages([]);
          setStatus("active");
          setHappiness(0);
          setStats({ money: 50, relationship: 50, reputation: 50, health: 50 });
          return;
        }

        const accessToken = sessionData.session.access_token;

        const r = await fetch(`/api/chat?gameId=${encodeURIComponent(gameId)}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (seq !== loadSeqRef.current) return;

        if (!r.ok) {
          // 실패해도 로딩만 풀고 화면 유지
          return;
        }

        const data = await r.json();

        setHappiness(clamp01to100(data.happiness ?? 0));
        setStatus((data.status as any) === "finished" ? "finished" : "active");
        setMessages(Array.isArray(data.messages) ? data.messages : []);

        if (data.stats) setStats((prev) => mergeStats(prev, data.stats));
      } finally {
        if (seq === loadSeqRef.current) setLoading(false);
      }
    })();
  }, [gameId]);

  async function send() {
    const text = input.trim();
    if (!text || sending || status === "finished") return;

    const seq = ++sendSeqRef.current;

    setSending(true);
    setInput("");

    // 낙관적 UI(사용자 메시지 먼저 추가)
    setMessages((prev) => [...prev, { role: "user", content: text }]);

    try {
      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      if (!sessionData.session) throw new Error("No session");

      const accessToken = sessionData.session.access_token;

      const r = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ gameId, userText: text }),
      });

      if (seq !== sendSeqRef.current) return;

      if (!r.ok) {
        const t = await r.text();
        throw new Error(t || "Request failed");
      }

      const data = await r.json();

      // 서버가 무엇을 주든 방어적으로 적용
      if (data.happiness !== undefined) setHappiness(clamp01to100(data.happiness));
      if (data.status) setStatus((data.status as any) === "finished" ? "finished" : "active");
      if (data.stats) setStats((prev) => mergeStats(prev, data.stats));

      const assistantText = typeof data.assistantText === "string" ? data.assistantText : "";
      const happinessDelta =
        typeof data.happinessDelta === "number" ? data.happinessDelta : undefined;

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            assistantText.trim() ||
            "결과: (응답 텍스트를 받지 못했습니다)\n상태변화: 행복 +0\n다음상황: 같은 명령을 더 짧게 다시 시도해줘.\n가능한 명령 예시: (1) 방금 명령을 한 문장으로 줄여 재전송한다 (2) 핵심 목표만 적어 다시 요청한다 (3) 새로 시작한다",
          happinessDelta,
        },
      ]);
    } catch (e: any) {
      if (seq !== sendSeqRef.current) return;

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "결과: 서버/모델 응답 처리 중 오류가 발생했다.\n" +
            "상태변화: 행복 +0\n" +
            "다음상황: 잠시 후 같은 명령을 더 짧게 써서 다시 시도해줘.\n" +
            "가능한 명령 예시: (1) 방금 명령을 한 문장으로 줄여 재전송한다 (2) 핵심 목표만 적어 다시 요청한다 (3) 새로 시작한다",
        },
      ]);
    } finally {
      if (seq === sendSeqRef.current) setSending(false);
    }
  }

  return (
    <main className="mx-auto max-w-md p-4 pb-32">
      {/* 상단 고정 스탯바 */}
      <div className="sticky top-[56px] z-10 bg-zinc-950/80 backdrop-blur border-b border-white/10 p-3 rounded-xl">
        <div className="font-semibold">드라마 진행</div>
        <div className="text-xs text-zinc-400 mt-0.5">플레이어는 “명령”으로 상황을 전개합니다</div>

        <div className="mt-3 flex gap-2">
          <StatChip label="경제력" value={stats.money} />
          <StatChip label="관계" value={stats.relationship} />
          <StatChip label="행복" value={happiness} emphasize />
          <StatChip label="평판" value={stats.reputation} />
          <StatChip label="건강" value={stats.health} />
        </div>

        {/* 상태변화 라인은 선택: 남기면 정보가 겹치긴 하지만 “서사 힌트”로는 유용 */}
        {lastStatusLine && (
          <div className="mt-3 text-xs text-zinc-200 flex flex-wrap gap-2">
            <span className="px-2 py-1 rounded-full bg-white/10 border border-white/10">
              상태변화: {lastStatusLine}
            </span>
          </div>
        )}

        {status === "finished" && (
          <div className="mt-3 text-sm text-emerald-300">
            시나리오가 마무리되었습니다. (다음: 엔딩/회고 생성)
          </div>
        )}
      </div>

      <div className="mt-4 space-y-3">
        {loading && (
          <div className="rounded-2xl p-3 border border-white/10 bg-white/5 text-sm text-zinc-300">
            불러오는 중…
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="rounded-2xl p-3 border border-white/10 bg-white/5 text-sm text-zinc-300">
            아직 시작 장면이 없습니다. (보통은 게임 시작 시 GM 첫 상황이 자동 생성됩니다)
          </div>
        )}

        {messages.map((m, i) => {
          const isUser = m.role === "user";
          const statusLine = !isUser ? extractStatusLine(m.content) : null;

          return (
            <div
              key={`${i}-${m.role}`}
              className={[
                "rounded-2xl p-3 border",
                isUser ? "ml-10 bg-white/10 border-white/10" : "mr-10 bg-emerald-400/10 border-emerald-400/20",
              ].join(" ")}
            >
              <div className="text-xs text-zinc-300">{isUser ? "플레이어(명령)" : "GM"}</div>

              {statusLine && <div className="mt-2 text-xs text-emerald-200">{statusLine}</div>}

              <div className="mt-1 whitespace-pre-wrap leading-relaxed">{m.content}</div>

              {!isUser && typeof m.happinessDelta === "number" && (
                <div className="mt-2 text-xs text-zinc-300">
                  행복 변화(서버 계산): {m.happinessDelta >= 0 ? "+" : ""}
                  {m.happinessDelta}
                </div>
              )}
            </div>
          );
        })}

        {!loading && sending && status !== "finished" && (
          <div className="rounded-2xl p-3 border mr-10 bg-emerald-400/10 border-emerald-400/20">
            <div className="text-xs text-zinc-300">GM</div>
            <div className="mt-1 text-sm text-zinc-200">
              응답 생성 중<span className="animate-pulse">…</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-zinc-950/90 backdrop-blur border-t border-white/10">
        <div className="mx-auto max-w-md p-3 flex gap-2">
          <input
            className="flex-1 rounded-xl bg-white/5 border border-white/10 px-3 py-3 outline-none"
            placeholder={status === "finished" ? "이미 마무리된 이야기예요." : "명령 입력 (예: 팀장에게 사실대로 말한다)"}
            value={input}
            disabled={sending || status === "finished"}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
          />
          <button
            className="rounded-xl bg-white/90 px-4 py-3 text-zinc-900 font-semibold disabled:opacity-40"
            disabled={sending || status === "finished" || input.trim().length === 0}
            onClick={send}
          >
            실행
          </button>
        </div>
      </div>
    </main>
  );
}
