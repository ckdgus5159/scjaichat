"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  const [handle, setHandle] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);

  useEffect(() => {
    setHandle("");
    setPin("");
  }, []);

  async function ensureAnonSession() {
    const { data } = await supabaseBrowser.auth.getSession();
    if (data.session) return data.session;
    const res = await supabaseBrowser.auth.signInAnonymously();
    if (res.error) throw res.error;
    const session = res.data.session;
    if (!session) throw new Error("세션 생성에 실패했습니다.");
    return session;
  }

  function validateInputs(h: string, p: string) {
    if (!h.trim()) return "ID를 입력하세요.";
    if (!/^\d{4,6}$/.test(p.trim())) return "PIN은 숫자 4~6자리로 입력하세요.";
    return null;
  }

  async function maybeResumeOrGoSetup(h: string) {
    setStatusText("진행 중인 게임 확인 중...");
    const { data: existingGame, error: gameSelErr } = await supabaseBrowser
      .from("games").select("id, created_at").eq("handle", h).eq("status", "active")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();

    if (gameSelErr) throw gameSelErr;

    if (existingGame?.id) {
      if (window.confirm("진행 중인 게임이 있습니다. 이어하시겠습니까?")) {
        router.push(`/play/${existingGame.id}`);
        return;
      }
    }
    router.push("/setup");
  }

  async function checkOrCreateIdentityThenGo() {
    const h = handle.trim();
    const p = pin.trim();
    const msg = validateInputs(h, p);
    if (msg) { alert(msg); return; }

    setBusy(true); setStatusText("ID 확인 중...");

    try {
      const session = await ensureAnonSession();
      if (!session) throw new Error("세션을 초기화할 수 없습니다.");
      const uid = session.user.id;

      const { data: existing, error: selErr } = await supabaseBrowser
        .from("profiles").select("id, handle, pin").eq("handle", h).maybeSingle();

      if (selErr) throw selErr;

      if (!existing) {
        if (!window.confirm("기존 DB에 없는 ID입니다. 추가하시겠습니까?")) {
          setStatusText("취소됨"); return;
        }
        const { error: upErr } = await supabaseBrowser
          .from("profiles").upsert({ id: uid, handle: h, pin: p }, { onConflict: "id" });
        if (upErr) throw upErr;
        setStatusText("새 ID를 생성했습니다.");
      } else {
        if ((existing.pin ?? "") !== p) {
          alert("PIN이 일치하지 않습니다."); setStatusText("PIN 불일치"); return;
        }
        setStatusText("기존 ID 확인 완료.");
      }

      localStorage.setItem("dc_handle", h);
      localStorage.setItem("dc_pin", p);
      await maybeResumeOrGoSetup(h);
    } catch (e: any) {
      alert(e?.message ?? String(e)); setStatusText("오류");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">드라마 채팅 프로토타입</h1>
      <p className="mt-3 text-stone-600 dark:text-zinc-300 leading-relaxed">
        당신은 주인공의 ‘조언자’입니다. 질문 10개로 가치관을 정하고, AI와 함께 현실 밀착형 서사를 만들어보세요.
      </p>

      <div className="mt-6 rounded-xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 p-4 space-y-3 shadow-sm transition-colors">
        <input className="w-full rounded-xl bg-stone-50 border border-stone-200 text-stone-900 px-3 py-3 outline-none focus:border-emerald-500 dark:bg-white/5 dark:border-white/10 dark:text-zinc-50 transition-colors"
          placeholder="ID (예: teamA_lch51)" value={handle} onChange={(e) => setHandle(e.target.value)} disabled={busy} autoComplete="off" />
        <input className="w-full rounded-xl bg-stone-50 border border-stone-200 text-stone-900 px-3 py-3 outline-none focus:border-emerald-500 dark:bg-white/5 dark:border-white/10 dark:text-zinc-50 transition-colors"
          placeholder="PIN (숫자 4~6자리)" type="password" value={pin} onChange={(e) => setPin(e.target.value.replace(/[^\d]/g, ""))} disabled={busy} />
        <button className="w-full rounded-xl bg-emerald-500 text-white dark:bg-emerald-400 px-4 py-3 dark:text-zinc-950 font-bold disabled:opacity-40 transition-colors"
          onClick={checkOrCreateIdentityThenGo} disabled={busy}>
          {busy ? "확인 중..." : "ID 확인/등록 후 시작"}
        </button>
        {statusText && <div className="text-xs text-stone-500 dark:text-zinc-400">{statusText}</div>}
      </div>
    </main>
  );
}