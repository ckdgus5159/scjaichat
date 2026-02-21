import { NextResponse } from "next/server";
import { supabaseServerWithAnon } from "@/lib/supabaseServer";
import { getGeminiClient, GEMINI_MODEL } from "@/lib/gemini";

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

  await supabase.from("messages").insert({ game_id: gameId, user_id: userData.user.id, role: "user", content: userText });

  const { data: msgs } = await supabase.from("messages").select("role, content").eq("game_id", gameId).order("created_at", { ascending: true });
  
  const turnCount = msgs?.filter(m => m.role === "user").length || 1;
  const isTimeSkip = turnCount % 5 === 0;

  const ai = getGeminiClient();
  const summary = game.values_profile?.summaryKo || "행복을 추구합니다.";
  
  const st = { 경제: game.money, 관계: game.relationship, 평판: game.reputation, 건강: game.health };
  let crits = [], warns = [], buffs = [];
  for (const [k, v] of Object.entries(st)) {
    if (v <= 20) crits.push(k);
    else if (v <= 25) warns.push(k);
    if (v >= 80) buffs.push(k);
  }

  let statConditions = "";
  if (crits.length > 0) statConditions += `\n- [주의 요망]: ${crits.join(', ')} 수치가 낮습니다. 하지만 파산, 소송, 죽음 등 극단적인 파국은 절대 피하고, "일시적인 슬럼프, 가벼운 오해, 감기 몸살" 등 일상적이고 극복 가능한 소소한 시련만 주어라.`;
  if (warns.length > 0) statConditions += `\n- [위험 경고]: ${warns.join(', ')} 수치가 조금 낮습니다. 앞으로 무리하면 안 좋겠다는 불안한 조짐을 슬쩍 언질하라.`;
  if (buffs.length > 0) statConditions += `\n- [긍정적 보상]: ${buffs.join(', ')} 수치가 높습니다. 일상의 소소하고 따뜻한 기회(우연한 행운, 칭찬, 소소한 수익 등)를 제공하라.`;

  const prompt = `
너는 인생 시뮬레이션의 마스터(GM)다.
플레이어 가치관 요약: ${summary}

[절대 금지 사항 및 힐링 게임 규칙 - 무조건 준수]
1. 허용된 스탯은 오직 '경제', '관계', '평판', '건강', '행복' 딱 5가지다. 다른 단어는 절대 생성하지 마라.
2. 억지 위기 조성 금지: 버스 안에서 갑자기 면접 코딩테스트가 추가된다거나 하는 '작위적이고 비현실적인 억지 위기'를 절대 주지 마라. 상황은 자연스럽게 흘러가야 한다.
3. 막장 드라마/절망 금지: 이 게임의 목적은 '힐링'이다. 빚더미에 앉거나, 부모가 소송을 걸거나, 중증 질환에 걸려 쓰러지는 등의 심각하고 암울한 전개는 절대 금지한다. 위기가 발생하더라도 "지갑을 잃어버림", "연인과의 가벼운 말다툼", "감기 몸살" 정도로 수위를 조절하라.
4. 행복 스탯만은 하락 시 조금씩만(-1 ~ -4) 깎아라.
5. 절대로 너의 생각 과정(thought)을 출력하지 말고, 기호(-) 없이 대괄호 [ ] 태그만 사용하라.
${statConditions}

[출력 양식]
${isTimeSkip ? 
`이번 턴은 타임스킵 이벤트다.
[결과]: 방금 전 행동에 대한 일상적인 결과.
[상태변화]: 스탯의 증감 내역 (예: 경제 -1, 관계 +3, 건강 -2, 행복 +2)
[시간의 흐름]: 1~5년의 시간이 흘렀음을 알리고 잔잔한 변화 묘사.
[다음상황]: 새로운 시간대에서 마주한 소소하고 현실적인 사건 (극단적 상황 금지).
[예시명령]: (1) (2) (3) (따옴표 없이 깔끔한 한 문장으로 작성)` 
: 
`아래 4블록을 지켜라.
[결과]: 행동에 대한 일상적인 결과.
[상태변화]: 스탯의 증감 내역 (예: 경제 +2, 관계 -1, 건강 -1, 행복 +3)
[다음상황]: 이어서 발생한 현실적이고 극복 가능한 소소한 위기나 상황.
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