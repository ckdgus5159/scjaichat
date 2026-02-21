"use client";

import { useEffect, useMemo, useState } from "react";
import { QUESTIONS, buildProtagonist, buildValuesProfile } from "@/lib/gameDesign";
import type { SetupAnswer, Protagonist } from "@/lib/types"; // Protagonist 추가
import { supabaseBrowser } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<Record<string, SetupAnswer>>({});
  const [loading, setLoading] = useState(false);
  const [forceLoading, setForceLoading] = useState(false);

  // 추가: 인적 사항 입력을 위한 상태
  const [showProfileInput, setShowProfileInput] = useState(false);
  const [protoState, setProtoState] = useState<Partial<Protagonist>>({
    ageBand: "20s",
    gender: "female",
    occupation: "student",
    subInfo: "",
    tone: "warm"
  });

  const q = QUESTIONS[step];
  const answers = useMemo(() => Object.values(picked), [picked]);
  const done = answers.length === QUESTIONS.length;
  const isLast = step === QUESTIONS.length - 1;

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
    return res.data.session;
  }

  async function startGame(opts?: { forceNew?: boolean }) {
    const forceNew = !!opts?.forceNew;
    if (forceNew) setForceLoading(true);
    else setLoading(true);

    try {
      const handle = localStorage.getItem("dc_handle") || "";
      const pin = localStorage.getItem("dc_pin") || "";
      const session = await ensureAnonSession();
      if (!session) return;
      const accessToken = session.access_token;

      const valuesProfile = buildValuesProfile(answers);
      
      // ✅ 기존 buildProtagonist 결과에 사용자가 직접 입력한 정보를 덮어씌움
      const baseProto = buildProtagonist(answers);
      const finalProtagonist: Protagonist = {
        ...baseProto,
        tone: protoState.tone as any,
        ageBand: protoState.ageBand as any,
        gender: protoState.gender as any,
        occupation: protoState.occupation as any,
        subInfo: protoState.subInfo || "",
        dayJob: 
          protoState.occupation === "highschool" ? `${protoState.subInfo || "고교"} 학생` :
          protoState.occupation === "student" ? `${protoState.subInfo || "대학"} 학생` : `${protoState.subInfo || "사무직"}`,
        oneLine: `${protoState.ageBand} ${protoState.occupation === "student" ? "대학생" : protoState.occupation === "highschool" ? "고등학생" : "직장인"}의 현실 드라마.`
      };

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
          protagonist: finalProtagonist,
          forceNew,
        }),
      });

      if (!r.ok) throw new Error(await r.text());
      const { gameId } = await r.json();
      router.push(`/play/${gameId}`);
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      if (forceNew) setForceLoading(false);
      else setLoading(false);
    }
  }

  const anyLoading = loading || forceLoading;

  // 인적 사항 입력 UI
  if (done && showProfileInput) {
    return (
      <main className="mx-auto max-w-md p-6">
        <h2 className="text-xl font-bold mb-6">마지막으로, 당신을 알려주세요</h2>
        <div className="space-y-6 bg-white/5 p-6 rounded-2xl border border-white/10">
          <div>
            <label className="text-xs text-zinc-500 uppercase font-bold">나이대</label>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {["teen", "20s", "30s", "40s"].map((a) => (
                <button key={a} onClick={() => setProtoState({...protoState, ageBand: a as any, occupation: a === "teen" ? "highschool" : protoState.occupation})}
                  className={`py-2 rounded-xl text-sm border transition ${protoState.ageBand === a ? 'border-emerald-400 bg-emerald-400/10 text-emerald-400' : 'border-white/10 text-zinc-400'}`}>
                  {a === "teen" ? "10대" : a}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-500 uppercase font-bold">신분</label>
            <div className="flex gap-2 mt-2">
              {protoState.ageBand === "teen" ? (
                <button className="flex-1 py-2 rounded-xl border border-emerald-400 bg-emerald-400/10 text-emerald-400 text-sm">고등학생(17~19세)</button>
              ) : (
                <>
                  <button onClick={() => setProtoState({...protoState, occupation: "student"})}
                    className={`flex-1 py-2 rounded-xl border text-sm transition ${protoState.occupation === "student" ? 'border-emerald-400 bg-emerald-400/10 text-emerald-400' : 'border-white/10 text-zinc-400'}`}>대학생</button>
                  <button onClick={() => setProtoState({...protoState, occupation: "worker"})}
                    className={`flex-1 py-2 rounded-xl border text-sm transition ${protoState.occupation === "worker" ? 'border-emerald-400 bg-emerald-400/10 text-emerald-400' : 'border-white/10 text-zinc-400'}`}>직장인</button>
                </>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-500 uppercase font-bold">
              {protoState.occupation === "highschool" ? "학교 이름" : protoState.occupation === "student" ? "전공 학과" : "현재 직업/직무"}
            </label>
            <input 
              type="text"
              value={protoState.subInfo}
              onChange={(e) => setProtoState({...protoState, subInfo: e.target.value})}
              placeholder="예: 한국고, 경영학, 개발자 등"
              className="w-full mt-2 bg-black/20 border border-white/10 rounded-xl p-3 outline-none focus:border-emerald-400 text-white"
            />
          </div>

          <div className="flex gap-2 pt-4">
            <button className="flex-1 rounded-xl bg-emerald-400 py-3 text-zinc-950 font-bold disabled:opacity-40"
              disabled={anyLoading || (protoState.occupation !== "highschool" && !protoState.subInfo)}
              onClick={() => startGame({ forceNew: false })}>시작하기</button>
            <button className="flex-1 rounded-xl border border-white/10 bg-white/5 py-3 text-white font-bold disabled:opacity-40"
              disabled={anyLoading}
              onClick={() => startGame({ forceNew: true })}>새로 시작</button>
          </div>
        </div>
      </main>
    );
  }

  // 가치관 테스트 질문 UI
  return (
    <main className="mx-auto max-w-md p-6">
      {anyLoading && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center">
          <div className="rounded-2xl border border-white/10 bg-zinc-950/80 px-5 py-4 w-[320px]">
            <div className="text-sm text-zinc-200">{forceLoading ? "새 게임 생성 중…" : "게임 준비 중…"}</div>
            <div className="mt-3 h-2 w-full bg-white/10 rounded-full overflow-hidden">
              <div className="h-full w-1/2 bg-emerald-400 animate-pulse" />
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">주인공 설정</h2>
        <div className="text-sm text-zinc-300">{step + 1} / {QUESTIONS.length}</div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="text-sm text-zinc-300">{q.title}</div>
        <div className="mt-2 text-lg font-medium leading-snug">{q.prompt}</div>
        <div className="mt-4 space-y-2">
          {q.choices.map((c) => {
            const selected = picked[q.id]?.choiceId === c.id;
            return (
              <button key={c.id} disabled={anyLoading}
                className={["w-full text-left rounded-xl p-3 border", selected ? "border-white/60 bg-white/10" : "border-white/10 bg-black/10"].join(" ")}
                onClick={() => setPicked((prev) => ({ ...prev, [q.id]: { qid: q.id, choiceId: c.id, choiceText: c.text, weights: c.weights } }))}>
                {c.text}
              </button>
            );
          })}
        </div>
        <div className="mt-5 flex gap-2">
          <button className="rounded-xl border border-white/10 px-4 py-2 text-sm disabled:opacity-40"
            disabled={step === 0 || anyLoading}
            onClick={() => setStep((s) => Math.max(0, s - 1))}>이전</button>
          {!isLast && (
            <button className="ml-auto rounded-xl bg-white/90 px-4 py-2 text-sm font-medium text-zinc-900 disabled:opacity-40"
              disabled={!picked[q.id] || anyLoading}
              onClick={() => setStep((s) => Math.min(QUESTIONS.length - 1, s + 1))}>다음</button>
          )}
        </div>
      </div>

      <div className="mt-6">
        <button className="w-full rounded-xl bg-white/10 border border-white/10 px-4 py-4 text-white font-semibold disabled:opacity-40"
          disabled={!done || anyLoading}
          onClick={() => setShowProfileInput(true)}>
          테스트 완료! 정보 입력하러 가기
        </button>
      </div>
    </main>
  );
}