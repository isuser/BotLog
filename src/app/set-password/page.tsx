import type { Metadata } from "next";
import { Suspense } from "react";
import { BotlogMark } from "@/components/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { signedInByEmailLink } from "@/lib/auth/password";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../(app)/actions";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = { title: "Set password · Botlog" };

/** Where invite and reset links land, and where Settings sends you to change your password. */
export default function SetPasswordPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <BotlogMark className="mb-2 size-10" />
          <CardTitle className="font-display text-2xl font-bold tracking-[-0.02em]">Choose a password</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Reads the session, so it renders at request time. */}
          <Suspense>
            <FormForUser />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}

async function FormForUser() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  return (
    <div className="flex flex-col gap-4">
      {/* An email link signs you into whichever account it was sent for, so say which one. */}
      <CardDescription>
        For <strong className="text-foreground">{user.email}</strong>.{" "}
        <form action={signOut} className="inline">
          <button type="submit" className="underline-offset-4 hover:underline">
            Not you? Sign out
          </button>
        </form>
      </CardDescription>
      <SetPasswordForm email={user.email} needsCurrent={!signedInByEmailLink(data?.claims.amr)} />
    </div>
  );
}
