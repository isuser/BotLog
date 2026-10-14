"use client";

import { useEffect } from "react";
import useSWR, { useSWRConfig } from "swr";
import { api } from "@/lib/client/api";
import type { Project } from "@/lib/client/types";
import { browserClient } from "@/lib/supabase/browser";

/** Waits this long after an event before refetching, so a burst of changes is one refresh. */
const DEBOUNCE_MS = 400;

/**
 * Keeps the open project's pages current while someone else (often an agent) works on it.
 * Listens for changes in this project and refetches what's on screen through the API; the
 * events themselves are only signals and their contents are never used.
 */
export function ProjectRealtime({ projectKey }: { projectKey: string }) {
  const { mutate } = useSWRConfig();
  // Same key as the header and board, so it's already cached.
  const { data: project } = useSWR(`/projects/${projectKey}`, (path: string) =>
    api<{ data: Project }>(path).then((r) => r.data),
  );
  const projectId = project?.id;

  useEffect(() => {
    if (!projectId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Everything shown for this project: board, header counts, epics, labels, and any open
    // task or epic with its comments and activity. Only mounted keys actually refetch.
    const refresh = () =>
      mutate(
        (key) =>
          typeof key === "string" &&
          (key.startsWith(`/projects/${projectKey}`) || key.startsWith("/tasks/") || key.startsWith("/epics/")),
      );

    const schedule = () => {
      // A hidden tab catches up when it's focused again (SWR refetches on focus).
      if (document.visibilityState === "hidden") return;
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), DEBOUNCE_MS);
    };

    const supabase = browserClient();
    const filter = `project_id=eq.${projectId}`;
    let channel: ReturnType<typeof supabase.channel> | undefined;
    let cancelled = false;

    void (async () => {
      // Join as the signed-in user, not anon: Realtime applies this token's RLS to events.
      // The browser client loads the session from cookies asynchronously, so wait for it.
      const { data } = await supabase.auth.getSession();
      if (cancelled || !data.session) return;
      await supabase.realtime.setAuth(data.session.access_token);
      if (cancelled) return;
      channel = supabase
        .channel(`project:${projectId}`)
        // Every change to tasks, comments, labels and epics writes an activity row.
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_log", filter }, schedule)
        // Reordering inside a column isn't logged, so listen to task updates too.
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "task", filter }, schedule)
        .subscribe();
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [projectId, projectKey, mutate]);

  return null;
}
