import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ProjectForm } from "@/components/project-form";
import { Sidebar } from "@/components/sidebar";
import { Card } from "@/components/ui/card";
import { getDashboardData } from "@/lib/data";

export default async function DashboardPage() {
  const { user, projects } = await getDashboardData();

  return (
    <div className="flex min-h-screen">
      <Sidebar email={user.email} />
      <main className="flex-1 px-8 py-8">
        <div className="mx-auto max-w-5xl space-y-8">
          <ProjectForm />

          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">最近项目</h2>
              <Link href="/projects/new" className="text-sm font-semibold text-primary">
                新建项目
              </Link>
            </div>
            {projects.length ? (
              <div className="grid gap-3">
                {projects.map((project) => (
                  <Link key={project.id} href={`/projects/${project.id}`}>
                    <Card className="flex items-center justify-between p-4 transition hover:border-primary/30 hover:shadow-soft">
                      <div>
                        <div className="font-semibold">{project.name}</div>
                        <div className="mt-1 max-w-2xl truncate text-sm text-slate-500">{project.description}</div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-slate-400" />
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <Card className="p-8 text-center text-sm text-slate-500">还没有项目，先从一句话开始。</Card>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
