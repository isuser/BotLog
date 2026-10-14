import { Suspense } from "react";
import { TaskList, TaskListSkeleton } from "./task-list";

/**
 * The list lives in the layout, like the board, so it stays mounted (with its sort and scroll)
 * while a task is open on top of it at /projects/[key]/list/tasks/[taskId].
 */
export default function ListLayout({ children, params }: LayoutProps<"/projects/[key]/list">) {
  return (
    <>
      {/* The key comes from the URL, so the list renders at request time. */}
      <Suspense fallback={<TaskListSkeleton />}>
        <ListForKey params={params} />
      </Suspense>
      {children}
    </>
  );
}

async function ListForKey({ params }: Pick<LayoutProps<"/projects/[key]/list">, "params">) {
  const { key } = await params;
  return <TaskList projectKey={key.toUpperCase()} />;
}
