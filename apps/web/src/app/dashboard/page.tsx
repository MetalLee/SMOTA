import { ProjectForm } from "@/components/project-form";
import { Sidebar } from "@/components/sidebar";
import { getDashboardData } from "@/lib/data";

export default async function DashboardPage() {
  const { user, projects } = await getDashboardData();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar email={user.email} projects={projects} />
      <main className="h-screen flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto max-w-5xl">
          <ProjectForm />
        </div>
      </main>
    </div>
  );
}
