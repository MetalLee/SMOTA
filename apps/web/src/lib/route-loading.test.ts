import { describe, expect, it } from "vitest";
import { getRouteLoadingSuspenseFallback } from "./route-loading";

describe("route loading helpers", () => {
  it("does not render route children as the provider suspense fallback", () => {
    expect(getRouteLoadingSuspenseFallback("page children")).toBeNull();
  });
});
