import type { ReactNode } from "react";

export type RouteLoadingOverlayScope = "global" | "main";

const mainAreaLoadingPaths = new Set(["/dashboard", "/resource", "/my-projects"]);

export function getRouteLoadingSuspenseFallback(_children?: ReactNode): null {
  return null;
}

export function getRouteLoadingOverlayScope(pathname: string): RouteLoadingOverlayScope {
  return mainAreaLoadingPaths.has(pathname) ? "main" : "global";
}
