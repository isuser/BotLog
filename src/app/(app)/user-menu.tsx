import { SettingsIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { SignOutButton } from "./sign-out-button";

export async function UserMenu() {
  const user = await requireUser();

  return (
    <div className="flex items-center gap-3">
      <span className="text-muted-foreground hidden text-sm sm:inline">{user.email}</span>
      <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link href="/settings" aria-label="Settings" />}>
        <SettingsIcon className="size-4" />
      </Button>
      <SignOutButton />
    </div>
  );
}
