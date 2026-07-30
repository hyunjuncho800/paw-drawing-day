import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const COMICS_BUCKET = "comics";

export class AuthError extends Error {}

function getSupabaseEnv(): { url: string; key: string } {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_ANON_KEY가 설정되지 않았어요. .env.local을 확인해주세요.",
    );
  }
  return { url, key };
}

/**
 * 요청의 Authorization 헤더에 담긴 로그인 사용자의 access token을 검증하고,
 * 그 사용자로 인증된(=RLS의 auth.uid()가 채워지는) Supabase 클라이언트를 만든다.
 * user_id는 클라이언트가 보낸 값을 절대 그대로 믿지 않고, 여기서 검증된 값만 사용한다.
 */
export async function getAuthenticatedUser(
  request: Request,
): Promise<{ client: SupabaseClient; userId: string; email: string | null }> {
  const authHeader = request.headers.get("authorization");
  const accessToken = authHeader?.replace(/^Bearer\s+/i, "").trim();

  if (!accessToken) {
    throw new AuthError("로그인이 필요해요.");
  }

  const { url, key } = getSupabaseEnv();
  const client = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) {
    throw new AuthError("로그인 정보가 올바르지 않아요. 다시 로그인해주세요.");
  }

  return { client, userId: data.user.id, email: data.user.email ?? null };
}
