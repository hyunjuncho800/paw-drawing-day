"use client";

import { useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import type { Profile } from "@/hooks/useAuthProfile";

const DOG_PHOTOS_BUCKET = "dog-photos";
const MAX_PHOTOS = 4;

const TRAIT_OPTIONS = [
  "활발함",
  "겁많음",
  "애교많음",
  "느긋함",
  "장난꾸러기",
  "고집쟁이",
  "먹보",
  "순둥이",
  "낯가림",
];

const DOG_BREED_SUGGESTIONS = [
  "말티즈",
  "푸들",
  "포메라니안",
  "시츄",
  "비숑 프리제",
  "치와와",
  "진돗개",
  "골든 리트리버",
  "래브라도 리트리버",
  "웰시코기",
  "닥스훈트",
  "시바견",
  "보더콜리",
  "불독",
  "요크셔테리어",
  "믹스견",
];

export default function OnboardingScreen({
  session,
  onComplete,
}: {
  session: Session;
  onComplete: (profile: Profile) => void;
}) {
  const [dogName, setDogName] = useState("");
  const [dogBreed, setDogBreed] = useState("");
  const [selectedTraits, setSelectedTraits] = useState<Set<string>>(new Set());
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const toggleTrait = (trait: string) => {
    setSelectedTraits((prev) => {
      const next = new Set(prev);
      if (next.has(trait)) {
        next.delete(trait);
      } else {
        next.add(trait);
      }
      return next;
    });
  };

  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (newFiles.length === 0) return;

    const combined = [...photoFiles, ...newFiles].slice(0, MAX_PHOTOS);
    setPhotoFiles(combined);
    setPhotoPreviewUrls(combined.map((f) => URL.createObjectURL(f)));
  };

  const removePhoto = (index: number) => {
    setPhotoFiles((prev) => prev.filter((_, i) => i !== index));
    setPhotoPreviewUrls((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!dogName.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage("");

    const supabase = getSupabaseBrowserClient();

    // 매직링크 리다이렉트 직후 세션이 아직 완전히 붙지 않은 상태로 제출될 수 있어,
    // prop으로 받은 session을 그대로 믿지 않고 제출 시점에 다시 확인한다.
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const currentSession = sessionData.session ?? session;

    if (sessionError || !currentSession) {
      setIsSubmitting(false);
      setErrorMessage("로그인 세션이 만료됐어요. 새로고침 후 다시 로그인해주세요.");
      return;
    }

    // 여러 각도 사진을 다 올려두면 만화 생성 시 모두 참고 이미지로 써서 정확도가 올라간다.
    const photoUrls: string[] = [];
    for (const file of photoFiles) {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${currentSession.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(DOG_PHOTOS_BUCKET)
        .upload(path, file, { upsert: false });

      if (uploadError) {
        setIsSubmitting(false);
        setErrorMessage(`사진 업로드에 실패했어요: ${uploadError.message}`);
        return;
      }

      const { data: publicUrlData } = supabase.storage.from(DOG_PHOTOS_BUCKET).getPublicUrl(path);
      photoUrls.push(publicUrlData.publicUrl);
    }

    const { data, error } = await supabase
      .from("profiles")
      .insert({
        id: currentSession.user.id,
        email: currentSession.user.email ?? "",
        dog_name: dogName.trim(),
        dog_breed: dogBreed.trim() || null,
        dog_traits: Array.from(selectedTraits),
        photo_url: photoUrls[0] ?? null,
        photo_urls: photoUrls,
      })
      .select("id, email, dog_name, dog_breed, dog_traits, photo_url, photo_urls, dog_appearance, photo_face_crop, created_at")
      .single();

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    onComplete(data as Profile);
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[#FFF3E4] via-[#FDEAF0] to-[#E7F3FB] px-4 py-10">
      <span className="pointer-events-none absolute -left-4 top-10 text-6xl opacity-20 rotate-[-15deg] select-none">
        🐾
      </span>
      <span className="pointer-events-none absolute right-2 top-32 text-5xl opacity-20 rotate-[20deg] select-none">
        🐾
      </span>

      <div className="relative z-10 w-full max-w-md rounded-[2rem] border border-[#f6dfe4] bg-white/80 p-8 shadow-[0_10px_40px_-15px_rgba(200,150,160,0.4)] backdrop-blur-sm">
        <h1 className="mb-1 text-center font-diary text-3xl text-[#8a5a44]">🐶 반가워요!</h1>
        <p className="mb-6 text-center text-sm text-[#a5897c]">우리 강아지에 대해 알려주세요</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <label
              htmlFor="onboardingDogName"
              className="mb-2 block text-sm font-bold text-[#8a5a44]"
            >
              🐶 강아지 이름
            </label>
            <input
              id="onboardingDogName"
              type="text"
              required
              value={dogName}
              onChange={(e) => setDogName(e.target.value)}
              placeholder="예: 콩이"
              maxLength={20}
              className="w-full rounded-2xl border-2 border-[#fcdce7] bg-[#fff8fa] px-4 py-3 text-[#5c4438] placeholder:text-[#c9a9a0] outline-none transition focus:border-[#f4a6c0] focus:bg-white"
            />
          </div>

          <div>
            <label
              htmlFor="onboardingDogBreed"
              className="mb-2 flex items-center gap-1.5 text-sm font-bold text-[#8a5a44]"
            >
              🐕 품종 <span className="font-normal text-[#c9a9a0]">(선택)</span>
            </label>
            <input
              id="onboardingDogBreed"
              type="text"
              value={dogBreed}
              onChange={(e) => setDogBreed(e.target.value)}
              placeholder="예: 골든 리트리버"
              maxLength={30}
              list="dog-breed-options"
              className="w-full rounded-2xl border-2 border-[#fcdce7] bg-[#fff8fa] px-4 py-3 text-[#5c4438] placeholder:text-[#c9a9a0] outline-none transition focus:border-[#f4a6c0] focus:bg-white"
            />
            <datalist id="dog-breed-options">
              {DOG_BREED_SUGGESTIONS.map((breed) => (
                <option key={breed} value={breed} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="mb-2 flex items-center gap-1.5 text-sm font-bold text-[#8a5a44]">
              📷 사진 <span className="font-normal text-[#c9a9a0]">(선택, 최대 {MAX_PHOTOS}장)</span>
            </label>
            <div className="flex flex-wrap items-center gap-3">
              {photoPreviewUrls.map((url, i) => (
                <div key={url} className="relative h-16 w-16 flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`강아지 사진 ${i + 1}`}
                    className="h-full w-full rounded-2xl border-2 border-[#cfe8f5] object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    aria-label="사진 삭제"
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-xs text-white transition hover:bg-black/70"
                  >
                    ×
                  </button>
                </div>
              ))}

              {photoFiles.length < MAX_PHOTOS && (
                <>
                  <label
                    htmlFor="onboardingDogPhoto"
                    className="flex h-16 w-16 flex-shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-2xl border-2 border-dashed border-[#fcdce7] bg-[#fff8fa] text-[#8a5a44] transition hover:bg-[#ffeef4]"
                  >
                    <span className="text-xl">+</span>
                    <span className="text-[10px]">추가</span>
                  </label>
                  <input
                    id="onboardingDogPhoto"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handlePhotoChange}
                    className="hidden"
                  />
                </>
              )}
            </div>
            <p className="mt-1.5 text-xs text-[#c9a9a0]">
              여러 각도(정면, 클로즈업 등)의 사진을 올려두면 만화 속 강아지 얼굴이 더 정확하게 재현돼요.
            </p>
          </div>

          <div>
            <span className="mb-2 flex items-center gap-1.5 text-sm font-bold text-[#8a5a44]">
              ✨ 성격 <span className="font-normal text-[#c9a9a0]">(선택, 여러 개 가능)</span>
            </span>
            <div className="flex flex-wrap gap-2">
              {TRAIT_OPTIONS.map((trait) => {
                const active = selectedTraits.has(trait);
                return (
                  <button
                    key={trait}
                    type="button"
                    onClick={() => toggleTrait(trait)}
                    className={`rounded-full border-2 px-3 py-1.5 text-xs font-semibold transition ${
                      active
                        ? "border-[#f4a6c0] bg-[#f7a8c4] text-white"
                        : "border-[#fcdce7] bg-[#fff8fa] text-[#8a5a44] hover:bg-[#ffeef4]"
                    }`}
                  >
                    {trait}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            disabled={!dogName.trim() || isSubmitting}
            className="mt-2 flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#f7a8c4] to-[#8fcbe8] py-3 text-sm font-bold text-white shadow-lg shadow-pink-200/50 transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
          >
            {isSubmitting ? "저장하는 중..." : "시작하기 🎨"}
          </button>

          {errorMessage && (
            <p className="rounded-2xl bg-[#ffeef0] px-4 py-3 text-center text-sm text-[#c25d70]">
              😢 {errorMessage}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
