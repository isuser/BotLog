"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { signOut } from "./actions";

/**
 * Signs out, then loads the sign-in page as a new page rather than navigating to it. That drops
 * everything the tab kept in memory (cached API data and pages kept alive by the router), so
 * whoever signs in next in this tab never sees the previous person's data.
 */
export function SignOutButton() {
  return (
    <form
      action={async () => {
        await signOut();
        // A new page on purpose: router navigation would keep the cached data around.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/sign-in");
      }}
    >
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="ghost" size="sm" disabled={pending}>
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
