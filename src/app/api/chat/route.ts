import { NextResponse } from "next/server";
import { supabaseServerWithAnon } from "@/lib/supabaseServer";
import { getGeminiClient, GEMINI_MODEL } from "@/lib/gemini";

// ✅ parseInt를 사용해 무조건 정수 형태로 스탯을 추출합니다.
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

  const { data: msgs } = await supabase.from("messages").select("role, content, meta").eq("game_id", gameId).order("created_at", { ascending: true });

  return NextResponse.json({
    status: game.status,
    happiness: game.happiness,
    stats: { money: game.money, relationship: game.relationship, reputation: game.reputation, health: game.health },
    valuesSummary: game.values_profile?.summaryKo || "",
    messages: msgs?.map((m: any) => ({ role: m.role, content: m.content, stats: m.meta?.stats })) || []
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

  if (userText.trim() === "//엔딩") {
    await supabase.from("messages").insert({ game_id: gameId, user_id: userData.user.id, role: "user", content: "//엔딩 명령어 입력" });
    const endText = "[결과]: 치트키가 활성화되었습니다.\n[상태변화]: 행복 +100\n[다음상황]: 모든 시련을 이겨내고 대학 생활을 성공적으로 마무리했습니다. 곧 인생 요약 페이지로 이동합니다.\n[예시명령]: (1) 자서전 확인하기";
    
    await supabase.from("games").update({ happiness: 100, status: "finished" }).eq("id", gameId);
    await supabase.from("messages").insert({
      game_id: gameId, user_id: userData.user.id, role: "assistant", content: endText, happiness_delta: 100,
      meta: { stats: { money: game.money, relationship: game.relationship, reputation: game.reputation, health: game.health, happiness: 100 } }
    });

    return NextResponse.json({ assistantText: endText, happiness: 100, stats: { money: game.money, relationship: game.relationship, reputation: game.reputation, health: game.health }, status: "finished" });
  }

  await supabase.from("messages").insert({ game_id: gameId, user_id: userData.user.id, role: "user", content: userText });

  const { data: msgs } = await supabase.from("messages").select("role, content").eq("game_id", gameId).order("created_at", { ascending: true });
  
  const turnCount = msgs?.filter(m => m.role === "user").length || 1;
  const isTimeSkip = turnCount % 5 === 0;

  const ai = getGeminiClient();
  const summary = game.values_profile?.summaryKo || "행복을 추구합니다.";

  const prompt = `
너는 인생 시뮬레이션의 마스터(GM)다. 주인공은 평범한 대학생이다.
플레이어 가치관: ${summary}

[절대 금지 사항 및 규칙 - 무조건 준수]
1. 허용된 스탯은 '경제', '관계', '평판', '건강', '행복' 딱 5가지다.
2. 너무 평탄하고 행복한 전개만 반복하지 마라! 프로젝트 무임승차, 갑작스런 지출, 가족또는 연인간의 갈등 등 '현실적인 긴장감과 스트레스 요소'를 중간중간 반드시 발생시켜라.
3. 하지만 파산, 중증 질환, 부모의 소송 등 극단적이고 암울한 막장 드라마 전개는 피하고, '극복 가능한 일상적 시련'으로 수위를 조절하라.
4. 행복 스탯만은 하락 시 다른 스탯보다 덜 하향되도록 해라.
5. 스탯의 증감 내역은 무조건 소수점이 없는 '정수' 형태로만 표기하라. (예: +3, -2)
6. 숫자(1. 2.)나 기호(-) 없이 대괄호 [ ] 태그만 써라.

[출력 양식]
${isTimeSkip ? 
`이번 턴은 타임스킵 이벤트다.
[결과]: 방금 전 행동에 대한 일상적인 결과.
[상태변화]: 스탯의 증감 내역 (예: 경제 -1, 관계 +3, 건강 -2, 행복 +2)
[시간의 흐름]: 1~5년의 시간이 흘렀음을 알리고 잔잔한 변화 묘사.
[다음상황]: 새로운 시간대에서 마주한 소소하고 현실적인 사건 (극단적 상황 금지).
[예시명령]: (1) (2) (3) (따옴표 없이 깔끔한 한 문장으로 작성, 번호마다 줄바꿈을 통해 시인성 강화)` 
: 
`아래 4블록을 지켜라.
[결과]: 행동에 대한 일상적인 결과.
[상태변화]: 스탯의 증감 내역 (예: 경제 +2, 관계 -1, 건강 -1, 행복 +3)
[다음상황]: 이어서 발생한 현실적이고 극복 가능한 소소한 위기나 상황.
[예시명령]: (1) (2) (3) (따옴표 없이 깔끔한 한 문장으로 작성, 번호마다 줄바꿈을 통해 시인성 강화)`}
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

    // ✅ 여기서 Math.round를 추가로 씌워 확실하게 정수값만 DB에 저장되도록 강제합니다.
    const clamp = (v: number) => Math.round(Math.max(0, Math.min(100, v)));
    
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
      game_id: gameId, user_id: userData.user.id, role: "assistant", content: aiText, happiness_delta: deltas.happiness,
      meta: {
        stats: { money: newStats.money, relationship: newStats.relationship, reputation: newStats.reputation, health: newStats.health, happiness: newHappiness }
      }
    });

    return NextResponse.json({
      assistantText: aiText, happiness: newHappiness, stats: newStats, status: newStatus
    });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}