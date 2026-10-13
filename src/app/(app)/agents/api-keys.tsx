"use client";

import { CopyIcon, KeyRoundIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, apiAll, errorMessage } from "@/lib/client/api";
import { fullDate, timeAgo } from "@/lib/client/format";
import type { Agent, ApiKey, NewApiKey } from "@/lib/client/types";

/** An agent's keys: active first, then revoked ones (kept so activity stays traceable). */
export function ApiKeys({ agent, canManage }: { agent: Agent; canManage: boolean }) {
  const path = `/agents/${agent.id}/api-keys`;
  const { data: keys, error, mutate } = useSWR(canManage ? path : null, (p: string) => apiAll<ApiKey>(p));

  if (!canManage) return null;

  const active = keys?.filter((k) => !k.revoked_at) ?? [];
  const revoked = keys?.filter((k) => k.revoked_at) ?? [];

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">API keys</h3>
        {!agent.archived_at && (
          <NewKeyDialog
            agent={agent}
            onCreated={() => void mutate()}
            trigger={
              <Button variant="ghost" size="sm">
                <PlusIcon /> New key
              </Button>
            }
          />
        )}
      </div>

      {error ? (
        <p className="text-danger-foreground text-sm">Couldn&apos;t load keys: {error.message}</p>
      ) : !keys ? null : keys.length === 0 ? (
        <p className="text-muted-foreground text-sm">No keys yet. Create one to connect an AI client.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {[...active, ...revoked].map((key) => (
            <li key={key.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <KeyRoundIcon className="text-muted-foreground size-4 shrink-0" />
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center gap-2">
                  <span className={key.revoked_at ? "text-muted-foreground truncate line-through" : "truncate"}>
                    {key.name}
                  </span>
                  {key.revoked_at && <Badge variant="secondary">Revoked</Badge>}
                </div>
                <span className="text-muted-foreground text-xs">
                  <span className="font-mono">{key.prefix}…</span> · created{" "}
                  <span title={fullDate(key.created_at)}>{timeAgo(key.created_at)}</span> ·{" "}
                  {key.last_used_at ? (
                    <span title={fullDate(key.last_used_at)}>used {timeAgo(key.last_used_at)}</span>
                  ) : (
                    "never used"
                  )}
                </span>
              </div>
              {!key.revoked_at && <RevokeKeyDialog agent={agent} apiKey={key} onRevoked={() => void mutate()} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NewKeyDialog({
  agent,
  trigger,
  onCreated,
}: {
  agent: Agent;
  trigger: React.ReactElement;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [created, setCreated] = useState<NewApiKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const { data } = await api<{ data: NewApiKey }>(`/agents/${agent.id}/api-keys`, {
        method: "POST",
        json: { name },
      });
      setCreated(data);
      onCreated();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} copied`);
    } catch {
      toast.error("Couldn't copy. Select the key and copy it instead.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          // The key is gone once the dialog closes; it's never shown again.
          setName("");
          setCreated(null);
          setError(null);
        }
      }}
    >
      <DialogTrigger render={trigger} />
      {/* A grid track sized to the modal, so the long key and command wrap instead of widening it. */}
      <DialogContent className="grid-cols-[minmax(0,1fr)]">
        {created ? (
          <div className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Copy your key</DialogTitle>
              <DialogDescription>
                This is the only time it&apos;s shown. Connect your AI client to the MCP server below, sending
                the key as <code className="font-mono">Authorization: Bearer &lt;key&gt;</code>.
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-2">
              <Input
                readOnly
                aria-label="API key"
                value={created.key}
                className="font-mono"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button variant="outline" size="icon" aria-label="Copy key" onClick={() => void copy(created.key, "Key")}>
                <CopyIcon />
              </Button>
            </div>
            <ConnectCommand apiKey={created.key} onCopy={(command) => void copy(command, "Command")} />
            <DialogFooter>
              <DialogClose render={<Button>Done</Button>} />
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>New key for {agent.name}</DialogTitle>
              <DialogDescription>Name it after where it&apos;s used, so you know which one to revoke.</DialogDescription>
            </DialogHeader>
            {error && (
              <Alert variant="danger">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="key-name">Name</Label>
              <Input
                id="key-name"
                required
                maxLength={100}
                autoFocus
                placeholder="Claude Code on my laptop"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending || !name.trim()}>
                {pending ? "Creating…" : "Create key"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The MCP server URL, and the command that adds it to Claude Code with this key. */
function ConnectCommand({ apiKey, onCopy }: { apiKey: string; onCopy: (command: string) => void }) {
  const url = `${window.location.origin}/api/mcp`;
  const command = `claude mcp add --transport http botlog ${url} --header "Authorization: Bearer ${apiKey}"`;
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-muted-foreground">
        MCP server: <code className="text-foreground font-mono break-all">{url}</code>. For Claude Code:
      </p>
      <div className="flex gap-2">
        <pre className="bg-muted min-w-0 flex-1 rounded-md px-3 py-2 font-mono text-xs break-all whitespace-pre-wrap">
          {command}
        </pre>
        <Button variant="outline" size="icon" aria-label="Copy command" className="self-start" onClick={() => onCopy(command)}>
          <CopyIcon />
        </Button>
      </div>
    </div>
  );
}

function RevokeKeyDialog({ agent, apiKey, onRevoked }: { agent: Agent; apiKey: ApiKey; onRevoked: () => void }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function revoke() {
    setPending(true);
    try {
      await api(`/agents/${agent.id}/api-keys/${apiKey.id}`, { method: "DELETE" });
      onRevoked();
      setOpen(false);
      toast(`Revoked "${apiKey.name}"`);
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
            Revoke
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revoke &quot;{apiKey.name}&quot;?</DialogTitle>
          <DialogDescription>
            Clients using this key stop working right away. A revoked key can&apos;t be restored.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Cancel</Button>} />
          <Button variant="destructive" disabled={pending} onClick={() => void revoke()}>
            {pending ? "Revoking…" : "Revoke key"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
