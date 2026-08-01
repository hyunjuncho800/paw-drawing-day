import type { SupabaseClient } from "@supabase/supabase-js";

/** 하루 1회 제한에서 예외로 두는 관리자 이메일 목록.
 * 관리자가 여러 명 필요해지면 그때 role/관리자 테이블로 옮기면 된다. */
const ADMIN_EMAILS = ["ft6f@naver.com"];

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 서버가 어느 타임존에서 돌아가든 상관없이, "지금" 시각 기준 KST 하루(자정~다음날 자정)의
 * 시작/끝을 UTC ISO 문자열로 계산한다. UTC epoch 기반으로 계산해 서버 로컬 타임존에 영향받지 않는다. */
export function getKstDayRange(now: Date = new Date()): {
  startUtcIso: string;
  endUtcIso: string;
} {
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  const y = kstNow.getUTCFullYear();
  const m = kstNow.getUTCMonth();
  const d = kstNow.getUTCDate();

  // "KST y-m-d 00:00:00"에 해당하는 실제 UTC 시각 = 그 날짜의 UTC 자정에서 9시간을 뺀 값.
  const startUtcMs = Date.UTC(y, m, d, 0, 0, 0) - KST_OFFSET_MS;
  const endUtcMs = startUtcMs + 24 * 60 * 60 * 1000;

  return {
    startUtcIso: new Date(startUtcMs).toISOString(),
    endUtcIso: new Date(endUtcMs).toISOString(),
  };
}

export type TodayEntry = {
  id: string;
  dog_name: string;
  diary_text: string;
  comic_json: unknown;
  image_url: string | null;
  image_url_final: string | null;
  created_at: string;
};

/** 이 사용자가 오늘(KST) 이미 만든 만화가 있는지 확인한다.
 * 있으면 그 기록과, 다음에 다시 만들 수 있어지는 시각(다음날 KST 자정, UTC ISO)을 함께 돌려준다. */
export async function findTodayEntry(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ entry: TodayEntry | null; nextResetAt: string }> {
  const { startUtcIso, endUtcIso } = getKstDayRange();

  const { data, error } = await supabase
    .from("diary_entries")
    .select("id, dog_name, diary_text, comic_json, image_url, image_url_final, created_at")
    .eq("user_id", userId)
    .gte("created_at", startUtcIso)
    .lt("created_at", endUtcIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return { entry: (data as TodayEntry | null) ?? null, nextResetAt: endUtcIso };
}
