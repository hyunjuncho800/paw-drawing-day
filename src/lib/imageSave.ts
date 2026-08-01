"use client";

/** data: URL이 아니면 Supabase Storage 같은 외부 호스트이므로 CORS 허용 요청을 건다. */
async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  if (!src.startsWith("data:")) img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("이미지를 불러오지 못했어요."));
    img.src = src;
  });
  return img;
}

/** 2x2 그리드 이미지에서 index(0~3)번째 칸만 잘라 PNG Blob으로 돌려준다. */
export async function cropQuadrant(imageSrc: string, index: number): Promise<Blob> {
  const img = await loadImage(imageSrc);
  const w = img.naturalWidth / 2;
  const h = img.naturalHeight / 2;
  const col = index % 2;
  const row = Math.floor(index / 2);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("캔버스를 사용할 수 없어요.");
  ctx.drawImage(img, col * w, row * h, w, h, 0, 0, w, h);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("이미지 변환에 실패했어요."))),
      "image/png",
    );
  });
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

/** "박탄이_20260801.png" / "박탄이_20260801_컷1.png" 형태의 파일명을 만든다. */
export function buildImageFileName(dogName: string, suffix?: string): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const safeName = (dogName.trim() || "멍그림").replace(/[\\/:*?"<>|]/g, "");
  return `${safeName}_${y}${m}${d}${suffix ? `_${suffix}` : ""}.png`;
}

type ShareNavigator = Navigator & {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
};

/** 모바일에서는 Web Share API(공유 시트)를 우선 시도하고, 지원하지 않으면
 * 일반 다운로드(<a download>)로 자동 대체한다. */
export async function saveOrShareImage(
  blob: Blob,
  filename: string,
): Promise<"shared" | "downloaded"> {
  const file = new File([blob], filename, { type: "image/png" });
  const nav = navigator as ShareNavigator;

  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename });
      return "shared";
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return "shared";
      }
      // 공유 실패 시 아래 다운로드로 대체
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return "downloaded";
}
