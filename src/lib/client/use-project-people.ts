import useSWR from "swr";
import { api, apiAll } from "./api";
import { actorName, type Actor, type NameContext } from "./assignees";
import type { Agent, Member, Profile } from "./types";

/**
 * The viewer, a project's members and (when `withAgents`) its members' agents, and how names
 * read there: in a shared project (more than one member) agents show with their owner. Keyed
 * by the project's id; SWR shares each list between every card and panel of the project.
 */
export function useProjectPeople(projectId: string, { withAgents = false }: { withAgents?: boolean } = {}) {
  const { data: me } = useSWR("/me", (path: string) => api<{ data: Profile }>(path).then((r) => r.data));
  const { data: members } = useSWR(`/projects/${projectId}/members`, (path: string) => apiAll<Member>(path));
  const { data: agents } = useSWR(withAgents ? `/projects/${projectId}/agents` : null, (path: string) =>
    apiAll<Agent>(path),
  );
  const context: NameContext = { shared: (members?.length ?? 0) > 1, meId: me?.id };
  return { me, members, agents, context, name: (actor: Actor) => actorName(actor, context) };
}
