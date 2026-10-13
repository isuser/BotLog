import { PRIORITY_LABELS, STATUS_LABELS, TYPE_LABELS } from "./task-labels";
import type { Activity, Task } from "./types";

type Change = { from: unknown; to: unknown };

/** Names for the people and agents an entry may refer to, by id. */
export type NameLookup = (type: "user" | "agent", id: string) => string | undefined;

const label = <T extends string>(labels: Record<T, string>, value: unknown) =>
  labels[value as T] ?? String(value);

const formatDate = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });

/** "a", "a and b", "a, b and c". */
function list(parts: string[]) {
  return parts.length < 2 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

function describeUpdate(changes: Record<string, Change>, names: NameLookup): string[] {
  const parts: string[] = [];
  for (const [field, { from, to }] of Object.entries(changes)) {
    switch (field) {
      case "title":
        parts.push(`renamed the task to “${to}”`);
        break;
      case "description":
        parts.push(to ? "updated the description" : "cleared the description");
        break;
      case "status":
        parts.push(`moved it from ${label(STATUS_LABELS, from)} to ${label(STATUS_LABELS, to)}`);
        break;
      case "priority":
        parts.push(to === "none" ? "removed the priority" : `set priority to ${label(PRIORITY_LABELS, to)}`);
        break;
      case "type":
        parts.push(`changed the type to ${label(TYPE_LABELS, to)}`);
        break;
      case "due_date":
        parts.push(to ? `set the due date to ${formatDate(String(to))}` : "removed the due date");
        break;
      case "epic_id":
        parts.push(to ? "changed the epic" : "removed the epic");
        break;
    }
  }

  // A reassignment can change both assignee columns at once; describe it once, by the new assignee.
  const user = changes.assignee_user_id;
  const agent = changes.assignee_agent_id;
  if (user || agent) {
    if (agent?.to) parts.push(`assigned it to ${names("agent", String(agent.to)) ?? "an agent"}`);
    else if (user?.to) parts.push(`assigned it to ${names("user", String(user.to)) ?? "someone"}`);
    else parts.push("unassigned it");
  }
  return parts;
}

/**
 * What an activity entry did, as a phrase that follows the actor's name ("moved it from To do
 * to Done"). Null for entries the activity list leaves out: comments, which show above it, and
 * changes to fields that aren't shown.
 */
export function describeActivity(entry: Activity, names: NameLookup): string | null {
  const changes = (entry.changes ?? {}) as Record<string, Change>;
  switch (entry.action) {
    case "created":
      return "created the task";
    case "archived":
      return "archived the task";
    case "restored":
      return "restored the task";
    case "moved":
      return describeUpdate({ status: changes.status }, names)[0] ?? null;
    case "updated":
      return list(describeUpdate(changes, names)) || null;
    case "label_added":
      return "added a label";
    case "label_removed":
      return "removed a label";
    default:
      return null;
  }
}

/** Ids → names from what the panel already has loaded: the viewer, agents and the task's assignee. */
export function nameLookup(me: { id: string }, agents: { id: string; name: string }[], task: Task): NameLookup {
  const known = new Map<string, string>([[`user:${me.id}`, "you"]]);
  for (const agent of agents) known.set(`agent:${agent.id}`, agent.name);
  if (task.assignee && !known.has(`${task.assignee.type}:${task.assignee.id}`)) {
    known.set(`${task.assignee.type}:${task.assignee.id}`, task.assignee.name || "someone");
  }
  return (type, id) => known.get(`${type}:${id}`);
}
