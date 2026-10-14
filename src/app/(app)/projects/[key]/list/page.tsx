import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

export async function generateMetadata({ params }: PageProps<"/projects/[key]/list">): Promise<Metadata> {
  const { key } = await params;
  return { title: `${key.toUpperCase()} list · Botlog` };
}

/** The list itself is in the layout; this page is the list with no task open. */
export default function ListPage() {
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
