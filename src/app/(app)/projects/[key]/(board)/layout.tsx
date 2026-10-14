import { Suspense } from "react";
import { Board, BoardSkeleton } from "./board";

/**
 * The board lives in the layout, so it stays mounted (with its scroll position) while a
 * task is open on top of it at /projects/[key]/tasks/[taskId].
 */
export default function ProjectLayout({ children, params }: LayoutProps<"/projects/[key]">) {
  return (
    <>
      {/* The key comes from the URL, so the board renders at request time. */}
      <Suspense fallback={<BoardSkeleton />}>
        <BoardForKey params={params} />
      </Suspense>
      {children}
    </>
  );
}

async function BoardForKey({ params }: Pick<LayoutProps<"/projects/[key]">, "params">) {
  const { key } = await params;
  return <Board projectKey={key.toUpperCase()} />;
}
