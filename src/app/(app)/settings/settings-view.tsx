"use client";

import { CheckIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage } from "@/lib/client/api";
import { applyTheme, useTheme } from "@/lib/client/theme";
import type { Profile } from "@/lib/client/types";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const THEME_OPTIONS: { theme: Theme; name: string; description: string }[] = [
  { theme: "lime", name: "Lime", description: "Dark, bold and electric." },
  { theme: "sandpaper", name: "Sandpaper", description: "Warm, light and calm." },
];

export function SettingsView() {
  const { data: profile, error, mutate } = useSWR("/me", (path: string) =>
    api<{ data: Profile }>(path).then((r) => r.data),
  );

  async function save(change: Partial<Pick<Profile, "name" | "theme">>) {
    const { data } = await api<{ data: Profile }>("/me", { method: "PATCH", json: change });
    await mutate(data, { revalidate: false });
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 overflow-y-auto p-4 sm:p-8">
      <h1 className="font-display text-4xl font-bold tracking-[-0.02em]">Settings</h1>
      {error ? (
        <p className="text-danger">Couldn&apos;t load your profile: {error.message}</p>
      ) : !profile ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <>
          <ProfileSection key={profile.name} profile={profile} onSave={save} />
          <ThemeSection saved={profile.theme} onSave={save} />
        </>
      )}
    </main>
  );
}

function ProfileSection({
  profile,
  onSave,
}: {
  profile: Profile;
  onSave: (change: { name: string }) => Promise<void>;
}) {
  const [name, setName] = useState(profile.name);

  async function commit() {
    const trimmed = name.trim();
    if (trimmed === profile.name) return setName(profile.name);
    try {
      await onSave({ name: trimmed });
      toast("Name saved");
    } catch (error) {
      toast.error(errorMessage(error));
      setName(profile.name);
    }
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="settings-profile">
      <h2 id="settings-profile" className="text-sm font-semibold">
        Profile
      </h2>
      <div className="grid max-w-md gap-2">
        <Label htmlFor="settings-name">Name</Label>
        <Input
          id="settings-name"
          value={name}
          maxLength={100}
          placeholder={profile.email}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        <p className="text-muted-foreground text-xs">Shown on tasks, comments and activity.</p>
      </div>
      <div className="grid max-w-md gap-1">
        <span className="text-sm font-medium">Email</span>
        <span className="text-muted-foreground text-sm">{profile.email}</span>
      </div>
    </section>
  );
}

/** Two theme cards; picking one applies it at once and saves it to the profile. */
function ThemeSection({ saved, onSave }: { saved: Theme; onSave: (change: { theme: Theme }) => Promise<void> }) {
  const current = useTheme();

  async function pick(theme: Theme) {
    if (theme === current) return;
    applyTheme(theme);
    try {
      await onSave({ theme });
    } catch (error) {
      applyTheme(saved);
      toast.error(errorMessage(error));
    }
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="settings-theme">
      <h2 id="settings-theme" className="text-sm font-semibold">
        Theme
      </h2>
      <div role="radiogroup" aria-labelledby="settings-theme" className="grid gap-4 sm:grid-cols-2">
        {THEME_OPTIONS.map(({ theme, name, description }) => {
          const selected = theme === current;
          return (
            <button
              key={theme}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => void pick(theme)}
              className={cn(
                "bg-card flex flex-col gap-3 rounded-xl border p-3 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                selected ? "border-ring" : "hover:border-ring/50",
              )}
            >
              <ThemePreview theme={theme} />
              <span className="flex items-start justify-between gap-2 px-1">
                <span>
                  <span className="block text-sm font-semibold">{name}</span>
                  <span className="text-muted-foreground block text-sm">{description}</span>
                </span>
                {selected && (
                  <span className="bg-primary text-primary-foreground flex size-5 shrink-0 items-center justify-center rounded-full">
                    <CheckIcon className="size-3.5" />
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** A tiny board drawn with the theme's own tokens (the theme blocks apply to any data-theme element). */
function ThemePreview({ theme }: { theme: Theme }) {
  return (
    <span data-theme={theme} aria-hidden className="bg-background flex h-28 gap-2 rounded-lg border p-2.5">
      {(["border-t-status-todo", "border-t-status-in-progress"] as const).map((edge, i) => (
        <span key={edge} className={cn("bg-muted flex flex-1 flex-col gap-1.5 rounded-md border border-t-2 p-1.5", edge)}>
          <span className="bg-card flex flex-col gap-1 rounded border p-1.5">
            <span className="bg-foreground/80 h-1.5 w-3/4 rounded-full" />
            <span className="flex items-center justify-between">
              <span className={cn("h-2 w-6 rounded-sm", i === 0 ? "bg-danger" : "bg-warning")} />
              {i === 1 && <span className="bg-agent size-2.5 rounded-full" />}
            </span>
          </span>
          <span className="bg-card h-5 rounded border" />
        </span>
      ))}
    </span>
  );
}
