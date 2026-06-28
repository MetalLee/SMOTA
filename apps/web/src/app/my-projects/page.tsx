import { MyProjectCard } from "@/components/my-project-card";
import { RouteLoadingLink } from "@/components/route-loading";
import { Sidebar } from "@/components/sidebar";
import { Card } from "@/components/ui/card";
import { getMyProjectsData } from "@/lib/data";
import { getMyProjectsGridClass } from "@/lib/my-projects";

export default async function MyProjectsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const params = await searchParams;
  const activeTab = params.tab === "favorites" ? "favorites" : "all";
  const { user, projects, projectCards } = await getMyProjectsData(activeTab);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar email={user.email} projects={projects} />
      <main className="h-screen flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto max-w-none">
          <h1 className="text-3xl font-bold tracking-tight text-ink">我的项目</h1>

          <div className="mt-8 inline-flex rounded-full bg-slate-100 p-1 text-sm font-semibold text-slate-500">
            <RouteLoadingLink href="/my-projects" className={activeTab === "all" ? "rounded-full bg-white px-4 py-2 text-ink shadow-sm" : "rounded-full px-4 py-2 transition hover:text-ink"}>
              全部
            </RouteLoadingLink>
            <RouteLoadingLink
              href="/my-projects?tab=favorites"
              className={activeTab === "favorites" ? "rounded-full bg-white px-4 py-2 text-ink shadow-sm" : "rounded-full px-4 py-2 transition hover:text-ink"}
            >
              收藏
            </RouteLoadingLink>
          </div>

          {projectCards.length ? (
            <section className={`${getMyProjectsGridClass()} mt-10`}>
              {projectCards.map((project) => (
                <MyProjectCard key={project.id} project={project} />
              ))}
            </section>
          ) : (
            <Card className="mt-10 flex min-h-64 items-center justify-center p-8 text-center">
              <div>
                <div className="text-base font-bold text-ink">暂无项目</div>
                <p className="mt-2 text-sm text-slate-500">{activeTab === "favorites" ? "收藏发现中的项目后，它们会展示在这里。" : "创建项目后，它们会以卡片形式展示在这里。"}</p>
                <RouteLoadingLink
                  href="/projects/new"
                  className="mt-5 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#5147ee]"
                >
                  创建项目
                </RouteLoadingLink>
              </div>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
