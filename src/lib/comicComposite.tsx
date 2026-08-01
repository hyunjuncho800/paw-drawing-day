"use client";

import { createRoot } from "react-dom/client";
import { ComicGrid, type ComicPanel } from "@/components/ComicGrid";

const CAPTURE_SIZE = 800;

/** 화면에 보이는 것과 똑같은 그림+말풍선 오버레이를 화면 밖에 잠깐 렌더링한 뒤
 * html2canvas로 통째로 캡처해서, 텍스트가 실제로 구워진 완성본 PNG(data URL)를 만든다.
 * 저장/다운로드용 이미지 파일에는 대사가 CSS 오버레이가 아니라 픽셀로 들어가야 하기 때문. */
export async function renderComicComposite(
  imageUrl: string,
  panels: ComicPanel[],
  title: string,
): Promise<string> {
  const html2canvas = (await import("html2canvas-pro")).default;
  await document.fonts.ready;

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.pointerEvents = "none";
  document.body.appendChild(container);

  const root = createRoot(container);
  try {
    await new Promise<void>((resolve, reject) => {
      root.render(
        <ComicGrid
          imageUrl={imageUrl}
          panels={panels}
          title={title}
          pixelSize={CAPTURE_SIZE}
          onImageReady={resolve}
          onImageError={() => reject(new Error("이미지를 불러오지 못했어요."))}
        />,
      );
    });

    // 폰트/레이아웃이 완전히 자리잡을 시간을 살짝 준다.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const canvas = await html2canvas(container, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
    });
    return canvas.toDataURL("image/png");
  } finally {
    root.unmount();
    container.remove();
  }
}
