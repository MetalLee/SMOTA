import { describe, expect, it } from "vitest";
import { canReadRunSandboxStatus, shouldAttemptPreviewRecovery } from "./sandbox-status-access";

describe("sandbox status access", () => {
  it("allows owners and shared project viewers to recover preview status", () => {
    expect(canReadRunSandboxStatus({ userId: "user-1", runOwnerId: "user-1", projectShared: false })).toBe(true);
    expect(canReadRunSandboxStatus({ userId: "user-2", runOwnerId: "user-1", projectShared: true })).toBe(true);
    expect(canReadRunSandboxStatus({ userId: "user-2", runOwnerId: "user-1", projectShared: false })).toBe(false);
  });

  it("attempts preview recovery only for previewing completed runs with a sandbox and preview URL", () => {
    expect(
      shouldAttemptPreviewRecovery({
        ensurePreview: true,
        runStatus: "succeeded",
        sandboxStatus: "previewing",
        sandboxName: "smota-sandbox",
        previewUrl: "https://preview.example.dev"
      })
    ).toBe(true);
    expect(
      shouldAttemptPreviewRecovery({
        ensurePreview: true,
        runStatus: "succeeded",
        sandboxStatus: "previewing",
        sandboxName: "smota-sandbox",
        previewUrl: null
      })
    ).toBe(false);
    expect(
      shouldAttemptPreviewRecovery({
        ensurePreview: true,
        runStatus: "running",
        sandboxStatus: "previewing",
        sandboxName: "smota-sandbox",
        previewUrl: "https://preview.example.dev"
      })
    ).toBe(false);
    expect(
      shouldAttemptPreviewRecovery({
        ensurePreview: true,
        runStatus: "succeeded",
        sandboxStatus: "stopped",
        sandboxName: "smota-sandbox",
        previewUrl: "https://preview.example.dev"
      })
    ).toBe(false);
  });
});
