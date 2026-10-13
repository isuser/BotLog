"use client";

import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import useSWR, { useSWRConfig } from "swr";
import { ActorAvatar } from "@/components/actor-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { api, apiAll, errorMessage } from "@/lib/client/api";
import type { Agent } from "@/lib/client/types";
import type { SessionUser } from "@/lib/auth/session";
import { AgentDialog } from "./agent-dialog";
import { ApiKeys } from "./api-keys";

const fetchAll = (path: string) => apiAll<Agent>(path);

export function AgentsView({ currentUser }: { currentUser: SessionUser }) {
  const { data: agents, error } = useSWR("/agents", fetchAll);
  const [showArchived, setShowArchived] = useState(false);
  const { data: archived } = useSWR(showArchived ? "/agents?archived=true" : null, fetchAll);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-4xl font-bold tracking-[-0.02em]">Agents</h1>
        <AgentDialog
          trigger={
            <Button size="lg">
              <PlusIcon /> New agent
            </Button>
          }
        />
      </div>

      {error ? (
        <p className="text-danger">Couldn&apos;t load agents: {error.message}</p>
      ) : !agents ? (
        <div className="flex flex-col gap-4">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-12 text-center">
          <p className="font-medium">No agents yet</p>
          <p className="text-muted-foreground text-sm">
            Create an agent, give it an API key, and connect your AI client to work on tasks with you.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {agents.map((agent) => (
            <li key={agent.id}>
              <AgentCard agent={agent} canManage={agent.owner_user_id === currentUser.id} />
            </li>
          ))}
        </ul>
      )}

      {agents && (
        <div className="flex flex-col gap-4">
          <Button variant="link" className="self-start px-0" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "Hide archived agents" : "Show archived agents"}
          </Button>
          {showArchived &&
            (!archived ? (
              <Skeleton className="h-20 rounded-xl" />
            ) : archived.length === 0 ? (
              <p className="text-muted-foreground text-sm">No archived agents.</p>
            ) : (
              <ul className="flex flex-col gap-4">
                {archived.map((agent) => (
                  <li key={agent.id}>
                    <AgentCard agent={agent} canManage={agent.owner_user_id === currentUser.id} />
                  </li>
                ))}
              </ul>
            ))}
        </div>
      )}
    </main>
  );
}

function AgentCard({ agent, canManage }: { agent: Agent; canManage: boolean }) {
  const { mutate } = useSWRConfig();
  const [pending, setPending] = useState(false);

  async function restore() {
    setPending(true);
    try {
      await api(`/agents/${agent.id}/restore`, { method: "POST" });
      await Promise.all([mutate("/agents"), mutate("/agents?archived=true")]);
      toast(`Restored ${agent.name}. Its unrevoked keys work again.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="bg-card flex flex-col gap-4 rounded-xl border p-4">
      <div className="flex items-start gap-3">
        <ActorAvatar actor={{ type: "agent", id: agent.id, name: agent.name, avatar: agent.avatar }} className="size-8" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate font-medium">{agent.name}</h2>
            {agent.archived_at && <Badge variant="secondary">Archived</Badge>}
          </div>
          {agent.description && (
            <p className="text-muted-foreground text-sm whitespace-pre-wrap">{agent.description}</p>
          )}
        </div>
        {canManage && (
          <div className="flex shrink-0 gap-1">
            {agent.archived_at ? (
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => void restore()}>
                Restore
              </Button>
            ) : (
              <>
                <AgentDialog
                  agent={agent}
                  trigger={
                    <Button variant="ghost" size="sm">
                      Edit
                    </Button>
                  }
                />
                <ArchiveAgentDialog agent={agent} />
              </>
            )}
          </div>
        )}
      </div>
      <ApiKeys agent={agent} canManage={canManage} />
    </article>
  );
}

function ArchiveAgentDialog({ agent }: { agent: Agent }) {
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function archive() {
    setPending(true);
    try {
      await api(`/agents/${agent.id}`, { method: "DELETE" });
      await Promise.all([mutate("/agents"), mutate("/agents?archived=true")]);
      setOpen(false);
      toast(`Archived ${agent.name}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm">
            Archive
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive {agent.name}?</DialogTitle>
          <DialogDescription>
            Its API keys stop working, and work again if you restore it, so revoke any key that leaked. Its tasks, comments and activity stay as they are.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Cancel</Button>} />
          <Button variant="destructive" disabled={pending} onClick={() => void archive()}>
            {pending ? "Archiving…" : "Archive agent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
