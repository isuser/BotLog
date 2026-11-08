import type { Metadata } from "next";
import { Suspense } from "react";
import { TaskPanel } from "./task-panel";
import { segmentLabel } from "@/lib/client/refs";

export async function generateMetadata({ params }: PageProps<"/projects/[key]/tasks/[taskId]">): Promise<Metadata> {
  const { taskId } = await params;
  return { title: `${segmentLabel(taskId)} · Botlog` };
}

/** A task open over its board. The URL can be shared; opening it loads the board behind. */
export default function TaskPage() {
  return (
    // The panel reads the URL, which is only known at request time on a page load. Opening
    // a task from the board renders it straight away, without waiting for the server.
    <Suspense fallback={null}>
      <TaskPanel />
    </Suspense>
  );
}
