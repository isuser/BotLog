import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { signOut } from "./actions";

export async function UserMenu() {
  const user = await requireUser();

  return (
    <div className="flex items-center gap-3">
      <span className="text-muted-foreground hidden text-sm sm:inline">{user.email}</span>
      <form action={signOut}>
        <Button type="submit" variant="ghost" size="sm">
          Sign out
        </Button>
      </form>
    </div>
  );
}
