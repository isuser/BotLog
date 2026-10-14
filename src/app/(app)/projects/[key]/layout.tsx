import { Suspense } from "react";
import { ProjectHeader } from "./project-header";
import { ProjectRealtime } from "./project-realtime";

/** Every project page: the project's title and its Board / Epics tabs, kept live by realtime. */
export default function ProjectLayout({ children, params }: LayoutProps<"/projects/[key]">) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The key comes from the URL, so the header renders at request time. */}
      <Suspense fallback={<div className="h-[4.5rem]" />}>
        <HeaderForKey params={params} />
      </Suspense>
      {children}
    </div>
  );
}

async function HeaderForKey({ params }: Pick<LayoutProps<"/projects/[key]">, "params">) {
  const { key } = await params;
  return (
    <>
      <ProjectHeader projectKey={key.toUpperCase()} />
      <ProjectRealtime projectKey={key.toUpperCase()} />
    </>
  );
}
