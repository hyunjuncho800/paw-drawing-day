import { NextResponse } from "next/server";
import { runPrediction, extractImageUrl } from "@/lib/replicate";

export const runtime = "nodejs";
export const maxDuration = 180;

const MAX_SCENES = 6;
const MAX_REFERENCE_IMAGES = 8;

/** 4컷 모두 같은 강아지로 보이도록, 참고 이미지가 있을 때만 프롬프트 끝에 붙이는 문구 */
const REFERENCE_CONSISTENCY_SUFFIX =
  " keep the same dog's fur color, face shape, and markings as the reference image.";

type ModelConfig = {
  slug: string;
  /** 모델마다 참고 이미지 필드명이 달라서(input_images vs image_input) 모델별로 입력을 만든다. */
  buildInput: (prompt: string, referenceImages: string[]) => Record<string, unknown>;
};

const MODEL_CONFIGS = {
  "flux-2-pro": {
    slug: "black-forest-labs/flux-2-pro",
    buildInput: (prompt, referenceImages) => ({
      prompt,
      input_images: referenceImages,
      aspect_ratio: "1:1",
      output_format: "png",
    }),
  },
  "nano-banana": {
    slug: "google/nano-banana",
    buildInput: (prompt, referenceImages) => ({
      prompt,
      image_input: referenceImages,
      aspect_ratio: "1:1",
      output_format: "png",
    }),
  },
} as const satisfies Record<string, ModelConfig>;

type ModelKey = keyof typeof MODEL_CONFIGS;

function isModelKey(value: unknown): value is ModelKey {
  return typeof value === "string" && value in MODEL_CONFIGS;
}

async function generateOneImage(
  model: ModelConfig,
  prompt: string,
  referenceImages: string[],
  token: string,
): Promise<string> {
  const fullPrompt =
    referenceImages.length > 0 ? `${prompt}${REFERENCE_CONSISTENCY_SUFFIX}` : prompt;
  const input = model.buildInput(fullPrompt, referenceImages);
  const { prediction } = await runPrediction(model.slug, input, token);
  return extractImageUrl(prediction);
}

type RequestBody = {
  scenes?: unknown;
  referenceImages?: unknown;
  model?: unknown;
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
    return NextResponse.json(
      { error: "요청 본문을 읽을 수 없어요." },
      { status: 400 },
    );
  }

  const modelKey: ModelKey = isModelKey(body.model) ? body.model : "flux-2-pro";
  const model = MODEL_CONFIGS[modelKey];

  const scenes = Array.isArray(body.scenes)
    ? body.scenes.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    : [];

  if (scenes.length === 0) {
    return NextResponse.json(
      { error: "장면 묘사(scenes)가 비어 있어요." },
      { status: 400 },
    );
  }
  if (scenes.length > MAX_SCENES) {
    return NextResponse.json(
      { error: `한 번에 최대 ${MAX_SCENES}장까지만 생성할 수 있어요.` },
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

  // 4컷 모두 동일한 참고 이미지 세트를 사용 — 컷마다 다른 사진을 쓰지 않는다.
  const results = await Promise.allSettled(
    scenes.map((scene) => generateOneImage(model, scene, referenceImages, token)),
  );

  const images = results.map((result, index) =>
    result.status === "fulfilled"
      ? { panel: index + 1, url: result.value }
      : {
          panel: index + 1,
          error:
            result.reason instanceof Error
              ? result.reason.message
              : "알 수 없는 오류",
        },
  );

  const allFailed = images.every((img) => "error" in img);

  return NextResponse.json({ model: modelKey, images }, { status: allFailed ? 502 : 200 });
}
