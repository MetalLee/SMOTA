import { Eye, GitFork, UserRound } from "lucide-react";
import { ShareProjectActions } from "@/components/share-project-actions";
import { RouteLoadingLink } from "@/components/route-loading";
import { Sidebar } from "@/components/sidebar";
import { SharedProjectPreview } from "@/components/shared-project-preview";
import { Card } from "@/components/ui/card";
import { getSharedProjectData } from "@/lib/data";
import { getShareStatsLabels } from "@/lib/project-sharing";

export default async function SharedProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, projects, project, runId, previewUrl, isFavorited, stats, creator } = await getSharedProjectData(id);
  const [viewLabel, cloneLabel] = getShareStatsLabels(stats);

  return (
    <div className="flex h-screen overflow-hidden bg-[#f6f7fb]">
      <Sidebar email={user.email} projects={projects} />
      <main className="h-screen flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto max-w-7xl">
          <div className="text-sm font-semibold text-slate-500">
            <RouteLoadingLink href="/resource" className="transition hover:text-ink">
              发现
            </RouteLoadingLink>
            <span className="mx-2">›</span>
            <span className="text-ink">其他</span>
          </div>

          <div className="mt-12 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h1 className="break-words text-4xl font-bold tracking-tight text-ink">{project.name}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-lg text-slate-500">
                <span className="inline-flex items-center gap-1.5">
                  <Eye className="h-5 w-5" />
                  {viewLabel.replace("浏览人数 ", "")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <GitFork className="h-5 w-5" />
                  {cloneLabel.replace("克隆次数 ", "")}
                </span>
              </div>
            </div>
            <ShareProjectActions projectId={project.id} projectName={project.name} previewUrl={previewUrl} isFavorited={isFavorited} />
          </div>

          <div className="mt-8 overflow-hidden rounded-lg border border-border bg-white shadow-sm">
            <SharedProjectPreview runId={runId} previewUrl={previewUrl} projectName={project.name} />
          </div>

          <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <section>
              <h2 className="text-2xl font-bold text-ink">关于</h2>
              <div className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-500">
                <UserRound className="h-4 w-4" />
                {project.app_type}
              </div>
            </section>
            <Card className="border-0 bg-transparent p-0 shadow-none">
              <h2 className="text-lg font-bold text-ink">创作者</h2>
              <div className="mt-5 flex items-center gap-4">
                {creator.avatarUrl ? (
                  <img src={creator.avatarUrl} alt={`${creator.name} 头像`} className="h-12 w-12 rounded-full object-cover" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {creator.name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="text-base font-semibold text-ink">{creator.name}</div>
                  <div className="mt-1 text-sm text-slate-500">{project.shared_at ? new Date(project.shared_at).toLocaleDateString("zh-CN") : ""}</div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
