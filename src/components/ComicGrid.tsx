export type ComicPanel = {
  panel: number;
  scene_en: string;
  dialogue_ko: string;
};

/** 2x2 그리드의 각 분면 하단에 자막 캡션 바를 고정 배치하기 위한 위치(%).
 * AI 그림 내용과 무관하게 항상 같은 자리(패널 하단 20%)에 표시한다. */
const CAPTION_POSITIONS = [
  { top: "40%", bottom: "50%", left: "3%", right: "53%" },
  { top: "40%", bottom: "50%", left: "53%", right: "3%" },
  { top: "90%", bottom: "0%", left: "3%", right: "53%" },
  { top: "90%", bottom: "0%", left: "53%", right: "3%" },
];

/** 2x2 만화 그리드 이미지 + 패널별 자막 캡션 오버레이.
 * 상세 화면과 목록 썸네일, 확대 모달에서 공통으로 사용한다 — `textSizeClassName`으로
 * 표시 크기에 맞게 캡션 폰트 크기만 조절한다. */
export function ComicGrid({
  imageUrl,
  panels,
  title,
  textSizeClassName = "text-[11px] sm:text-sm",
  captionPaddingClassName = "px-2 pb-1.5 sm:px-3 sm:pb-2",
}: {
  imageUrl: string;
  panels: ComicPanel[];
  title: string;
  textSizeClassName?: string;
  captionPaddingClassName?: string;
}) {
  const sortedPanels = panels.slice().sort((a, b) => a.panel - b.panel);

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-2xl border-2 border-[#cfe8f5] bg-[#eef8fd]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt={`${title} 2x2 그리드`} className="h-full w-full object-cover" />
      {sortedPanels.map((panel, i) => (
        <div
          key={panel.panel}
          className={`pointer-events-none absolute flex items-end justify-center ${captionPaddingClassName}`}
          style={{
            ...CAPTION_POSITIONS[i],
            background: "linear-gradient(to top, rgba(255,250,240,0.92) 40%, rgba(255,250,240,0))",
          }}
        >
          <p
            className={`w-full text-center font-diary font-bold leading-snug text-[#332a24] ${textSizeClassName}`}
          >
            {panel.dialogue_ko}
          </p>
        </div>
      ))}
    </div>
  );
}
