import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface PreviewScreenshotConfig {
  viewport: {
    width: number;
    height: number;
  };
  timeoutMs: number;
  settleMs: number;
}

export interface CapturePreviewScreenshotInput {
  previewUrl: string;
  config: PreviewScreenshotConfig;
  chromium?: RunnerChromium;
  fileExists?: (path: string) => boolean;
}

export interface UploadPreviewScreenshotInput {
  supabase: SupabaseClient;
  bucket: string;
  objectPath: string;
  image: Buffer;
}

export interface RunnerChromium {
  executablePath(): string;
  launch(options: { headless: boolean }): Promise<RunnerBrowser>;
}

export interface RunnerBrowser {
  newPage(): Promise<RunnerPage>;
  close(): Promise<void>;
}

export interface RunnerPage {
  setViewportSize(viewport: { width: number; height: number }): Promise<void>;
  goto(url: string, options: { timeout: number; waitUntil: "networkidle" }): Promise<unknown>;
  waitForTimeout(timeout: number): Promise<void>;
  screenshot(options: { type: "png" }): Promise<Buffer>;
}

export function getPreviewScreenshotBucket(env: Record<string, string | undefined> = process.env) {
  return env.SUPABASE_PREVIEW_BUCKET?.trim() || env.SMOTA_PREVIEW_BUCKET?.trim() || "";
}

export function getPreviewScreenshotConfig(env: Record<string, string | undefined> = process.env): PreviewScreenshotConfig {
  return {
    viewport: {
      width: Number(env.PREVIEW_SCREENSHOT_WIDTH ?? 1280),
      height: Number(env.PREVIEW_SCREENSHOT_HEIGHT ?? 720)
    },
    timeoutMs: Number(env.PREVIEW_SCREENSHOT_TIMEOUT_MS ?? 30000),
    settleMs: Number(env.PREVIEW_SCREENSHOT_SETTLE_MS ?? 1500)
  };
}

export function shouldCapturePreviewScreenshot({ bucket, previewUrl }: { bucket: string; previewUrl: string }) {
  return Boolean(bucket.trim() && previewUrl.trim());
}

export function buildPreviewScreenshotObjectPath(input: { ownerId: string; projectId: string; runId: string }) {
  return `${input.ownerId}/${input.projectId}/${input.runId}/preview.png`;
}

export function getRunnerChromiumInstallCommand() {
  return "pnpm --filter @smota/sandbox-runner install:chromium";
}

export function configureRunnerPlaywrightEnvironment(env: Record<string, string | undefined> = process.env) {
  env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
}

export function assertRunnerChromiumAvailable({
  chromium,
  fileExists = existsSync
}: {
  chromium: Pick<RunnerChromium, "executablePath">;
  fileExists?: (path: string) => boolean;
}) {
  const executablePath = chromium.executablePath();
  if (!executablePath || !fileExists(executablePath)) {
    throw new Error(
      `Runner Chromium is not installed${executablePath ? ` at ${executablePath}` : ""}. Run \`${getRunnerChromiumInstallCommand()}\` before starting the Runner.`
    );
  }
}

export async function loadRunnerChromium(): Promise<RunnerChromium> {
  configureRunnerPlaywrightEnvironment();
  const require = createRequire(import.meta.url);
  const playwright = require("playwright") as { chromium: RunnerChromium };
  return playwright.chromium;
}

export async function capturePreviewScreenshot({
  previewUrl,
  config,
  chromium,
  fileExists = existsSync
}: CapturePreviewScreenshotInput) {
  const runnerChromium = chromium ?? (await loadRunnerChromium());
  assertRunnerChromiumAvailable({ chromium: runnerChromium, fileExists });

  const browser = await runnerChromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewportSize(config.viewport);
    await page.goto(previewUrl, { timeout: config.timeoutMs, waitUntil: "networkidle" });
    if (config.settleMs > 0) {
      await page.waitForTimeout(config.settleMs);
    }
    return await page.screenshot({ type: "png" });
  } finally {
    await browser.close();
  }
}

export async function uploadPreviewScreenshot({ supabase, bucket, objectPath, image }: UploadPreviewScreenshotInput) {
  const { error } = await supabase.storage.from(bucket).upload(objectPath, image, {
    contentType: "image/png",
    upsert: true
  });

  if (error) {
    throw new Error(error.message);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
  return data.publicUrl;
}
