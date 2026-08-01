"use client";

import { useCallback, useState } from "react";
import type { ComicPanel } from "@/components/ComicGrid";
import { renderComicComposite } from "@/lib/comicComposite";
import { buildImageFileName, cropQuadrant, dataUrlToBlob, saveOrShareImage } from "@/lib/imageSave";

export type ComicImageSource = {
  /** 이미 텍스트가 합쳐진 완성본 URL이 있으면 그걸 바로 쓰고,
   * 없으면(레거시 데이터) 그 자리에서 html2canvas로 새로 만든다. */
  finalImageUrl: string | null;
  rawImageUrl: string;
  panels: ComicPanel[];
  title: string;
};

/** 4컷 전체 이미지 저장/공유 + 1컷 개별 이미지 저장/공유를 함께 제공하는 훅.
 * 모바일에서는 Web Share API가 지원되면 공유 시트를, 아니면 일반 다운로드를 쓴다. */
export function useComicImageSaver(dogName: string) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const resolveComposite = useCallback(async (source: ComicImageSource): Promise<string> => {
    if (source.finalImageUrl) return source.finalImageUrl;
    return renderComicComposite(source.rawImageUrl, source.panels, source.title);
  }, []);

  const saveFull = useCallback(
    async (source: ComicImageSource) => {
      setBusyKey("full");
      setMessage("");
      try {
        const composite = await resolveComposite(source);
        const blob = await dataUrlToBlob(composite);
        const filename = buildImageFileName(dogName);
        const result = await saveOrShareImage(blob, filename);
        setMessage(result === "shared" ? "공유했어요 📤" : "저장했어요 💾");
      } catch {
        setMessage("이미지를 저장하지 못했어요 😢");
      } finally {
        setBusyKey(null);
      }
    },
    [dogName, resolveComposite],
  );

  const savePanel = useCallback(
    async (source: ComicImageSource, index: number) => {
      setBusyKey(`panel-${index}`);
      setMessage("");
      try {
        const composite = await resolveComposite(source);
        const blob = await cropQuadrant(composite, index);
        const filename = buildImageFileName(dogName, `컷${index + 1}`);
        const result = await saveOrShareImage(blob, filename);
        setMessage(result === "shared" ? "공유했어요 📤" : "저장했어요 💾");
      } catch {
        setMessage("이미지를 저장하지 못했어요 😢");
      } finally {
        setBusyKey(null);
      }
    },
    [dogName, resolveComposite],
  );

  return { saveFull, savePanel, busyKey, message };
}
