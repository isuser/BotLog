import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { SettingsView } from "./settings-view";

export const metadata: Metadata = { title: "Settings · Botlog" };

export default function SettingsPage() {
  return (
    // Reads the session, so it renders at request time.
    <Suspense fallback={null}>
      <SettingsForUser />
    </Suspense>
  );
}

async function SettingsForUser() {
  await requireUser();
  return <SettingsView />;
}
