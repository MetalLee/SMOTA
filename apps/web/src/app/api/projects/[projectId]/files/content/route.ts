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
    return NextResponse.json({ error: "Invalid path. Parent traversal is not allowed." }, { status: 400 });
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
    return NextResponse.json({ error: "File is not indexed for this project." }, { status: 404 });
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
    return NextResponse.json({ error: "No Sandbox is associated with this project. Re-run the Sandbox workflow to read files." }, { status: 409 });
  }

  try {
    const sandbox = await getVercelSandbox(run.sandbox_name);
    const content = await readWorkspaceTextFile({ sandbox, path: safePath });
    return NextResponse.json(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to restore Sandbox or read this file.";
    return NextResponse.json({ error: message, hint: "If the Sandbox expired and cannot be restored, start a new Sandbox run." }, { status: 409 });
  }
}
