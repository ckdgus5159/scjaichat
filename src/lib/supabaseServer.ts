import { createClient } from "@supabase/supabase-js";

export function supabaseServerWithAnon(accessToken?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // accessToken이 있으면 Authorization 헤더로 RLS를 "해당 유저"로 동작시킴
  return createClient(url, anon, {
    global: accessToken
      ? { headers: { Authorization: `Bearer ${accessToken}` } }
      : undefined,
  });
}
//