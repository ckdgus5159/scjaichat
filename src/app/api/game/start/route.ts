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
  answers: z.any().optional(), // setup에서 넘어오면 사용, 없으면 기본값
});

function clipText(text: string, maxLen = 2200) {
  const t = (text ?? "").trim();
  return t.length > maxLen ? t.slice(0, maxLen).trim() : t;
}

function gmHasFourBlocks(text: string) {
  const required = ["결과:", "상태변화:", "다음상황:", "가능한 명령 예시:"];
  return required.every((h) => text.includes(h));
}

// chat과 동일한 예시 검증(중복이 싫으면 공용 유틸로 빼도 됨)
function extractExamplesLines(text: string) {
  const m = text.match(/가능한 명령 예시\s*:\s*([\s\S]*?)$/m);
  if (!m) return [];
  return m[1]
    .trim()
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}
function countExamples(lines: string[]) {
  const re = /^($\s*[1-9]\s*$|[1-9]\s*[.)])/;
  return lines.filter((l) => re.test(l)).length;
}
function isReactionishExample(exampleLine: string) {
  const badStarts = ["클릭", "확인", "본", "봐", "열", "덮", "숨", "긴장", "떨", "망설", "생각", "걱정", "한숨", "읽", "기다"];
  const normalized = exampleLine
    .replace(/^$\s*\d+\s*$\s*/, "")
    .replace(/^\d+\s*[.)]\s*/, "")
    .trim();
  return badStarts.some((b) => normalized.startsWith(b));
}
function lacksActionTarget(exampleLine: string) {
  const normalized = exampleLine
    .replace(/^$\s*\d+\s*$\s*/, "")
    .replace(/^\d+\s*[.)]\s*/, "")
    .trim();
  if (normalized.length < 12) return true;
  const hasTargetHint =
    /에게|한테|께|로|으로|에서|에게서|에\s|메일|메시지|전화|면담|회의|카톡|DM|보고|제출|요청|정리|수정|예약|작성/.test(normalized);
  return !hasTargetHint;
}

async function ensureOpeningQualityOrRegenOnce(ai: ReturnType<typeof getGeminiClient>, draft: string, prompt: string) {
  const clipped = clipText(draft);
  let needsRegen = !gmHasFourBlocks(clipped);

  const lines = extractExamplesLines(clipped);
  if (countExamples(lines) !== 3) needsRegen = true;

  if (!needsRegen) {
    const ex = lines.filter((l) => /^($\s*[1-9]\s*$|[1-9]\s*[.)])/.test(l)).slice(0, 3);
    if (ex.length !== 3) needsRegen = true;
    else {
      if (ex.some((l) => isReactionishExample(l) || lacksActionTarget(l))) needsRegen = true;
    }
  }

  if (!needsRegen) return clipped;

  const regen = `
너의 직전 오프닝에서 '가능한 명령 예시'가 반응/게이트 중심이거나 행동의 대상/채널/목적이 부족하다.
아래 규칙을 만족하는 오프닝을 다시 작성하라. 4블록 형식 유지. 예시는 3개 고정.

[오프닝 설계]
- 첫 갈림길은 '결과를 확인할까 말까'가 아니다.
- 결과(합격/불합격)는 1~2문장 내로 빠르게 지나가도 된다.
- 갈림길은 결과 이후의 "행동 선택"이어야 한다.
- 가능한 명령 예시 3개는 서로 다른 축이어야 한다:
  (A) 커리어/성과 (B) 관계/낭만 (C) 자기관리/원칙
- 각 예시는 "행동 + 대상 + 방식/채널 + 즉시 목적" 포함.
- '클릭/확인/본다/덮는다/긴장한다/망설인다/생각한다' 금지.
  `.trim();

  const resp2 = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: "user", parts: [{ text: prompt + "\n\n[추가 지시]\n" + regen }] }],
  });

  const regenerated = clipText((resp2.text ?? "").trim());
  return regenerated || clipped;
}

function buildOpeningPrompt(protagonist: any, valuesProfile: any) {
  return `
너는 "현실 직장/연애 드라마" 텍스트 어드벤처의 진행자(GM)다.
배경은 서울의 현실적인 직장 생활이다. 과장된 판타지 금지.
목표 정서: 낭만 + 자아성취.

[주인공 설정]
- 나이대: ${protagonist?.ageBand ?? "30s"}
- 직업: ${protagonist?.dayJob ?? "사무직"}
- 성격 톤: ${protagonist?.tone ?? "warm"}
- 한 줄: ${protagonist?.oneLine ?? ""}

[가치관(행복관) 프로필]
${JSON.stringify(valuesProfile ?? {}, null, 2)}

[출력 규칙]
반드시 아래 4개 블록만 출력(그 외 텍스트 금지):
결과:
상태변화:
다음상황:
가능한 명령 예시:

[진행/선택 규칙 - 매우 중요]
- 첫 갈림길은 '결과를 확인할까 말까'가 아니다. (정보 확인은 자동으로 일어난다고 가정해도 됨)
- 갈림길은 '확인 후 무엇을 하느냐' 같은 행동 선택으로 만들어라.
- 가능한 명령 예시는 3개 고정이며, 반드시 (1) (2) (3)로 시작.
- 각 예시는 "행동 + 대상 + 방식/채널 + 즉시 목적"을 포함해야 한다.
- 3개 예시는 각각 다른 축을 대표해야 한다:
  (A) 커리어/성과  (B) 관계/낭만  (C) 자기관리/원칙
- '클릭/확인/본다/덮는다/긴장한다/망설인다/생각한다' 같은 반응형 동사는 금지.
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

  // handle/pin 검증
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("handle,pin")
    .eq("handle", handle)
    .maybeSingle();

  if (profErr) return new NextResponse(`Profile lookup failed: ${profErr.message}`, { status: 400 });
  if (!profile) return new NextResponse("Invalid handle", { status: 401 });
  if (profile.pin !== pin) return new NextResponse("Invalid pin", { status: 401 });

  // single active policy (handle + user_id로 이중 안전)
  if (forceNew) {
    const { error: finishErr } = await supabase
      .from("games")
      .update({ status: "finished" })
      .eq("handle", handle)
      .eq("user_id", userData.user.id)
      .eq("status", "active");

    if (finishErr) return new NextResponse(finishErr.message, { status: 400 });
  }

  // answers 기본값(테이블 타입에 맞게 {} or [] 선택)
  const answers = body.answers ?? {};

  // game 생성 (NOT NULL들 채움)
  const { data: newGame, error: insGameErr } = await supabase
    .from("games")
    .insert({
      handle,
      user_id: userData.user.id,
      status: "active",
      happiness: 0,
      answers,
      protagonist: protagonist ?? {},
      values_profile: valuesProfile ?? {},
    })
    .select("id,happiness,status,protagonist,values_profile")
    .single();

  if (insGameErr) return new NextResponse(insGameErr.message, { status: 400 });

  // opening 생성 + 검증/재생성 1회
  const ai = getGeminiClient();
  const openingPrompt = buildOpeningPrompt(newGame.protagonist, newGame.values_profile);

  let opening =
    "결과: 알람이 울리고, 너는 자동으로 손을 뻗어 끈다.\n" +
    "상태변화: 행복 +0\n" +
    "다음상황: 오늘 오전, 팀장과 1:1 면담이 잡혀 있다. 동시에 어제 연락이 오던 사람이 '퇴근 후 시간 돼?'라고 묻는다. 네가 먼저 움직이면 오늘의 흐름이 바뀐다. 무엇부터 할까?\n" +
    "가능한 명령 예시: (1) 팀장에게 면담에서 다룰 의제를 메시지로 미리 보낸다 (2) 상대에게 퇴근 시간을 제안해 약속을 확정한다 (3) 오늘 할 일 3가지를 적고 가장 중요한 한 가지에 30분을 배정한다";

  try {
    const resp = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: openingPrompt }] }],
    });

    const draft = (resp.text ?? "").trim();
    if (draft) {
      opening = await ensureOpeningQualityOrRegenOnce(ai, draft, openingPrompt);
    }
  } catch {
    // fallback 유지
  }

  const { error: insMsgErr } = await supabase.from("messages").insert({
    game_id: newGame.id,
    user_id: userData.user.id,
    role: "assistant",
    content: opening,
    happiness_delta: 0,
    meta: { model: GEMINI_MODEL, mode: "gm", kind: "opening" },
  });

  if (insMsgErr) return new NextResponse(insMsgErr.message, { status: 400 });

  return NextResponse.json({
    gameId: newGame.id,
    status: newGame.status,
    happiness: newGame.happiness,
  });
}
