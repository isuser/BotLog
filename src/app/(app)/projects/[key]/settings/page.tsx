import type { Metadata } from "next";
import { Suspense } from "react";
import { ProjectSettingsView } from "./project-settings-view";

export async function generateMetadata({ params }: PageProps<"/projects/[key]/settings">): Promise<Metadata> {
  const { key } = await params;
  return { title: `${key.toUpperCase()} settings · Botlog` };
}

export default function ProjectSettingsPage({ params }: PageProps<"/projects/[key]/settings">) {
  return (
    // The key comes from the URL, so the page renders at request time.
    <Suspense fallback={null}>
      <SettingsForKey params={params} />
    </Suspense>
  );
}

async function SettingsForKey({ params }: Pick<PageProps<"/projects/[key]/settings">, "params">) {
  const { key } = await params;
  return <ProjectSettingsView projectKey={key.toUpperCase()} />;
}
