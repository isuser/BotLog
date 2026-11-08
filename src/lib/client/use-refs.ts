"use client";

import { useParams } from "next/navigation";
import { useMemo } from "react";
import useSWR from "swr";
import { apiAll } from "./api";
import { clashingKeys, isFullSegment, taskProjectSegment } from "./refs";
import type { Project, Task } from "./types";

/**
 * Whether the project page's URL uses the full form (`/projects/ana%2FBOT`). Project pages
 * show and link full IDs exactly when their URL does, so they need no projects list.
 */
export function useFullFormUrl(): boolean {
  const { key } = useParams<{ key?: string }>();
  return key ? isFullSegment(key) : false;
}

/** The segment for a task's project API paths on a project page (`BOT` or `ana%2FBOT`), matching the page's own. */
export function useTaskProjectSegment(task: Pick<Task, "project_key" | "full_id">): string {
  return taskProjectSegment(task, useFullFormUrl());
}

/**
 * Whether to show a project's tasks in the full form: on a project page when its URL does;
 * elsewhere (My tasks) when the viewer sees another project with the same key.
 */
export function useFullFormFor(): (projectKey: string) => boolean {
  const { key } = useParams<{ key?: string }>();
  const clashes = useClashingKeys(!key);
  return (projectKey) => (key ? isFullSegment(key) : clashes.has(projectKey));
}

/** The keys the viewer sees on more than one project, from the projects list (shared with the projects page). */
export function useClashingKeys(enabled = true): Set<string> {
  const { data: projects } = useSWR(enabled ? "/projects" : null, (path: string) => apiAll<Project>(path));
  return useMemo(() => clashingKeys(projects ?? []), [projects]);
}
