"use client";

import { useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { setPassword, type SetPasswordState } from "./actions";

export function SetPasswordForm({ email, needsCurrent }: { email: string; needsCurrent: boolean }) {
  const [state, formAction, pending] = useActionState<SetPasswordState, FormData>(setPassword, { error: null });

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* Lets password managers save the new password under the right account. */}
      <input type="email" name="username" value={email} autoComplete="username" readOnly hidden />

      {state.error && (
        <Alert variant="danger" role="alert">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      {needsCurrent && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="current">Current password</Label>
          <Input id="current" name="current" type="password" autoComplete="current-password" required />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
        <p className="text-muted-foreground text-xs">At least {MIN_PASSWORD_LENGTH} characters.</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </div>

      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Saving…" : "Save password"}
      </Button>
    </form>
  );
}
