"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  // Projects covers the projects list and every board.
  { href: "/", label: "Projects", active: (path: string) => path === "/" || path.startsWith("/projects") },
  { href: "/my-tasks", label: "My tasks", active: (path: string) => path.startsWith("/my-tasks") },
  { href: "/agents", label: "Agents", active: (path: string) => path.startsWith("/agents") },
  { href: "/help", label: "Help", active: (path: string) => path.startsWith("/help") },
];

/** The top bar's links; the current section is a lime pill. */
export function NavLinks() {
  return <NavLinkList pathname={usePathname()} />;
}

/** The links with none highlighted, while the URL isn't known yet. */
export function NavLinksFallback() {
  return <NavLinkList pathname={null} />;
}

function NavLinkList({ pathname }: { pathname: string | null }) {
  return (
    <>
      {LINKS.map(({ href, label, active }) => {
        const current = pathname !== null && active(pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "rounded-full px-3 py-1 text-sm font-medium transition-colors",
              current
                ? "bg-primary text-primary-foreground inset-ring-brand-outline inset-ring"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </>
  );
}
