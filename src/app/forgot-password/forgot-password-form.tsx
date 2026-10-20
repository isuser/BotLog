"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset, type ForgotPasswordState } from "./actions";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<ForgotPasswordState, FormData>(requestPasswordReset, {
    error: null,
    sent: false,
    email: "",
  });

  if (state.sent) {
    return (
      <div className="flex flex-col gap-4">
        <Alert role="status">
          <AlertDescription>
            If {state.email} has a Botlog account, a reset link is on its way. It can take a few minutes; if
            nothing arrives, try again later.
          </AlertDescription>
        </Alert>
        <Link href="/sign-in" className="text-muted-foreground text-center text-sm hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && (
        <Alert variant="danger" role="alert">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.email} />
      </div>

      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Sending…" : "Send reset link"}
      </Button>
      <Link href="/sign-in" className="text-muted-foreground text-center text-sm hover:underline">
        Back to sign in
      </Link>
    </form>
  );
}
