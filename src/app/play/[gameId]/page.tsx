"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseClient";

type Msg = { role: "user" | "assistant"; content: string; happinessDelta?: number };

type PageProps = {
  params: Promise<{ gameId: string }>;
};

function extractStatusLine(gmText: string): string | null {
  // GM 출력 규격: "상태변화: ..."
  const m = gmText.match(/^\s*상태변화\s*:\s*(.+)\s*$/m);
  return m ? m[1].trim() : null;
}

export default function PlayPage({ params }: PageProps) {
  // Next.js 16+: params is a Promise
  const { gameId } = React.use(params);

  const [happiness, setHappiness] = useState(0);
  const [status, setStatus] = useState<"active" | "finished">("active");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false); // GM 응답 대기 상태로도 사용
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement | null>(null);

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
    // 최초 로딩: 최근 메시지 + 행복 상태 불러오기
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
        setHappiness(data.happiness);
        setStatus(data.status);
        setMessages(data.messages);
      } finally {
        setLoading(false);
      }
    })();
  }, [gameId]);

  async function send() {
    const text = input.trim();
    if (!text || sending || status === "finished") return;

    setSending(true);
    setInput("");

    // 낙관적 업데이트(플레이어 명령)
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

      if (!r.ok) {
        const t = await r.text();
        throw new Error(t);
      }

      const data = await r.json();
      setHappiness(data.happiness);
      setStatus(data.status);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.assistantText, happinessDelta: data.happinessDelta },
      ]);
    } catch (e: any) {
      // 에러도 GM 말풍선로 보여주면 UX가 덜 깨짐
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
      setSending(false);
    }
  }

  return (
    <main className="mx-auto max-w-md p-4 pb-32">
      <div className="sticky top-0 z-10 bg-zinc-950/80 backdrop-blur border-b border-white/10 p-3 rounded-xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-semibold">드라마 진행</div>
            <div className="text-xs text-zinc-400">플레이어는 “명령”으로 상황을 전개합니다</div>
          </div>
          <div className="text-sm text-zinc-300 shrink-0">
            행복: <span className="text-white font-semibold">{happiness}</span> / 100
          </div>
        </div>

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

      {/* ✅ 상단 "현재 상황(다음상황)" 박스 제거 */}

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
              key={i}
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

        {/* ✅ GM 응답 대기 중 로딩 말풍선 */}
        {!loading && sending && status !== "finished" && (
          <div className="rounded-2xl p-3 border mr-10 bg-emerald-400/10 border-emerald-400/20">
            <div className="text-xs text-zinc-300">GM</div>
            <div className="mt-1 text-sm text-zinc-200">응답 생성 중…</div>
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
            disabled={sending || status === "finished"}
            onClick={send}
          >
            실행
          </button>
        </div>
      </div>
    </main>
  );
}
