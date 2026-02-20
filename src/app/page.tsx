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
    try {
      const h = localStorage.getItem("dc_handle") || "";
      const p = localStorage.getItem("dc_pin") || "";
      if (h) setHandle(h);
      if (p) setPin(p);
    } catch {
      // ignore
    }
  }, []);

  async function ensureAnonSession() {
    const { data } = await supabaseBrowser.auth.getSession();
    if (data.session) return data.session;

    const res = await supabaseBrowser.auth.signInAnonymously();
    if (res.error) throw res.error;

    const session = res.data.session;
    if (!session) throw new Error("Anonymous sign-in succeeded but session is null");
    return session;
  }

  function validateInputs(h: string, p: string) {
    if (!h.trim()) return "ID를 입력하세요.";
    if (!/^\d{4,6}$/.test(p.trim())) return "PIN은 숫자 4~6자리로 입력하세요.";
    return null;
  }

  async function maybeResumeOrGoSetup(h: string) {
    // h 기준으로 active 게임이 있는지 확인
    setStatusText("진행 중인 게임 확인 중...");

    const { data: existingGame, error: gameSelErr } = await supabaseBrowser
      .from("games")
      .select("id, created_at")
      .eq("handle", h)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (gameSelErr) throw gameSelErr;

    if (existingGame?.id) {
      const ok = window.confirm("진행 중인 게임이 있습니다. 이어하시겠습니까?");
      if (ok) {
        router.push(`/play/${existingGame.id}`);
        return;
      }
      router.push("/setup");
      return;
    }

    router.push("/setup");
  }

  async function checkOrCreateIdentityThenGo() {
    const h = handle.trim();
    const p = pin.trim();

    const msg = validateInputs(h, p);
    if (msg) {
      alert(msg);
      return;
    }

    setBusy(true);
    setStatusText("ID 확인 중...");

    try {
      const session = await ensureAnonSession();
      const uid = session.user.id;

      // 1) handle로 기존 프로필 확인
      const { data: existing, error: selErr } = await supabaseBrowser
        .from("profiles")
        .select("id, handle, pin")
        .eq("handle", h)
        .maybeSingle();

      if (selErr) throw selErr;

      if (!existing) {
        const ok = window.confirm("기존 DB에 없는 ID입니다. 추가하시겠습니까?");
        if (!ok) {
          setStatusText("취소됨");
          return;
        }

        // 2) 새로 생성: insert 대신 upsert (PK 중복 방지)
        const { error: upErr } = await supabaseBrowser
          .from("profiles")
          .upsert({ id: uid, handle: h, pin: p }, { onConflict: "id" });

        if (upErr) throw upErr;

        setStatusText("새 ID를 생성했습니다.");
      } else {
        // 3) 기존: PIN 확인
        if ((existing.pin ?? "") !== p) {
          alert("PIN이 일치하지 않습니다.");
          setStatusText("PIN 불일치");
          return;
        }
        setStatusText("기존 ID 확인 완료.");
      }

      // 4) 로컬 저장
      localStorage.setItem("dc_handle", h);
      localStorage.setItem("dc_pin", p);

      // 5) active 게임 있으면 이어하기 팝업 -> 바로 play로
      await maybeResumeOrGoSetup(h);
    } catch (e: any) {
      console.error("Home error:", e);
      console.error("message:", e?.message);
      console.error("details:", e?.details);
      console.error("hint:", e?.hint);
      alert(e?.message ?? String(e));
      setStatusText("오류");
    } finally {
      setBusy(false);
    }
  }

  // 저장된 handle/pin이 있는 유저는 “시작하기”를 누르면 바로 이어하기 체크가 되게
  async function onStartClick() {
    await checkOrCreateIdentityThenGo();
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-semibold">드라마 채팅 프로토타입</h1>

      <p className="mt-3 text-zinc-300 leading-relaxed">
        당신은 주인공의 ‘조언자’입니다. 질문 10개로 가치관(행복관)을 정하고,
        채팅 한 번마다 행복이 오르거나 내려갑니다. 행복이 100이 되면 한 편의
        자서전처럼 마무리됩니다.
      </p>

      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
        <div className="text-sm text-zinc-300">
          데모용: <span className="text-white font-semibold">ID + PIN</span>으로 이어서 할 수 있어요.
        </div>

        <input
          className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-3 outline-none"
          placeholder="ID (예: teamA_lch51)"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          disabled={busy}
        />

        <input
          className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-3 outline-none"
          placeholder="PIN (숫자 4~6자리)"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          disabled={busy}
        />

        <button
          className="w-full rounded-xl bg-white/90 px-4 py-3 text-zinc-900 font-medium disabled:opacity-40"
          onClick={checkOrCreateIdentityThenGo}
          disabled={busy}
        >
          ID 확인/등록 후 시작
        </button>

        {statusText && <div className="text-xs text-zinc-300">{statusText}</div>}
      </div>

      <div className="mt-6 space-y-2">
        {/* 기존 Link 대신 버튼으로: 클릭 시 이어하기 로직 수행 */}
        <button
          className="inline-flex items-center justify-center rounded-xl bg-white/90 px-4 py-3 text-zinc-900 font-medium w-full disabled:opacity-40"
          onClick={onStartClick}
          disabled={busy}
        >
          시작하기
        </button>

        {/* 혹시 필요하면 setup으로 바로 가는 우회 링크(디버그용) */}
        <Link className="block text-center text-xs text-zinc-400 underline" href="/setup">
          (디버그) setup으로 바로가기
        </Link>
      </div>
    </main>
  );
}
