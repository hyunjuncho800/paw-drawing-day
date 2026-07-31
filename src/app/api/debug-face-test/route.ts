import { NextResponse } from "next/server";
import { runPrediction, extractImageUrl, type PredictionUsage } from "@/lib/replicate";
import { verifyDogFacePattern } from "@/lib/faceVerification";

export const runtime = "nodejs";
export const maxDuration = 180;

const GRID_MODEL_SLUG = "google/nano-banana";
const MAX_ATTEMPTS = 3;

const FIXED_ART_STYLE =
  "Art style: Korean Instatoon style, cute digital webtoon illustration, bold clean outlines, vibrant flat colors, adorable simple character design, high contrast, clean white background.";

/**
 * 디버그 전용 라우트 — 4컷 그리드 대신 강아지 얼굴 클로즈업 1장만 생성한다.
 * 비대칭 얼굴 무늬 프롬프트를 빠르고 저렴하게 반복 테스트하기 위한 용도.
 * 프로덕션 파이프라인(/api/generate-grid-image)과는 완전히 분리되어 있다.
 * 생성 후 Claude 비전으로 검증하고, 틀리면 최대 MAX_ATTEMPTS번까지 재시도한다.
 */
type RequestBody = {
  referenceImages?: unknown;
  dogAppearance?: unknown;
};

async function generateOnce(
  prompt: string,
  referenceImages: string[],
  token: string,
): Promise<{ image: string; usage: PredictionUsage }> {
  const { prediction, usage } = await runPrediction(
    GRID_MODEL_SLUG,
    {
      prompt,
      image_input: referenceImages,
      aspect_ratio: "1:1",
      output_format: "png",
    },
    token,
  );

  const imageUrl = extractImageUrl(prediction);
  const res = await fetch(imageUrl);
  const contentType = res.headers.get("content-type") ?? "image/png";
  const buffer = Buffer.from(await res.arrayBuffer());
  const image = `data:${contentType};base64,${buffer.toString("base64")}`;

  return { image, usage };
}

export async function POST(request: Request) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "REPLICATE_API_TOKEN이 설정되지 않았어요." }, { status: 500 });
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 본문을 읽을 수 없어요." }, { status: 400 });
  }

  const referenceImages = Array.isArray(body.referenceImages)
    ? body.referenceImages.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    : [];

  const dogAppearance = typeof body.dogAppearance === "string" ? body.dogAppearance.trim() : "";

  const prompt = [
    "A single close-up portrait of just the dog's head and face, facing directly toward the camera at eye level, centered pose, plain clean white background, no other objects or people.",
    FIXED_ART_STYLE,
    dogAppearance ? `The dog looks exactly like this: ${dogAppearance}` : "",
    referenceImages.length > 0
      ? "This must be the EXACT same dog as the reference image(s) — reproduce the precise facial marking pattern shown in the reference, not a generic same-breed look."
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  try {
    const attempts: { image: string; verification: { matches: boolean; reasoning: string } }[] = [];

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const { image, usage } = await generateOnce(prompt, referenceImages, token);
      const verification = dogAppearance
        ? await verifyDogFacePattern(image, dogAppearance, { lenient: false })
        : { matches: true, reasoning: "dogAppearance가 없어 검증을 건너뜀." };

      attempts.push({ image, verification });

      if (verification.matches) {
        return NextResponse.json({
          image,
          usage,
          prompt,
          attemptCount: i + 1,
          verification,
        });
      }
    }

    // 다 실패하면 마지막 결과라도 반환 (best effort)
    const last = attempts[attempts.length - 1];
    return NextResponse.json({
      image: last.image,
      prompt,
      attemptCount: attempts.length,
      verification: last.verification,
      allFailed: true,
      allReasons: attempts.map((a) => a.verification.reasoning),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
