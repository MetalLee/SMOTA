import { describe, expect, it } from "vitest";
import {
  buildPreviewScreenshotObjectPath,
  buildSandboxPreviewScreenshotCommand,
  getPreviewScreenshotCommandTimeoutMs,
  getSandboxPreviewScreenshotPath,
  getPreviewScreenshotBucket,
  getPreviewScreenshotConfig,
  shouldCapturePreviewScreenshot
} from "./sandbox-screenshot";

describe("sandbox preview screenshots", () => {
  it("uses an explicit storage bucket from environment", () => {
    expect(getPreviewScreenshotBucket({ SUPABASE_PREVIEW_BUCKET: "smota-previews" })).toBe("smota-previews");
    expect(getPreviewScreenshotBucket({ SMOTA_PREVIEW_BUCKET: "fallback-previews" })).toBe("fallback-previews");
  });

  it("builds stable per-run screenshot object paths", () => {
    expect(
      buildPreviewScreenshotObjectPath({
        ownerId: "owner-1",
        projectId: "project-1",
        runId: "run-1"
      })
    ).toBe("owner-1/project-1/run-1/preview.png");
  });

  it("captures screenshots only when a bucket and preview url are available", () => {
    expect(shouldCapturePreviewScreenshot({ bucket: "smota-previews", previewUrl: "https://preview.example.dev" })).toBe(true);
    expect(shouldCapturePreviewScreenshot({ bucket: "", previewUrl: "https://preview.example.dev" })).toBe(false);
    expect(shouldCapturePreviewScreenshot({ bucket: "smota-previews", previewUrl: "" })).toBe(false);
  });

  it("uses conservative default screenshot config", () => {
    expect(getPreviewScreenshotConfig({})).toEqual({
      viewport: { width: 1280, height: 720 },
      timeoutMs: 30000,
      settleMs: 1500
    });
  });

  it("uses a stable Sandbox-local screenshot path", () => {
    expect(getSandboxPreviewScreenshotPath()).toBe("/tmp/smota-preview.png");
  });

  it("caps optional screenshot command time below the Sandbox start API max duration", () => {
    const config = {
      viewport: { width: 1280, height: 720 },
      timeoutMs: 30000,
      settleMs: 1500
    };

    expect(getPreviewScreenshotCommandTimeoutMs({}, config)).toBe(120000);
    expect(getPreviewScreenshotCommandTimeoutMs({ PREVIEW_SCREENSHOT_COMMAND_TIMEOUT_MS: "90000" }, config)).toBe(90000);
  });

  it("builds a Sandbox command that installs Chromium and captures the preview after build", () => {
    const command = buildSandboxPreviewScreenshotCommand({
      previewUrl: "https://preview.example.dev",
      config: {
        viewport: { width: 1280, height: 720 },
        timeoutMs: 30000,
        settleMs: 1500
      }
    });

    expect(command).toContain("dnf install -y");
    expect(command).toContain("nspr");
    expect(command).toContain("nss");
    expect(command).toContain("npm exec --yes playwright@1.61.1 -- install chromium --only-shell");
    expect(command).toContain("npm exec --yes playwright@1.61.1 -- screenshot");
    expect(command).toContain("--wait-for-timeout 1500");
    expect(command).toContain("--viewport-size 1280,720");
    expect(command).toContain("https://preview.example.dev");
    expect(command).toContain("/tmp/smota-preview.png");
  });
});
