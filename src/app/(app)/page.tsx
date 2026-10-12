import type { Metadata } from "next";
import { ProjectsView } from "./projects-view";

export const metadata: Metadata = { title: "Projects · Botlog" };

export default function ProjectsPage() {
  return <ProjectsView />;
}
