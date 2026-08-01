export type ComicPanel = {
  panel: number;
  scene_en: string;
  dialogue_ko: string;
};

/** 2x2 그리드의 각 분면 하단에 말풍선 카드를 고정 배치하기 위한 위치(%).
 * AI 그림 내용과 무관하게 항상 같은 자리(패널 하단)에 표시한다. */
const CAPTION_POSITIONS = [
  { bottom: "52%", left: "5%", right: "53%" },
  { bottom: "52%", left: "53%", right: "5%" },
  { bottom: "2%", left: "5%", right: "53%" },
  { bottom: "2%", left: "53%", right: "5%" },
];

/** 표시 크기(상세/모달 vs 목록 썸네일)에 따른 기본 폰트 크기 단계.
 * 대사 길이가 길어지면 이 기본값에서 한 단계씩 더 줄어든다.
 * 그림보다 글씨가 더 눈에 띄지 않도록 전반적으로 작게 유지한다. */
const FONT_SIZE_TIERS: Record<"full" | "thumbnail", string[]> = {
  full: ["text-xs sm:text-sm", "text-[11px] sm:text-xs", "text-[10px] sm:text-[11px]", "text-[9px] sm:text-[10px]"],
  thumbnail: ["text-[4.5px] sm:text-[5px]", "text-[4px] sm:text-[4.5px]", "text-[3.5px] sm:text-[4px]", "text-[3px] sm:text-[3.5px]"],
};

function captionFontSizeClass(text: string, size: "full" | "thumbnail"): string {
  const tiers = FONT_SIZE_TIERS[size];
  const length = text.length;
  if (length <= 10) return tiers[0];
  if (length <= 18) return tiers[1];
  if (length <= 28) return tiers[2];
  return tiers[3];
}

/** 2x2 만화 그리드 이미지 + 패널별 말풍선 카드 캡션 오버레이.
 * 상세 화면과 목록 썸네일, 확대 모달에서 공통으로 사용한다 — `size`로 표시 크기에
 * 맞는 폰트 단계를 고르고, 대사가 길면 그 안에서 한 단계씩 더 줄인다. */
export function ComicGrid({
  imageUrl,
  panels,
  title,
  size = "full",
  pixelSize,
  onImageReady,
  onImageError,
}: {
  imageUrl: string;
  panels: ComicPanel[];
  title: string;
  size?: "full" | "thumbnail";
  /** 지정하면 이 정사각형 픽셀 크기로 고정 렌더링한다(html2canvas로 캡처할 때,
   * aspect-ratio 유틸 클래스 대신 확실한 치수를 주기 위해 사용). */
  pixelSize?: number;
  onImageReady?: () => void;
  onImageError?: () => void;
}) {
  const sortedPanels = panels.slice().sort((a, b) => a.panel - b.panel);
  const cardPadding = size === "thumbnail" ? "px-1 py-0.5" : "px-2.5 py-1.5 sm:px-3 sm:py-1.5";
  const tailSize = size === "thumbnail" ? "border-x-[2px] border-b-[3px]" : "border-x-[5px] border-b-[6px]";

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border-2 border-[#cfe8f5] bg-[#eef8fd] ${
        pixelSize ? "" : "aspect-square w-full"
      }`}
      style={pixelSize ? { width: pixelSize, height: pixelSize } : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt={`${title} 2x2 그리드`}
        className="h-full w-full object-cover"
        crossOrigin={imageUrl.startsWith("data:") ? undefined : "anonymous"}
        onLoad={onImageReady}
        onError={onImageError}
      />
      {sortedPanels.map((panel, i) => (
        <div
          key={panel.panel}
          className="pointer-events-none absolute flex justify-center"
          style={CAPTION_POSITIONS[i]}
        >
          <div
            className={`relative max-w-full rounded-xl border border-white/50 bg-[#fffaf0]/85 shadow-[0_1px_4px_rgba(120,90,70,0.18)] ${cardPadding}`}
          >
            {/* 말풍선 꼬리: 카드 위쪽에서 강아지 쪽을 향해 살짝 튀어나온 삼각형 */}
            <span
              className={`absolute bottom-full left-1/2 h-0 w-0 -translate-x-1/2 border-x-transparent border-b-[#fffaf0]/85 ${tailSize}`}
            />
            <p
              className={`text-center font-diary font-semibold text-[#4a3b32] ${captionFontSizeClass(panel.dialogue_ko, size)}`}
              style={{
                wordBreak: "keep-all",
                overflowWrap: "break-word",
                whiteSpace: "pre-wrap",
                lineHeight: 1.3,
              }}
            >
              {panel.dialogue_ko}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
