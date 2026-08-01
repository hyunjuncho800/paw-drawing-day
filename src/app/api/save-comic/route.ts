import { NextResponse } from "next/server";
import { getAuthenticatedUser, AuthError, COMICS_BUCKET } from "@/lib/supabase";

export const runtime = "nodejs";

type RequestBody = {
  dogName?: unknown;
  diaryText?: unknown;
  comicJson?: unknown;
  imageDataUrl?: unknown;
  imageDataUrlFinal?: unknown;
};

function parseDataUrl(dataUrl: string): { buffer: Buffer; contentType: string; extension: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("이미지 데이터 형식이 올바르지 않아요.");
  }
  const contentType = match[1];
  const buffer = Buffer.from(match[2], "base64");
  const extension = contentType.split("/")[1] ?? "png";
  return { buffer, contentType, extension };
}

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 본문을 읽을 수 없어요." }, { status: 400 });
  }

  const dogName = typeof body.dogName === "string" ? body.dogName.trim() : "";
  const diaryText = typeof body.diaryText === "string" ? body.diaryText.trim() : "";
  const imageDataUrl = typeof body.imageDataUrl === "string" ? body.imageDataUrl : "";
  const imageDataUrlFinal =
    typeof body.imageDataUrlFinal === "string" ? body.imageDataUrlFinal : "";
  const comicJson = body.comicJson;

  if (!dogName || !diaryText || !imageDataUrl || !comicJson) {
    return NextResponse.json(
      { error: "저장에 필요한 정보(dogName/diaryText/comicJson/imageDataUrl)가 부족해요." },
      { status: 400 },
    );
  }

  try {
    // userId는 클라이언트가 보낸 값을 쓰지 않고, 로그인 토큰에서 검증된 값만 사용한다.
    const { client: supabase, userId } = await getAuthenticatedUser(request);

    // 같은 사용자가 짧은 시간 안에 같은 일기 내용으로 다시 제출하면(재시도/중복 클릭 등)
    // 새 이미지를 또 생성/저장하지 않고 방금 저장된 항목을 그대로 반환한다.
    const dedupWindowStart = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recentDuplicate } = await supabase
      .from("diary_entries")
      .select("id, created_at, image_url, image_url_final")
      .eq("user_id", userId)
      .eq("diary_text", diaryText)
      .gte("created_at", dedupWindowStart)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentDuplicate) {
      return NextResponse.json({
        id: recentDuplicate.id,
        createdAt: recentDuplicate.created_at,
        imageUrl: recentDuplicate.image_url,
        imageUrlFinal: recentDuplicate.image_url_final,
        deduplicated: true,
      });
    }

    const { buffer, contentType, extension } = parseDataUrl(imageDataUrl);

    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from(COMICS_BUCKET)
      .upload(path, buffer, { contentType, upsert: false });

    if (uploadError) {
      throw new Error(`이미지 업로드 실패: ${uploadError.message}`);
    }

    const { data: publicUrlData } = supabase.storage.from(COMICS_BUCKET).getPublicUrl(path);
    const imageUrl = publicUrlData.publicUrl;

    // 완성본(그림+대사 텍스트가 합쳐진 이미지)은 있으면 별도 경로에 함께 저장한다.
    // 실패해도 원본 저장/전체 흐름은 막지 않고, 완성본만 없는 채로 넘어간다.
    let imageUrlFinal: string | null = null;
    if (imageDataUrlFinal) {
      try {
        const finalParsed = parseDataUrl(imageDataUrlFinal);
        const finalPath = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}-final.${finalParsed.extension}`;
        const { error: finalUploadError } = await supabase.storage
          .from(COMICS_BUCKET)
          .upload(finalPath, finalParsed.buffer, {
            contentType: finalParsed.contentType,
            upsert: false,
          });
        if (!finalUploadError) {
          const { data: finalPublicUrlData } = supabase.storage
            .from(COMICS_BUCKET)
            .getPublicUrl(finalPath);
          imageUrlFinal = finalPublicUrlData.publicUrl;
        }
      } catch {
        imageUrlFinal = null;
      }
    }

    const { data: inserted, error: insertError } = await supabase
      .from("diary_entries")
      .insert({
        user_id: userId,
        dog_name: dogName,
        diary_text: diaryText,
        comic_json: comicJson,
        image_url: imageUrl,
        image_url_final: imageUrlFinal,
      })
      .select("id, created_at")
      .single();

    if (insertError) {
      throw new Error(`DB 저장 실패: ${insertError.message}`);
    }

    return NextResponse.json({
      id: inserted.id,
      createdAt: inserted.created_at,
      imageUrl,
      imageUrlFinal,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
