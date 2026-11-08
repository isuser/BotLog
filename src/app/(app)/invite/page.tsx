import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { JoinView } from "./join-view";

export const metadata: Metadata = { title: "Join a project · Botlog" };

/** Opened from an invite link, `/invite#<token>`: the token stays in the browser. */
export default function InvitePage() {
  return (
    // Reads the session, so it renders at request time.
    <Suspense fallback={null}>
      <JoinForUser />
    </Suspense>
  );
}

async function JoinForUser() {
  await requireUser();
  return <JoinView />;
}
