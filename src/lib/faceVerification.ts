import Anthropic from "@anthropic-ai/sdk";

export type FaceVerificationResult = {
  matches: boolean;
  reasoning: string;
};

/** dogAppearance 문구가 이미지 생성 프롬프트만으로는 신뢰성 있게 재현되지 않아서(특히
 * 좌우 비대칭 무늬), 생성된 이미지를 Claude 비전으로 직접 확인하고 틀리면 재시도한다. */
export async function verifyDogFacePattern(
  imageDataUrl: string,
  dogAppearance: string,
  options: { lenient: boolean },
): Promise<FaceVerificationResult> {
  const match = imageDataUrl.match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
  if (!match) {
    return { matches: true, reasoning: "이미지 형식을 읽을 수 없어 검증을 건너뜀." };
  }
  const [, mediaType, base64Data] = match;

  const client = new Anthropic();

  const instructions = options.lenient
    ? `이 이미지는 강아지가 등장하는 2x2 네 컷 만화 그리드입니다. 아래 강아지 생김새 설명과 비교해서,
특히 "왼쪽/오른쪽 눈" 관련 비대칭 무늬(한쪽 눈에만 검은 털이 닿고 반대쪽은 하얀 털만 있는 것) 부분을 확인해주세요.
강아지 얼굴이 정면으로 뚜렷하게 보이는 컷이 하나라도 있다면 그 컷에서 비대칭 패턴이 설명과 맞는지 판단하세요.
모든 컷에서 강아지 얼굴이 옆모습이거나 너무 작아서 판단이 불가능하면 "PASS"로 처리하세요(재시도 낭비 방지).`
    : `이 이미지는 강아지 얼굴 클로즈업 초상화 1장입니다. 아래 생김새 설명과 비교해서,
특히 "왼쪽/오른쪽 눈" 비대칭 무늬(한쪽 눈에만 검은 털이 닿고 반대쪽은 하얀 털만 있는 것)가
설명과 정확히 일치하는지 엄격하게 판단하세요.`;

  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType as "image/png" | "image/jpeg", data: base64Data } },
          {
            type: "text",
            text: `${instructions}

강아지 생김새 설명:
"""
${dogAppearance}
"""

이미지 왼쪽/오른쪽은 화면(사진)을 그대로 보는 기준입니다 (강아지 자신의 좌우가 아님).

정확히 이 형식으로만 답하세요:
RESULT: PASS 또는 RESULT: FAIL
REASON: (한 문장 이유)`,
          },
        ],
      },
    ],
  });

  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  const resultMatch = text.match(/RESULT:\s*(PASS|FAIL)/i);
  const reasonMatch = text.match(/REASON:\s*(.+)/i);

  return {
    matches: resultMatch ? resultMatch[1].toUpperCase() === "PASS" : true,
    reasoning: reasonMatch?.[1]?.trim() ?? text.trim(),
  };
}
