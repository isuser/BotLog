import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { TaskPanel } from "../../../(board)/tasks/[taskId]/task-panel";

export async function generateMetadata({ params }: PageProps<"/projects/[key]/list/tasks/[taskId]">): Promise<Metadata> {
  const { taskId } = await params;
  return { title: `${decodeURIComponent(taskId).toUpperCase()} · Botlog` };
}

/** A task open over the list view. Closing it goes back to the list. */
export default function ListTaskPage({ params }: PageProps<"/projects/[key]/list/tasks/[taskId]">) {
  return (
    // Reads the URL and the session, so it renders at request time.
    <Suspense fallback={null}>
      <TaskPanelForRoute params={params} />
    </Suspense>
  );
}

async function TaskPanelForRoute({ params }: Pick<PageProps<"/projects/[key]/list/tasks/[taskId]">, "params">) {
  const [{ key, taskId }, user] = await Promise.all([params, requireUser()]);
  return (
    <TaskPanel
      projectKey={key.toUpperCase()}
      taskRef={decodeURIComponent(taskId).toUpperCase()}
      currentUser={user}
      view="list"
    />
  );
}
