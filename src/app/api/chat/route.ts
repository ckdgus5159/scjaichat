import { NextResponse } from "next/server";
import { supabaseServerWithAnon } from "@/lib/supabaseServer";
import { getGeminiClient, GEMINI_MODEL } from "@/lib/gemini";

// ✅ AI가 반환한 텍스트에서 상태변화 수치를 추출 (전체 텍스트 기반)
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

  // ✅ meta 데이터를 함께 불러오도록 수정
  const { data: msgs } = await supabase.from("messages").select("role, content, meta").eq("game_id", gameId).order("created_at", { ascending: true });

  return NextResponse.json({
    status: game.status,
    happiness: game.happiness,
    stats: { money: game.money, relationship: game.relationship, reputation: game.reputation, health: game.health },
    valuesSummary: game.values_profile?.summaryKo || "",
    // ✅ meta.stats 가 있으면 각 메시지에 포함하여 반환
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

  await supabase.from("messages").insert({ game_id: gameId, user_id: userData.user.id, role: "user", content: userText });

  const { data: msgs } = await supabase.from("messages").select("role, content").eq("game_id", gameId).order("created_at", { ascending: true });
  
  const turnCount = msgs?.filter(m => m.role === "user").length || 1;
  const isTimeSkip = turnCount % 5 === 0;

  const ai = getGeminiClient();
  const summary = game.values_profile?.summaryKo || "행복을 추구합니다.";
  
  // ✅ 스탯 분석을 통한 경고/보상
  const st = { 경제: game.money, 관계: game.relationship, 평판: game.reputation, 건강: game.health };
  let crits = [], warns = [], buffs = [];
  for (const [k, v] of Object.entries(st)) {
    if (v <= 20) crits.push(k);
    else if (v <= 25) warns.push(k);
    if (v >= 80) buffs.push(k);
  }

  let statConditions = "";
  if (crits.length > 0) statConditions += `\n- [치명적 위기]: ${crits.join(', ')} 수치가 20 이하로 매우 위험하다. 다음상황에 반드시 관련된 치명적이고 부정적인 사건/사고를 발생시켜라.`;
  if (warns.length > 0) statConditions += `\n- [위험 경고]: ${warns.join(', ')} 수치가 위태롭다. 불안한 조짐을 슬쩍 언질하라.`;
  if (buffs.length > 0) statConditions += `\n- [긍정적 보상]: ${buffs.join(', ')} 수치가 80 이상이다. 관련된 큰 이득이나 기회를 제공하라.`;

  // ✅ 가짜 스탯 방지, 건강 하락 강제, 현실감 추가 
  const prompt = `
너는 인생 시뮬레이션의 마스터(GM)다.
플레이어 가치관 요약: ${summary}

[절대 금지 사항 및 규칙 - 무조건 준수]
1. 허용된 스탯은 오직 '경제', '관계', '평판', '건강', '행복' 딱 5가지다. '명예', '지식', '스트레스' 등 다른 스탯은 절대 만들지 마라.
2. 주인공이 야근, 무리, 병환, 극심한 피로 등을 겪는다면 무조건 '건강' 스탯을 하락(-3 ~ -10)시켜라. 건강에 변동이 없으면 안 된다.
3. 비현실적인 벼락부자, 뜬금없는 임원 승진, 유니콘 스타트업 창업 등 만화 같은 지나친 대성공을 자제하고 철저히 '현실적이고 평범한 삶의 궤적'을 유지하라.
4. 학업과 직장 이야기만 반복하지 말고, 연애, 이별, 결혼, 가족의 투병/사망, 소소한 취미 생활, 예기치 않은 재정 문제 등 다채로운 일상 이벤트를 골고루 발생시켜라.
5. 절대로 너의 생각 과정(thought, context 분석 등)을 출력하지 마라.
6. 숫자(1. 2.)나 기호(-)를 쓰지 말고 대괄호 [ ] 태그만 사용하라.
${statConditions}

[출력 양식]
${isTimeSkip ? 
`이번 턴은 타임스킵 이벤트다. 아래 5블록을 지켜라.
[결과]: 방금 전 사용자의 선택에 대한 최종 결과.
[상태변화]: 스탯의 증감 내역 (예: 경제 -3, 관계 +5, 건강 -2, 행복 +2)
[시간의 흐름]: 1~5년의 시간이 흘렀음을 알리고 변화 묘사.
[다음상황]: 새로운 시간대에서 마주한 다채롭고 현실적인 사건.
[예시명령]: (1) (2) (3) (따옴표 없이 깔끔한 한 문장으로 작성)` 
: 
`아래 4블록을 지켜라.
[결과]: 사용자 선택에 대한 결과.
[상태변화]: 스탯의 증감 내역 (예: 경제 +2, 관계 -4, 건강 -4, 행복 +3)
[다음상황]: 이어서 발생한 현실적인 위기나 상황.
[예시명령]: (1) (2) (3) (따옴표 없이 깔끔한 한 문장으로 작성)`}
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

    // ✅ 응답 생성 당시의 최신 스탯을 DB의 meta 필드에 기록
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