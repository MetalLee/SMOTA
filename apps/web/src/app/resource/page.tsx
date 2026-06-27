import { Sidebar } from "@/components/sidebar";
import { getDashboardData } from "@/lib/data";

export default async function ResourcePage() {
  const { user, projects } = await getDashboardData();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar email={user.email} projects={projects} />
      <main className="h-screen flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-3xl font-bold tracking-tight">资源</h1>
          <p className="mt-2 text-sm text-slate-500">常用模板、组件和参考资源会在后续阶段集中到这里。</p>
        </div>
      </main>
    </div>
  );
}
