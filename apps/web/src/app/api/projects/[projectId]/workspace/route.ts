import { NextResponse } from "next/server";
import { selectVisibleWorkspaceFiles } from "@/lib/workbench";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: project } = await supabase.from("projects").select("*").eq("id", projectId).eq("owner_id", user.id).single();
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { data: runs } = await supabase
    .from("agent_runs")
    .select("*")
    .eq("project_id", projectId)
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1);
  const run = runs?.[0];

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const [{ data: tasks }, { data: artifacts }, { data: files }, { data: sandboxRun }] = await Promise.all([
    supabase
      .from("tasks")
      .select("*")
      .eq("project_id", projectId)
      .eq("run_id", run.id)
      .eq("owner_id", user.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("artifacts")
      .select("*")
      .eq("project_id", projectId)
      .eq("run_id", run.id)
      .eq("owner_id", user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("workspace_files")
      .select("*")
      .eq("project_id", projectId)
      .eq("owner_id", user.id)
      .order("path", { ascending: true }),
    supabase.from("sandbox_runs").select("*").eq("run_id", run.id).eq("owner_id", user.id).maybeSingle()
  ]);

  return NextResponse.json({
    project,
    run,
    tasks: tasks ?? [],
    artifacts: artifacts ?? [],
    files: selectVisibleWorkspaceFiles(files ?? [], run.id),
    sandboxRun
  });
}
