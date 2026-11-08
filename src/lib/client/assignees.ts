import type { Agent, Member } from "./types";

/** A task assignee or comment author, as the API returns them. */
export type Actor =
  | { type: "user"; id: string; name: string; email: string }
  | { type: "agent"; id: string; name: string; avatar: string | null; owner: { id: string; name: string } | null };

/**
 * How names read in a project. In a shared one (more than one member) agents show with their
 * owner; `meId` is the viewer, whose own agents read as "your agent".
 */
export type NameContext = { shared: boolean; meId?: string };

export const SOLO: NameContext = { shared: false };

/**
 * What an agent is, after its name: "Pedro's agent" (or "your agent") in shared projects,
 * plain "agent" otherwise or when the owner isn't known.
 */
export function agentRole(owner: { id: string; name: string } | null | undefined, { shared, meId }: NameContext) {
  if (!shared || !owner) return "agent";
  if (owner.id === meId) return "your agent";
  return `${owner.name || "a member"}'s agent`;
}

/** "Botalicious (Pedro's agent)" in shared projects, "Botalicious" otherwise. */
export function agentLabel(agent: { name: string; owner: { id: string; name: string } | null }, context: NameContext) {
  const name = agent.name || "Agent";
  const role = agentRole(agent.owner, context);
  return role === "agent" ? name : `${name} (${role})`;
}

export function actorName(actor: Actor, context: NameContext = SOLO) {
  if (actor.type === "agent") return agentLabel(actor, context);
  return actor.name || actor.email;
}

export const sameActor = (a: Actor | null, b: Actor | null) =>
  a === null ? b === null : b !== null && a.type === b.type && a.id === b.id;

export const agentActor = (agent: Pick<Agent, "id" | "name" | "avatar" | "owner">): Actor => ({
  type: "agent",
  id: agent.id,
  name: agent.name,
  avatar: agent.avatar,
  owner: agent.owner,
});

/**
 * Who a task can be assigned to, as menu options: nobody, you, the project's other members,
 * your agents, then the other members' agents. Whoever it's assigned to now stays listed (an
 * archived agent, or someone who has left) so the current choice shows.
 */
export function assigneeOptions({
  me,
  members = [],
  agents = [],
  current,
  context,
}: {
  me: { id: string; name: string; email: string } | undefined;
  members?: Pick<Member, "id" | "name" | "email">[];
  agents?: Pick<Agent, "id" | "name" | "avatar" | "owner">[];
  current: Actor | null;
  context: NameContext;
}): { actor: Actor | null; label: string }[] {
  const options: { actor: Actor | null; label: string }[] = [{ actor: null, label: "Unassigned" }];
  if (me) options.push({ actor: { type: "user", id: me.id, name: me.name, email: me.email }, label: "Me" });
  for (const member of members) {
    if (member.id === me?.id) continue;
    const actor: Actor = { type: "user", id: member.id, name: member.name, email: member.email };
    options.push({ actor, label: actorName(actor, context) });
  }
  const mine = (agent: (typeof agents)[number]) => agent.owner?.id === me?.id;
  for (const agent of [...agents.filter(mine), ...agents.filter((a) => !mine(a))]) {
    const actor = agentActor(agent);
    options.push({ actor, label: actorName(actor, context) });
  }
  if (current && !options.some((o) => sameActor(o.actor, current))) {
    options.splice(1, 0, { actor: current, label: actorName(current, context) });
  }
  return options;
}
