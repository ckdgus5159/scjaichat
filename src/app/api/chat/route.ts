import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServerWithAnon } from "@/lib/supabaseServer";
import { getGeminiClient, GEMINI_MODEL } from "@/lib/gemini";

const PostSchema = z.object({
  gameId: z.string().uuid(),
  userText: z.string().min(1).max(2000),
});

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withTimeout<T>(p: Promise<T>, ms: number, label = "timeout"): Promise<T> {
  let t: any;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error(label)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(t);
  }
}

async function generateWithRetry(
  ai: ReturnType<typeof getGeminiClient>,
  args: Parameters<typeof ai.models.generateContent>[0],
  opts?: { attempts?: number; timeoutMs?: number }
) {
  const attempts = opts?.attempts ?? 3;
  const timeoutMs = opts?.timeoutMs ?? 12000; // 12초 안에 안 오면 끊고 재시도

  let lastErr: any;

  for (let i = 0; i < attempts; i++) {
    try {
      const p = ai.models.generateContent(args);
      return await withTimeout(p, timeoutMs, "gemini_timeout");
    } catch (e: any) {
      lastErr = e;
      const status = e?.status ?? e?.cause?.status ?? e?.response?.status;
      const retryable = status === 503 || status === 429 || e?.message === "gemini_timeout";

      if (!retryable || i === attempts - 1) throw e;

      const backoff = 300 * Math.pow(2, i); // 300, 600, 1200...
      const jitter = Math.floor(Math.random() * 200);
      await sleep(backoff + jitter);
    }
  }
  throw lastErr;
}


/** ===== GM 출력 품질: 예시(명령) 검증/수정 ===== */

const EXAMPLE_LINE_RE = /^($\s*[1-9]\s*$|[1-9]\s*[.)])\s*/;

function extractExamplesBlock(text: string): { raw: string | null; lines: string[] } {
  const m = text.match(/가능한 명령 예시\s*:\s*([\s\S]*?)$/m);
  if (!m) return { raw: null, lines: [] };

  const raw = m[1].trim();
  const lines = raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);

  return { raw, lines };
}

function countExamples(lines: string[]) {
  return lines.filter((l) => EXAMPLE_LINE_RE.test(l)).length;
}

function normalizeExampleLine(exampleLine: string) {
  return exampleLine.replace(EXAMPLE_LINE_RE, "").trim();
}

function isReactionishExample(exampleLine: string) {
  const badStarts = [
    "클릭",
    "확인",
    "본",
    "봐",
    "열",
    "덮",
    "숨",
    "긴장",
    "떨",
    "망설",
    "생각",
    "걱정",
    "한숨",
    "읽",
    "기다",
    "버틴",
    "버티",
    "피한",
    "피하",
  ];

  const normalized = normalizeExampleLine(exampleLine);
  return badStarts.some((b) => normalized.startsWith(b));
}

function lacksActionTarget(exampleLine: string) {
  const normalized = normalizeExampleLine(exampleLine);

  if (normalized.length < 12) return true;

  const hasTargetHint =
    /에게|한테|께|로|으로|에서|에게서|에\s|메(일|시)지|전화|면담|회의|카톡|DM|메일|보고|제출|요청|정리|수정|예약|작성/.test(
      normalized
    );

  return !hasTargetHint;
}

function gmHasFourBlocks(text: string) {
  const required = ["결과:", "상태변화:", "다음상황:", "가능한 명령 예시:"];
  return required.every((h) => text.includes(h));
}

function clipText(text: string, maxLen = 2200) {
  const t = (text ?? "").trim();
  return t.length > maxLen ? t.slice(0, maxLen).trim() : t;
}

function clipConversation(conv: string, maxLen = 5000) {
  const t = (conv ?? "").trim();
  if (t.length <= maxLen) return t;
  return t.slice(t.length - maxLen);
}

/**
 * 예시가 반응형/게이트형이면 1회 재생성 요청.
 * (속도 때문에: "정말 필요할 때만" 1회)
 */
async function ensureGoodExamplesOrRegenOnce(args: {
  ai: ReturnType<typeof getGeminiClient>;
  system: string;
  conversation: string;
  userText: string;
  draft: string;
}) {
  const { ai, system, conversation, userText, draft } = args;

  const clipped = clipText(draft);

  // 1) 형식이 깨졌으면 재생성 후보
  if (!gmHasFourBlocks(clipped)) {
    return await regenOnce({ ai, system, conversation, userText, reason: "format", fallback: clipped });
  }

  // 2) 예시 블록 추출
  const ex = extractExamplesBlock(clipped);
  if (!ex.raw) {
    return await regenOnce({ ai, system, conversation, userText, reason: "no_examples", fallback: clipped });
  }

  // 3) 예시가 정확히 3개인지
  const exampleLines = ex.lines.filter((l) => EXAMPLE_LINE_RE.test(l)).slice(0, 3);
  if (exampleLines.length !== 3 || countExamples(ex.lines) !== 3) {
    return await regenOnce({ ai, system, conversation, userText, reason: "count", fallback: clipped });
  }

  // 4) 반응형/대상부족 탐지 (여기서만 재생성)
  const bad = exampleLines.some((l) => isReactionishExample(l) || lacksActionTarget(l));
  if (!bad) return clipped;

  return await regenOnce({ ai, system, conversation, userText, reason: "quality", fallback: clipped });
}

async function regenOnce(args: {
  ai: ReturnType<typeof getGeminiClient>;
  system: string;
  conversation: string;
  userText: string;
  reason: "format" | "no_examples" | "count" | "quality";
  fallback: string;
}) {
  const { ai, system, conversation, userText, fallback } = args;

  const regenInstruction = `
너의 직전 출력에서 "가능한 명령 예시"가 반응/게이트 중심이거나, 3개 고정 규칙/대상/채널/목적 조건을 위반했다.
전체 4블록 형식은 유지하되, 특히 "가능한 명령 예시" 3개를 아래 기준으로 다시 작성해라.

[예시 재작성 기준]
- 3개 고정. 반드시 (1) (2) (3)로 시작.
- 각 예시는 "행동 + 대상 + 방식/채널 + 즉시 목적" 포함.
- '클릭/확인/본다/덮는다/긴장한다/망설인다/생각한다' 같은 반응형 동사 금지.
- 3개 예시는 서로 다른 축이어야 함:
  (A) 커리어/성과 (B) 관계/낭만 (C) 자기관리/원칙
- 각 예시는 현실적인 비용/리스크가 다르게 느껴지게.

지금 턴의 플레이어 명령은 아래와 같다:
${userText}
  `.trim();

  const resp2 = await generateWithRetry(ai, {
    model: GEMINI_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              system +
              "\n\n[대화 기록]\n" +
              conversation +
              "\n\n[이번 턴 플레이어 명령]\n" +
              userText +
              "\n\n[추가 지시]\n" +
              regenInstruction +
              "\n\nGM:",
          },
        ],
      },
    ],
  }, {attempts: 2, timeoutMs: 12000 });

  const regenerated = clipText((resp2.text ?? "").trim());
  return regenerated || fallback;
}

// --- 프로토타입용 단순 delta 추정기(명령/자아성취/낭만 키워드 보강) ---
function estimateHappinessDelta(userText: string, valuesProfile: any): number {
  const t = userText.toLowerCase();

  const lex: Record<string, string[]> = {
    stability: ["안정", "저축", "리스크", "불안", "루틴", "예측", "정리", "계획", "확인한다"],
    growth: ["성장", "배우", "연습", "도전", "개선", "공부", "경험", "발표", "피드백", "면담", "제안한다", "시도한다"],
    connection: ["사람", "대화", "연락", "관계", "함께", "가족", "친구", "진심", "사과한다", "고백한다", "만난다"],
    freedom: ["자유", "선택", "내가", "내 시간", "거절", "경계", "주도", "퇴근", "휴가"],
    recognition: ["인정", "성과", "칭찬", "평가", "결과", "증명", "리드", "주도한다"],
    meaning: ["의미", "가치", "후회", "중요", "목적", "나답게", "내 기준", "우선순위"],
    comfort: ["휴식", "쉬", "잠", "회복", "산책", "따뜻", "편안", "밥", "카페"],
    integrity: ["원칙", "정직", "약속", "기준", "책임", "사실대로", "솔직하게"],
    romance: ["데이트", "고백", "설렌", "심쿵", "소개팅", "손잡", "좋아해", "호감", "연애", "약속"],
    career: ["프로젝트", "기획", "보고", "팀장", "회의", "마감", "수정", "자료", "발표", "클라이언트", "상사"],
  };

  const weights: Record<string, number> = valuesProfile?.weights ?? {};
  const top = (valuesProfile?.topValues ?? []) as string[];

  let score = 0;

  for (const [k, words] of Object.entries(lex)) {
    const hit = words.some((w) => t.includes(w.toLowerCase()));
    if (!hit) continue;

    const base = top.includes(k) ? 3 : 1;
    const w = typeof weights[k] === "number" ? weights[k] : 0;
    score += base + Math.min(2, Math.floor(w / 3));
  }

  const actionVerbs = [
    "한다",
    "간다",
    "말한다",
    "보낸다",
    "요청한다",
    "제출한다",
    "정리한다",
    "거절한다",
    "만난다",
    "연락한다",
    "사과한다",
    "예약한다",
    "수정한다",
  ];
  if (actionVerbs.some((w) => t.includes(w))) score += 1;

  const negWords = ["포기", "못해", "불가능", "망했", "최악", "그만", "의미없", "도망", "잠수"];
  if (negWords.some((w) => t.includes(w))) score -= 2;

  if (score <= -2) return -3;
  if (score === -1) return -1;
  if (score === 0) return 0;
  if (score <= 2) return 2;
  if (score <= 4) return 4;
  return 6;
}

/** ========== GET ========== */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : undefined;
  if (!token) return new NextResponse("Missing Authorization", { status: 401 });

  const { searchParams } = new URL(req.url);
  const gameId = searchParams.get("gameId");
  if (!gameId) return new NextResponse("Missing gameId", { status: 400 });

  const supabase = supabaseServerWithAnon(token);
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return new NextResponse("Invalid user", { status: 401 });

  const { data: game, error: gameErr } = await supabase
    .from("games")
    .select("id,happiness,status,user_id")
    .eq("id", gameId)
    .eq("user_id", userData.user.id)
    .single();
  if (gameErr) return new NextResponse(gameErr.message, { status: 400 });

  const { data: msgs, error: msgErr } = await supabase
    .from("messages")
    .select("role,content,happiness_delta,created_at")
    .eq("game_id", gameId)
    .order("created_at", { ascending: true })
    .limit(50);

  if (msgErr) return new NextResponse(msgErr.message, { status: 400 });

  return NextResponse.json({
    happiness: game.happiness,
    status: game.status,
    messages: (msgs ?? []).filter((m) => m.role !== "system").map((m) => ({
      role: m.role,
      content: m.content,
      happinessDelta: m.happiness_delta,
    })),
  });
}

/** ========== POST ========== */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : undefined;
  if (!token) return new NextResponse("Missing Authorization", { status: 401 });

  const supabase = supabaseServerWithAnon(token);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return new NextResponse("Invalid user", { status: 401 });

  const body = PostSchema.parse(await req.json());
  const { gameId, userText } = body;

  const { data: game, error: gameErr } = await supabase
    .from("games")
    .select("id,user_id,happiness,status,values_profile,protagonist")
    .eq("id", gameId)
    .eq("user_id", user.id)
    .single();

  if (gameErr) return new NextResponse(gameErr.message, { status: 400 });

  if (game.status === "finished") {
    return NextResponse.json({
      assistantText:
        "결과: 이미 이야기는 마무리됐다.\n상태변화: 행복 +0\n다음상황: 엔딩 크레딧 뒤, 조용한 월요일 아침이 시작된다.\n가능한 명령 예시: (1) 다시 시작한다 (2) 기록을 읽는다 (3) 조용히 창밖을 본다",
      happiness: game.happiness,
      happinessDelta: 0,
      status: game.status,
    });
  }

  // Save user message
  const { error: insUserErr } = await supabase.from("messages").insert({
    game_id: gameId,
    user_id: user.id,
    role: "user",
    content: userText,
    happiness_delta: 0,
    meta: {},
  });
  if (insUserErr) return new NextResponse(insUserErr.message, { status: 400 });

  // ✅ (1) Pull recent context: 24 -> 16 (속도 개선)
  const { data: history } = await supabase
    .from("messages")
    .select("role,content")
    .eq("game_id", gameId)
    .order("created_at", { ascending: true })
    .limit(10);

  const valuesProfile = game.values_profile as any;
  const valuesProfileText = clipText(JSON.stringify(valuesProfile), 800);
  const protagonist = game.protagonist as any;

  const system = `
너는 "현실 직장/연애 드라마" 텍스트 어드벤처의 진행자(GM)다.
유저는 주인공에게 조언하는 사람이 아니라, 주인공을 직접 조종하는 플레이어다.
유저 입력은 "명령"이다.

[톤/장르]
- 배경: 서울 직장인 일상 (과장된 판타지/초능력/비현실적 사건 금지)
- 목표 정서: 낭만 + 자아성취 (성장/일/관계의 균형)
- 텍스트는 짧고 선명하게. 감정상담/훈계/장문 위로 금지.

[주인공 설정]
- 나이대: ${protagonist?.ageBand ?? "30s"}
- 직업: ${protagonist?.dayJob ?? "사무직"}
- 성격 톤: ${protagonist?.tone ?? "warm"}
- 한 줄: ${protagonist?.oneLine ?? ""}

[가치관(행복관) 프로필]
${JSON.stringify(valuesProfileText, null, 2)}

[진행 규칙]
1) 매 턴 너는 반드시 아래 4개 블록을 "정확히" 출력한다. 다른 문장/해설/규칙 설명을 추가하지 마라.
- 결과: (2~5문장)
- 상태변화: (한 줄)
- 다음상황: (2~5문장, 반드시 갈림길)
- 가능한 명령 예시: (3개, (1)(2)(3), 동사로 시작)

2) 유저 입력이 명령처럼 보이지 않으면, 너는 그 문장을 "의도/행동"으로 변환해 명령으로 간주하고 진행한다.
3) 유저의 명령을 무시하지 말고, 반드시 결과에 반영한다.
4) 다음상황은 '업무/연애/자기관리' 중 2개 이상 축을 동시에 건드리면 더 좋다.

[선택 설계 규칙 - 매우 중요]
- "클릭한다/본다/확인한다/덮는다" 같은 '확인 게이트'를 갈림길 중심으로 두지 마라.
- 가능한 명령 예시는 반드시 "행동 + 대상 + 방식/채널 + 즉시 목적"을 포함한다.
- 3개 예시는 서로 다른 축:
  (A) 커리어/성과  (B) 관계/낭만  (C) 자기관리/원칙
- 폭력/범죄 조장, 노골적 성적 묘사, 자해 유도 금지.
  `.trim();

  const conversationRaw = (history ?? [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => `${m.role === "user" ? "플레이어(명령)" : "GM"}: ${m.content}`)
    .join("\n");

  // ✅ (2) conversation clip: 최근 2500자만 전달 (속도 개선)
  const conversation = clipConversation(conversationRaw, 2500);

  const delta = estimateHappinessDelta(userText, valuesProfile);

  const ai = getGeminiClient();
  const reqArgs = {
    model: GEMINI_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              system +
              "\n\n[대화 기록]\n" +
              conversation +
              "\n\n[이번 턴 플레이어 명령]\n" +
              userText +
              "\n\nGM:",
          },
        ],
      },
    ],
  };
  const resp = await generateWithRetry(ai, reqArgs, { attempts: 3, timeoutMs: 12000 });
  const draft = (resp.text ?? "").trim();

  // ✅ (4) format이 깨졌을때만 재생성
  let assistantText = clipText(draft);
  if (!gmHasFourBlocks(assistantText)) {
    assistantText = await regenOnce({ ai, system, conversation, userText, reason: "format", fallback: assistantText });
  }


  const newHappiness = clamp((game.happiness ?? 0) + delta, 0, 100);
  const newStatus = newHappiness >= 100 ? "finished" : "active";

  // Save assistant message
  const { error: insAIErr } = await supabase.from("messages").insert({
    game_id: gameId,
    user_id: user.id,
    role: "assistant",
    content: assistantText,
    happiness_delta: delta,
    meta: { model: GEMINI_MODEL, mode: "gm" },
  });
  if (insAIErr) return new NextResponse(insAIErr.message, { status: 400 });

  // Update game
  const { error: upErr } = await supabase
    .from("games")
    .update({ happiness: newHappiness, status: newStatus })
    .eq("id", gameId)
    .eq("user_id", user.id);

  if (upErr) return new NextResponse(upErr.message, { status: 400 });

  return NextResponse.json({
    assistantText,
    happiness: newHappiness,
    happinessDelta: delta,
    status: newStatus,
  });
}
