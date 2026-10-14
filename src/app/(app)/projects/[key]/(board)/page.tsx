import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

export async function generateMetadata({ params }: PageProps<"/projects/[key]">): Promise<Metadata> {
  const { key } = await params;
  return { title: `${key.toUpperCase()} · Botlog` };
}

/**
 * The board itself is in the layout; this page is the board with no task open. The title
 * reads the key from the URL, so the page tells Next.js it renders at request time.
 */
export default function BoardPage() {
  return (
    <Suspense>
      <RequestTime />
    </Suspense>
  );
}

async function RequestTime() {
  await connection();
  return null;
}
