"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

export type Profile = {
  id: string;
  email: string;
  dog_name: string;
  dog_breed: string | null;
  dog_traits: string[];
  created_at: string;
};

export type AuthStatus = "loading" | "signedOut" | "needsOnboarding" | "ready";

/** 로그인 상태 + 온보딩 완료 여부(profiles row 존재)를 함께 추적하는 훅.
 * "/"와 "/my-comics"가 동일한 규칙으로 화면을 분기할 수 있도록 공유한다. */
export function useAuthProfile() {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const loadProfile = useCallback(async (userId: string) => {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, dog_name, dog_breed, dog_traits, created_at")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("프로필을 불러오지 못했어요:", error.message);
      setStatus("needsOnboarding");
      return;
    }

    if (data) {
      setProfile(data as Profile);
      setStatus("ready");
    } else {
      setStatus("needsOnboarding");
    }
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) {
        void loadProfile(data.session.user.id);
      } else {
        setStatus("signedOut");
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        void loadProfile(newSession.user.id);
      } else {
        setProfile(null);
        setStatus("signedOut");
      }
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  const completeOnboarding = useCallback((newProfile: Profile) => {
    setProfile(newProfile);
    setStatus("ready");
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
  }, []);

  return { status, session, profile, completeOnboarding, signOut };
}
