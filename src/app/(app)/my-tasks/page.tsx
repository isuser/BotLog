import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { MyTasksView } from "./my-tasks-view";

export const metadata: Metadata = { title: "My tasks · Botlog" };

export default function MyTasksPage() {
  return (
    // Reads the session, so it renders at request time.
    <Suspense fallback={null}>
      <MyTasksForUser />
    </Suspense>
  );
}

async function MyTasksForUser() {
  await requireUser();
  return <MyTasksView />;
}
