"use client";

import { useEffect, useMemo, useState } from "react";
import { QUESTIONS, buildProtagonist, buildValuesProfile } from "@/lib/gameDesign";
import type { SetupAnswer } from "@/lib/types";
import { supabaseBrowser } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<Record<string, SetupAnswer>>({});
  const [loading, setLoading] = useState(false);

  // 새로 시작(강제 생성) 용 로딩 상태 분리(UX 깔끔)
  const [forceLoading, setForceLoading] = useState(false);

  const q = QUESTIONS[step];
  const answers = useMemo(() => Object.values(picked), [picked]);
  const done = answers.length === QUESTIONS.length;

  // handle/pin 가드: 없으면 홈으로 돌려보냄
  useEffect(() => {
    const handle = localStorage.getItem("dc_handle") || "";
    const pin = localStorage.getItem("dc_pin") || "";

    const ok = handle.trim().length > 0 && /^\d{4,6}$/.test(pin.trim());
    if (!ok) {
      alert("ID/PIN이 없습니다. 홈에서 ID 확인/등록 후 진행해주세요.");
      router.replace("/");
    }
  }, [router]);

  async function ensureAnonSession() {
    const { data } = await supabaseBrowser.auth.getSession();
    if (data.session) return data.session;

    const res = await supabaseBrowser.auth.signInAnonymously();
    if (res.error) throw res.error;

    const session = res.data.session;
    if (!session) throw new Error("Anonymous sign-in succeeded but session is null");
    return session;
  }

  async function startGame(opts?: { forceNew?: boolean }) {
    const forceNew = !!opts?.forceNew;

    // 버튼 2개라 로딩 상태 분리
    if (forceNew) setForceLoading(true);
    else setLoading(true);

    try {
      const handle = localStorage.getItem("dc_handle") || "";
      const pin = localStorage.getItem("dc_pin") || "";

      // 혹시 setup 진입 후 localStorage가 지워졌을 때 대비
      if (!handle.trim() || !/^\d{4,6}$/.test(pin.trim())) {
        alert("ID/PIN이 유효하지 않습니다. 홈에서 다시 확인해주세요.");
        router.replace("/");
        return;
      }

      const session = await ensureAnonSession();
      const accessToken = session.access_token;

      const valuesProfile = buildValuesProfile(answers);
      const protagonist = buildProtagonist(answers);

      const r = await fetch("/api/game/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          handle,
          pin,
          answers,
          valuesProfile,
          protagonist,
          forceNew, // 핵심: 새로 시작 강제 옵션
        }),
      });

      if (!r.ok) {
        const t = await r.text();
        throw new Error(t);
      }

      const { gameId } = await r.json();
      router.push(`/play/${gameId}`);
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? String(e));
    } finally {
      if (forceNew) setForceLoading(false);
      else setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">주인공 설정</h2>
        <div className="text-sm text-zinc-300">
          {step + 1} / {QUESTIONS.length}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="text-sm text-zinc-300">{q.title}</div>
        <div className="mt-2 text-lg font-medium leading-snug">{q.prompt}</div>

        <div className="mt-4 space-y-2">
          {q.choices.map((c) => {
            const selected = picked[q.id]?.choiceId === c.id;
            return (
              <button
                key={c.id}
                className={[
                  "w-full text-left rounded-xl p-3 border",
                  selected ? "border-white/60 bg-white/10" : "border-white/10 bg-black/10",
                ].join(" ")}
                onClick={() => {
                  setPicked((prev) => ({
                    ...prev,
                    [q.id]: {
                      qid: q.id,
                      choiceId: c.id,
                      choiceText: c.text,
                      weights: c.weights,
                    },
                  }));
                }}
              >
                {c.text}
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex gap-2">
          <button
            className="rounded-xl border border-white/10 px-4 py-2 text-sm disabled:opacity-40"
            disabled={step === 0 || loading || forceLoading}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            이전
          </button>
          <button
            className="ml-auto rounded-xl bg-white/90 px-4 py-2 text-sm font-medium text-zinc-900 disabled:opacity-40"
            disabled={!picked[q.id] || loading || forceLoading}
            onClick={() => setStep((s) => Math.min(QUESTIONS.length - 1, s + 1))}
          >
            다음
          </button>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <div className="text-sm text-zinc-300">
          목표: “정해진 길이 아니라도, 가치관이 충족되면 행복은 오른다.”
        </div>

        {/* 기본: 이어서 or 없으면 새로 (API에서 active 있으면 resumed) */}
        <button
          className="w-full rounded-xl bg-emerald-400 px-4 py-3 text-zinc-950 font-semibold disabled:opacity-40"
          disabled={!done || loading || forceLoading}
          onClick={() => startGame({ forceNew: false })}
        >
          {loading ? "시작 중..." : "이 설정으로 시작(이어하기 포함)"}
        </button>

        {/* 강제 새로 시작 */}
        <button
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white font-semibold disabled:opacity-40"
          disabled={!done || loading || forceLoading}
          onClick={() => startGame({ forceNew: true })}
        >
          {forceLoading ? "새로 생성 중..." : "새로 시작(강제)"}
        </button>

        <button
          className="w-full rounded-xl border border-white/10 px-4 py-3 text-sm text-zinc-200 disabled:opacity-40"
          disabled={loading || forceLoading}
          onClick={() => router.replace("/")}
        >
          홈으로 (ID/PIN 변경)
        </button>
      </div>
    </main>
  );
}
