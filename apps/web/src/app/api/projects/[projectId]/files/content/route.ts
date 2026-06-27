import { NextResponse } from "next/server";
import { getVercelSandbox, readWorkspaceTextFile, sanitizeWorkspacePath } from "@smota/sandbox-runner";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { searchParams } = new URL(request.url);
  const requestedPath = searchParams.get("path") ?? "";
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let safePath: string;
  try {
    safePath = sanitizeWorkspacePath(requestedPath);
  } catch {
    return fileError("invalid_file_path", "Invalid file path", 400);
  }

  const { data: project } = await supabase.from("projects").select("id").eq("id", projectId).eq("owner_id", user.id).single();
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { data: file } = await supabase
    .from("workspace_files")
    .select("path")
    .eq("project_id", projectId)
    .eq("owner_id", user.id)
    .eq("path", safePath)
    .maybeSingle();

  if (!file) {
    return fileError("invalid_file_path", "Invalid file path", 404);
  }

  const { data: run } = await supabase
    .from("agent_runs")
    .select("sandbox_name, sandbox_status")
    .eq("project_id", projectId)
    .eq("owner_id", user.id)
    .not("sandbox_name", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!run?.sandbox_name) {
    return fileError("sandbox_not_ready", "Sandbox not ready", 409);
  }

  if (run.sandbox_status === "stopped") {
    return fileError("sandbox_stopped", "Sandbox stopped", 409);
  }

  try {
    const sandbox = await getVercelSandbox(run.sandbox_name);
    const content = await readWorkspaceTextFile({ sandbox, path: safePath });
    return NextResponse.json(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to restore Sandbox or read this file.";
    if (message.toLowerCase().includes("large") || message.toLowerCase().includes("limit")) {
      return fileError("file_too_large", "File too large", 413);
    }
    if (message.toLowerCase().includes("binary")) {
      return fileError("binary_file", "Binary file is not supported", 415);
    }
    if (message.toLowerCase().includes("stopped") || message.toLowerCase().includes("expired")) {
      return fileError("sandbox_stopped", "Sandbox stopped", 409);
    }
    return fileError("sandbox_not_ready", "Sandbox not ready", 409, message);
  }
}

function fileError(code: string, error: string, status: number, detail?: string) {
  return NextResponse.json({ code, error, detail }, { status });
}
