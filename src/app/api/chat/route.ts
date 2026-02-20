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
  const timeoutMs = opts?.timeoutMs ?? 12_000;

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

  const resp2 = await generateWithRetry(
    ai,
    {
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
    },
    { attempts: 2, timeoutMs: 20_000 }
  );

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

// ✅ 5스탯(머니/관계/평판/건강) delta: 단순 키워드 휴리스틱 (초기 버전)
function estimateStatsDelta(userText: string) {
  const t = userText.toLowerCase();

  let money = 0;
  let relationship = 0;
  let reputation = 0;
  let health = 0;

  // money
  if (/(저축|절약|예산|가계부|정리|상환|협상|환불)/.test(t)) money += 2;
  if (/(대출|빚|연체|충동구매|질렀|결제|손실|파산)/.test(t)) money -= 2;
  if (/(연봉|인상|보너스|수입|알바|부업|이직)/.test(t)) money += 1;
  if (/(주식|코인|레버리지)/.test(t)) money -= 1;

  // relationship
  if (/(연락|대화|만나|데이트|사과|화해|고백|배려|선물)/.test(t)) relationship += 2;
  if (/(잠수|무시|차단|싸우|비난|뒷담|끝내)/.test(t)) relationship -= 2;

  // reputation
  if (/(보고|공유|정리|기여|책임|약속|리드|발표|성과|납기|마감)/.test(t)) reputation += 2;
  if (/(지각|무단|핑계|거짓말|대충|땡땡|회피)/.test(t)) reputation -= 2;

  // health
  if (/(운동|산책|수면|잠|휴식|회복|검진|상담|치료)/.test(t)) health += 2;
  if (/(야근|밤샘|과로|폭식|술|담배|두통|불면)/.test(t)) health -= 2;

  // 너무 크게 튀지 않게 제한
  money = clamp(money, -3, 3);
  relationship = clamp(relationship, -3, 3);
  reputation = clamp(reputation, -3, 3);
  health = clamp(health, -3, 3);

  return { money, relationship, reputation, health };
}

/** ===================== 가치관 충돌 판정 ===================== */

type ConflictLevel = "none" | "soft" | "hard";
type ActionTag =
  | "dishonesty"
  | "betrayal"
  | "ghosting"
  | "reckless_spending"
  | "crime_violence"
  | "overwork"
  | "substance"
  | "selfcare"
  | "career_push"
  | "romance_push";

function classifyAction(userText: string): ActionTag[] {
  const t = userText.toLowerCase();
  const tags: ActionTag[] = [];

  if (/(거짓말|속이|조작|위조|핑계|뻥)/.test(t)) tags.push("dishonesty");
  if (/(바람|양다리|환승|배신|뒷담|모함)/.test(t)) tags.push("betrayal");
  if (/(잠수|차단|읽씹|안읽|무시)/.test(t)) tags.push("ghosting");
  if (/(충동구매|질렀|할부|카드론|도박|올인|레버리지)/.test(t)) tags.push("reckless_spending");
  if (/(폭행|협박|스토킹|절도|사기|불법)/.test(t)) tags.push("crime_violence");
  if (/(밤샘|연속 야근|과로|주말출근|휴가반납)/.test(t)) tags.push("overwork");
  if (/(과음|폭음|담배|약물)/.test(t)) tags.push("substance");

  if (/(운동|수면|휴식|회복|상담|치료|검진)/.test(t)) tags.push("selfcare");
  if (/(보고|발표|면담|제안|성과|마감|프로젝트|이직|협상)/.test(t)) tags.push("career_push");
  if (/(고백|데이트|만나|연락|사과|화해|약속|소개팅)/.test(t)) tags.push("romance_push");

  return Array.from(new Set(tags));
}

function checkValueConflict(valuesProfile: any, tags: ActionTag[]): { level: ConflictLevel; reason: string } {
  // valuesProfile 형태가 아직 고정이 아니니, "topValues/weights" 기반으로 완만하게.
  const top = new Set<string>((valuesProfile?.topValues ?? []) as string[]);
  const weights = (valuesProfile?.weights ?? {}) as Record<string, number>;

  const integrityStrong = top.has("integrity") || (weights.integrity ?? 0) >= 7;
  const stabilityStrong = top.has("stability") || (weights.stability ?? 0) >= 7;
  const comfortStrong = top.has("comfort") || (weights.comfort ?? 0) >= 7;
  const freedomStrong = top.has("freedom") || (weights.freedom ?? 0) >= 7;
  const meaningStrong = top.has("meaning") || (weights.meaning ?? 0) >= 7;

  // hard: 원칙(정직/약속)을 핵심으로 두는데 거짓말/불법/배신
  if (integrityStrong && (tags.includes("dishonesty") || tags.includes("crime_violence") || tags.includes("betrayal"))) {
    return { level: "hard", reason: "주인공의 핵심 가치(정직/원칙)와 정면으로 충돌" };
  }

  // hard: 안정이 핵심인데 도박/올인/레버리지/카드론 류
  if (stabilityStrong && tags.includes("reckless_spending")) {
    return { level: "hard", reason: "주인공의 핵심 가치(안정/리스크 회피)와 정면으로 충돌" };
  }

  // soft: 편안/회복이 핵심인데 과로/폭음
  if (comfortStrong && (tags.includes("overwork") || tags.includes("substance"))) {
    return { level: "soft", reason: "회복/안정 욕구와 충돌(성공하더라도 후유증)" };
  }

  // soft: 자유가 핵심인데 관계에 과하게 얽매이는 선택(이건 과하지 않게 soft만)
  if (freedomStrong && tags.includes("romance_push")) {
    return { level: "soft", reason: "자율/경계 욕구와 충돌(관계는 전진하되 답답함/피로)" };
  }

  // soft: 의미가 핵심인데 편법/지름길(거짓말까지는 아니더라도)류
  if (meaningStrong && tags.includes("dishonesty")) {
    return { level: "soft", reason: "의미/자기기준과 충돌(성과는 나도 마음이 찝찝)" };
  }

  return { level: "none", reason: "" };
}

/** ===================== stage(단계) 추론 & 시간점프 프롬프트 ===================== */

type Stage =
  | "student"
  | "job_seeker"
  | "employee_junior"
  | "employee_mid"
  | "manager"
  | "pre_marriage"
  | "married"
  | "unknown";

function inferStage(protagonist: any, valuesProfile: any): Stage {
  const blob = [
    protagonist?.dayJob,
    protagonist?.oneLine,
    JSON.stringify(protagonist ?? {}),
    JSON.stringify(valuesProfile ?? {}),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/(대학|캠퍼스|수강|학점|과제|동아리|전공|새내기|1학년|2학년|3학년|4학년)/.test(blob)) return "student";
  if (/(취준|취업|자소서|면접|인턴|포트폴리오|공채|서류)/.test(blob)) return "job_seeker";
  if (/(사원|대리|주임|인턴|팀|프로젝트|보고|회의|마감|상사|팀장)/.test(blob)) return "employee_junior";
  if (/(과장|차장|파트장|리드|리더|책임자)/.test(blob)) return "employee_mid";
  if (/(부장|임원|본부장|센터장|이사)/.test(blob)) return "manager";
  if (/(결혼\s*준비|상견례|예식장|신혼|청첩장)/.test(blob)) return "pre_marriage";
  if (/(기혼|아내|남편|배우자|신혼)/.test(blob)) return "married";

  return "unknown";
}

function buildTimeJumpInstruction(args: {
  stage: Stage;
  timePhase: number;
  turnAfterIncrement: number;
}) {
  const { stage, timePhase, turnAfterIncrement } = args;

  // timePhase가 올라갈수록 “단계 전진”을 강하게 요구
  // (모델이 알아서 1~5년을 고르게 하도록, 범위/필수 요소를 명문화)
  const stageHint =
    stage === "student"
      ? "대학생(학년/진로/연애/동아리/인턴 가능)"
      : stage === "job_seeker"
        ? "취업준비생(면접/합격/불합격/공백/관계 변화 가능)"
        : stage === "employee_junior"
          ? "주니어 직장인(프로젝트/평가/연봉/승진/연애 현실문제 가능)"
          : stage === "employee_mid"
            ? "중간관리/리드(승진/성과압박/팀 갈등/건강 누적 가능)"
            : stage === "manager"
              ? "관리자/리더(조직개편/책임/평판/가정 이슈 가능)"
              : stage === "pre_marriage"
                ? "결혼준비(돈/관계/가족/일 균형 갈등 가능)"
                : stage === "married"
                  ? "기혼(가정/일/건강의 장기 균형 가능)"
                  : "단계 불명(서사에 맞게 합리적으로 설정)";

  return `
[시간 점프(필수) - 지금 턴에 반드시 수행]
- 이번 턴은 유저 명령 처리 이후 '5턴 단위 시간 점프' 발생 턴이다. (turn=${turnAfterIncrement}, time_phase=${timePhase})
- 너는 "결과:" 블록에서 시간 점프를 반드시 실행해야 한다.
- 점프 폭은 최소 1년 ~ 최대 5년 사이. (예: 1년, 2년 반, 3년, 4년, 5년)
- 단, 점프는 단순 요약이 아니라 '인생 단계가 전진'하는 사건을 동반해야 한다.
- 현재 주인공 단계 힌트: ${stageHint}
- 결과(시간 점프 요약)는 3~6문장:
  (1) 시간 경과(몇 년/몇 달) 명시
  (2) 커리어/학업의 변화 1개
  (3) 관계(연애/우정/가족) 변화 1개
  (4) 건강/생활습관의 누적 결과 1개(좋거나 나쁘거나)
  (5) 돈/평판 중 1개에 흔적
- "다음상황:"은 점프 이후 새 국면의 갈등으로 시작하며, 2개 이상의 축(업무/연애/자기관리)을 동시에 건드려라.
- 유저 명령을 무효화하지 말고, 명령의 결과가 '점프 이후의 현재 상태'에 흔적으로 남게 만들어라.
`.trim();
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
    .select("id,happiness,status,user_id,money,relationship,reputation,health,turn,time_phase")
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
    turn: game.turn ?? 0,
    timePhase: game.time_phase ?? 0,
    stats: {
      money: game.money ?? 50,
      relationship: game.relationship ?? 50,
      reputation: game.reputation ?? 50,
      health: game.health ?? 50,
    },
    messages: (msgs ?? [])
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role,
        content: m.content,
        happinessDelta: m.happiness_delta,
      })),
  });
}

/** ========== POST ========== */
export async function POST(req: Request) {
  try {
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

    console.log("[/api/chat POST]", { gameId, userTextLen: userText?.length, model: GEMINI_MODEL });

    const { data: game, error: gameErr } = await supabase
      .from("games")
      // ✅ turn/time_phase 포함해서 읽기
      .select(
        "id,user_id,happiness,status,values_profile,protagonist,money,relationship,reputation,health,turn,time_phase"
      )
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
        stats: {
          money: game.money ?? 50,
          relationship: game.relationship ?? 50,
          reputation: game.reputation ?? 50,
          health: game.health ?? 50,
        },
        statsDelta: { money: 0, relationship: 0, reputation: 0, health: 0 },
      });
    }

    const valuesProfile = game.values_profile as any;
    const valuesProfileText = clipText(JSON.stringify(valuesProfile ?? {}), 800);

    // protagonist / stage 보강
    const protagonist = (game.protagonist ?? {}) as any;
    const stage: Stage = (protagonist?.stage as Stage) || inferStage(protagonist, valuesProfile);

    // stage가 비어있으면 저장(최소 1회)
    if (!protagonist?.stage && stage !== "unknown") {
      const nextProtagonist = { ...(protagonist ?? {}), stage };
      // stage 저장 실패해도 게임 진행은 가능하므로 에러는 흘림
      await supabase
        .from("games")
        .update({ protagonist: nextProtagonist })
        .eq("id", gameId)
        .eq("user_id", user.id);
    }

    // ===== 가치관 충돌 판정 =====
    const tags = classifyAction(userText);
    const conflict = checkValueConflict(valuesProfile, tags);

    // Save user message
    const { error: insUserErr } = await supabase.from("messages").insert({
      game_id: gameId,
      user_id: user.id,
      role: "user",
      content: userText,
      happiness_delta: 0,
      meta: { conflict, tags },
    });
    if (insUserErr) return new NextResponse(insUserErr.message, { status: 400 });

    // 최근 10개 히스토리: desc로 가져오고 reverse로 원래 순서 복구
    const { data: historyDesc, error: histErr } = await supabase
      .from("messages")
      .select("role,content,created_at")
      .eq("game_id", gameId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (histErr) return new NextResponse(histErr.message, { status: 400 });

    const history = (historyDesc ?? []).reverse();

    const systemBase = `
너는 "현실 직장/연애 드라마" 텍스트 어드벤처의 진행자(GM)다.
유저는 주인공에게 조언하는 사람이 아니라, 주인공을 직접 조종하는 플레이어다.
유저 입력은 "명령"이다.

[톤/장르]
- 배경: 서울 현실 기반 (과장된 판타지/초능력/비현실적 사건 금지)
- 목표 정서: 낭만 + 자아성취 (성장/일/관계의 균형)
- 텍스트는 짧고 선명하게. 감정상담/훈계/장문 위로 금지.

[주인공 설정]
- 나이대: ${protagonist?.ageBand ?? "30s"}
- 직업/트랙: ${protagonist?.dayJob ?? "사무직"}
- 성격 톤: ${protagonist?.tone ?? "warm"}
- 한 줄: ${protagonist?.oneLine ?? ""}
- 현재 단계(stage): ${stage}

[가치관(행복관) 프로필(요약)]
${valuesProfileText}

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

[가치관 충돌 처리 - 매우 중요]
- 아래 입력은 시스템이 감지한 '가치관 충돌' 상태다.
- conflict.level이 "hard"면: 이 턴의 명령은 현실적 이유로 '실패 확정'이다.
  (예: 들키거나, 주인공이 끝내 못 하거나, 상황이 역풍으로 돌아오거나)
- conflict.level이 "soft"면: 명령은 '성공'하지만 부작용/후유증/관계 균열/건강 악화 같은 대가가 따라야 한다.
- conflict.level이 "none"이면: 정상 진행.
  `.trim();

    const conversationRaw = (history ?? [])
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => `${m.role === "user" ? "플레이어(명령)" : "GM"}: ${m.content}`)
      .join("\n");

    const conversation = clipConversation(conversationRaw, 2500);

    // ===== turn/time_phase 계산 (유저 명령 1회당 turn+1) =====
    const prevTurn = typeof game.turn === "number" ? game.turn : 0;
    const prevTimePhase = typeof game.time_phase === "number" ? game.time_phase : 0;

    const turnAfter = prevTurn + 1;
    const isTimeJumpTurn = turnAfter % 5 === 0;
    const timePhaseAfter = isTimeJumpTurn ? prevTimePhase + 1 : prevTimePhase;

    const timeJumpInstruction = isTimeJumpTurn
      ? buildTimeJumpInstruction({ stage, timePhase: timePhaseAfter, turnAfterIncrement: turnAfter })
      : "";

    const conflictInstruction = `
[conflict signal]
- conflict.level: ${conflict.level}
- conflict.reason: ${conflict.reason || "(none)"}
- action.tags: ${tags.length ? tags.join(", ") : "(none)"}
`.trim();

    const system = [systemBase, conflictInstruction, timeJumpInstruction].filter(Boolean).join("\n\n");

    // ===== delta 계산 =====
    let happinessDelta = estimateHappinessDelta(userText, valuesProfile);
    const baseStatsDelta = estimateStatsDelta(userText);

    // 충돌 레벨에 따른 페널티/가중
    // - hard: 실패 확정이므로, 행복을 깎고(혹은 성취감 상실), 평판/관계/돈/건강 중 태그에 맞게 추가 페널티
    // - soft: 성공하지만 후유증 → 건강/관계/평판에 약한 페널티를 추가
    let statsDelta = { ...baseStatsDelta };

    if (conflict.level === "hard") {
      happinessDelta = clamp(happinessDelta - 4, -10, 10);

      if (tags.includes("dishonesty")) statsDelta.reputation = clamp(statsDelta.reputation - 2, -3, 3);
      if (tags.includes("crime_violence")) statsDelta.reputation = clamp(statsDelta.reputation - 3, -3, 3);
      if (tags.includes("betrayal") || tags.includes("ghosting"))
        statsDelta.relationship = clamp(statsDelta.relationship - 3, -3, 3);
      if (tags.includes("reckless_spending")) statsDelta.money = clamp(statsDelta.money - 3, -3, 3);
    } else if (conflict.level === "soft") {
      happinessDelta = clamp(happinessDelta - 1, -10, 10);

      if (tags.includes("overwork")) statsDelta.health = clamp(statsDelta.health - 2, -3, 3);
      if (tags.includes("substance")) statsDelta.health = clamp(statsDelta.health - 2, -3, 3);
      // 관계 밀어붙이기 soft 충돌은 관계 + 이득을 유지하되 피로/평판 리스크를 약간 부여
      if (tags.includes("romance_push")) statsDelta.reputation = clamp(statsDelta.reputation - 1, -3, 3);
    }

    // time jump 턴에는 변화폭이 “조금 더 누적”되는 느낌을 주기 위해 statsDelta를 완만하게 가중(선택)
    // 너무 튀지 않게 +1 정도만 보정
    if (isTimeJumpTurn) {
      // 장기 경과는 건강/돈/평판에 더 크게 흔적이 남는 편
      statsDelta.money = clamp(statsDelta.money + (statsDelta.money > 0 ? 1 : 0), -3, 3);
      statsDelta.reputation = clamp(statsDelta.reputation + (statsDelta.reputation > 0 ? 1 : 0), -3, 3);
      statsDelta.health = clamp(statsDelta.health + (statsDelta.health < 0 ? -1 : 0), -3, 3);
      // happinessDelta는 그대로 두되, hard 충돌이면 이미 깎임
    }

    // 새 값 계산(진짜 값)
    const newMoney = clamp((game.money ?? 50) + statsDelta.money, 0, 100);
    const newRelationship = clamp((game.relationship ?? 50) + statsDelta.relationship, 0, 100);
    const newReputation = clamp((game.reputation ?? 50) + statsDelta.reputation, 0, 100);
    const newHealth = clamp((game.health ?? 50) + statsDelta.health, 0, 100);

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

    const resp = await generateWithRetry(ai, reqArgs, { attempts: 2, timeoutMs: 20_000 });
    const draft = (resp.text ?? "").trim();

    // 형식이 깨졌을 때만 1회 재생성
    let assistantText = clipText(draft);

    let needsRegen = false;

    if (assistantText && !gmHasFourBlocks(assistantText)) {
      needsRegen = true;
    } else {
      const ex = extractExamplesBlock(assistantText);
      if (!ex.raw) needsRegen = true;
      else {
        const c = countExamples(ex.lines);
        if (c !== 3) needsRegen = true;
        const firstThree = ex.lines.filter((l) => EXAMPLE_LINE_RE.test(l)).slice(0, 3);
        if (firstThree.length !== 3) needsRegen = true;
        if (firstThree.some((l) => isReactionishExample(l) || lacksActionTarget(l))) needsRegen = true;
      }
    }

    if (assistantText && needsRegen) {
      assistantText = await regenOnce({
        ai,
        system,
        conversation,
        userText,
        reason: "quality",
        fallback: assistantText,
      });
    }

    const newHappiness = clamp((game.happiness ?? 0) + happinessDelta, 0, 100);
    const newStatus = newHappiness >= 100 ? "finished" : "active";

    // Save assistant message
    const { error: insAIErr } = await supabase.from("messages").insert({
      game_id: gameId,
      user_id: user.id,
      role: "assistant",
      content: assistantText,
      happiness_delta: happinessDelta,
      meta: {
        model: GEMINI_MODEL,
        mode: "gm",
        conflict,
        tags,
        timeJump: isTimeJumpTurn,
        turn: turnAfter,
        timePhase: timePhaseAfter,
      },
    });
    if (insAIErr) return new NextResponse(insAIErr.message, { status: 400 });

    // ✅ Update game: happiness + stats + turn/time_phase 저장
    const { error: upErr } = await supabase
      .from("games")
      .update({
        happiness: newHappiness,
        status: newStatus,
        money: newMoney,
        relationship: newRelationship,
        reputation: newReputation,
        health: newHealth,
        turn: turnAfter,
        time_phase: timePhaseAfter,
      })
      .eq("id", gameId)
      .eq("user_id", user.id);

    if (upErr) return new NextResponse(upErr.message, { status: 400 });

    return NextResponse.json({
      assistantText,
      happiness: newHappiness,
      happinessDelta,
      status: newStatus,
      stats: {
        money: newMoney,
        relationship: newRelationship,
        reputation: newReputation,
        health: newHealth,
      },
      statsDelta,
      turn: turnAfter,
      timePhase: timePhaseAfter,
      timeJump: isTimeJumpTurn,
      conflict,
    });
  } catch (e: any) {
    const status = e?.status ?? e?.cause?.status ?? e?.response?.status;

    if (status === 503 || status === 429 || e?.message === "gemini_timeout") {
      console.error("[/api/chat POST] gemini unavailable", {
        status,
        message: e?.message,
      });
      return new NextResponse("Model overloaded. Please retry.", { status: 503 });
    }

    console.error("[/api/chat POST] unhandled error", e);
    return new NextResponse("Internal error", { status: 500 });
  }
}
