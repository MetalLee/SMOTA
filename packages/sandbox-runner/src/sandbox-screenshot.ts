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
}

export interface UploadPreviewScreenshotInput {
  supabase: SupabaseClient;
  bucket: string;
  objectPath: string;
  image: Buffer;
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

export function getSandboxPreviewScreenshotPath() {
  return "/tmp/smota-preview.png";
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function buildSandboxChromiumDependenciesCommand() {
  const packages = [
    "alsa-lib",
    "atk",
    "at-spi2-atk",
    "cairo",
    "cups-libs",
    "gtk3",
    "libdrm",
    "libX11",
    "libXcomposite",
    "libXdamage",
    "libXext",
    "libXfixes",
    "libXrandr",
    "libxkbcommon",
    "mesa-libgbm",
    "nspr",
    "nss",
    "pango"
  ];

  return `if command -v dnf >/dev/null 2>&1; then sudo dnf install -y ${packages.join(" ")}; fi`;
}

export function buildSandboxPreviewScreenshotCommand({
  previewUrl,
  config,
  outputPath = getSandboxPreviewScreenshotPath(),
  playwrightVersion = "1.61.1"
}: CapturePreviewScreenshotInput & { outputPath?: string; playwrightVersion?: string }) {
  return [
    buildSandboxChromiumDependenciesCommand(),
    `npm exec --yes playwright@${playwrightVersion} -- install chromium --only-shell`,
    [
      `npm exec --yes playwright@${playwrightVersion} -- screenshot`,
      `--timeout ${config.timeoutMs}`,
      `--wait-for-timeout ${Math.max(0, config.settleMs)}`,
      `--viewport-size ${config.viewport.width},${config.viewport.height}`,
      shellQuote(previewUrl),
      shellQuote(outputPath)
    ].join(" ")
  ].join(" && ");
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
