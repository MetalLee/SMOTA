import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildPreviewScreenshotObjectPath,
  capturePreviewScreenshot,
  getPreviewScreenshotBucket,
  getPreviewScreenshotConfig,
  getRunnerChromiumInstallCommand,
  assertRunnerChromiumAvailable,
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

  it("documents how to install Chromium on the Runner", () => {
    expect(getRunnerChromiumInstallCommand()).toBe("pnpm --filter @smota/sandbox-runner exec playwright install chromium");
  });

  it("keeps Playwright visible to the Next.js server bundle tracer", () => {
    const source = readFileSync(new URL("./sandbox-screenshot.ts", import.meta.url), "utf8");

    expect(source).toContain('require("playwright")');
    expect(source).not.toContain("new Function");
    expect(source).not.toContain("import('playwright')");
  });

  it("fails early when Runner Chromium is not installed", () => {
    expect(() =>
      assertRunnerChromiumAvailable({
        chromium: { executablePath: () => "/missing/chromium" },
        fileExists: () => false
      })
    ).toThrow(/Runner Chromium is not installed.*pnpm --filter @smota\/sandbox-runner exec playwright install chromium/s);
  });

  it("captures screenshots from the Runner using Playwright Chromium", async () => {
    const screenshot = Buffer.from("png");
    const calls: string[] = [];
    const page = {
      setViewportSize: async (viewport: { width: number; height: number }) => {
        calls.push(`viewport:${viewport.width}x${viewport.height}`);
      },
      goto: async (url: string, options: { timeout: number; waitUntil: string }) => {
        calls.push(`goto:${url}:${options.timeout}:${options.waitUntil}`);
      },
      waitForTimeout: async (timeout: number) => {
        calls.push(`wait:${timeout}`);
      },
      screenshot: async (options: { type: string }) => {
        calls.push(`screenshot:${options.type}`);
        return screenshot;
      }
    };
    const browser = {
      newPage: async () => {
        calls.push("newPage");
        return page;
      },
      close: async () => {
        calls.push("close");
      }
    };

    const image = await capturePreviewScreenshot({
      previewUrl: "https://preview.example.dev",
      config: {
        viewport: { width: 1280, height: 720 },
        timeoutMs: 30000,
        settleMs: 1500
      },
      chromium: {
        executablePath: () => "/runner/chromium",
        launch: async (options: { headless: boolean }) => {
          calls.push(`launch:${options.headless}`);
          return browser;
        }
      },
      fileExists: () => true
    });

    expect(image).toBe(screenshot);
    expect(calls).toEqual([
      "launch:true",
      "newPage",
      "viewport:1280x720",
      "goto:https://preview.example.dev:30000:networkidle",
      "wait:1500",
      "screenshot:png",
      "close"
    ]);
  });
});
