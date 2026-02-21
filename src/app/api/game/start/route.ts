import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServerWithAnon } from "@/lib/supabaseServer";
import { getGeminiClient, GEMINI_MODEL } from "@/lib/gemini";

const StartSchema = z.object({
  handle: z.string().min(2).max(30),
  pin: z.string().min(4).max(12),
  forceNew: z.boolean().optional().default(false),
  protagonist: z.any().optional(),
  valuesProfile: z.any().optional(),
  answers: z.any().optional(),
});

function buildOpeningPrompt(protagonist: any, valuesProfile: any) {
  const occ = protagonist?.occupation;
  const info = protagonist?.subInfo || "";
  let context = "";

  if (occ === "highschool") {
    context = `배경은 대한민국 고등학교. 계열은 ${info}이다. 입시와 친구 관계 등 10대의 현실.`;
  } else if (occ === "student") {
    context = `배경은 대학교 캠퍼스. 전공 학과는 ${info}이다. 학점, 취업 등 대학생의 현실.`;
  } else {
    context = `배경은 치열한 직장 생활. 직무는 ${info}이다. 업무 스트레스와 인간관계 등 직장인의 현실.`;
  }

  return `
너는 현실 밀착형 인생 드라마의 GM이다.
${context} 판타지 배제. 리얼리즘 유지.

[절대 금지 사항]
1. 절대로 너의 생각 과정(thought, context 분석 등)을 출력하지 마라.
2. 각 블록 앞에 '1.', '2.', '-' 같은 숫자나 기호를 붙이지 마라. 오직 대괄호 [ ] 태그만 사용하라.

[출력 규칙 - 오프닝 전용]
반드시 아래 5개 태그 형식으로만 즉시 출력하라.
[캐릭터 소개]: 주인공의 신분과 성향을 1~2문장으로 요약.
[당신의 상황]: 현재 직면한 구체적 상황. **반드시 100자 이내, 3문장 이하로 아주 짧고 강렬하게 작성.**
[상태변화]: 없음
[다음상황]: 바로 행동을 결정해야 하는 위기나 고민.
[예시명령]: (1) (2) (3) 형식. 단, 구체적인 묘사나 따옴표를 빼고, 플레이어가 바로 행동할 수 있는 깔끔한 한 문장으로 작성하라.
`.trim();
}

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : undefined;
  if (!token) return new NextResponse("Missing Authorization", { status: 401 });

  const supabase = supabaseServerWithAnon(token);
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return new NextResponse("Invalid user", { status: 401 });

  const body = StartSchema.parse(await req.json());
  const handle = body.handle.trim();
  const pin = body.pin.trim();
  const { forceNew, protagonist, valuesProfile } = body;

  const { data: profile } = await supabase.from("profiles").select("handle,pin").eq("handle", handle).maybeSingle();
  if (!profile || profile.pin !== pin) return new NextResponse("Invalid credentials", { status: 401 });

  if (forceNew) {
    await supabase.from("games").update({ status: "finished" }).eq("handle", handle).eq("user_id", userData.user.id).eq("status", "active");
  }

  const initialStats = { money: 50, relationship: 50, reputation: 50, health: 50 };

  const { data: newGame, error: insGameErr } = await supabase
    .from("games")
    .insert({
      handle, user_id: userData.user.id, status: "active", happiness: 0,
      answers: body.answers ?? {}, protagonist: protagonist ?? {}, values_profile: valuesProfile ?? {},
      ...initialStats
    }).select().single();

  if (insGameErr) return new NextResponse(insGameErr.message, { status: 400 });

  const ai = getGeminiClient();
  const openingPrompt = buildOpeningPrompt(newGame.protagonist, newGame.values_profile);
  
  let opening = "[캐릭터 소개]: 알 수 없음\n[당신의 상황]: 로딩 중 오류가 발생했습니다.\n[상태변화]: 없음\n[다음상황]: 서버 응답 지연\n[예시명령]: (1) 다시 시도한다";

  try {
    const resp = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: openingPrompt }] }],
    });
    opening = (resp.text ?? "").trim();
  } catch {}

  // ✅ 오프닝 메시지에 초기 스탯을 meta로 저장하여 프론트에서 확인할 수 있게 함
  await supabase.from("messages").insert({
    game_id: newGame.id, user_id: userData.user.id, role: "assistant", content: opening, 
    meta: { 
      kind: "opening",
      stats: { money: 50, relationship: 50, reputation: 50, health: 50, happiness: 0 } 
    }
  });

  return NextResponse.json({ gameId: newGame.id });
}