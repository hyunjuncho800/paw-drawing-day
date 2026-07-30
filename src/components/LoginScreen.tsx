"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

type Mode = "login" | "signup";

export default function LoginScreen() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");

  const toggleMode = () => {
    setMode((prev) => (prev === "login" ? "signup" : "login"));
    setErrorMessage("");
    setInfoMessage("");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage("");
    setInfoMessage("");

    const supabase = getSupabaseBrowserClient();

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      setIsSubmitting(false);

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      // "Confirm email"이 꺼져 있으면 가입과 동시에 세션이 발급되고,
      // useAuthProfile의 onAuthStateChange가 이를 감지해 자동으로 다음 화면으로 넘어간다.
      if (!data.session) {
        setInfoMessage("가입 확인 메일을 보냈어요. 메일함을 확인하고 링크를 눌러주세요.");
      }
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message);
    }
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
          {mode === "login"
            ? "로그인하고 우리 강아지의 하루를 남겨보세요"
            : "가입하고 우리 강아지의 하루를 남겨보세요"}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-2xl border-2 border-[#fcdce7] bg-[#fff8fa] px-4 py-3 text-center text-[#5c4438] placeholder:text-[#c9a9a0] outline-none transition focus:border-[#f4a6c0] focus:bg-white"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호 (6자 이상)"
            className="w-full rounded-2xl border-2 border-[#fcdce7] bg-[#fff8fa] px-4 py-3 text-center text-[#5c4438] placeholder:text-[#c9a9a0] outline-none transition focus:border-[#f4a6c0] focus:bg-white"
          />
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#f7a8c4] to-[#8fcbe8] py-3 text-sm font-bold text-white shadow-lg shadow-pink-200/50 transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
          >
            {isSubmitting ? "처리하는 중..." : mode === "login" ? "로그인" : "회원가입"}
          </button>
        </form>

        <button
          type="button"
          onClick={toggleMode}
          className="mt-4 text-xs font-semibold text-[#5c8299] underline underline-offset-2"
        >
          {mode === "login" ? "계정이 없으신가요? 회원가입" : "이미 계정이 있으신가요? 로그인"}
        </button>

        {infoMessage && (
          <p className="mt-4 rounded-2xl bg-[#fff3e4] px-4 py-3 text-sm leading-relaxed text-[#8a5a44]">
            📩 {infoMessage}
          </p>
        )}

        {errorMessage && (
          <p className="mt-4 rounded-2xl bg-[#ffeef0] px-4 py-3 text-sm text-[#c25d70]">
            😢 {errorMessage}
          </p>
        )}
      </div>
    </div>
  );
}
