import { NextResponse } from "next/server";
import { getAuthenticatedUser, AuthError } from "@/lib/supabase";
import { findTodayEntry, isAdminEmail } from "@/lib/dailyLimit";

export const runtime = "nodejs";

/** 오늘(KST) 이미 만화를 만들었는지 확인한다.
 * 화면 진입 시 이 결과로 입력 폼 대신 "오늘의 기록 다시보기"를 보여줄지 결정한다. */
export async function GET(request: Request) {
  try {
    const { client: supabase, userId, email } = await getAuthenticatedUser(request);

    if (isAdminEmail(email)) {
      return NextResponse.json({ limited: false, isAdmin: true, entry: null, nextResetAt: null });
    }

    const { entry, nextResetAt } = await findTodayEntry(supabase, userId);

    return NextResponse.json({
      limited: Boolean(entry),
      isAdmin: false,
      entry,
      nextResetAt: entry ? nextResetAt : null,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
