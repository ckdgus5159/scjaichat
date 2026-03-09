import { NextResponse } from "next/server";
import { supabaseServerWithAnon } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : undefined;
  if (!token) return new NextResponse("Missing Auth", { status: 401 });

  const supabase = supabaseServerWithAnon(token);
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return new NextResponse("Invalid user", { status: 401 });

  const { gameId } = await req.json();

  // 해당 게임의 모든 메시지를 시간순으로 가져오기
  const { data: msgs } = await supabase
    .from("messages")
    .select("id, role, meta")
    .eq("game_id", gameId)
    .order("created_at", { ascending: true });

  if (!msgs || msgs.length <= 1) {
    return NextResponse.json({ error: "되돌릴 수 있는 대화가 없습니다." }, { status: 400 });
  }

  // 마지막 유저(user) 메시지의 인덱스 찾기
  let lastUserIndex = -1;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "user") {
      lastUserIndex = i;
      break;
    }
  }

  if (lastUserIndex === -1) {
    return NextResponse.json({ error: "되돌릴 수 있는 대화가 없습니다." }, { status: 400 });
  }

  // 삭제할 메시지 ID 목록 (마지막 유저 메시지 + 그 이후에 생성된 GM 메시지 모두 포함)
  const idsToDelete = msgs.slice(lastUserIndex).map(m => m.id);

  // 직전 상태(스탯) 복구용 데이터 (마지막 유저 메시지 바로 이전의 GM 오프닝/답변)
  const prevMsg = msgs[lastUserIndex - 1];
  const prevStats = prevMsg?.meta?.stats || { money: 50, relationship: 50, reputation: 50, health: 50, happiness: 0 };

  // 1. DB에서 잘못된/취소할 메시지들 완전 삭제
  await supabase.from("messages").delete().in("id", idsToDelete);

  // 2. 게임 스탯 롤백 및 상태 활성화 (엔딩이 났더라도 다시 플레이 상태로 복구)
  await supabase.from("games").update({
    money: prevStats.money,
    relationship: prevStats.relationship,
    reputation: prevStats.reputation,
    health: prevStats.health,
    happiness: prevStats.happiness,
    status: "active" 
  }).eq("id", gameId);

  return NextResponse.json({ success: true, stats: prevStats });
}