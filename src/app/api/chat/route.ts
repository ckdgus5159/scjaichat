import { NextResponse } from "next/server";
import { supabaseServerWithAnon } from "@/lib/supabaseServer";
import { getGeminiClient, GEMINI_MODEL } from "@/lib/gemini";

// ✅ 개선된 파싱 함수: 전체 텍스트에서 안전하게 수치만 추출 (줄바꿈 오류 해결)
function parseStatDeltas(aiText: string) {
  const extract = (name: string) => {
    const reg = new RegExp(`${name}\\s*[:]?\\s*([+-]?\\d+)`);
    const m = aiText.match(reg);
    return m ? parseInt(m[1], 10) : 0;
  };
  return {
    money: extract('경제'),
    relationship: extract('관계'),
    reputation: extract('평판'),
    health: extract('건강'),
    happiness: extract('행복')
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const gameId = searchParams.get("gameId");
  if (!gameId) return new NextResponse("Missing gameId", { status: 400 });

  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : undefined;
  if (!token) return new NextResponse("Missing Auth", { status: 401 });

  const supabase = supabaseServerWithAnon(token);
  const { data: game } = await supabase.from("games").select("*").eq("id", gameId).single();
  if (!game) return new NextResponse("Game not found", { status: 404 });

  const { data: msgs } = await supabase.from("messages").select("*").eq("game_id", gameId).order("created_at", { ascending: true });

  return NextResponse.json({
    status: game.status,
    happiness: game.happiness,
    stats: { money: game.money, relationship: game.relationship, reputation: game.reputation, health: game.health },
    valuesSummary: game.values_profile?.summaryKo || "",
    messages: msgs?.map((m: any) => ({ role: m.role, content: m.content })) || []
  });
}

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : undefined;
  if (!token) return new NextResponse("Missing Auth", { status: 401 });

  const supabase = supabaseServerWithAnon(token);
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return new NextResponse("Invalid user", { status: 401 });

  const { gameId, userText } = await req.json();
  const { data: game } = await supabase.from("games").select("*").eq("id", gameId).single();
  if (!game) return new NextResponse("Game not found", { status: 404 });

  await supabase.from("messages").insert({ game_id: gameId, user_id: userData.user.id, role: "user", content: userText });

  const { data: msgs } = await supabase.from("messages").select("role, content").eq("game_id", gameId).order("created_at", { ascending: true });
  
  const turnCount = msgs?.filter(m => m.role === "user").length || 1;
  const isTimeSkip = turnCount % 5 === 0;

  const ai = getGeminiClient();
  const summary = game.values_profile?.summaryKo || "행복을 추구합니다.";
  
  const prompt = `
너는 인생 시뮬레이션의 마스터(GM)다.
플레이어 가치관 요약: ${summary}

[절대 규칙 - 무조건 준수]
1. 너의 사고 과정(thought)은 절대 노출하지 마라. 대괄호 태그로만 응답하라.
2. 플레이어의 행동이 현실성이 없거나, 자신의 가치관과 명백히 어긋난다면 "행동 실패"로 처리하고 페널티를 주어라.
3. 스탯 변동: 피로, 무리수, 손해 발생 시 '경제, 관계, 평판, 건강' 스탯을 확실히 하락(-3 ~ -10)시켜라.
4. '행복' 스탯은 떨어질 땐 소폭(-1 ~ -2), 올바른 선택엔 대폭(+3 ~ +5) 주어 우상향하게 만들어라.

[출력 양식]
${isTimeSkip ? 
`이번 턴은 타임스킵 이벤트다.
[시간의 흐름]: 1~5년의 시간이 흘렀음을 알리고 변화 묘사.
[결과]: 방금 전 행동에 대한 결과 (실패 시 실패 묘사).
[상태변화]: 스탯 증감 (예: 경제 -3, 관계 +5...)
[다음상황]: 새로운 시간대에서 마주한 사건.
[예시명령]: (1) (2) (3) 형식의 짧은 한 줄 제안.` 
: 
`[결과]: 행동에 대한 결과 (실패 시 실패 묘사).
[상태변화]: 스탯 증감 (예: 경제 +2, 관계 -4...)
[다음상황]: 이어서 발생한 위기.
[예시명령]: (1) (2) (3) 형식의 짧은 한 줄 제안.`}
`.trim();

  const history = msgs?.slice(-6).map(m => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.content }]
  })) || [];

  const contents = [
    ...history,
    { role: "user" as const, parts: [{ text: prompt + `\n\n최신 사용자 행동: ${userText}` }] }
  ];

  try {
    const resp = await ai.models.generateContent({ model: GEMINI_MODEL, contents });
    const aiText = resp.text || "";
    const deltas = parseStatDeltas(aiText);

    const clamp = (v: number) => Math.max(0, Math.min(100, v));
    const newStats = {
      money: clamp(game.money + deltas.money),
      relationship: clamp(game.relationship + deltas.relationship),
      reputation: clamp(game.reputation + deltas.reputation),
      health: clamp(game.health + deltas.health)
    };
    const newHappiness = clamp(game.happiness + deltas.happiness);

    let newStatus = game.status;
    if (newHappiness >= 100) newStatus = "finished";

    await supabase.from("games").update({
      money: newStats.money, relationship: newStats.relationship,
      reputation: newStats.reputation, health: newStats.health,
      happiness: newHappiness, status: newStatus
    }).eq("id", gameId);

    await supabase.from("messages").insert({
      game_id: gameId, user_id: userData.user.id, role: "assistant", content: aiText, happiness_delta: deltas.happiness
    });

    return NextResponse.json({
      assistantText: aiText, happiness: newHappiness, stats: newStats, status: newStatus
    });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}