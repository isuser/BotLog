"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CardDescription, CardTitle } from "@/components/ui/card";
import { emailLinkType } from "@/lib/auth/password";
import { confirmEmailLink, type ConfirmState } from "./actions";

export function ConfirmForm({ signedInAs }: { signedInAs: string | null }) {
  const searchParams = useSearchParams();
  const type = emailLinkType(searchParams.get("type"));
  const tokenHash = searchParams.get("token_hash") ?? "";
  const [state, formAction, pending] = useActionState<ConfirmState, FormData>(confirmEmailLink, {
    error: type && tokenHash ? null : "This link is incomplete. Open it again from the email.",
  });

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <CardTitle className="font-display text-2xl font-bold tracking-[-0.02em]">
          {type === "recovery" ? "Reset your password" : "Welcome to Botlog"}
        </CardTitle>
        <CardDescription>
          {type === "recovery"
            ? "Continue to choose a new password."
            : "You've been invited. Continue to choose your password."}
        </CardDescription>
      </div>

      {signedInAs && (
        <Alert role="note">
          <AlertDescription>
            You&apos;re signed in as {signedInAs}. Continuing signs you out and into the account this link was sent
            to.
          </AlertDescription>
        </Alert>
      )}

      <input type="hidden" name="type" value={type ?? ""} />
      <input type="hidden" name="token_hash" value={tokenHash} />

      {state.error && (
        <Alert variant="danger" role="alert">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={pending || !type || !tokenHash} className="mt-2">
        {pending ? "Checking link…" : "Continue"}
      </Button>
      <Link href="/sign-in" className="text-muted-foreground text-center text-sm hover:underline">
        Back to sign in
      </Link>
    </form>
  );
}
