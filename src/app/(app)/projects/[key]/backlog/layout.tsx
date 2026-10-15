import { Suspense } from "react";
import { BacklogSkeleton, BacklogView } from "./backlog-view";

/**
 * The backlog lives in the layout, like the board, so it stays mounted (with its scroll)
 * while a task is open on top of it at /projects/[key]/backlog/tasks/[taskId].
 */
export default function BacklogLayout({ children, params }: LayoutProps<"/projects/[key]/backlog">) {
  return (
    <>
      {/* The key comes from the URL, so the backlog renders at request time. */}
      <Suspense fallback={<BacklogSkeleton />}>
        <BacklogForKey params={params} />
      </Suspense>
      {children}
    </>
  );
}

async function BacklogForKey({ params }: Pick<LayoutProps<"/projects/[key]/backlog">, "params">) {
  const { key } = await params;
  return <BacklogView projectKey={key.toUpperCase()} />;
}
