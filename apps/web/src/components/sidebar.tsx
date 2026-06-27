import { LogOut, UserRound } from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import { PendingButton } from "@/components/pending-button";
import { RouteLoadingLink } from "@/components/route-loading";
import { SidebarNav } from "@/components/sidebar-nav";
import { getSidebarRecentProjects, type SidebarRecentProjectInput } from "@/lib/sidebar";

export function Sidebar({ email, projects = [] }: { email?: string | null; projects?: SidebarRecentProjectInput[] }) {
  const recentProjects = getSidebarRecentProjects(projects);

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-border bg-white px-4 py-5">
      <RouteLoadingLink className="mb-8 flex items-center gap-3 rounded-lg px-2 py-1 transition hover:bg-slate-50" href="/dashboard">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
          S
        </div>
        <div>
          <div className="text-sm font-bold tracking-wide">SMOTA</div>
          <div className="text-xs text-slate-500">AI App Builder</div>
        </div>
      </RouteLoadingLink>

      <SidebarNav />

      <section className="mt-8">
        <div className="mb-3 px-3 text-xs font-semibold text-slate-400">最近</div>
        {recentProjects.length ? (
          <div className="space-y-1">
            {recentProjects.map((project) => (
              <RouteLoadingLink
                key={project.id}
                href={project.href}
                className="block truncate rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-ink"
              >
                {project.name}
              </RouteLoadingLink>
            ))}
          </div>
        ) : (
          <div className="px-3 text-sm leading-6 text-slate-400">暂无项目</div>
        )}
      </section>

      <div className="mt-auto rounded-lg border border-border bg-slate-50 p-3">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm">
            <UserRound className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-slate-700">{email ?? "已登录用户"}</div>
            <div className="text-xs text-slate-400">Workspace</div>
          </div>
        </div>
        <form action={signOutAction}>
          <PendingButton
            className="h-9 w-full border-border bg-white text-xs font-semibold text-slate-600 shadow-none hover:bg-slate-50 hover:text-ink"
            type="submit"
            pendingLabel="登出中"
          >
            <LogOut className="h-4 w-4" />
            登出
          </PendingButton>
        </form>
      </div>
    </aside>
  );
}
