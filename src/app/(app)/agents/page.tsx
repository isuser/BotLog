import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { AgentsView } from "./agents-view";

export const metadata: Metadata = { title: "Agents · Botlog" };

export default function AgentsPage() {
  return (
    // Reads the session, so it renders at request time.
    <Suspense fallback={null}>
      <AgentsForUser />
    </Suspense>
  );
}

async function AgentsForUser() {
  const user = await requireUser();
  return <AgentsView currentUser={user} />;
}
