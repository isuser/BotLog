"use client";

import { useEffect } from "react";
import useSWR from "swr";
import { api } from "@/lib/client/api";
import { applyTheme } from "@/lib/client/theme";
import type { Profile } from "@/lib/client/types";

/** Applies the theme saved in the profile, e.g. one changed on another device. */
export function ThemeSync() {
  const { data: profile } = useSWR("/me", (path: string) => api<{ data: Profile }>(path).then((r) => r.data));
  useEffect(() => {
    if (profile) applyTheme(profile.theme);
  }, [profile]);
  return null;
}
