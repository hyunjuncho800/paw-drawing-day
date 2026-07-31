import { NextResponse } from "next/server";
import { runPrediction, extractImageUrl, type PredictionUsage } from "@/lib/replicate";

export const runtime = "nodejs";
export const maxDuration = 180;

const GRID_MODEL_SLUG = "google/nano-banana";
const MAX_REFERENCE_IMAGES = 8;

const REFERENCE_CONSISTENCY_SUFFIX =
  "Keep the same dog's fur color, face shape, and markings as the reference image consistently across all 4 panels.";

// 매번 조금씩 다르게 쓰지 않도록, 그림체는 항상 이 문장 그대로 고정한다.
const FIXED_ART_STYLE =
  "Art style: Korean Instatoon style, cute digital webtoon illustration, bold clean outlines, vibrant flat colors, adorable simple character design, high contrast, clean white background. Keep this exact art style consistent across all 4 panels.";

type Quad = [string, string, string, string];

/** 4개의 scene_en으로 하나의 2x2 그리드 이미지 프롬프트를 만든다.
 * 말풍선은 그리지 않는다 — 순수한 장면(배경+강아지)만 그리게 하고,
 * 대사(dialogue_ko)는 화면 하단에 자막 형태로 HTML/CSS 오버레이한다.
 * 강아지 생김새는 매번 AI가 새로 추측하지 않도록, profiles.dog_appearance에
 * 고정 저장해둔 문장을 참고 사진과 함께 항상 그대로 전달한다. */
function buildGridPrompt(scenes: Quad, hasReference: boolean, dogAppearance: string): string {
  const labels = ["top-left", "top-right", "bottom-left", "bottom-right"];
  const parts = [
    "A single square image divided into an even 2x2 grid of 4 panels, with a thin white border separating each panel.",
    FIXED_ART_STYLE,
    dogAppearance
      ? `The dog in every panel looks exactly like this: ${dogAppearance}. Keep this exact appearance consistent across all 4 panels.`
      : "",
    hasReference ? REFERENCE_CONSISTENCY_SUFFIX : "",
    "Do not draw any speech bubbles, text, letters, or writing anywhere in the image — just the scenes themselves.",
    ...scenes.map((scene, i) => `Panel ${i + 1} (${labels[i]}): ${scene}`),
  ];
  return parts.filter(Boolean).join(" ");
}

/** 프론트엔드에서 캔버스로 패널을 잘라 다운로드할 수 있도록, 외부 URL 대신
 * base64 data URI로 변환해서 돌려준다 (외부 URL은 CORS 때문에 캔버스가 오염된다). */
async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`생성된 이미지를 가져오지 못했어요 (${res.status}).`);
  }
  const contentType = res.headers.get("content-type") ?? "image/png";
  const buffer = Buffer.from(await res.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

type RequestBody = {
  scenes?: unknown;
  dialogues?: unknown;
  referenceImages?: unknown;
  dogAppearance?: unknown;
};

export async function POST(request: Request) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return NextResponse.json(
      {
        error:
          "REPLICATE_API_TOKEN이 설정되지 않았어요. .env.local에 키를 넣고 개발 서버를 다시 시작해주세요.",
      },
      { status: 500 },
    );
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 본문을 읽을 수 없어요." }, { status: 400 });
  }

  const scenes = Array.isArray(body.scenes)
    ? body.scenes.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    : [];

  if (scenes.length !== 4) {
    return NextResponse.json(
      { error: "2x2 그리드는 정확히 4개의 장면 묘사(scenes)가 필요해요." },
      { status: 400 },
    );
  }

  const dialogues = Array.isArray(body.dialogues)
    ? body.dialogues.filter((s): s is string => typeof s === "string")
    : [];

  if (dialogues.length !== 4) {
    return NextResponse.json(
      { error: "2x2 그리드는 정확히 4개의 대사(dialogues)가 필요해요." },
      { status: 400 },
    );
  }

  const referenceImages = Array.isArray(body.referenceImages)
    ? body.referenceImages.filter(
        (s): s is string => typeof s === "string" && s.trim().length > 0,
      )
    : [];

  if (referenceImages.length > MAX_REFERENCE_IMAGES) {
    return NextResponse.json(
      { error: `참고 이미지는 최대 ${MAX_REFERENCE_IMAGES}장까지만 사용할 수 있어요.` },
      { status: 400 },
    );
  }

  const dogAppearance = typeof body.dogAppearance === "string" ? body.dogAppearance.trim() : "";

  const prompt = buildGridPrompt(
    scenes as [string, string, string, string],
    referenceImages.length > 0,
    dogAppearance,
  );

  try {
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
    const image = await urlToDataUrl(imageUrl);

    const usageResponse: PredictionUsage = usage;
    return NextResponse.json({ image, usage: usageResponse, callCount: 1 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
