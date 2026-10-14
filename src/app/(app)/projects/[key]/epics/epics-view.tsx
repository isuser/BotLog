"use client";

import { CalendarIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api, apiAll, errorMessage } from "@/lib/client/api";
import { formatDate } from "@/lib/client/format";
import { EPIC_STATUS_BADGE, EPIC_STATUS_LABELS } from "@/lib/client/task-labels";
import type { Epic } from "@/lib/client/types";
import { EpicProgress } from "./epic-progress";

/** The project's active epics, oldest first, each with its progress. */
export function EpicsView({ projectKey }: { projectKey: string }) {
  const key = `/projects/${projectKey}/epics`;
  const { data: epics, error } = useSWR(key, (path: string) => apiAll<Epic>(path));

  return (
    <main className="mx-auto flex w-full max-w-[77rem] flex-1 flex-col gap-4 overflow-y-auto px-4 pb-8">
      <div className="flex items-center justify-between gap-4">
        <p className="text-muted-foreground text-sm">Group related tasks into epics and follow their progress.</p>
        <NewEpicDialog projectKey={projectKey} />
      </div>

      {error ? (
        <p className="text-danger">Couldn&apos;t load epics: {error.message}</p>
      ) : !epics ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : epics.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-1 rounded-xl border border-dashed py-16 text-center text-sm">
          <p className="text-foreground font-medium">No epics yet</p>
          <p>Create one, then add tasks to it from the task panel or the epic&apos;s page.</p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {epics.map((epic) => (
            <li key={epic.id}>
              <Link
                href={`/projects/${projectKey}/epics/${epic.id}`}
                className="bg-card hover:border-ring/50 flex h-full flex-col gap-3 rounded-xl border p-4 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-medium break-words">{epic.title}</h2>
                  <Badge variant={EPIC_STATUS_BADGE[epic.status]}>{EPIC_STATUS_LABELS[epic.status]}</Badge>
                </div>
                <div className="mt-auto flex flex-col gap-2">
                  <EpicProgress progress={epic.progress} />
                  {epic.target_date && (
                    <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                      <CalendarIcon className="size-3.5" /> Target {formatDate(epic.target_date)}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function NewEpicDialog({ projectKey }: { projectKey: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const { data } = await api<{ data: Epic }>(`/projects/${projectKey}/epics`, {
        method: "POST",
        json: { title, ...(targetDate ? { target_date: targetDate } : {}) },
      });
      setOpen(false);
      router.push(`/projects/${projectKey}/epics/${data.id}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setTitle("");
          setTargetDate("");
          setError(null);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button>
            <PlusIcon /> New epic
          </Button>
        }
      />
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>New epic</DialogTitle>
            <DialogDescription>A larger piece of work. Its progress comes from its tasks.</DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="danger">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-2">
            <Label htmlFor="epic-title">Title</Label>
            <Input id="epic-title" required maxLength={500} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="epic-target">Target date (optional)</Label>
            <Input id="epic-target" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending || !title.trim()}>
              Create epic
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
