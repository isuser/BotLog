import { exportProject } from "@/lib/api/export";
import { route } from "@/lib/api/handler";
import { resolveProjectId } from "@/lib/api/projects";

type Params = { id: string };

/** The whole project as one JSON file to download: epics, labels, tasks and comments. */
export const GET = route<Params>(async ({ db, params }) => {
  const projectId = await resolveProjectId(db, params.id);
  const data = await exportProject(db, projectId);
  const filename = `botlog-${data.project.key.toLowerCase()}-${data.exported_at.slice(0, 10)}.json`;
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
});
