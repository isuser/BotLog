"use client";

import { useRouter } from "next/navigation";
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
import { api, ApiRequestError } from "@/lib/client/api";
import { PROJECT_KEY_MAX, PROJECT_KEY_PATTERN, suggestKey } from "@/lib/client/project-key";
import type { Project } from "@/lib/client/types";

export function NewProjectDialog({ trigger }: { trigger: React.ReactElement }) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyEdited, setKeyEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const reset = () => {
    setName("");
    setKey("");
    setKeyEdited(false);
    setDescription("");
    setError(null);
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const { data } = await api<{ data: Project }>("/projects", {
        method: "POST",
        json: { name, key, ...(description ? { description } : {}) },
      });
      await mutate("/projects");
      setOpen(false);
      reset();
      router.push(`/projects/${data.key}`);
    } catch (e) {
      const details = e instanceof ApiRequestError ? e.details : undefined;
      setError(details?.length ? details.map((d) => `${d.path}: ${d.message}`).join(". ") : (e as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              The key prefixes task IDs, like {key || "BOT"}-1: 2 to 4 letters or digits. It can&apos;t be changed later.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <Alert variant="danger">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              required
              maxLength={100}
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!keyEdited) setKey(suggestKey(e.target.value));
              }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="project-key">Key</Label>
            <Input
              id="project-key"
              required
              pattern={PROJECT_KEY_PATTERN}
              title="2 to 4 letters or digits, starting with a letter"
              maxLength={PROJECT_KEY_MAX}
              value={key}
              onChange={(e) => {
                setKey(e.target.value.toUpperCase());
                setKeyEdited(true);
              }}
              className="font-mono uppercase"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="project-description">Description (optional)</Label>
            <Textarea
              id="project-description"
              maxLength={10000}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending || !name || !key}>
              {pending ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
