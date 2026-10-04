"use client";
import { ProfileReview } from "./profile-review";

/** Preferences remain editable without another mandatory onboarding step. */
export function Preferences() {
  return <ProfileReview preferencesOnly />;
}
