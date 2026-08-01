import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { getAuthenticatedUser, AuthError } from "@/lib/supabase";
import { findTodayEntry, isAdminEmail } from "@/lib/dailyLimit";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Claude가 반드시 이 형태의 JSON만 반환하도록 강제하는 스키마 */
const COMIC_SCHEMA = {
  type: "object",
  properties: {
    title: {
      type: "string",
      description: "이 만화의 한국어 제목 (10자 내외)",
    },
    panels: {
      type: "array",
      description: "4컷 만화. 반드시 정확히 4개.",
      items: {
        type: "object",
        properties: {
          panel: {
            type: "integer",
            description: "컷 번호 (1~4)",
          },
          scene_en: {
            type: "string",
            description:
              "Image-generation prompt in English describing this panel's scene: the dog's pose, expression, action, background, and mood. Cute pastel webtoon style.",
          },
          dialogue_ko: {
            type: "string",
            description:
              "이 컷의 말풍선 대사 (한국어, 강아지 1인칭 시점, 25자 이내)",
          },
        },
        required: ["panel", "scene_en", "dialogue_ko"],
        additionalProperties: false,
      },
    },
    keywords: {
      type: "array",
      description: "일기에서 추출한 감정/습관 키워드 3~6개 (한국어 단어)",
      items: { type: "string" },
    },
  },
  required: ["title", "panels", "keywords"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `당신은 반려견 AI 만화 일기 서비스 '멍그리는 하루'의 만화 콘티 작가입니다.

보호자가 쓴 짧은 일기를 받아, 강아지를 주인공으로 한 따뜻하고 귀여운 4컷 만화 콘티를 만듭니다.

작성 규칙:
- 4컷은 기승전결 구조를 갖습니다. (1컷 상황 시작 → 2컷 전개 → 3컷 절정/반전 → 4컷 마무리·감정)
- scene_en은 이미지 생성 AI에 그대로 넘길 영어 프롬프트입니다. 매 컷마다 강아지의 자세·표정·행동·배경·분위기를 구체적으로 묘사하고, 다음 스타일 문구를 포함하세요: "cute pastel-toned webtoon illustration, soft beige and pink palette, warm cozy lighting, simple clean lines".
- dialogue_ko는 강아지가 직접 말하는 1인칭 대사입니다. 귀엽고 짧게, 25자 이내로 씁니다.
- keywords는 일기에서 읽어낸 강아지의 감정이나 습관을 나타내는 한국어 단어입니다. (예: "산책좋아", "낮잠", "질투", "먹보")
- 보호자가 알려준 강아지의 성격을 대사 톤과 행동 묘사에 반영하세요.`;

type RequestBody = {
  dogName?: unknown;
  personality?: unknown;
  diary?: unknown;
};

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEY가 설정되지 않았어요. 프로젝트 루트의 .env.local 파일에 키를 넣고 개발 서버를 다시 시작해주세요.",
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

  const dogName = typeof body.dogName === "string" ? body.dogName.trim() : "";
  const personality =
    typeof body.personality === "string" ? body.personality.trim() : "";
  const diary = typeof body.diary === "string" ? body.diary.trim() : "";

  if (!dogName || !diary) {
    return NextResponse.json(
      { error: "강아지 이름과 오늘의 일기는 필수예요." },
      { status: 400 },
    );
  }

  // 하루 1회 제한(관리자 계정 제외): Claude를 호출하기 전에 먼저 확인해서 불필요한 비용을 막는다.
  try {
    const { client: supabase, userId, email } = await getAuthenticatedUser(request);

    if (!isAdminEmail(email)) {
      const { entry, nextResetAt } = await findTodayEntry(supabase, userId);
      if (entry) {
        return NextResponse.json(
          {
            error: `오늘은 이미 ${entry.dog_name}의 하루를 기록했어요! 내일 다시 와주세요 🐾`,
            alreadyCreatedToday: true,
            entry,
            nextResetAt,
          },
          { status: 409 },
        );
      }
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    throw error;
  }

  const client = new Anthropic();

  const userPrompt = [
    `강아지 이름: ${dogName}`,
    `성격: ${personality || "(알려주지 않음 — 일기 내용에서 추측해주세요)"}`,
    "",
    "오늘의 일기:",
    diary,
  ].join("\n");

  try {
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: COMIC_SCHEMA },
      },
      messages: [{ role: "user", content: userPrompt }],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json(
        { error: "이 내용으로는 만화를 만들 수 없어요. 일기를 다시 써주세요." },
        { status: 422 },
      );
    }

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock) {
      return NextResponse.json(
        { error: "Claude가 응답을 만들지 못했어요. 다시 시도해주세요." },
        { status: 502 },
      );
    }

    // output_config.format 덕분에 이 텍스트는 스키마를 지키는 JSON 문자열입니다.
    const comic = JSON.parse(textBlock.text);

    return NextResponse.json({
      comic,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return NextResponse.json(
        { error: "API 키가 올바르지 않아요. .env.local을 확인해주세요." },
        { status: 401 },
      );
    }
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "요청이 너무 많아요. 잠시 후 다시 시도해주세요." },
        { status: 429 },
      );
    }
    if (error instanceof Anthropic.APIError) {
      console.error("Anthropic API error:", error.status, error.message);
      return NextResponse.json(
        { error: `Claude 호출에 실패했어요: ${error.message}` },
        { status: 502 },
      );
    }
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "알 수 없는 오류가 발생했어요." },
      { status: 500 },
    );
  }
}
