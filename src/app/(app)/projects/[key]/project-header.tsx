"use client";

import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/client/api";
import type { Project } from "@/lib/client/types";
import { cn } from "@/lib/utils";

/** The project's name and key, and tabs for its Board and Epics. Hidden if the project can't load. */
export function ProjectHeader({ projectKey }: { projectKey: string }) {
  const { data: project, error } = useSWR(`/projects/${projectKey}`, (path: string) =>
    api<{ data: Project }>(path).then((r) => r.data),
  );
  const pathname = usePathname();
  if (error) return null;

  const base = `/projects/${projectKey}`;
  const tabs = [
    { href: base, label: "Board", active: !pathname.startsWith(`${base}/epics`) },
    { href: `${base}/epics`, label: "Epics", active: pathname.startsWith(`${base}/epics`) },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[77rem] flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-4 pb-4">
      <Link href="/" aria-label="Back to projects" className="text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" />
      </Link>
      {project ? (
        <h1 className="font-display min-w-0 truncate text-4xl font-bold tracking-[-0.02em]">
          {project.name}{" "}
          <span className="text-muted-foreground font-mono text-sm font-normal tracking-normal">{project.key}</span>
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
