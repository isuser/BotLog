import type { Metadata } from "next";
import { Suspense } from "react";
import { TaskPanel } from "../../../(board)/tasks/[taskId]/task-panel";

export async function generateMetadata({ params }: PageProps<"/projects/[key]/list/tasks/[taskId]">): Promise<Metadata> {
  const { taskId } = await params;
  return { title: `${decodeURIComponent(taskId).toUpperCase()} · Botlog` };
}

/** A task open over the list view. Closing it goes back to the list. */
export default function ListTaskPage() {
  return (
    // The panel reads the URL in the browser, like on the board.
    <Suspense fallback={null}>
      <TaskPanel view="list" />
    </Suspense>
  );
}
