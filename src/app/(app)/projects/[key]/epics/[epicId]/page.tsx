import type { Metadata } from "next";
import { Suspense } from "react";
import { EpicView } from "./epic-view";

export const metadata: Metadata = { title: "Epic · Botlog" };

export default function EpicPage({ params }: PageProps<"/projects/[key]/epics/[epicId]">) {
  return (
    // Reads the URL, so it renders at request time.
    <Suspense fallback={null}>
      <EpicForRoute params={params} />
    </Suspense>
  );
}

async function EpicForRoute({ params }: Pick<PageProps<"/projects/[key]/epics/[epicId]">, "params">) {
  const { key, epicId } = await params;
  return <EpicView projectKey={key.toUpperCase()} epicId={decodeURIComponent(epicId)} />;
}
