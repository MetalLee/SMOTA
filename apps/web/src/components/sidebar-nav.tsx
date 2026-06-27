"use client";

import { usePathname } from "next/navigation";
import { RouteLoadingLink } from "@/components/route-loading";
import { getSidebarNavItems, isSidebarNavItemActive } from "@/lib/sidebar";
import { cn } from "@/lib/utils";

export function SidebarNav() {
  const pathname = usePathname();
  const navItems = getSidebarNavItems();

  return (
    <nav className="space-y-1">
      {navItems.map((item) => {
        const active = isSidebarNavItemActive(pathname, item.href);

        return (
          <RouteLoadingLink
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-10 items-center gap-3 rounded-lg px-3 text-sm text-slate-600 transition hover:bg-slate-50 hover:text-ink",
              active && "bg-slate-100 font-semibold text-ink"
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </RouteLoadingLink>
        );
      })}
    </nav>
  );
}
