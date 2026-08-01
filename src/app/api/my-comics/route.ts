import { NextResponse } from "next/server";
import { getAuthenticatedUser, AuthError } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { client: supabase, userId } = await getAuthenticatedUser(request);

    const { data, error } = await supabase
      .from("diary_entries")
      .select("id, dog_name, diary_text, comic_json, image_url, image_url_final, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ entries: data ?? [] });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
