import type { Project } from "./types";

/**
 * Someone else's project the caller was invited to. A null role (a project from before shared
 * projects, with no members yet) is the caller's own.
 */
export const isShared = (project: Pick<Project, "role">) => project.role === "admin" || project.role === "member";
