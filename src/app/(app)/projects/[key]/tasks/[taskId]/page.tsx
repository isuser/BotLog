import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { TaskPanel } from "./task-panel";

export async function generateMetadata({ params }: PageProps<"/projects/[key]/tasks/[taskId]">): Promise<Metadata> {
  const { taskId } = await params;
  return { title: `${decodeURIComponent(taskId).toUpperCase()} · Botlog` };
}

/** A task open over its board. The URL can be shared; opening it loads the board behind. */
export default function TaskPage({ params }: PageProps<"/projects/[key]/tasks/[taskId]">) {
  return (
    // Reads the URL and the session, so it renders at request time.
    <Suspense fallback={null}>
      <TaskPanelForRoute params={params} />
    </Suspense>
  );
}

async function TaskPanelForRoute({ params }: Pick<PageProps<"/projects/[key]/tasks/[taskId]">, "params">) {
  const [{ key, taskId }, user] = await Promise.all([params, requireUser()]);
  return (
    <TaskPanel projectKey={key.toUpperCase()} taskRef={decodeURIComponent(taskId).toUpperCase()} currentUser={user} />
  );
}
