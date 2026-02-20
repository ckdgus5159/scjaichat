import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
console.log("SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log("ANON_KEY head", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.slice(0, 12));

export const supabaseBrowser = createClient(url, anon);
