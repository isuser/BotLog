"use client";

import { CopyIcon, LinkIcon, LogOutIcon, UserMinusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import useSWR, { useSWRConfig } from "swr";
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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label as FieldLabel } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api, apiAll, errorMessage } from "@/lib/client/api";
import { fullDate, timeAgo } from "@/lib/client/format";
import type { Invite, Member, NewInvite, Profile, Project } from "@/lib/client/types";

type Role = Member["role"];
type InviteRole = Exclude<Role, "owner">;

const ROLE_NAMES: Record<Role, string> = { owner: "Owner", admin: "Admin", member: "Member" };
const INVITE_ROLES = { member: "Member", admin: "Admin" } satisfies Record<InviteRole, string>;
const EXPIRIES = { "1h": "1 hour", "24h": "24 hours", "7d": "7 days" } as const;
type Expiry = keyof typeof EXPIRIES;

const canManage = (role: Role | null) => role === "owner" || role === "admin";

/**
 * Who's in the project and their roles. Owners and admins change roles, remove people and
 * make single-use invite links; anyone but the owner can leave.
 */
export function MembersSection({ project }: { project: Project }) {
  const membersKey = `/projects/${project.key}/members`;
  const { mutate } = useSWRConfig();
  const { data: me } = useSWR("/me", (path: string) => api<{ data: Profile }>(path).then((r) => r.data));
  const { data: members, mutate: mutateMembers } = useSWR(membersKey, (path: string) => apiAll<Member>(path));
  const [removing, setRemoving] = useState<Member | null>(null);
  const [leaving, setLeaving] = useState(false);
  const router = useRouter();
  const manager = canManage(project.role);

  /** Removing someone unassigns their tasks, so the board and tasks refresh too. */
  const refreshTasks = () =>
    mutate((key) => typeof key === "string" && (key.startsWith(`/projects/${project.key}/tasks`) || key.startsWith("/tasks/")));

  async function changeRole(member: Member, role: InviteRole) {
    try {
      await api(`${membersKey}/${member.id}`, { method: "PATCH", json: { role } });
      await mutateMembers();
      toast(`${member.name} is now ${role === "admin" ? "an admin" : "a member"}`);
    } catch (e) {
      toast.error(errorMessage(e));
      void mutateMembers();
    }
  }

  async function remove(member: Member) {
    try {
      await api(`${membersKey}/${member.id}`, { method: "DELETE" });
      setRemoving(null);
      await mutateMembers();
      void refreshTasks();
      toast(`${member.name} removed`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function leave() {
    try {
      await api(`${membersKey}/me`, { method: "DELETE" });
      setLeaving(false);
      await mutate("/projects");
      toast(`You left ${project.name}`);
      router.push("/");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="settings-members">
      <div className="flex flex-col gap-1">
        <h2 id="settings-members" className="text-base font-semibold">
          Members
        </h2>
        <p className="text-muted-foreground text-sm">
          Everyone here sees the whole project and works on it, with their agents.{" "}
          {manager
            ? "Admins can also change the Done window, invite people and manage members; only the owner renames the project."
            : "The owner and admins invite people and manage members."}
        </p>
      </div>

      {!members ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <ul className="bg-card divide-y rounded-lg border">
          {members.map((member) => (
            <MemberRow
              key={`${member.id}:${member.role}`}
              member={member}
              isMe={member.id === me?.id}
              manageable={manager && member.role !== "owner" && member.id !== me?.id}
              onChangeRole={(role) => void changeRole(member, role)}
              onRemove={() => setRemoving(member)}
            />
          ))}
        </ul>
      )}

      {manager && <InviteLinks projectKey={project.key} />}

      {project.role && project.role !== "owner" && (
        <Button variant="outline" className="self-start" onClick={() => setLeaving(true)}>
          <LogOutIcon /> Leave project
        </Button>
      )}

      <Dialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removing?.name}?</DialogTitle>
            <DialogDescription>
              They lose access to {project.name}. Their tasks here, and their agents&apos; tasks, become unassigned.
              They can come back with a new invite link.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline">Cancel</Button>} />
            <Button variant="destructive" onClick={() => removing && void remove(removing)}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={leaving} onOpenChange={setLeaving}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave {project.name}?</DialogTitle>
            <DialogDescription>
              You and your agents lose access to it, and your tasks here become unassigned. To come back you need a
              new invite link.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline">Cancel</Button>} />
            <Button variant="destructive" onClick={() => void leave()}>
              Leave project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function MemberRow({
  member,
  isMe,
  manageable,
  onChangeRole,
  onRemove,
}: {
  member: Member;
  isMe: boolean;
  manageable: boolean;
  onChangeRole: (role: InviteRole) => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 text-sm">
      <div className="flex min-w-40 flex-1 flex-col">
        <span className="truncate font-medium">
          {member.name}
          {isMe && <span className="text-muted-foreground ml-1.5 font-normal">(you)</span>}
        </span>
        <span className="text-muted-foreground truncate text-xs">{member.email}</span>
      </div>
      <time className="text-muted-foreground hidden shrink-0 text-xs sm:block" dateTime={member.joined_at} title={fullDate(member.joined_at)}>
        Joined {timeAgo(member.joined_at)}
      </time>
      {manageable ? (
        <span className="flex shrink-0 items-center gap-1">
          <Select
            value={member.role}
            items={INVITE_ROLES}
            onValueChange={(next) => next && next !== member.role && onChangeRole(next as InviteRole)}
          >
            <SelectTrigger size="sm" aria-label={`Role of ${member.name}`} className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(INVITE_ROLES).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon-sm" aria-label={`Remove ${member.name}`} className="text-muted-foreground" onClick={onRemove}>
            <UserMinusIcon />
          </Button>
        </span>
      ) : (
        <Badge variant={member.role === "owner" ? "secondary" : "outline"} className="shrink-0">
          {ROLE_NAMES[member.role]}
        </Badge>
      )}
    </li>
  );
}

/** Make a single-use invite link, see the open ones, and revoke them. Owners and admins. */
function InviteLinks({ projectKey }: { projectKey: string }) {
  const invitesKey = `/projects/${projectKey}/invites`;
  const { data: invites, mutate: mutateInvites } = useSWR(invitesKey, (path: string) => apiAll<Invite>(path));
  const [role, setRole] = useState<InviteRole>("member");
  const [expiresIn, setExpiresIn] = useState<Expiry>("1h");
  const [creating, setCreating] = useState(false);
  // The link is only in the create response; it's gone once this is cleared.
  const [created, setCreated] = useState<{ id: string; link: string } | null>(null);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    try {
      const { data } = await api<{ data: NewInvite }>(invitesKey, { method: "POST", json: { role, expires_in: expiresIn } });
      // Built from the app's own address, like the API's `url` but without trusting the request's.
      setCreated({ id: data.id, link: `${window.location.origin}/invite#${data.token}` });
      await mutateInvites();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setCreating(false);
    }
  }

  async function revoke(invite: Invite) {
    try {
      await api(`${invitesKey}/${invite.id}`, { method: "DELETE" });
      if (created?.id === invite.id) setCreated(null);
      await mutateInvites();
      toast("Invite link revoked");
    } catch (e) {
      toast.error(errorMessage(e));
      void mutateInvites();
    }
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      toast("Invite link copied");
    } catch {
      toast.error("Couldn't copy. Select the link and copy it instead.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">Invite links</h3>
        <p className="text-muted-foreground text-sm">
          Each link works once, for one person, until it expires. They need a Botlog account on this server to join.
        </p>
      </div>
      <form onSubmit={create} className="flex flex-wrap items-end gap-3">
        <div className="grid gap-2">
          <FieldLabel>Role</FieldLabel>
          <Select value={role} items={INVITE_ROLES} onValueChange={(next) => next && setRole(next as InviteRole)}>
            <SelectTrigger aria-label="Role" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(INVITE_ROLES).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <FieldLabel>Expires after</FieldLabel>
          <Select value={expiresIn} items={EXPIRIES} onValueChange={(next) => next && setExpiresIn(next as Expiry)}>
            <SelectTrigger aria-label="Expires after" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(EXPIRIES).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" variant="outline" disabled={creating}>
          <LinkIcon /> {creating ? "Creating…" : "Create link"}
        </Button>
      </form>

      {created && (
        <div className="bg-card flex flex-col gap-2 rounded-lg border p-3">
          <p className="text-sm">Copy the link now and send it to the person you&apos;re inviting. It isn&apos;t shown again.</p>
          <div className="flex gap-2">
            <Input
              readOnly
              aria-label="Invite link"
              value={created.link}
              className="font-mono"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button variant="outline" size="icon" aria-label="Copy invite link" onClick={() => void copy(created.link)}>
              <CopyIcon />
            </Button>
          </div>
        </div>
      )}

      {!invites ? (
        <Skeleton className="h-12 w-full" />
      ) : invites.length === 0 ? (
        <p className="text-muted-foreground text-sm">No open invite links.</p>
      ) : (
        <ul className="bg-card divide-y rounded-lg border">
          {invites.map((invite) => (
            <li key={invite.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <Badge variant="outline" className="shrink-0">
                {ROLE_NAMES[invite.role]}
              </Badge>
              <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
                {invite.created_by ? `By ${invite.created_by.name}, ` : ""}
                <time dateTime={invite.created_at} title={fullDate(invite.created_at)}>
                  {timeAgo(invite.created_at)}
                </time>
              </span>
              <time className="text-muted-foreground shrink-0 text-xs" dateTime={invite.expires_at} title={fullDate(invite.expires_at)}>
                Expires {timeAgo(invite.expires_at)}
              </time>
              <Button variant="outline" size="sm" className="shrink-0" onClick={() => void revoke(invite)}>
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
