import { Box, Home, Layers, LogOut, Settings, Sparkles, UserRound } from "lucide-react";
import { signOutAction } from "@/app/actions/auth";

const navItems = [
  { label: "首页", icon: Home },
  { label: "资源", icon: Box },
  { label: "我的项目", icon: Layers },
  { label: "模板", icon: Sparkles },
  { label: "设置", icon: Settings }
];

export function Sidebar({ email }: { email?: string | null }) {
  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-border bg-white px-4 py-5">
      <div className="mb-8 flex items-center gap-3 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
          S
        </div>
        <div>
          <div className="text-sm font-bold tracking-wide">SMOTA</div>
          <div className="text-xs text-slate-500">AI App Builder</div>
        </div>
      </div>

      <nav className="space-y-1">
        {navItems.map((item) => (
          <div
            key={item.label}
            className="flex h-10 items-center gap-3 rounded-lg px-3 text-sm text-slate-600 transition hover:bg-slate-50 hover:text-ink"
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </div>
        ))}
      </nav>

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
          <button className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border bg-white text-xs font-semibold text-slate-600 transition hover:text-ink">
            <LogOut className="h-4 w-4" />
            登出
          </button>
        </form>
      </div>
    </aside>
  );
}
