import type { SupabaseClient } from "@supabase/supabase-js";
import { isProbablyBinary, sanitizeWorkspacePath } from "./sandbox-security";
import { insertRunEvent, type RunContext } from "./sandbox-events";

export const WORKSPACE_DIR = "/workspace";
export const EXCLUDED_DIRS = new Set(["node_modules", ".git", "dist", ".next", ".vercel"]);
const MAX_READ_BYTES = 1024 * 1024;

export interface FileSandbox {
  fs: {
    mkdir(path: string, options?: { recursive?: boolean }): Promise<string | undefined>;
    readdir(path: string, options?: { withFileTypes?: boolean }): Promise<Array<string | { name: string; isDirectory(): boolean; isFile(): boolean }>>;
    stat(path: string): Promise<{ size: number; mtime?: Date; isDirectory(): boolean; isFile(): boolean }>;
  };
  writeFiles(files: Array<{ path: string; content: string | Uint8Array; mode?: number }>): Promise<void>;
  readFileToBuffer(file: { path: string; cwd?: string }): Promise<Buffer | null>;
}

export async function ensureWorkspace(sandbox: FileSandbox) {
  await sandbox.fs.mkdir(WORKSPACE_DIR, { recursive: true });
}

export async function writeHarnessArtifacts(
  sandbox: FileSandbox,
  artifacts: Array<{ path: string; content: string }>
) {
  await sandbox.writeFiles(
    artifacts.map((artifact) => ({
      path: `${WORKSPACE_DIR}/${sanitizeWorkspacePath(artifact.path)}`,
      content: artifact.content
    }))
  );
}

export async function scanWorkspaceFiles(params: {
  sandbox: FileSandbox;
  supabase: SupabaseClient;
  context: RunContext;
}) {
  const rows: Array<Record<string, unknown>> = [];

  async function walk(dir: string, relativeDir = "") {
    const entries = await params.sandbox.fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const name = typeof entry === "string" ? entry : entry.name;
      if (!name || EXCLUDED_DIRS.has(name)) {
        continue;
      }

      const relativePath = relativeDir ? `${relativeDir}/${name}` : name;
      const absolutePath = `${WORKSPACE_DIR}/${relativePath}`;
      const stat = await params.sandbox.fs.stat(absolutePath);

      if (stat.isDirectory()) {
        await walk(absolutePath, relativePath);
        continue;
      }

      if (!stat.isFile()) {
        continue;
      }

      rows.push({
        owner_id: params.context.ownerId,
        project_id: params.context.projectId,
        run_id: params.context.runId,
        path: relativePath,
        file_type: "file",
        change_type: "generated",
        size: stat.size,
        last_modified_at: stat.mtime?.toISOString?.() ?? new Date().toISOString()
      });
    }
  }

  await walk(WORKSPACE_DIR);

  await params.supabase.from("workspace_files").delete().eq("project_id", params.context.projectId).eq("owner_id", params.context.ownerId);
  if (rows.length) {
    await params.supabase.from("workspace_files").insert(rows);
  }

  await insertRunEvent(params.supabase, params.context, {
    eventType: "file.indexed",
    step: "index_files",
    message: `Indexed ${rows.length} workspace files.`,
    payload: { count: rows.length }
  });

  return rows;
}

export async function readWorkspaceTextFile(params: {
  sandbox: FileSandbox;
  path: string;
  maxBytes?: number;
}) {
  const safePath = sanitizeWorkspacePath(params.path);
  const content = await params.sandbox.readFileToBuffer({ path: `${WORKSPACE_DIR}/${safePath}` });

  if (!content) {
    throw new Error("File was not found in the active Sandbox workspace.");
  }

  if (content.length > (params.maxBytes ?? MAX_READ_BYTES)) {
    throw new Error("File is larger than the 1MB read limit.");
  }

  if (isProbablyBinary(content)) {
    throw new Error("Binary files cannot be displayed in the text editor.");
  }

  return {
    path: safePath,
    content: content.toString("utf8")
  };
}
