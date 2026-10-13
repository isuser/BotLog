"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/client/api";
import type { Agent } from "@/lib/client/types";

/** Creates an agent, or edits `agent` when given. */
export function AgentDialog({ agent, trigger }: { agent?: Agent; trigger: React.ReactElement }) {
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(agent?.name ?? "");
  const [description, setDescription] = useState(agent?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const reset = () => {
    setName(agent?.name ?? "");
    setDescription(agent?.description ?? "");
    setError(null);
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api(agent ? `/agents/${agent.id}` : "/agents", {
        method: agent ? "PATCH" : "POST",
        json: { name, description },
      });
      await mutate("/agents");
      setOpen(false);
      if (!agent) reset();
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
        if (next) reset();
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{agent ? "Edit agent" : "New agent"}</DialogTitle>
            <DialogDescription>
              An agent is an AI teammate. Give it API keys to connect an AI client, and assign it tasks.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <Alert variant="danger">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="agent-name">Name</Label>
            <Input
              id="agent-name"
              required
              maxLength={100}
              autoFocus
              placeholder="Claude"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="agent-description">Description (optional)</Label>
            <Textarea
              id="agent-description"
              maxLength={2000}
              rows={3}
              placeholder="What it works on, which client it runs in"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? "Saving…" : agent ? "Save" : "Create agent"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
