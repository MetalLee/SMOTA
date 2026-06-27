import { WandSparkles } from "lucide-react";
import { createProjectAction } from "@/app/actions/projects";
import { PendingButton } from "@/components/pending-button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";

const examples = [
  "为宠物诊所创建预约管理后台",
  "做一个面向设计师的作品集 Landing Page",
  "创建 SaaS Demo，用于管理客户线索和跟进任务"
];

export function ProjectForm() {
  return (
    <Card className="p-6 shadow-soft">
      <form action={createProjectAction} className="space-y-5">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">你想构建什么？</h1>
          <p className="mt-2 text-sm text-slate-500">输入一句话，SMOTA 会先生成项目计划和 Harness 文档。</p>
        </div>
        <Textarea name="prompt" required placeholder="例如：为宠物诊所创建预约管理后台" />

        <div className="grid gap-4 lg:grid-cols-2">
          <fieldset className="rounded-lg border border-border p-4">
            <legend className="px-1 text-sm font-semibold text-slate-700">模式选择</legend>
            <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
              <input defaultChecked type="radio" name="mode" value="plan-first" />
              计划优先
            </label>
            <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">
              <input type="radio" name="mode" value="quick-build" />
              快速构建
            </label>
          </fieldset>
          <fieldset className="rounded-lg border border-border p-4">
            <legend className="px-1 text-sm font-semibold text-slate-700">应用类型</legend>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-slate-600">
              {["Web App", "Admin", "Landing Page", "SaaS Demo"].map((type) => (
                <label key={type} className="flex items-center gap-2">
                  <input defaultChecked={type === "Web App"} type="radio" name="appType" value={type} />
                  {type}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <PendingButton type="submit" className="h-12 px-5" pendingLabel="构建中">
          <WandSparkles className="h-4 w-4" />
          构建
        </PendingButton>
      </form>

      <div className="mt-6 border-t border-border pt-5">
        <div className="mb-3 text-sm font-semibold text-slate-700">示例 Prompt</div>
        <div className="flex flex-wrap gap-2">
          {examples.map((example) => (
            <span key={example} className="rounded-full border border-border bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
              {example}
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}
