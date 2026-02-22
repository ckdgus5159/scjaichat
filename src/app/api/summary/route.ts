import { NextResponse } from "next/server";
import { supabaseServerWithAnon } from "@/lib/supabaseServer";
import { getGeminiClient, GEMINI_MODEL } from "@/lib/gemini";

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : undefined;
  if (!token) return new NextResponse("Missing Auth", { status: 401 });

  const supabase = supabaseServerWithAnon(token);
  const { gameId } = await req.json();

  const { data: msgs } = await supabase.from("messages").select("role, content").eq("game_id", gameId).order("created_at", { ascending: true });
  if (!msgs || msgs.length === 0) return NextResponse.json({ summary: "대화 기록이 없습니다." });

  // 대화 내용을 하나의 텍스트로 합침 (토큰 수 최적화)
  const fullHistory = msgs.map(m => `${m.role === 'user' ? '나의 선택:' : 'GM결과:'} ${m.content}`).join("\n");

  const prompt = `
너는 플레이어의 대학 생활을 아름다운 회고록(자서전)으로 작성해주는 AI 작가다.
아래는 플레이어가 시뮬레이션 동안 겪었던 대화 기록이다.
이 기록을 바탕으로 플레이어가 어떤 위기를 겪고 어떤 가치관으로 선택을 내렸는지 분석하여, 최종적으로 어떤 의미 있는 삶을 살게 되었는지 1인칭 관점('나')으로 서술해라.
분량은 반드시 1000자 이내로 맞추고, 감동적이고 서정적인 문체로 작성하라.

[대화 기록]
${fullHistory.substring(0, 15000)}
`.trim();

  try {
    const ai = getGeminiClient();
    const resp = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }]
    });
    return NextResponse.json({ summary: resp.text || "요약 작성에 실패했습니다." });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}