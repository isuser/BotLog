import Link from "next/link";
import { Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { UserMenu } from "./user-menu";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
        <nav className="flex items-center gap-4">
          <Link href="/" className="font-semibold">
            Botlog
          </Link>
          <Link href="/" className="text-muted-foreground hover:text-foreground text-sm">
            Projects
          </Link>
          <Link href="/agents" className="text-muted-foreground hover:text-foreground text-sm">
            Agents
          </Link>
        </nav>
        {/* Reads the session, so it streams in at request time. */}
        <Suspense fallback={<div className="h-8" />}>
          <UserMenu />
        </Suspense>
      </header>
      {children}
      <Toaster position="bottom-right" />
    </div>
  );
}
