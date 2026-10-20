import type { Metadata } from "next";
import { Suspense } from "react";
import { BotlogMark } from "@/components/logo";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getSessionUser } from "@/lib/auth/session";
import { ConfirmForm } from "./confirm-form";

export const metadata: Metadata = { title: "Continue · Botlog" };

/** Landing page for invite and password reset emails (see the email templates on Self-hosting). */
export default function ConfirmPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <BotlogMark className="size-10" />
        </CardHeader>
        <CardContent>
          {/* The form reads ?token_hash and ?type, which are only known at request time. */}
          <Suspense>
            <ConfirmForSession />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}

async function ConfirmForSession() {
  const user = await getSessionUser();
  return <ConfirmForm signedInAs={user?.email ?? null} />;
}
