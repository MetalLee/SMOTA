import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const { searchParams } = new URL(request.url);
  const after = searchParams.get("after");
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: run } = await supabase.from("agent_runs").select("id").eq("id", runId).eq("owner_id", user.id).single();
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  let query = supabase.from("run_events").select("*").eq("run_id", runId).eq("owner_id", user.id).order("created_at", { ascending: true });
  if (after) {
    query = query.gt("created_at", after);
  }

  const { data: events, error } = await query.limit(500);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: events ?? [] });
}
