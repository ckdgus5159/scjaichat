"use client";

import { useEffect, useMemo, useState } from "react";
import { QUESTIONS, buildProtagonist, buildValuesProfile } from "@/lib/gameDesign";
import type { SetupAnswer, Protagonist } from "@/lib/types";
import { supabaseBrowser } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<Record<string, SetupAnswer>>({});
  const [loading, setLoading] = useState(false);
  const [forceLoading, setForceLoading] = useState(false);

  // 캐릭터 상세 설정 상태
  const [showProfileInput, setShowProfileInput] = useState(false);
  const [protoState, setProtoState] = useState<Partial<Protagonist>>({
    ageBand: "20s", gender: "female", occupation: "student", subInfo: "", tone: "warm"
  });

  const q = QUESTIONS[step];
  const answers = useMemo(() => Object.values(picked), [picked]);
  const done = answers.length === QUESTIONS.length;
  const isLast = step === QUESTIONS.length - 1;

  useEffect(() => {
    const handle = localStorage.getItem("dc_handle") || "";
    const pin = localStorage.getItem("dc_pin") || "";
    if (!(handle.trim().length > 0 && /^\d{4,6}$/.test(pin.trim()))) {
      alert("ID/PIN이 없습니다. 홈에서 다시 진행해주세요.");
      router.replace("/");
    }
  }, [router]);

  async function ensureAnonSession() {
    const { data } = await supabaseBrowser.auth.getSession();
    if (data.session) return data.session;
    const res = await supabaseBrowser.auth.signInAnonymously();
    return res.data.session;
  }

  async function startGame(opts?: { forceNew?: boolean }) {
    const forceNew = !!opts?.forceNew;
    if (forceNew) setForceLoading(true); else setLoading(true);

    try {
      const handle = localStorage.getItem("dc_handle") || "";
      const pin = localStorage.getItem("dc_pin") || "";
      const session = await ensureAnonSession();
      const accessToken = session!.access_token;

      const valuesProfile = buildValuesProfile(answers);
      const baseProto = buildProtagonist(answers);

      const finalProtagonist: Protagonist = {
        ...baseProto,
        ageBand: protoState.ageBand as any,
        gender: protoState.gender as any,
        occupation: protoState.occupation as any,
        subInfo: protoState.subInfo || "",
        dayJob: protoState.occupation === "highschool" ? `${protoState.subInfo || "인문계"} 고교생` : baseProto.dayJob,
        oneLine: `${protoState.ageBand} ${protoState.occupation === "highschool" ? "고등학생" : "청년"}의 서사.`
      };

      const r = await fetch("/api/game/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ handle, pin, answers, valuesProfile, protagonist: finalProtagonist, forceNew }),
      });

      if (!r.ok) throw new Error(await r.text());
      const { gameId } = await r.json();
      router.push(`/play/${gameId}`);
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setForceLoading(false); setLoading(false);
    }
  }

  if (done && showProfileInput) {
    return (
      <main className="mx-auto max-w-md p-6 min-h-[80vh] flex flex-col justify-center">
        <h2 className="text-xl font-bold mb-6 text-emerald-400">캐릭터 정보 입력</h2>
        <div className="space-y-6 bg-white/5 p-6 rounded-3xl border border-white/10 shadow-xl">
          <div>
            <label className="text-xs text-zinc-500 font-bold uppercase">나이대 선택</label>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {["teen", "20s", "30s", "40s"].map(a => (
                <button key={a} onClick={() => setProtoState({...protoState, ageBand: a as any, occupation: a === "teen" ? "highschool" : "student"})}
                  className={`py-2 rounded-xl text-xs border transition ${protoState.ageBand === a ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' : 'border-white/10 text-zinc-400'}`}>
                  {a === "teen" ? "10대" : a}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-500 font-bold uppercase">
              {protoState.occupation === "highschool" ? "학교 유형 (인문계-이과/문과, 예고, 체고 등)" : "상세 (학과/직무)"}
            </label>
            <input type="text" value={protoState.subInfo} onChange={(e) => setProtoState({...protoState, subInfo: e.target.value})}
              placeholder="직접 입력해주세요"
              className="w-full mt-2 bg-black/40 border border-white/10 rounded-xl p-3 outline-none focus:border-emerald-500 text-white" />
          </div>
          <button className="w-full rounded-xl bg-emerald-400 py-4 text-zinc-950 font-bold disabled:opacity-40"
            disabled={loading || !protoState.subInfo} onClick={() => startGame({ forceNew: false })}>이 설정으로 드라마 시작</button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-6">
      {(loading || forceLoading) && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <div className="text-emerald-400 animate-pulse font-bold">시나리오 구성 중...</div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">가치관 설정</h2>
        <div className="text-sm text-zinc-300">{step + 1} / {QUESTIONS.length}</div>
      </div>
      <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="text-sm text-zinc-300">{q.title}</div>
        <div className="mt-2 text-lg font-medium leading-snug">{q.prompt}</div>
        <div className="mt-4 space-y-2">
          {q.choices.map((c) => {
            const selected = picked[q.id]?.choiceId === c.id;
            return (
              <button key={c.id} className={["w-full text-left rounded-xl p-3 border transition", selected ? "border-emerald-500 bg-emerald-500/10 text-emerald-400" : "border-white/10 bg-black/10 text-zinc-400"].join(" ")}
                onClick={() => setPicked(prev => ({ ...prev, [q.id]: { qid: q.id, choiceId: c.id, choiceText: c.text, weights: c.weights } }))}>
                {c.text}
              </button>
            );
          })}
        </div>
        <div className="mt-5 flex gap-2">
          <button className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-400"
            disabled={step === 0} onClick={() => setStep(s => s - 1)}>이전</button>
          {!isLast && <button className="ml-auto rounded-xl bg-white/90 px-4 py-2 text-sm font-medium text-zinc-900"
            disabled={!picked[q.id]} onClick={() => setStep(s => s + 1)}>다음</button>}
        </div>
      </div>
      {isLast && done && (
        <button className="w-full mt-6 rounded-xl bg-emerald-400 py-4 text-zinc-950 font-bold"
          onClick={() => setShowProfileInput(true)}>테스트 완료! 정보 입력하러 가기</button>
      )}
    </main>
  );
}