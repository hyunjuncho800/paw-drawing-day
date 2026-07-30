"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || status === "sending") return;

    setStatus("sending");
    setErrorMessage("");

    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }

    setStatus("sent");
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[#FFF3E4] via-[#FDEAF0] to-[#E7F3FB] px-4 py-10">
      <span className="pointer-events-none absolute -left-4 top-10 text-6xl opacity-20 rotate-[-15deg] select-none">
        🐾
      </span>
      <span className="pointer-events-none absolute right-2 top-32 text-5xl opacity-20 rotate-[20deg] select-none">
        🐾
      </span>

      <div className="relative z-10 w-full max-w-sm rounded-[2rem] border border-[#f6dfe4] bg-white/80 p-8 text-center shadow-[0_10px_40px_-15px_rgba(200,150,160,0.4)] backdrop-blur-sm">
        <h1 className="font-diary text-4xl text-[#8a5a44]">🐾 멍그리는 하루</h1>
        <p className="mb-6 mt-2 text-sm text-[#a5897c]">
          이메일로 로그인하고 우리 강아지의 하루를 남겨보세요
        </p>

        {status === "sent" ? (
          <p className="rounded-2xl bg-[#fff3e4] px-4 py-6 text-sm leading-relaxed text-[#8a5a44]">
            📩 <strong>{email}</strong>로 로그인 링크를 보냈어요.
            <br />
            메일함을 확인해서 링크를 눌러주세요!
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-2xl border-2 border-[#fcdce7] bg-[#fff8fa] px-4 py-3 text-center text-[#5c4438] placeholder:text-[#c9a9a0] outline-none transition focus:border-[#f4a6c0] focus:bg-white"
            />
            <button
              type="submit"
              disabled={status === "sending"}
              className="flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#f7a8c4] to-[#8fcbe8] py-3 text-sm font-bold text-white shadow-lg shadow-pink-200/50 transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
            >
              {status === "sending" ? "보내는 중..." : "로그인 링크 받기"}
            </button>
          </form>
        )}

        {status === "error" && (
          <p className="mt-4 rounded-2xl bg-[#ffeef0] px-4 py-3 text-sm text-[#c25d70]">
            😢 {errorMessage}
          </p>
        )}
      </div>
    </div>
  );
}
