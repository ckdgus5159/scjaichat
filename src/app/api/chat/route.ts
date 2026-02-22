import { NextResponse } from "next/server";
import { supabaseServerWithAnon } from "@/lib/supabaseServer";
import { getGeminiClient, GEMINI_MODEL } from "@/lib/gemini";

// 정수 변환 로직
function parseStatDeltas(aiText: string) {
  const extract = (name: string) => {
    const m = aiText.match(new RegExp(`${name}\\s*[:]?\\s*([+-]?\\d+)`));
    return m ? parseInt(m[1], 10) : 0;
  };
  return {
    money: extract('경제'), relationship: extract('관계'),
    reputation: extract('평판'), health: extract('건강'), happiness: extract('행복')
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

  // 게임 정보와 대화 목록 병렬 가져오기
  const [gameRes, msgsRes] = await Promise.all([
    supabase.from("games").select("status, happiness, money, relationship, reputation, health").eq("id", gameId).single(),
    supabase.from("messages").select("role, content, meta").eq("game_id", gameId).order("created_at", { ascending: true })
  ]);

  if (!gameRes.data) return new NextResponse("Game not found", { status: 404 });

  return NextResponse.json({
    status: gameRes.data.status,
    happiness: gameRes.data.happiness,
    stats: { money: gameRes.data.money, relationship: gameRes.data.relationship, reputation: gameRes.data.reputation, health: gameRes.data.health },
    messages: msgsRes.data?.map((m: any) => ({ role: m.role, content: m.content, stats: m.meta?.stats })) || []
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

  // 디버그 명령어 처리 (즉시 엔딩)
  if (userText.trim() === "//엔딩") {
    const endText = "[결과]: 치트키가 활성화되었습니다.\n[상태변화]: 행복 +100\n[다음상황]: 모든 시련을 이겨내고 대학 생활을 성공적으로 마무리했습니다. 곧 인생 요약 페이지로 이동합니다.\n[예시명령]: (1) 자서전 확인하기";
    
    await Promise.all([
      supabase.from("messages").insert({ game_id: gameId, user_id: userData.user.id, role: "user", content: "//엔딩 명령어 입력" }),
      supabase.from("games").update({ happiness: 100, status: "finished" }).eq("id", gameId),
      supabase.from("messages").insert({
        game_id: gameId, user_id: userData.user.id, role: "assistant", content: endText, happiness_delta: 100,
        meta: { stats: { money: 50, relationship: 50, reputation: 50, health: 50, happiness: 100 } }
      })
    ]);
    return NextResponse.json({ assistantText: endText, happiness: 100, status: "finished" });
  }

  // 최적화: 최근 메시지와 게임 정보 병렬 가져오기
  const [gameRes, historyRes, countRes] = await Promise.all([
    supabase.from("games").select("*").eq("id", gameId).single(),
    supabase.from("messages").select("role, content").eq("game_id", gameId).order("created_at", { ascending: false }).limit(6),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("game_id", gameId).eq("role", "user")
  ]);

  const game = gameRes.data;
  if (!game) return new NextResponse("Game not found", { status: 404 });

  // 유저 메시지 DB 저장 비동기 실행
  const insertUserPromise = supabase.from("messages").insert({ game_id: gameId, user_id: userData.user.id, role: "user", content: userText });

  const turnCount = (countRes.count || 0) + 1;
  const isTimeSkip = turnCount % 5 === 0;
  
  // ✅ 주인공의 설정(전공, 나이 등)과 가치관 추출
  const summary = game.values_profile?.summaryKo || "행복을 추구합니다.";
  const protagonistInfo = game.protagonist?.oneLine || "평범한 대학생";

  const st = { 경제: game.money, 관계: game.relationship, 평판: game.reputation, 건강: game.health };
  let statConditions = "";
  const crits = Object.entries(st).filter(x => x[1] <= 20).map(x => x[0]);
  const warns = Object.entries(st).filter(x => x[1] > 20 && x[1] <= 25).map(x => x[0]);
  const buffs = Object.entries(st).filter(x => x[1] >= 80).map(x => x[0]);

  if (crits.length > 0) statConditions += `\n- [주의 요망]: ${crits.join(', ')} 수치가 낮습니다. 파국은 피하고 소소한 시련으로 조절하라.`;
  if (warns.length > 0) statConditions += `\n- [위험 경고]: ${warns.join(', ')} 불안한 조짐 슬쩍 언질하라.`;
  if (buffs.length > 0) statConditions += `\n- [긍정적 보상]: ${buffs.join(', ')} 따뜻한 기회 제공하라.`;

  // ✅ 프롬프트 강화: 전공/직무 연관성 유지 지시 추가
  const prompt = `
너는 인생 시뮬레이션의 마스터(GM)다.
주인공 기본 정보: ${protagonistInfo}
플레이어 가치관: ${summary}

[절대 금지 사항 및 규칙 - 무조건 준수]
1. 허용된 스탯은 '경제', '관계', '평판', '건강', '행복' 딱 5가지다. 스탯의 증감폭은 최소 ±5 에서 최대 ±20이다.
2. 너무 평탄하고 행복한 전개만 반복하지 마라! 프로젝트 무임승차, 갑작스런 지출, 가족또는 연인간의 갈등 등 '현실적인 긴장감과 스트레스 요소'를 중간중간 반드시 발생시켜라.
3. 하지만 파산, 중증 질환, 부모의 소송 등 극단적이고 암울한 막장 드라마 전개는 피하고, '극복 가능한 일상적 시련'으로 수위를 조절하라.
4. 행복 스탯만은 하락 시 다른 스탯보다 덜 하향되도록 해라.
5. 스탯의 증감 내역은 무조건 소수점이 없는 '정수' 형태로만 표기하라. (예: +3, -2)
6. 숫자(1. 2.)나 기호(-) 없이 대괄호 [ ] 태그만 써라.
7. 결과를 출력시 꼭 플레이어의 명령이 이루어지지 않을 수도 있다. 캐릭터의 가치관과 상반된 명령을 내릴 시 적당한 이유를 대며 해당 행동이 무효되고 예상치 못한 결과가 출력되도록 하라.

[출력 양식]
${isTimeSkip ? 
`이번 턴은 타임스킵 이벤트다.
[결과]: 방금 전 행동에 대한 일상적인 결과.
[상태변화]: 스탯의 증감 내역 (예: 경제 -1, 관계 +3, 건강 -2, 행복 +2)
[시간의 흐름]: 1~5년의 시간이 흘렀음을 알리고 잔잔한 변화 묘사.
[다음상황]: 전공/직무와 관련된 새로운 환경에서 마주한 현실적인 위기나 갈등.
[예시명령]: (1) (2) (3) (따옴표 없이 깔끔한 한 문장으로 작성, 번호마다 줄바꿈을 통해 시인성 강화)` 
: 
`아래 4블록을 지켜라.
[결과]: 행동에 대한 일상적인 결과.
[상태변화]: 스탯의 증감 내역 (예: 경제 +2, 관계 -1, 건강 -1, 행복 +3)
[다음상황]: 전공/직무와 관련된 새로운 환경에서 마주한 현실적인 위기나 갈등.
[예시명령]: (1) (2) (3) (따옴표 없이 깔끔한 한 문장으로 작성, 번호마다 줄바꿈을 통해 시인성 강화)`}
`.trim();

  // 역순(내림차순)으로 가져온 히스토리를 시간순으로 뒤집기
  const history = (historyRes.data || []).reverse().map(m => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.content }]
  }));

  const contents = [
    ...history,
    { role: "user" as const, parts: [{ text: prompt + `\n\n최신 사용자 행동: ${userText}` }] }
  ];

  try {
    const ai = getGeminiClient();
    const resp = await ai.models.generateContent({ model: GEMINI_MODEL, contents });
    const aiText = resp.text || "";
    const deltas = parseStatDeltas(aiText);

    const clamp = (v: number) => Math.round(Math.max(0, Math.min(100, v)));
    const newStats = {
      money: clamp(game.money + deltas.money), relationship: clamp(game.relationship + deltas.relationship),
      reputation: clamp(game.reputation + deltas.reputation), health: clamp(game.health + deltas.health)
    };
    const newHappiness = clamp(game.happiness + deltas.happiness);
    const newStatus = newHappiness >= 100 ? "finished" : game.status;

    // 업데이트 병렬 실행
    await Promise.all([
      insertUserPromise, 
      supabase.from("games").update({ ...newStats, happiness: newHappiness, status: newStatus }).eq("id", gameId),
      supabase.from("messages").insert({
        game_id: gameId, user_id: userData.user.id, role: "assistant", content: aiText, happiness_delta: deltas.happiness,
        meta: { stats: { ...newStats, happiness: newHappiness } }
      })
    ]);

    return NextResponse.json({ assistantText: aiText, happiness: newHappiness, stats: newStats, status: newStatus });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}