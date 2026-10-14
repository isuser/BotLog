import { useEffect } from "react";
import { useSWRConfig } from "swr";
import { browserClient } from "@/lib/supabase/browser";

/** Waits this long after an event before refetching, so a burst of changes is one refresh. */
const DEBOUNCE_MS = 400;

/**
 * Refetches the SWR keys that `matches` picks whenever tasks, comments, labels or epics change.
 * Listens to activity_log inserts (every such change writes one) and task updates (reordering
 * isn't logged), optionally only for one project. Realtime applies the user's RLS, so without a
 * project it covers their workspace. Events are only signals: their contents are never used.
 * Pass `channel: null` to wait (e.g. until a project's id is known).
 */
export function useRealtimeRefresh(channel: string | null, matches: (key: string) => boolean, projectId?: string) {
  const { mutate } = useSWRConfig();

  useEffect(() => {
    if (!channel) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let subscription: ReturnType<ReturnType<typeof browserClient>["channel"]> | undefined;
    let cancelled = false;

    const schedule = () => {
      // A hidden tab catches up when it's focused again (SWR refetches on focus).
      if (document.visibilityState === "hidden") return;
      clearTimeout(timer);
      timer = setTimeout(() => void mutate((key) => typeof key === "string" && matches(key)), DEBOUNCE_MS);
    };

    const supabase = browserClient();
    const filter = projectId ? { filter: `project_id=eq.${projectId}` } : {};
    void (async () => {
      // Join as the signed-in user, not anon: Realtime applies this token's RLS to events.
      // The browser client loads the session from cookies asynchronously, so wait for it.
      const { data } = await supabase.auth.getSession();
      if (cancelled || !data.session) return;
      await supabase.realtime.setAuth(data.session.access_token);
      if (cancelled) return;
      subscription = supabase
        .channel(channel)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_log", ...filter }, schedule)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "task", ...filter }, schedule)
        .subscribe();
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (subscription) void supabase.removeChannel(subscription);
    };
    // `matches` is a new function each render; the channel name already captures what it selects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, projectId, mutate]);
}
