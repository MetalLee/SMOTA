import { ProjectForm } from "@/components/project-form";
import { Sidebar } from "@/components/sidebar";
import { getDashboardData } from "@/lib/data";

export default async function NewProjectPage() {
  const { user } = await getDashboardData();

  return (
    <div className="flex min-h-screen">
      <Sidebar email={user.email} />
      <main className="flex flex-1 items-start justify-center px-8 py-10">
        <div className="w-full max-w-4xl">
          <ProjectForm />
        </div>
      </main>
    </div>
  );
}
