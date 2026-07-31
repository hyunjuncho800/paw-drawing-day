"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuthProfile } from "@/hooks/useAuthProfile";
import LoginScreen from "@/components/LoginScreen";
import OnboardingScreen from "@/components/OnboardingScreen";
import { ComicGrid, type ComicPanel } from "@/components/ComicGrid";

type ComicJson = { title?: string; panels?: ComicPanel[] } | null;

type ComicEntry = {
  id: string;
  dog_name: string;
  diary_text: string;
  comic_json: ComicJson;
  image_url: string | null;
  created_at: string;
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#FFF3E4] via-[#FDEAF0] to-[#E7F3FB]">
      <span className="h-10 w-10 animate-spin rounded-full border-4 border-[#f2c877]/40 border-t-[#f2c877]" />
    </div>
  );
}

/** 목록에서 클릭한 만화를 원본 크기로 크게 보여주는 모달.
 * 미리보기는 대사/일기 텍스트를 2줄로 잘라 보여주지만, 여기서는 전체가 다 보인다. */
function ComicDetailModal({ entry, onClose }: { entry: ComicEntry; onClose: () => void }) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[2rem] bg-white p-5 shadow-2xl sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-[#c9a9a0]">{formatDate(entry.created_at)}</p>
            <h2 className="font-diary text-2xl text-[#8a5a44]">
              🐶 {entry.dog_name}
              {entry.comic_json?.title ? ` · ${entry.comic_json.title}` : ""}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#fff3e4] text-[#8a5a44] transition hover:bg-[#ffeef4]"
          >
            ✕
          </button>
        </div>

        {entry.image_url && entry.comic_json?.panels ? (
          <ComicGrid
            imageUrl={entry.image_url}
            panels={entry.comic_json.panels}
            title={entry.comic_json?.title ?? entry.dog_name}
          />
        ) : entry.image_url ? (
          <div className="aspect-square w-full overflow-hidden rounded-2xl border-2 border-[#cfe8f5] bg-[#eef8fd]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={entry.image_url}
              alt={entry.comic_json?.title ?? entry.dog_name}
              className="h-full w-full object-cover"
            />
          </div>
        ) : null}

        <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-[#5c4438]">
          {entry.diary_text}
        </p>
      </div>
    </div>
  );
}

function ComicsList({ accessToken }: { accessToken: string }) {
  const [entries, setEntries] = useState<ComicEntry[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<ComicEntry | null>(null);

  useEffect(() => {
    fetch("/api/my-comics", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          setError(data.error ?? "목록을 불러오지 못했어요.");
          return;
        }
        setEntries(data.entries);
      })
      .catch(() => {
        setError("서버에 연결하지 못했어요.");
      })
      .finally(() => setIsLoading(false));
  }, [accessToken]);

  return (
    <div className="relative flex min-h-screen flex-col items-center overflow-hidden bg-gradient-to-br from-[#FFF3E4] via-[#FDEAF0] to-[#E7F3FB] px-4 py-10 sm:py-16">
      <span className="pointer-events-none absolute -left-4 top-10 text-6xl opacity-20 rotate-[-15deg] select-none">
        🐾
      </span>
      <span className="pointer-events-none absolute right-2 top-32 text-5xl opacity-20 rotate-[20deg] select-none">
        🐾
      </span>

      <header className="relative z-10 mb-8 flex w-full max-w-2xl flex-col items-center text-center">
        <Link
          href="/"
          className="mb-3 self-start text-xs font-semibold text-[#8a5a44] underline underline-offset-2 hover:text-[#5c4438]"
        >
          ← 돌아가기
        </Link>
        <h1 className="font-diary text-4xl text-[#8a5a44] sm:text-5xl">📖 내 만화 목록</h1>
        <p className="mt-2 text-sm text-[#a5897c]">우리 강아지와 쌓아온 하루하루예요</p>
      </header>

      <main className="relative z-10 w-full max-w-2xl">
        {isLoading && (
          <div className="flex flex-col items-center justify-center gap-2 rounded-[2rem] border border-[#f6dfe4] bg-white/80 px-4 py-16 text-center">
            <span className="h-8 w-8 animate-spin rounded-full border-4 border-[#f2c877]/40 border-t-[#f2c877]" />
            <p className="text-sm font-semibold text-[#8a5a44]">불러오는 중이에요...</p>
          </div>
        )}

        {!isLoading && error && (
          <p className="rounded-2xl bg-[#ffeef0] px-4 py-3 text-center text-sm text-[#c25d70]">
            😢 {error}
          </p>
        )}

        {!isLoading && !error && entries && entries.length === 0 && (
          <div className="rounded-[2rem] border border-[#f6dfe4] bg-white/80 px-4 py-16 text-center">
            <p className="text-sm font-semibold text-[#8a5a44]">
              아직 저장된 만화가 없어요
            </p>
            <Link
              href="/"
              className="mt-3 inline-block text-xs font-semibold text-[#5c8299] underline underline-offset-2"
            >
              첫 만화 만들러 가기 🎨
            </Link>
          </div>
        )}

        {!isLoading && !error && entries && entries.length > 0 && (
          <div className="flex flex-col gap-4">
            {entries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setSelectedEntry(entry)}
                className="flex gap-4 rounded-[2rem] border border-[#f6dfe4] bg-white/80 p-4 text-left shadow-[0_10px_40px_-15px_rgba(200,150,160,0.4)] backdrop-blur-sm transition hover:bg-white sm:p-5"
              >
                <div className="w-24 flex-shrink-0 sm:w-32">
                  {entry.image_url && entry.comic_json?.panels ? (
                    <ComicGrid
                      imageUrl={entry.image_url}
                      panels={entry.comic_json.panels}
                      title={entry.comic_json?.title ?? entry.dog_name}
                      size="thumbnail"
                    />
                  ) : entry.image_url ? (
                    <div className="aspect-square w-full overflow-hidden rounded-2xl border-2 border-[#cfe8f5] bg-[#eef8fd]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={entry.image_url}
                        alt={entry.comic_json?.title ?? entry.dog_name}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-1 flex-col justify-center">
                  <p className="text-xs text-[#c9a9a0]">{formatDate(entry.created_at)}</p>
                  <h2 className="font-diary text-xl text-[#8a5a44]">
                    🐶 {entry.dog_name}
                    {entry.comic_json?.title ? ` · ${entry.comic_json.title}` : ""}
                  </h2>
                  <p className="mt-1 line-clamp-2 text-sm text-[#5c4438]">{entry.diary_text}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      {selectedEntry && (
        <ComicDetailModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
      )}
    </div>
  );
}

export default function MyComics() {
  const { status, session, completeOnboarding } = useAuthProfile();

  if (status === "loading") {
    return <LoadingScreen />;
  }

  if (status === "signedOut" || !session) {
    return <LoginScreen />;
  }

  if (status === "needsOnboarding") {
    return <OnboardingScreen session={session} onComplete={completeOnboarding} />;
  }

  return <ComicsList accessToken={session.access_token} />;
}
