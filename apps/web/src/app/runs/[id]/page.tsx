import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/data";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getCurrentUser();
  const { data: run } = await supabase
    .from("agent_runs")
    .select("project_id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (!run) {
    redirect("/dashboard");
  }

  redirect(`/projects/${run.project_id}`);
}
