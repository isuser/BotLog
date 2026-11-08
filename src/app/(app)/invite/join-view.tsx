"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiRequestError, errorMessage } from "@/lib/client/api";
import { forgetInviteToken, inviteToken } from "@/lib/client/invite-token";
import type { InvitePreview, Project } from "@/lib/client/types";
import { projectHref } from "@/lib/client/refs";

const DEAD: Record<Exclude<InvitePreview["state"], "valid">, string> = {
  expired: "This invite link has expired.",
  used: "This invite link has already been used.",
  revoked: "This invite link was revoked.",
};

export function JoinView() {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  // undefined until read in the browser; null when there's no token at all.
  const [token, setToken] = useState<string | null | undefined>(undefined);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the token only exists in the browser
  useEffect(() => setToken(inviteToken()), []);

  const { data: invite, error } = useSWR(
    token ? ["invite-preview", token] : null,
    ([, t]) => api<{ data: InvitePreview }>("/invites/preview", { method: "POST", json: { token: t } }).then((r) => r.data),
    { revalidateOnFocus: false },
  );
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const join = async () => {
    setJoining(true);
    setJoinError(null);
    try {
      const { data: project } = await api<{ data: Project }>("/invites/accept", { method: "POST", json: { token } });
      forgetInviteToken();
      const projects = await mutate<Project[]>("/projects");
      router.push(projectHref(project, projects ?? [project]));
    } catch (e) {
      setJoinError(errorMessage(e));
      setJoining(false);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 p-4 sm:p-8">
      {token === null || (error instanceof ApiRequestError && error.status === 404) ? (
        <Message title="Invite not found">
          This invite link doesn&apos;t work. Check that you copied all of it, or ask for a new one.
        </Message>
      ) : error ? (
        <Message title="Couldn't load this invite">{error.message}</Message>
      ) : !invite ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : invite.is_member && invite.project ? (
        <Message title={`You're already in ${invite.project.name}`}>
          <Button nativeButton={false} render={<Link href={`/projects/${invite.project.key}`} />}>
            Open the project
          </Button>
        </Message>
      ) : invite.state !== "valid" || !invite.project ? (
        <Message title="Can't join with this link">
          {invite.state === "valid" ? DEAD.revoked : DEAD[invite.state]} Ask the person who sent it for a new one.
        </Message>
      ) : (
        <Message title={`Join ${invite.project.name}`}>
          <p>
            {invite.invited_by ? <strong>{invite.invited_by}</strong> : "Someone"} invited you to the project{" "}
            <strong>{invite.project.name}</strong> ({invite.project.key}) as {invite.role === "admin" ? "an admin" : "a member"}.
            You&apos;ll see its board, and your agents can work in it too.
          </p>
          {joinError && <p className="text-danger">{joinError}</p>}
          <div className="flex gap-2">
            <Button onClick={join} disabled={joining}>
              {joining ? "Joining…" : "Join project"}
            </Button>
            <Button variant="ghost" nativeButton={false} render={<Link href="/" />}>
              Not now
            </Button>
          </div>
        </Message>
      )}
    </main>
  );
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border p-6">
      <h1 className="font-display text-2xl font-bold tracking-[-0.02em]">{title}</h1>
      <div className="text-muted-foreground flex flex-col gap-4 text-sm">{children}</div>
    </div>
  );
}
