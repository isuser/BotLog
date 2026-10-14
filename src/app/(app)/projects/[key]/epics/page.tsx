import type { Metadata } from "next";
import { Suspense } from "react";
import { EpicsView } from "./epics-view";

export async function generateMetadata({ params }: PageProps<"/projects/[key]/epics">): Promise<Metadata> {
  const { key } = await params;
  return { title: `${key.toUpperCase()} epics · Botlog` };
}

export default function EpicsPage({ params }: PageProps<"/projects/[key]/epics">) {
  return (
    // The key comes from the URL, so the page renders at request time.
    <Suspense fallback={null}>
      <EpicsForKey params={params} />
    </Suspense>
  );
}

async function EpicsForKey({ params }: Pick<PageProps<"/projects/[key]/epics">, "params">) {
  const { key } = await params;
  return <EpicsView projectKey={key.toUpperCase()} />;
}
