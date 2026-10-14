import Link from "next/link";
import { Suspense } from "react";
import { BotlogLogo } from "@/components/logo";
import { Toaster } from "@/components/ui/sonner";
import { NavLinks, NavLinksFallback } from "./nav-links";
import { ThemeSync } from "./theme-sync";
import { UserMenu } from "./user-menu";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
        <nav className="flex items-center gap-2">
          <Link href="/" aria-label="Botlog home" className="mr-2 rounded-md">
            <BotlogLogo />
          </Link>
          {/* Reads the URL to highlight the current section. */}
          <Suspense fallback={<NavLinksFallback />}>
            <NavLinks />
          </Suspense>
        </nav>
        {/* Reads the session, so it streams in at request time. */}
        <Suspense fallback={<div className="h-8" />}>
          <UserMenu />
        </Suspense>
      </header>
      {children}
      <Toaster position="bottom-right" />
      <ThemeSync />
    </div>
  );
}
