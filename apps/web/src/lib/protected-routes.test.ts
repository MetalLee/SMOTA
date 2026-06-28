import { describe, expect, it } from "vitest";
import { isProtectedPath } from "./protected-routes";

describe("protected routes", () => {
  it("protects primary dashboard navigation routes", () => {
    expect(isProtectedPath("/dashboard")).toBe(true);
    expect(isProtectedPath("/resource")).toBe(true);
    expect(isProtectedPath("/my-projects")).toBe(true);
  });

  it("protects nested project and run routes without matching unrelated paths", () => {
    expect(isProtectedPath("/projects/project-1")).toBe(true);
    expect(isProtectedPath("/runs/run-1")).toBe(true);
    expect(isProtectedPath("/share/project-1")).toBe(true);
    expect(isProtectedPath("/resource/templates")).toBe(true);
    expect(isProtectedPath("/auth/login")).toBe(false);
    expect(isProtectedPath("/dashboard-preview")).toBe(false);
  });
});
