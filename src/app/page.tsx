"use client";

import { useAuthProfile } from "@/hooks/useAuthProfile";
import LoginScreen from "@/components/LoginScreen";
import OnboardingScreen from "@/components/OnboardingScreen";
import ComicCreatorApp from "@/components/ComicCreatorApp";

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#FFF3E4] via-[#FDEAF0] to-[#E7F3FB]">
      <span className="h-10 w-10 animate-spin rounded-full border-4 border-[#f2c877]/40 border-t-[#f2c877]" />
    </div>
  );
}

export default function Home() {
  const { status, session, profile, completeOnboarding, signOut } = useAuthProfile();

  if (status === "loading") {
    return <LoadingScreen />;
  }

  if (status === "signedOut" || !session) {
    return <LoginScreen />;
  }

  if (status === "needsOnboarding") {
    return <OnboardingScreen session={session} onComplete={completeOnboarding} />;
  }

  if (!profile) {
    return <LoadingScreen />;
  }

  return (
    <ComicCreatorApp
      profile={profile}
      accessToken={session.access_token}
      onSignOut={signOut}
    />
  );
}
