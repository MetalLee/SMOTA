import { Workbench } from "@/components/workbench";
import { getProjectWorkspace } from "@/lib/data";

export default async function ProjectPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const data = await getProjectWorkspace(id);
  return <Workbench {...data} activeTab={query.tab ?? "plan"} />;
}
