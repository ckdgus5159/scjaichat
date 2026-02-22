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

  const [showProfileInput, setShowProfileInput] = useState(false);
  
  // 대학생 전용 상태 관리
  const [age, setAge] = useState("20");
  const [year, setYear] = useState("1");
  const [major, setMajor] = useState("");
  const [gender, setGender] = useState("남성");
  const [mbti, setMbti] = useState({ eI: "", sN: "", tF: "", jP: "" });

  const q = QUESTIONS[step];
  const answers = useMemo(() => Object.values(picked), [picked]);
  const done = answers.length === QUESTIONS.length;
  const isLast = step === QUESTIONS.length - 1;
  const isMbtiComplete = mbti.eI && mbti.sN && mbti.tF && mbti.jP;

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
      const finalMbti = `${mbti.eI}${mbti.sN}${mbti.tF}${mbti.jP}`;

      const finalProtagonist: Protagonist = {
        ...baseProto,
        ageBand: parseInt(age) >= 30 ? "30대" : "20대",
        gender: gender === "남성" ? "male" : "female",
        occupation: "student",
        subInfo: `${major} ${year}학년`,
        dayJob: "대학생",
        oneLine: `${age}세 ${gender}, ${major} ${year}학년 (${finalMbti}) 대학생의 이야기.`
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
      setForceLoading(false); setLoading(false);
    }
  }

  const isAnyLoading = loading || forceLoading;

  if (isAnyLoading) {
    return (
      <main className="fixed inset-0 z-50 bg-stone-50 dark:bg-zinc-950 flex flex-col items-center justify-center transition-colors px-6">
        <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-6 shadow-sm dark:shadow-[0_0_15px_rgba(16,185,129,0.5)]"></div>
        <h2 className="text-xl font-bold text-emerald-600 dark:text-emerald-400 animate-pulse tracking-widest mb-8">당신만의 세계를 구축하는 중...</h2>
        
        {/* ✅ 다시 복구된 게임 가이드라인 패널 */}
        <div className="bg-white/90 dark:bg-black/40 p-6 rounded-2xl border border-stone-200 dark:border-white/10 max-w-sm w-full text-left space-y-4 shadow-lg">
          <h3 className="font-bold text-stone-800 dark:text-zinc-200 text-sm border-b border-stone-200 dark:border-white/10 pb-2">💡 게임 진행 안내</h3>
          <p className="text-xs text-stone-600 dark:text-zinc-400 leading-relaxed">
            <span className="mr-1">⏳</span> <strong>시간의 흐름:</strong> 5번의 턴(행동)마다 시간이 큰 폭으로 도약합니다.
          </p>
          <p className="text-xs text-stone-600 dark:text-zinc-400 leading-relaxed">
            <span className="mr-1">⚖️</span> <strong>가치관 반영:</strong> 가치관과 맞지 않는 터무니없는 행동은 AI의 판단 하에 <strong>실패 및 페널티</strong>를 받을 수 있습니다.
          </p>
          <p className="text-xs text-stone-600 dark:text-zinc-400 leading-relaxed">
            <span className="mr-1">🏆</span> <strong>엔딩 조건:</strong> 시련을 극복하고 <strong>행복 스탯이 100</strong>에 도달하면 게임이 종료되며 자서전이 완성됩니다.
          </p>
        </div>

      </main>
    );
  }

  if (done && showProfileInput) {
    return (
      <main className="mx-auto max-w-md p-6 min-h-[80vh] flex flex-col justify-center pb-20">
        <h2 className="text-xl font-bold mb-6 text-emerald-600 dark:text-emerald-400">캐릭터 정보 입력 (대학생)</h2>
        <div className="space-y-5 bg-white border border-stone-200 dark:bg-white/5 p-6 rounded-3xl dark:border-white/10 shadow-md transition-colors">
          
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-xs text-stone-500 dark:text-zinc-400 font-bold uppercase mb-2 block">나이</label>
              <select value={age} onChange={e => setAge(e.target.value)} className="w-full bg-stone-50 border border-stone-200 text-stone-900 dark:bg-black/40 dark:border-white/10 rounded-xl p-3 outline-none focus:border-emerald-500 dark:text-white">
                {Array.from({length: 15}, (_, i) => i + 20).map(n => <option key={n} value={n}>{n}세</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-stone-500 dark:text-zinc-400 font-bold uppercase mb-2 block">학년</label>
              <select value={year} onChange={e => setYear(e.target.value)} className="w-full bg-stone-50 border border-stone-200 text-stone-900 dark:bg-black/40 dark:border-white/10 rounded-xl p-3 outline-none focus:border-emerald-500 dark:text-white">
                {[1,2,3,4].map(n => <option key={n} value={n}>{n}학년</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-stone-500 dark:text-zinc-400 font-bold uppercase mb-2 block">성별</label>
            <div className="grid grid-cols-2 gap-2">
              {['남성', '여성'].map(g => (
                <button key={g} onClick={() => setGender(g)} className={`py-3 rounded-xl text-sm font-semibold border transition ${gender === g ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'border-stone-200 text-stone-600 bg-stone-50 dark:border-white/10 dark:text-zinc-400 dark:bg-transparent'}`}>{g}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-stone-500 dark:text-zinc-400 font-bold uppercase mb-2 block">학과 (자유입력)</label>
            <input type="text" value={major} onChange={(e) => setMajor(e.target.value)} placeholder="예: 컴퓨터공학과, 경영학과" className="w-full bg-stone-50 border border-stone-200 text-stone-900 dark:bg-black/40 dark:border-white/10 rounded-xl p-3 outline-none focus:border-emerald-500 dark:text-white transition-colors" />
          </div>

          <div>
            <label className="text-xs text-stone-500 dark:text-zinc-400 font-bold uppercase mb-2 block">MBTI</label>
            <div className="grid grid-cols-4 gap-1">
              {[ {k:'eI', v1:'E', v2:'I'}, {k:'sN', v1:'S', v2:'N'}, {k:'tF', v1:'T', v2:'F'}, {k:'jP', v1:'J', v2:'P'} ].map(pair => (
                <div key={pair.k} className="flex flex-col gap-1">
                  <button onClick={() => setMbti({...mbti, [pair.k]: pair.v1})} className={`py-2 rounded-lg text-sm font-bold border transition ${mbti[pair.k as keyof typeof mbti] === pair.v1 ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' : 'border-stone-200 text-stone-500 bg-stone-50 dark:border-white/5 dark:text-zinc-500 dark:bg-black/20'}`}>{pair.v1}</button>
                  <button onClick={() => setMbti({...mbti, [pair.k]: pair.v2})} className={`py-2 rounded-lg text-sm font-bold border transition ${mbti[pair.k as keyof typeof mbti] === pair.v2 ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' : 'border-stone-200 text-stone-500 bg-stone-50 dark:border-white/5 dark:text-zinc-500 dark:bg-black/20'}`}>{pair.v2}</button>
                </div>
              ))}
            </div>
          </div>

          <button className="w-full mt-2 rounded-xl bg-emerald-500 text-white dark:bg-emerald-400 py-4 dark:text-zinc-950 font-bold disabled:opacity-40"
            disabled={!major.trim() || !isMbtiComplete} onClick={() => startGame({ forceNew: false })}>드라마 시작하기</button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-lg font-semibold text-stone-900 dark:text-white">가치관 설정</h2>
        <div className="text-sm text-stone-500 dark:text-zinc-300">{step + 1} / {QUESTIONS.length}</div>
      </div>
      <div className="mt-4 rounded-2xl border border-stone-200 bg-white dark:border-white/10 dark:bg-white/5 p-5 shadow-sm transition-colors">
        <div className="text-sm text-emerald-600 dark:text-emerald-400/80 font-bold tracking-wide">{q.title}</div>
        <div className="mt-3 text-lg font-medium leading-snug text-stone-800 dark:text-white">{q.prompt}</div>
        <div className="mt-6 space-y-2">
          {q.choices.map((c) => {
            const selected = picked[q.id]?.choiceId === c.id;
            return (
              <button key={c.id} className={["w-full text-left rounded-xl p-4 border transition", selected ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" : "border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100 dark:border-white/10 dark:bg-black/20 dark:text-zinc-300 dark:hover:bg-white/5"].join(" ")}
                onClick={() => setPicked(prev => ({ ...prev, [q.id]: { qid: q.id, choiceId: c.id, choiceText: c.text, weights: c.weights } }))}>
                {c.text}
              </button>
            );
          })}
        </div>
        <div className="mt-6 flex gap-2">
          <button className="rounded-xl border border-stone-200 dark:border-white/10 px-4 py-3 text-sm text-stone-600 dark:text-zinc-400 font-medium bg-white dark:bg-transparent"
            disabled={step === 0} onClick={() => setStep(s => s - 1)}>이전</button>
          {!isLast && <button className="ml-auto rounded-xl bg-stone-800 text-white dark:bg-white/90 px-6 py-3 text-sm font-bold dark:text-zinc-900 disabled:opacity-40"
            disabled={!picked[q.id]} onClick={() => setStep(s => s + 1)}>다음</button>}
        </div>
      </div>
      {isLast && done && (
        <button className="w-full mt-6 rounded-xl bg-emerald-500 text-white dark:bg-emerald-400 py-4 dark:text-zinc-950 font-bold shadow-md"
          onClick={() => setShowProfileInput(true)}>테스트 완료! 정보 입력하러 가기</button>
      )}
    </main>
  );
}