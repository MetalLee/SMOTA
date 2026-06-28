import { MyProjectCard } from "@/components/my-project-card";
import { RouteLoadingLink } from "@/components/route-loading";
import { Sidebar } from "@/components/sidebar";
import { Card } from "@/components/ui/card";
import { getResourceData } from "@/lib/data";
import { getMyProjectsGridClass } from "@/lib/my-projects";
import { getResourceTabs, normalizeResourceTab } from "@/lib/project-sharing";

export default async function ResourcePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const params = await searchParams;
  const activeTab = normalizeResourceTab(params.tab);
  const { user, projects, discoveryCards } = await getResourceData();
  const tabs = getResourceTabs();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar email={user.email} projects={projects} />
      <main className="h-screen flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto max-w-none">
          <h1 className="text-3xl font-bold tracking-tight">资源</h1>

          <div className="mt-8 inline-flex rounded-full bg-slate-100 p-1 text-sm font-semibold text-slate-500">
            {tabs.map((tab) => (
              <RouteLoadingLink
                key={tab.key}
                href={tab.key === "discover" ? "/resource" : `/resource?tab=${tab.key}`}
                className={activeTab === tab.key ? "rounded-full bg-white px-4 py-2 text-ink shadow-sm" : "rounded-full px-4 py-2 transition hover:text-ink"}
              >
                {tab.label}
              </RouteLoadingLink>
            ))}
          </div>

          {activeTab === "discover" ? (
            discoveryCards.length ? (
              <section className={`${getMyProjectsGridClass()} mt-10`}>
                {discoveryCards.map((project) => (
                  <MyProjectCard key={project.id} project={project} />
                ))}
              </section>
            ) : (
              <Card className="mt-10 flex min-h-64 items-center justify-center p-8 text-center">
                <div>
                  <div className="text-base font-bold text-ink">暂无发现项目</div>
                  <p className="mt-2 text-sm text-slate-500">已发布并共享到发现的项目会展示在这里。</p>
                </div>
              </Card>
            )
          ) : (
            <Card className="mt-10 flex min-h-64 items-center justify-center p-8 text-center">
              <div>
                <div className="text-base font-bold text-ink">模板列表为空</div>
                <p className="mt-2 text-sm text-slate-500">这里会用于集中展示可复用模板。</p>
              </div>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
