const POLL_INTERVAL_MS = 1000;
const MAX_POLL_ATTEMPTS = 60;
const MAX_RATE_LIMIT_RETRIES = 5;
const DEFAULT_RETRY_AFTER_MS = 10_000;
const MAX_CONCURRENT_CREATES = 2;

export type ReplicatePrediction = {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output: unknown;
  error: string | null;
  logs?: string | null;
  metrics?: { predict_time?: number; image_output_count?: number };
  urls: { get: string; cancel?: string };
};

export type PredictionUsage = {
  tokens: number | null;
  predictSeconds: number | null;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class ConcurrencyLimiter {
  private active = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      this.queue.shift()?.();
    }
  }
}

/**
 * 계정 처리량 제한 탓에 순간 요청이 몰리면 429가 뜨는 걸 줄이기 위해, Replicate로
 * 나가는 "예측 생성" 요청 자체를 전역에서 동시 2건까지만 허용한다.
 */
const createPredictionLimiter = new ConcurrencyLimiter(MAX_CONCURRENT_CREATES);

async function createPrediction(
  modelSlug: string,
  input: Record<string, unknown>,
  token: string,
): Promise<ReplicatePrediction> {
  return createPredictionLimiter.run(async () => {
    for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
      const createResponse = await fetch(
        `https://api.replicate.com/v1/models/${modelSlug}/predictions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Prefer: "wait",
          },
          body: JSON.stringify({ input }),
        },
      );

      if (createResponse.status === 429) {
        const detail = await createResponse.json().catch(() => null);
        if (attempt === MAX_RATE_LIMIT_RETRIES) {
          throw new Error("요청이 몰려서 이미지를 만들지 못했어요. 잠시 후 다시 시도해주세요.");
        }
        const retryAfterMs =
          typeof detail?.retry_after === "number"
            ? detail.retry_after * 1000
            : DEFAULT_RETRY_AFTER_MS;
        await sleep(retryAfterMs + 500);
        continue;
      }

      if (!createResponse.ok) {
        const detail = await createResponse.text();
        throw new Error(`Replicate 요청 실패 (${createResponse.status}): ${detail}`);
      }

      return createResponse.json();
    }

    throw new Error("이미지 생성 요청에 실패했어요.");
  });
}

function parseUsage(prediction: ReplicatePrediction): PredictionUsage {
  const tokenMatch = prediction.logs?.match(/Tokens:\s*(\d+)/i);
  return {
    tokens: tokenMatch ? Number(tokenMatch[1]) : null,
    predictSeconds: prediction.metrics?.predict_time ?? null,
  };
}

/** 예측을 생성하고 완료될 때까지 폴링한 뒤, 결과와 비용 추정치(토큰/소요 시간)를 함께 반환한다. */
export async function runPrediction(
  modelSlug: string,
  input: Record<string, unknown>,
  token: string,
): Promise<{ prediction: ReplicatePrediction; usage: PredictionUsage }> {
  let prediction = await createPrediction(modelSlug, input, token);

  let attempts = 0;
  while (
    prediction.status !== "succeeded" &&
    prediction.status !== "failed" &&
    prediction.status !== "canceled"
  ) {
    if (attempts >= MAX_POLL_ATTEMPTS) {
      throw new Error("이미지 생성이 너무 오래 걸려요.");
    }
    attempts += 1;
    await sleep(POLL_INTERVAL_MS);

    const pollResponse = await fetch(prediction.urls.get, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!pollResponse.ok) {
      throw new Error(`상태 확인 실패 (${pollResponse.status})`);
    }
    prediction = await pollResponse.json();
  }

  if (prediction.status !== "succeeded") {
    throw new Error(prediction.error ?? "이미지 생성에 실패했어요.");
  }

  const usage = parseUsage(prediction);
  console.log(
    `[replicate] model=${modelSlug} tokens=${usage.tokens ?? "?"} predict_time=${usage.predictSeconds ?? "?"}s`,
  );

  return { prediction, usage };
}

export function extractImageUrl(prediction: ReplicatePrediction): string {
  const output = prediction.output;
  const url = Array.isArray(output) ? output[0] : output;
  if (typeof url !== "string") {
    throw new Error("이미지 URL을 찾을 수 없어요.");
  }
  return url;
}
