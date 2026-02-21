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

function clipText(text: string, maxLen = 2200) {
  const t = (text ?? "").trim();
  return t.length > maxLen ? t.slice(0, maxLen).trim() : t;
}

function gmHasFourBlocks(text: string) {
  const required = ["상태변화:", "다음상황:", "예시 명령:"];
  return required.every((h) => text.includes(h));
}

async function ensureOpeningQualityOrRegenOnce(ai: any, draft: string, prompt: string) {
  const clipped = clipText(draft);
  let needsRegen = !gmHasFourBlocks(clipped);
  if (!needsRegen) return clipped;
  return clipped; 
}

function buildOpeningPrompt(protagonist: any, valuesProfile: any) {
  let context = "";
  const occ = protagonist?.occupation;
  const info = protagonist?.subInfo || "";

  if (occ === "highschool") {
    context = `배경은 대한민국 고등학교의 현실적인 학교 생활이다. 학교 유형은 ${info}이다. 입시 압박, 친구 관계 등 10대의 현실을 담아라.`;
  } else if (occ === "student") {
    context = `배경은 대학교 캠퍼스이다. 전공은 ${info}이다. 과제, 취업 고민 등 대학생의 현실을 담아라.`;
  } else {
    context = `배경은 치열한 직장 생활이다. 직무는 ${info}이다. 성과 압박, 상사 갈등 등 K-직장인의 현실을 담아라.`;
  }

  return `
너는 "현실 밀착형 인생 드라마" 텍스트 어드벤처의 진행자(GM)다.
${context} 판타지 금지. 리얼리즘 유지.

[출력 규칙 - 오프닝 전용]
1. [당신의 상황]: '결과:' 대신 반드시 이 태그를 사용할 것. 수치 언급 없이 소설처럼 묘사하라.
2. [상태변화]: 없음
3. [다음상황]: 사용자가 마주한 첫 번째 선택 상황 제시.
4. [예시 명령]: (1) (2) (3) 형식 유지.
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
      handle,
      user_id: userData.user.id,
      status: "active",
      happiness: 0,
      answers: body.answers ?? {},
      protagonist: protagonist ?? {},
      values_profile: valuesProfile ?? {},
      ...initialStats
    })
    .select().single();

  if (insGameErr) return new NextResponse(insGameErr.message, { status: 400 });

  const ai = getGeminiClient();
  const openingPrompt = buildOpeningPrompt(newGame.protagonist, newGame.values_profile);
  
  let opening = "당신의 상황: 새로운 하루가 시작됩니다.\n상태변화: 없음\n다음상황: 로딩 중 오류가 발생했습니다.\n예시 명령: (1) 다시 시도한다";

  try {
    const resp = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: openingPrompt }] }],
    });
    opening = (resp.text ?? "").trim();
  } catch {}

  await supabase.from("messages").insert({
    game_id: newGame.id,
    user_id: userData.user.id,
    role: "assistant",
    content: opening,
    meta: { model: GEMINI_MODEL, mode: "gm", kind: "opening" },
  });

  return NextResponse.json({ gameId: newGame.id });
}