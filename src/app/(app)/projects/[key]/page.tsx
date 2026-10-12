import type { Metadata } from "next";
import { Suspense } from "react";
import { Board, BoardSkeleton } from "./board";

export async function generateMetadata({ params }: PageProps<"/projects/[key]">): Promise<Metadata> {
  const { key } = await params;
  return { title: `${key.toUpperCase()} · Botlog` };
}

export default function BoardPage({ params }: PageProps<"/projects/[key]">) {
  return (
    // The key comes from the URL, so the board renders at request time.
    <Suspense fallback={<BoardSkeleton />}>
      <BoardForKey params={params} />
    </Suspense>
  );
}

async function BoardForKey({ params }: Pick<PageProps<"/projects/[key]">, "params">) {
  const { key } = await params;
  return <Board projectKey={key.toUpperCase()} />;
}
