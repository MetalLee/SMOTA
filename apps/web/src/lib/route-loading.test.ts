import { describe, expect, it } from "vitest";
import { getRouteLoadingOverlayScope, getRouteLoadingSuspenseFallback } from "./route-loading";

describe("route loading helpers", () => {
  it("does not render route children as the provider suspense fallback", () => {
    expect(getRouteLoadingSuspenseFallback("page children")).toBeNull();
  });

  it("scopes dashboard resource and my-projects route loading to the right content area", () => {
    expect(getRouteLoadingOverlayScope("/dashboard")).toBe("main");
    expect(getRouteLoadingOverlayScope("/resource")).toBe("main");
    expect(getRouteLoadingOverlayScope("/my-projects")).toBe("main");
    expect(getRouteLoadingOverlayScope("/projects/project-1")).toBe("global");
    expect(getRouteLoadingOverlayScope("/auth/login")).toBe("global");
  });
});
