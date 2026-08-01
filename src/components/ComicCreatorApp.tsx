"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import Link from "next/link";
import type { Profile, PhotoFaceCrop } from "@/hooks/useAuthProfile";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { ComicGrid } from "@/components/ComicGrid";
import { renderComicComposite } from "@/lib/comicComposite";
import { useComicImageSaver } from "@/lib/useComicImageSaver";

const MAX_PHOTOS = 2;
const MAX_DIARY_LENGTH = 150;
const DOG_PHOTOS_BUCKET = "dog-photos";

/** 프로필 사진에서 얼굴 부분만(0~1 비율 좌표) 잘라 별도의 참고 이미지로 만든다.
 * 전신 사진 한 장만으로는 얼굴이 작아서 AI가 이목구비 무늬를 놓치기 쉬워서,
 * 같은 사진에서 얼굴 클로즈업을 추가로 잘라 함께 전달한다. */
async function cropImageToDataUrl(imageUrl: string, crop: PhotoFaceCrop): Promise<string> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("이미지를 불러오지 못했어요."));
    img.src = imageUrl;
  });

  const sx = crop.left * img.naturalWidth;
  const sy = crop.top * img.naturalHeight;
  const sw = crop.width * img.naturalWidth;
  const sh = crop.height * img.naturalHeight;

  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("캔버스를 사용할 수 없어요.");
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas.toDataURL("image/jpeg", 0.9);
}

type Photo = {
  id: string;
  url: string;
  file: File;
};

type ComicPanel = {
  panel: number;
  scene_en: string;
  dialogue_ko: string;
};

type Comic = {
  title: string;
  panels: ComicPanel[];
  keywords: string[];
};

type GridUsage = {
  tokens: number | null;
  predictSeconds: number | null;
};

type TodayComicJson = { title?: string; panels?: ComicPanel[] } | null;

type TodayEntry = {
  id: string;
  dog_name: string;
  diary_text: string;
  comic_json: TodayComicJson;
  image_url: string | null;
  image_url_final: string | null;
  created_at: string;
};

type DailyStatus = {
  loading: boolean;
  limited: boolean;
  isAdmin: boolean;
  entry: TodayEntry | null;
  nextResetAt: string | null;
};

/** 다음 자정(KST)까지 남은 시간을 "N시간 M분 후" 형태로 안내한다. */
function formatCountdown(nextResetAt: string | null, now: number): string {
  if (!nextResetAt) return "";
  const diffMs = new Date(nextResetAt).getTime() - now;
  if (diffMs <= 0) return "곧 다시 만들 수 있어요";
  const totalMinutes = Math.ceil(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}시간 ${minutes}분 후에 다시 만들 수 있어요`;
  return `${minutes}분 후에 다시 만들 수 있어요`;
}

type GridImageState = {
  image: string | null;
  isLoading: boolean;
  error: string;
  usage: GridUsage | null;
};

const createInitialGridResult = (): GridImageState => ({
  image: null,
  isLoading: false,
  error: "",
  usage: null,
});

export default function ComicCreatorApp({
  profile,
  accessToken,
  onSignOut,
}: {
  profile: Profile;
  accessToken: string;
  onSignOut: () => void;
}) {
  const [dogName, setDogName] = useState(profile.dog_name);
  const [personality, setPersonality] = useState(
    profile.dog_traits.length > 0 ? profile.dog_traits.join(", ") : "",
  );
  const [diary, setDiary] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [comic, setComic] = useState<Comic | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [gridResult, setGridResult] = useState<GridImageState>(createInitialGridResult());
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [finalImage, setFinalImage] = useState<string | null>(null);
  const [dailyStatus, setDailyStatus] = useState<DailyStatus>({
    loading: true,
    limited: false,
    isAdmin: false,
    entry: null,
    nextResetAt: null,
  });
  const [nowTick, setNowTick] = useState(() => Date.now());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageSaver = useComicImageSaver(dogName);

  // 화면에 들어올 때 오늘(KST) 이미 만든 기록이 있는지 먼저 확인한다.
  // 있으면 입력 폼 대신 "오늘의 기록 다시보기"를 보여준다(관리자 계정은 서버가 항상 limited:false로 응답).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/today-comic", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(async (response) => {
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setDailyStatus({ loading: false, limited: false, isAdmin: false, entry: null, nextResetAt: null });
          return;
        }
        setDailyStatus({
          loading: false,
          limited: Boolean(data.limited),
          isAdmin: Boolean(data.isAdmin),
          entry: data.entry ?? null,
          nextResetAt: data.nextResetAt ?? null,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setDailyStatus({ loading: false, limited: false, isAdmin: false, entry: null, nextResetAt: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  // 카운트다운 문구가 갱신되도록 1분마다 현재 시각을 다시 읽는다.
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  const remainingSlots = MAX_PHOTOS - photos.length;
  const hasProfilePhoto = Boolean(profile.photo_url);
  const sortedComicPanels = comic ? comic.panels.slice().sort((a, b) => a.panel - b.panel) : [];
  const isFormValid =
    dogName.trim().length > 0 &&
    diary.trim().length > 0 &&
    (photos.length > 0 || hasProfilePhoto);

  const addPhotos = (fileList: FileList | null) => {
    if (!fileList || remainingSlots <= 0) return;

    const imageFiles = Array.from(fileList)
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, remainingSlots);

    const newPhotos: Photo[] = imageFiles.map((file) => ({
      id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
      url: URL.createObjectURL(file),
      file,
    }));

    setPhotos((prev) => [...prev, ...newPhotos]);
  };

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    addPhotos(event.target.files);
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    addPhotos(event.dataTransfer.files);
  };

  const removePhoto = (id: string) => {
    setPhotos((prev) => {
      const target = prev.find((photo) => photo.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((photo) => photo.id !== id);
    });
  };

  /** 참고 사진을 base64로 요청에 실으면 Vercel의 요청 본문 4.5MB 제한에 걸릴 수 있어서,
   * Storage에 먼저 올리고 공개 URL만 참고 이미지로 전달한다. */
  const uploadReferenceImage = async (file: File): Promise<string> => {
    const supabase = getSupabaseBrowserClient();
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${profile.id}/diary-refs/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(DOG_PHOTOS_BUCKET)
      .upload(path, file, { contentType: file.type || "image/jpeg", upsert: true });

    if (uploadError) {
      throw new Error(`사진 업로드에 실패했어요: ${uploadError.message}`);
    }

    const { data } = supabase.storage.from(DOG_PHOTOS_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  };

  const generateGridImage = async (
    scenes: string[],
    dialogues: string[],
    referenceImages: string[],
    dogAppearance: string | null,
  ): Promise<string | null> => {
    setGridResult({ image: null, isLoading: true, error: "", usage: null });

    try {
      const response = await fetch("/api/generate-grid-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenes, dialogues, referenceImages, dogAppearance }),
      });

      const data = await response.json();

      if (!response.ok) {
        setGridResult({
          image: null,
          isLoading: false,
          error: data.error ?? "그림을 만들지 못했어요.",
          usage: null,
        });
        return null;
      }

      setGridResult({ image: data.image, isLoading: false, error: "", usage: data.usage ?? null });
      return data.image as string;
    } catch {
      setGridResult({
        image: null,
        isLoading: false,
        error: "이미지 서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.",
        usage: null,
      });
      return null;
    }
  };

  /** 그리드 이미지 생성이 끝나면 화면에 보이는 것과 동일한 그림+대사 오버레이를
   * html2canvas로 캡처해 텍스트가 픽셀로 구워진 완성본을 만든 뒤, 원본과 함께
   * Storage + DB에 한 줄 저장한다. user_id는 서버가 access token으로 직접 검증해서 채운다. */
  const saveComicEntry = async (
    entryDogName: string,
    entryDiaryText: string,
    entryComicJson: Comic,
    imageDataUrl: string,
  ) => {
    setSaveStatus("saving");
    try {
      const sortedPanels = entryComicJson.panels.slice().sort((a, b) => a.panel - b.panel);
      let composite: string | null = null;
      try {
        composite = await renderComicComposite(imageDataUrl, sortedPanels, entryComicJson.title);
        setFinalImage(composite);
      } catch (err) {
        console.error("완성본 캡처 실패:", err);
        composite = null;
      }

      const response = await fetch("/api/save-comic", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          dogName: entryDogName,
          diaryText: entryDiaryText,
          comicJson: entryComicJson,
          imageDataUrl,
          imageDataUrlFinal: composite,
        }),
      });
      setSaveStatus(response.ok ? "saved" : "error");
    } catch {
      setSaveStatus("error");
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isFormValid || isLoading) return;

    setIsLoading(true);
    setErrorMessage("");
    setComic(null);
    setGridResult(createInitialGridResult());
    setSaveStatus("idle");
    setFinalImage(null);

    try {
      const response = await fetch("/api/generate-comic", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ dogName, personality, diary }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.alreadyCreatedToday) {
          // 다른 탭 등에서 사이에 이미 만든 경우를 대비한 안전망. 서버 응답으로 오늘의 기록 화면으로 전환한다.
          setDailyStatus({
            loading: false,
            limited: true,
            isAdmin: false,
            entry: data.entry ?? null,
            nextResetAt: data.nextResetAt ?? null,
          });
        } else {
          setErrorMessage(data.error ?? "만화를 만들지 못했어요.");
        }
        return;
      }

      const newComic: Comic = data.comic;
      setComic(newComic);

      // 프로필에 등록해둔 사진을 전부(여러 각도) 참고 이미지로 쓰고, 이번에 새로 올린 사진(들)을 이어 붙인다.
      // 여러 각도를 함께 전달할수록 AI가 얼굴 무늬 같은 디테일을 더 정확히 재현한다.
      // 전신 사진만으로는 얼굴이 작아서, 얼굴 클로즈업(있다면)도 추가로 함께 전달한다.
      const uploadedReferenceImages = await Promise.all(
        photos.map((photo) => uploadReferenceImage(photo.file)),
      );
      let faceCloseupImage: string | null = null;
      if (profile.photo_url && profile.photo_face_crop) {
        try {
          faceCloseupImage = await cropImageToDataUrl(profile.photo_url, profile.photo_face_crop);
        } catch {
          faceCloseupImage = null;
        }
      }
      const profilePhotos = profile.photo_urls.length > 0
        ? profile.photo_urls
        : profile.photo_url
          ? [profile.photo_url]
          : [];
      const profileReferenceImages = [
        ...profilePhotos,
        ...(faceCloseupImage ? [faceCloseupImage] : []),
      ];
      const referenceImages = [...profileReferenceImages, ...uploadedReferenceImages];
      const sortedPanels = newComic.panels.slice().sort((a, b) => a.panel - b.panel);
      const scenes = sortedPanels.map((p) => p.scene_en);
      const dialogues = sortedPanels.map((p) => p.dialogue_ko);

      // 2x2 그리드 1장을 한 번의 API 호출로 생성하고, 성공하면 자동 저장한다.
      const gridImage = await generateGridImage(
        scenes,
        dialogues,
        referenceImages,
        profile.dog_appearance,
      );
      if (gridImage) {
        void saveComicEntry(dogName, diary, newComic, gridImage);
      }
    } catch {
      setErrorMessage("서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center overflow-hidden bg-gradient-to-br from-[#FFF3E4] via-[#FDEAF0] to-[#E7F3FB] px-4 py-10 sm:py-16">
      {/* decorative paw prints */}
      <span className="pointer-events-none absolute -left-4 top-10 text-6xl opacity-20 rotate-[-15deg] select-none">
        🐾
      </span>
      <span className="pointer-events-none absolute right-2 top-32 text-5xl opacity-20 rotate-[20deg] select-none">
        🐾
      </span>
      <span className="pointer-events-none absolute bottom-10 left-10 text-7xl opacity-10 rotate-[10deg] select-none">
        🐾
      </span>

      <header className="relative z-10 mb-8 flex flex-col items-center text-center">
        <h1 className="font-diary text-5xl text-[#8a5a44] sm:text-6xl">
          🐾 멍그리는 하루
        </h1>
        <p className="mt-2 text-sm text-[#a5897c] sm:text-base">
          우리 강아지와 함께한 오늘을, 귀여운 만화 한 장으로 남겨보세요
        </p>
        <div className="mt-3 flex items-center gap-3 text-xs font-semibold">
          <Link
            href="/my-comics"
            className="text-[#8a5a44] underline underline-offset-2 hover:text-[#5c4438]"
          >
            📖 내 만화 목록 보기
          </Link>
          <span className="text-[#e0c9c9]">·</span>
          <button
            type="button"
            onClick={onSignOut}
            className="text-[#a5897c] underline underline-offset-2 hover:text-[#5c4438]"
          >
            로그아웃 ({profile.email})
          </button>
        </div>
      </header>

      {dailyStatus.loading && (
        <main className="relative z-10 flex w-full max-w-xl justify-center py-16">
          <span className="h-8 w-8 animate-spin rounded-full border-4 border-[#f2c877]/40 border-t-[#f2c877]" />
        </main>
      )}

      {!dailyStatus.loading && dailyStatus.limited && !dailyStatus.isAdmin && dailyStatus.entry && (
        <main className="relative z-10 w-full max-w-xl">
          <div className="rounded-[2rem] border border-[#f6dfe4] bg-white/80 p-6 text-center shadow-[0_10px_40px_-15px_rgba(200,150,160,0.4)] backdrop-blur-sm sm:p-9">
            <p className="mb-2 text-5xl">🐾</p>
            <h2 className="mb-1 font-diary text-2xl text-[#8a5a44]">
              오늘은 이미 {dailyStatus.entry.dog_name}의 하루를 기록했어요!
            </h2>
            <p className="mb-1 text-sm text-[#a5897c]">내일 다시 와주세요 🐾</p>
            {dailyStatus.nextResetAt && (
              <p className="mb-6 text-xs text-[#c9a9a0]">
                {formatCountdown(dailyStatus.nextResetAt, nowTick)}
              </p>
            )}

            {(() => {
              const entry = dailyStatus.entry;
              const panels = entry.comic_json?.panels ?? [];
              const title = entry.comic_json?.title ?? entry.dog_name;
              if (entry.image_url_final) {
                return (
                  <div className="relative aspect-square w-full overflow-hidden rounded-2xl border-2 border-[#cfe8f5] bg-[#eef8fd]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={entry.image_url_final} alt={title} className="h-full w-full object-cover" />
                  </div>
                );
              }
              if (entry.image_url && panels.length > 0) {
                return <ComicGrid imageUrl={entry.image_url} panels={panels} title={title} />;
              }
              if (entry.image_url) {
                return (
                  <div className="relative aspect-square w-full overflow-hidden rounded-2xl border-2 border-[#cfe8f5] bg-[#eef8fd]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={entry.image_url} alt={title} className="h-full w-full object-cover" />
                  </div>
                );
              }
              return null;
            })()}

            <p className="mt-4 whitespace-pre-wrap text-left text-sm leading-relaxed text-[#5c4438]">
              {dailyStatus.entry.diary_text}
            </p>

            <Link
              href="/my-comics"
              className="mt-6 inline-block text-xs font-semibold text-[#5c8299] underline underline-offset-2"
            >
              📖 내 만화 목록에서 더 보기
            </Link>
          </div>
        </main>
      )}

      {!dailyStatus.loading && (!dailyStatus.limited || dailyStatus.isAdmin) && (
        <>
      <main className="relative z-10 w-full max-w-xl">
        <form
          onSubmit={handleSubmit}
          className="rounded-[2rem] border border-[#f6dfe4] bg-white/80 p-6 shadow-[0_10px_40px_-15px_rgba(200,150,160,0.4)] backdrop-blur-sm sm:p-9"
        >
          {/* 강아지 이름 */}
          <div className="mb-6">
            <label
              htmlFor="dogName"
              className="mb-2 flex items-center gap-1.5 text-sm font-bold text-[#8a5a44]"
            >
              🐶 강아지 이름
            </label>
            <input
              id="dogName"
              type="text"
              value={dogName}
              onChange={(e) => setDogName(e.target.value)}
              placeholder="예: 콩이"
              maxLength={20}
              className="w-full rounded-2xl border-2 border-[#fcdce7] bg-[#fff8fa] px-4 py-3 text-[#5c4438] placeholder:text-[#c9a9a0] outline-none transition focus:border-[#f4a6c0] focus:bg-white"
            />
          </div>

          {/* 성격 */}
          <div className="mb-6">
            <label
              htmlFor="personality"
              className="mb-2 flex items-center gap-1.5 text-sm font-bold text-[#8a5a44]"
            >
              ✨ 성격{" "}
              <span className="font-normal text-[#c9a9a0]">(선택)</span>
            </label>
            <input
              id="personality"
              type="text"
              value={personality}
              onChange={(e) => setPersonality(e.target.value)}
              placeholder="예: 겁 많고 애교 많은 먹보"
              maxLength={40}
              className="w-full rounded-2xl border-2 border-[#fcdce7] bg-[#fff8fa] px-4 py-3 text-[#5c4438] placeholder:text-[#c9a9a0] outline-none transition focus:border-[#f4a6c0] focus:bg-white"
            />
          </div>

          {/* 사진 업로드 */}
          <div className="mb-6">
            <label className="mb-2 flex items-center gap-1.5 text-sm font-bold text-[#8a5a44]">
              📷 사진 업로드{" "}
              <span className="font-normal text-[#c9a9a0]">
                ({photos.length}/{MAX_PHOTOS})
              </span>
            </label>
            {hasProfilePhoto && (
              <p className="mb-2 text-xs text-[#8fae8f]">
                🐾 등록해둔 프로필 사진이 자동으로 참고 이미지로 사용돼요. 추가로 사진을 올리면 함께 참고해요.
              </p>
            )}

            {photos.length > 0 && (
              <div className="mb-3 grid grid-cols-2 gap-3">
                {photos.map((photo) => (
                  <div
                    key={photo.id}
                    className="group relative aspect-square overflow-hidden rounded-2xl border-2 border-[#cfe8f5] bg-[#eef8fd]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt={`업로드한 강아지 사진 ${photo.file.name}`}
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(photo.id)}
                      aria-label="사진 삭제"
                      className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-sm text-white transition hover:bg-black/70"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {remainingSlots > 0 && (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                role="button"
                tabIndex={0}
                className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition ${
                  isDragging
                    ? "border-[#8ec7e6] bg-[#dff1fa]"
                    : "border-[#bfe1f0] bg-[#eff9fd] hover:bg-[#e4f4fb]"
                }`}
              >
                <span className="text-3xl">📸</span>
                <p className="text-sm font-semibold text-[#5c8299]">
                  사진을 올리거나 끌어다 놓아주세요
                </p>
                <p className="text-xs text-[#9db8c6]">
                  최대 {MAX_PHOTOS}장 · JPG, PNG
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileInputChange}
                  className="hidden"
                />
              </div>
            )}
          </div>

          {/* 오늘의 일기 */}
          <div className="mb-7">
            <label
              htmlFor="diary"
              className="mb-2 flex items-center gap-1.5 text-sm font-bold text-[#8a5a44]"
            >
              📝 오늘의 일기
            </label>
            <textarea
              id="diary"
              value={diary}
              onChange={(e) => setDiary(e.target.value.slice(0, MAX_DIARY_LENGTH))}
              rows={4}
              placeholder={
                "오늘 우리 강아지와 있었던 일을 2~3줄로 적어주세요 🐾\n예: 오늘은 공원에서 신나게 뛰어놀고, 낮잠도 푹 잤어요!"
              }
              className="w-full resize-none rounded-2xl border-2 border-[#fbe6c4] bg-[#fffaf0] px-4 py-3 text-[#5c4438] placeholder:text-[#d9bd94] outline-none transition focus:border-[#f2c877] focus:bg-white"
            />
            <div className="mt-1 text-right text-xs text-[#c9a9a0]">
              {diary.length}/{MAX_DIARY_LENGTH}
            </div>
          </div>

          <button
            type="submit"
            disabled={!isFormValid || isLoading}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#f7a8c4] to-[#8fcbe8] py-4 text-base font-bold text-white shadow-lg shadow-pink-200/50 transition hover:scale-[1.02] hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
          >
            {isLoading ? (
              <>
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                콩닥콩닥 그리는 중...
              </>
            ) : (
              <>🎨 만화 만들기</>
            )}
          </button>

          {errorMessage && (
            <p className="mt-4 rounded-2xl bg-[#ffeef0] px-4 py-3 text-center text-sm text-[#c25d70]">
              😢 {errorMessage}
            </p>
          )}
        </form>
      </main>

      {/* 결과 */}
      {comic && (
        <div className="relative z-10 mt-6 flex w-full max-w-3xl flex-col gap-6">
          <section className="rounded-[2rem] border border-[#f6dfe4] bg-white/80 p-6 shadow-[0_10px_40px_-15px_rgba(200,150,160,0.4)] backdrop-blur-sm sm:p-9">
            <h2 className="mb-1 font-diary text-3xl text-[#8a5a44]">
              🎬 {comic.title}
            </h2>
            <p className="mb-6 text-xs text-[#c9a9a0]">
              2x2 그리드 한 장으로 생성 · API 호출 1회 (Nano Banana)
            </p>

            {gridResult.isLoading && (
              <div className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-[#fff3e4] px-4 py-16 text-center">
                <span className="h-10 w-10 animate-spin rounded-full border-4 border-[#f2c877]/40 border-t-[#f2c877]" />
                <p className="text-sm font-semibold text-[#8a5a44]">
                  4컷이 담긴 그림 한 장을 그리고 있어요 🎨
                </p>
                <p className="text-xs text-[#c9a9a0]">보통 10~30초 정도 걸려요</p>
              </div>
            )}

            {gridResult.error && (
              <p className="rounded-2xl bg-[#ffeef0] px-4 py-3 text-center text-sm text-[#c25d70]">
                😢 {gridResult.error}
              </p>
            )}

            {gridResult.image && (
              <>
                <ComicGrid imageUrl={gridResult.image} panels={sortedComicPanels} title={comic.title} />

                {gridResult.usage && (
                  <p className="mt-2 text-center text-xs text-[#c9a9a0]">
                    토큰 {gridResult.usage.tokens ?? "?"} · 생성 시간{" "}
                    {gridResult.usage.predictSeconds != null
                      ? `${gridResult.usage.predictSeconds.toFixed(1)}초`
                      : "?"}{" "}
                    · API 호출 1회
                  </p>
                )}

                <button
                  type="button"
                  onClick={() =>
                    void imageSaver.saveFull({
                      finalImageUrl: finalImage,
                      rawImageUrl: gridResult.image!,
                      panels: sortedComicPanels,
                      title: comic.title,
                    })
                  }
                  disabled={imageSaver.busyKey === "full"}
                  className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-[#8fcbe8] to-[#f7a8c4] py-2.5 text-sm font-bold text-white shadow-md transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {imageSaver.busyKey === "full" ? "저장 준비 중..." : "🖼️ 이미지 저장하기"}
                </button>

                <div className="mt-2 grid grid-cols-4 gap-2">
                  {[0, 1, 2, 3].map((i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() =>
                        void imageSaver.savePanel(
                          {
                            finalImageUrl: finalImage,
                            rawImageUrl: gridResult.image!,
                            panels: sortedComicPanels,
                            title: comic.title,
                          },
                          i,
                        )
                      }
                      disabled={imageSaver.busyKey === `panel-${i}`}
                      className="rounded-xl border-2 border-[#cfe8f5] bg-[#eef8fd] py-2 text-xs font-semibold text-[#5c8299] transition hover:bg-[#e4f4fb] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {imageSaver.busyKey === `panel-${i}` ? "..." : `컷${i + 1} ⬇`}
                    </button>
                  ))}
                </div>

                {imageSaver.message && (
                  <p className="mt-2 text-center text-xs font-semibold text-[#5c8299]">
                    {imageSaver.message}
                  </p>
                )}

                <p className="mt-3 text-center text-xs text-[#c9a9a0]">
                  {saveStatus === "saving" && "☁️ 내 만화 목록에 저장하는 중..."}
                  {saveStatus === "saved" && "✅ 내 만화 목록에 저장됐어요"}
                  {saveStatus === "error" && "😢 저장에 실패했어요"}
                </p>
              </>
            )}
          </section>

          <section className="rounded-[2rem] border border-[#f6dfe4] bg-white/60 p-6 shadow-[0_10px_40px_-15px_rgba(200,150,160,0.3)] backdrop-blur-sm sm:p-9">
            <p className="mb-2 text-xs text-[#c9a9a0]">콘티 원본 JSON</p>
            <pre className="max-h-[28rem] overflow-auto rounded-2xl bg-[#fffaf0] p-4 text-xs leading-relaxed text-[#5c4438]">
              {JSON.stringify(comic, null, 2)}
            </pre>
          </section>
        </div>
      )}
        </>
      )}
    </div>
  );
}
