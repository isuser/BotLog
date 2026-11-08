"use client";

import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import { Skeleton } from "@/components/ui/skeleton";
import { ambiguousMatches, api } from "@/lib/client/api";
import { isFullSegment, projectLabel, segmentLabel, toSegment } from "@/lib/client/refs";
import type { Project } from "@/lib/client/types";
import { cn } from "@/lib/utils";

/** The project's name and key, and tabs for its Board, Backlog, List, Epics and Settings. Hidden if the project can't load. */
export function ProjectHeader({ projectKey }: { projectKey: string }) {
  const { data: project, error } = useSWR(`/projects/${projectKey}`, (path: string) =>
    api<{ data: Project }>(path).then((r) => r.data),
  );
  const pathname = usePathname();
  const base = `/projects/${projectKey}`;
  const matches = ambiguousMatches(error);
  if (matches) return <AmbiguousProject projectKey={projectKey} matches={matches} subpath={pathname.slice(base.length)} />;
  if (error) return null;

  const inBacklog = pathname.startsWith(`${base}/backlog`);
  const inList = pathname.startsWith(`${base}/list`);
  const inEpics = pathname.startsWith(`${base}/epics`);
  const inSettings = pathname.startsWith(`${base}/settings`);
  const tabs = [
    { href: base, label: "Board", active: !inBacklog && !inList && !inEpics && !inSettings },
    { href: `${base}/backlog`, label: "Backlog", active: inBacklog },
    { href: `${base}/list`, label: "List", active: inList },
    { href: `${base}/epics`, label: "Epics", active: inEpics },
    { href: `${base}/settings`, label: "Settings", active: inSettings },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[77rem] flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-4 pb-4">
      <Link href="/" aria-label="Back to projects" className="text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" />
      </Link>
      {project ? (
        <h1 className="font-display min-w-0 truncate text-4xl font-bold tracking-[-0.02em]">
          {project.name}{" "}
          <span className="text-muted-foreground font-mono text-sm font-normal tracking-normal">
            {projectLabel(project, isFullSegment(projectKey))}
          </span>
        </h1>
      ) : (
        <Skeleton className="h-10 w-64" />
      )}
      <nav aria-label="Project views" className="bg-muted ml-auto flex gap-1 rounded-lg border p-1">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={tab.active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1 text-sm font-medium transition-colors",
              tab.active ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

/**
 * A bare key that matches several projects the viewer can see (theirs and one shared with
 * them, say). Never guess: link each one's full form, on the same page.
 */
function AmbiguousProject({ projectKey, matches, subpath }: { projectKey: string; matches: string[]; subpath: string }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col items-center gap-3 p-8 text-center">
      <p className="font-medium">{segmentLabel(projectKey)} matches more than one project</p>
      <p className="text-muted-foreground text-sm">
        Projects shared with you can use the same key as yours. Pick one; it shows with its owner&apos;s handle in front.
      </p>
      <ul className="flex flex-col gap-1">
        {matches.map((ref) => (
          <li key={ref}>
            <Link href={`/projects/${toSegment(ref)}${subpath.startsWith("/tasks/") ? "" : subpath}`} className="font-mono text-sm underline">
              {ref}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
