import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { segmentLabel } from "@/lib/client/refs";

export async function generateMetadata({ params }: PageProps<"/projects/[key]/backlog">): Promise<Metadata> {
  const { key } = await params;
  return { title: `${segmentLabel(key)} backlog · Botlog` };
}

/** The backlog itself is in the layout; this page is the backlog with no task open. */
export default function BacklogPage() {
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
