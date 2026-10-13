"use client";

import { PlusIcon } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiAll } from "@/lib/client/api";
import { COLUMNS } from "@/lib/client/board";
import type { Project } from "@/lib/client/types";
import { NewProjectDialog } from "./new-project-dialog";

export function ProjectsView() {
  const { data: projects, error } = useSWR("/projects", (path: string) => apiAll<Project>(path));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-4 sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-4xl font-bold tracking-[-0.02em]">Projects</h1>
        <NewProjectDialog
          trigger={
            <Button size="lg">
              <PlusIcon /> New project
            </Button>
          }
        />
      </div>

      {error ? (
        <p className="text-danger">Couldn&apos;t load projects: {error.message}</p>
      ) : !projects ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-12 text-center">
          <p className="font-medium">No projects yet</p>
          <p className="text-muted-foreground text-sm">Create one to start adding tasks for you and your agents.</p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                href={`/projects/${project.key}`}
                className="bg-card hover:border-ring/60 flex h-full flex-col gap-3 rounded-xl border p-4 transition-colors"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium">{project.name}</span>
                  <span className="text-muted-foreground font-mono text-xs">{project.key}</span>
                </div>
                <dl className="text-muted-foreground mt-auto grid grid-cols-4 gap-2 text-xs">
                  {COLUMNS.map(({ status, title }) => (
                    <div key={status}>
                      <dt className="truncate">{title}</dt>
                      <dd className="text-foreground text-base font-medium">{project.task_counts[status]}</dd>
                    </div>
                  ))}
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
