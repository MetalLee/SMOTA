"use client";

import Link, { type LinkProps } from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { getLoadingOverlayClasses } from "@/lib/workbench";

type AnchorProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps | "href">;

interface RouteLoadingContextValue {
  loading: boolean;
  startGlobalLoading: () => void;
}

const RouteLoadingContext = createContext<RouteLoadingContextValue | null>(null);

function shouldIgnoreClick(event: MouseEvent<HTMLAnchorElement>) {
  return event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

function normalizeHref(href: LinkProps["href"]) {
  if (typeof href === "string") {
    return href.split("#")[0];
  }

  const pathname = href.pathname ?? "";
  const query = href.query ? new URLSearchParams(href.query as Record<string, string>).toString() : "";
  return query ? `${pathname}?${query}` : pathname;
}

export function RouteLoadingProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const classes = getLoadingOverlayClasses();
  const routeKey = `${pathname}?${searchParams.toString()}`;

  useEffect(() => {
    setLoading(false);
  }, [routeKey]);

  const value = useMemo<RouteLoadingContextValue>(
    () => ({
      loading,
      startGlobalLoading: () => setLoading(true)
    }),
    [loading]
  );

  return (
    <RouteLoadingContext.Provider value={value}>
      {children}
      {loading ? <LoadingOverlay className={classes.globalOverlay} label="正在加载" /> : null}
    </RouteLoadingContext.Provider>
  );
}

export function useRouteLoading() {
  const context = useContext(RouteLoadingContext);
  if (!context) {
    throw new Error("useRouteLoading must be used inside RouteLoadingProvider.");
  }
  return context;
}

export function RouteLoadingLink({ onClick, ...props }: LinkProps & AnchorProps) {
  const { startGlobalLoading } = useRouteLoading();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentHref = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

  return (
    <Link
      {...props}
      onClick={(event) => {
        onClick?.(event);
        if (!shouldIgnoreClick(event) && normalizeHref(props.href) !== currentHref) {
          startGlobalLoading();
        }
      }}
    />
  );
}

export function WorkspaceLoadingLink({
  onClick,
  onNavigateStart,
  ...props
}: LinkProps & AnchorProps & { onNavigateStart: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentHref = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

  return (
    <Link
      {...props}
      onClick={(event) => {
        onClick?.(event);
        if (!shouldIgnoreClick(event) && normalizeHref(props.href) !== currentHref) {
          onNavigateStart();
        }
      }}
    />
  );
}

export function LoadingOverlay({ className, label }: { className: string; label: string }) {
  const classes = getLoadingOverlayClasses();

  return (
    <div className={className} aria-live="polite" aria-busy="true">
      <div className={classes.panel}>
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span>{label}</span>
      </div>
    </div>
  );
}
