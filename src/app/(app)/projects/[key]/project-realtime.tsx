"use client";

import useSWR from "swr";
import { api } from "@/lib/client/api";
import { useRealtimeRefresh } from "@/lib/client/realtime";
import type { Project } from "@/lib/client/types";

/**
 * Keeps the open project's pages current while someone else (often an agent) works on it:
 * board, list, header counts, epics, labels, and any open task or epic with its comments and
 * activity. Only mounted keys actually refetch.
 */
export function ProjectRealtime({ projectKey }: { projectKey: string }) {
  // Same key as the header and board, so it's already cached.
  const { data: project } = useSWR(`/projects/${projectKey}`, (path: string) =>
    api<{ data: Project }>(path).then((r) => r.data),
  );
  useRealtimeRefresh(
    project ? `project:${project.id}` : null,
    (key) => key.startsWith(`/projects/${projectKey}`) || key.startsWith("/tasks/") || key.startsWith("/epics/"),
    project?.id,
  );
  return null;
}
