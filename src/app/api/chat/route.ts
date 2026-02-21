import { NextResponse } from "next/server";
import { supabaseServerWithAnon } from "@/lib/supabaseServer";
import { getGeminiClient, GEMINI_MODEL } from "@/lib/gemini";

// AI가 반환한 텍스트에서 상태변화 수치를 추출
function parseStatDeltas(aiText: string) {
  let deltas = { money: 0, relationship: 0, reputation: 0, health: 0, happiness: 0 };
  const statMatch = aiText.match(/상태변화[:\s]*([^\\n\[]*)/);
  if (statMatch) {
    const sText = statMatch[1];
    const extract = (name: string) => {
      const reg = new RegExp(`${name}\\s*([+-]?\\d+)`);
      const m = sText.match(reg);
      return m ? parseInt(m[1], 10) : 0;
    };
    deltas.money = extract('경제');
    deltas.relationship = extract('관계');
    deltas.reputation = extract('평판');
    deltas.health = extract('건강');
    deltas.happiness = extract('행복');
  }
  return deltas;
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

  // 유저 메시지 먼저 저장
  await supabase.from("messages").insert({ game_id: gameId, user_id: userData.user.id, role: "user", content: userText });

  const { data: msgs } = await supabase.from("messages").select("role, content").eq("game_id", gameId).order("created_at", { ascending: true });
  
  // 5턴째인지 확인 (타임스킵 로직)
  const turnCount = msgs?.filter(m => m.role === "user").length || 1;
  const isTimeSkip = turnCount % 5 === 0;

  const ai = getGeminiClient();
  const summary = game.values_profile?.summaryKo || "행복을 추구합니다.";
  
  const prompt = `
너는 인생 시뮬레이션의 마스터(GM)다.
플레이어 가치관 요약: ${summary}

[절대 금지 사항]
1. 절대로 너의 생각 과정(thought, context 분석 등)을 출력하지 마라.
2. 각 블록 앞에 '1.', '2.', '-' 같은 숫자나 기호를 붙이지 마라. 대괄호 [ ] 태그만 사용하라.

[스탯 변동 알고리즘 - 엄격 적용]
- 사용자의 선택이 손해나 피로를 유발하면 '경제, 관계, 평판, 건강' 스탯을 반드시 하락(-3 ~ -10)시켜라.
- '행복' 스탯은 떨어질 때는 조금(-1 ~ -2), 오를 때는 크게(+3 ~ +5) 주어 우상향하게 만들어라.

[출력 양식]
${isTimeSkip ? 
`이번 턴은 타임스킵 이벤트다. 아래 5블록을 지켜라.
[시간의 흐름]: 1~5년의 시간이 흘렀음을 알리고 변화 묘사.
[결과]: 방금 전 사용자의 선택에 대한 최종 결과.
[상태변화]: 스탯의 증감 내역 (예: 경제 -3, 관계 +5...)
[다음상황]: 새로운 나이/시간대에서 마주한 사건.
[예시명령]: (1) (2) (3) (따옴표 없이 깔끔한 한 문장으로 작성)` 
: 
`아래 4블록을 지켜라.
[결과]: 사용자 선택에 대한 결과.
[상태변화]: 스탯의 증감 내역 (예: 경제 +2, 관계 -4...)
[다음상황]: 이어서 발생한 위기나 상황.
[예시명령]: (1) (2) (3) (따옴표 없이 깔끔한 한 문장으로 작성)`}
`.trim();

  // 기존 대화 내역 (history) 구성
  const history = msgs?.slice(-6).map(m => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.content }]
  })) || [];

  // 새 요청 (history + 새로운 prompt 합치기)
  const contents = [
    ...history,
    { role: "user" as const, parts: [{ text: prompt + `\n\n최신 사용자 행동: ${userText}` }] }
  ];

  try {
    // startChat 대신 generateContent를 사용하여 전체 대화 내역을 한 번에 전달
    const resp = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: contents
    });
    
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