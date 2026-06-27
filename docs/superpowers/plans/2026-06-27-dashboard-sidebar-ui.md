# Dashboard Sidebar UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move recent projects into the dashboard sidebar, remove the Template and Settings menu items, and isolate sidebar/main scrolling.

**Architecture:** Keep the dashboard server component responsible for fetching data and pass recent projects into the existing sidebar component. Add a small pure helper for sidebar navigation and recent project projection so the UI behavior is covered by focused unit tests.

**Tech Stack:** Next.js App Router, React Server Components, TypeScript, Tailwind CSS, Vitest.

---

### Task 1: Sidebar Data Helpers

**Files:**
- Create: `apps/web/src/lib/sidebar.ts`
- Test: `apps/web/src/lib/sidebar.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { getSidebarNavItems, getSidebarRecentProjects } from "./sidebar";

describe("sidebar helpers", () => {
  it("keeps the dashboard navigation focused on the three primary destinations", () => {
    expect(getSidebarNavItems().map((item) => item.label)).toEqual(["首页", "资源", "我的项目"]);
  });

  it("projects recent project data for compact sidebar rendering", () => {
    const projects = [
      { id: "project-1", name: "开发蜘蛛纸牌游戏", description: "Create a card game" },
      { id: "project-2", name: "", description: null }
    ];

    expect(getSidebarRecentProjects(projects)).toEqual([
      { id: "project-1", name: "开发蜘蛛纸牌游戏", href: "/projects/project-1" },
      { id: "project-2", name: "未命名项目", href: "/projects/project-2" }
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @smota/web test -- src/lib/sidebar.test.ts`

Expected: FAIL because `apps/web/src/lib/sidebar.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
import { Box, Home, Layers, type LucideIcon } from "lucide-react";

export interface SidebarNavItem {
  label: string;
  icon: LucideIcon;
}

export interface SidebarRecentProjectInput {
  id: string;
  name: string | null;
}

export interface SidebarRecentProject {
  id: string;
  name: string;
  href: string;
}

export function getSidebarNavItems(): SidebarNavItem[] {
  return [
    { label: "首页", icon: Home },
    { label: "资源", icon: Box },
    { label: "我的项目", icon: Layers }
  ];
}

export function getSidebarRecentProjects(projects: SidebarRecentProjectInput[]): SidebarRecentProject[] {
  return projects.map((project) => ({
    id: project.id,
    name: project.name?.trim() || "未命名项目",
    href: `/projects/${project.id}`
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @smota/web test -- src/lib/sidebar.test.ts`

Expected: PASS.

### Task 2: Dashboard Sidebar Layout

**Files:**
- Modify: `apps/web/src/components/sidebar.tsx`
- Modify: `apps/web/src/app/dashboard/page.tsx`

- [ ] **Step 1: Update sidebar rendering**

Use `getSidebarNavItems()` for navigation and render recent project links below the nav section. Keep the account/logout area pinned after a flexible spacer.

- [ ] **Step 2: Update dashboard page layout**

Pass `projects` into `<Sidebar />`, remove the right-side recent-project cards, and set both sidebar and main content to independent viewport scroll containers.

- [ ] **Step 3: Verify build-oriented checks**

Run:

```bash
pnpm --filter @smota/web test -- src/lib/sidebar.test.ts
pnpm --filter @smota/web typecheck
```

Expected: both commands pass.

### Task 3: Project Detail Scroll Isolation

**Files:**
- Modify: `apps/web/src/lib/workbench.ts`
- Modify: `apps/web/src/lib/workbench.test.ts`
- Modify: `apps/web/src/components/workbench-client.tsx`

- [x] **Step 1: Write the failing test**

Add a `getWorkbenchLayoutClasses()` expectation to `apps/web/src/lib/workbench.test.ts` requiring:

```ts
expect(classes.root).toContain("h-screen");
expect(classes.root).toContain("overflow-hidden");
expect(classes.sidebar).toContain("h-screen");
expect(classes.sidebar).toContain("overflow-y-auto");
expect(classes.main).toContain("h-screen");
expect(classes.content).toContain("overflow-y-auto");
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @smota/web test -- src/lib/workbench.test.ts`

Observed: FAIL with `getWorkbenchLayoutClasses is not a function`.

- [x] **Step 3: Write minimal implementation**

Add `getWorkbenchLayoutClasses()` in `apps/web/src/lib/workbench.ts` and use it in `apps/web/src/components/workbench-client.tsx` for the root, sidebar, main, and content containers.

- [x] **Step 4: Verify**

Run:

```bash
pnpm --filter @smota/web test
pnpm --filter @smota/web typecheck
```

Expected: both commands pass.

### Task 4: Project Detail Agent Panel Fixed Actions

**Files:**
- Modify: `apps/web/src/lib/workbench.ts`
- Modify: `apps/web/src/lib/workbench.test.ts`
- Modify: `apps/web/src/components/workbench-client.tsx`

- [x] **Step 1: Write the failing test**

Extend `getWorkbenchLayoutClasses()` expectations so the project detail sidebar itself is `overflow-hidden`, the agent summary area is `overflow-y-auto`, and the action area is `shrink-0 border-t`.

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @smota/web test -- src/lib/workbench.test.ts`

Observed: FAIL because the sidebar still used `overflow-y-auto` and the Agent Panel section classes did not exist.

- [x] **Step 3: Write minimal implementation**

Add Agent Panel layout classes and render the panel as two vertical sections:

- Scrollable summary section: project name, prompt, status, agent timeline, current stage, and task checklist.
- Fixed action section: continue-description input and the current primary action button.

Remove the always-visible `刷新状态` button from the fixed action section.

- [x] **Step 4: Verify**

Run:

```bash
pnpm --filter @smota/web test -- src/lib/workbench.test.ts
pnpm --filter @smota/web typecheck
```

Expected: both commands pass.

### Task 5: Project Detail Progress Icon Synchronization

**Files:**
- Modify: `apps/web/src/lib/workbench.ts`
- Modify: `apps/web/src/lib/workbench.test.ts`
- Modify: `apps/web/src/components/workbench-client.tsx`

- [x] **Step 1: Investigate root cause**

The Sandbox workflow updates `agent_runs.status`, `agent_runs.current_step`, `agent_runs.sandbox_status`, `agent_runs.build_status`, and `run_events`, but it does not continuously update persisted `tasks.status`. The left panel rendered task icons directly from `task.status`, so older runs could remain visually stale even after `run.status = succeeded` and `sandbox_status = previewing`.

- [x] **Step 2: Write failing tests**

Add tests for:

- `getTaskDisplayStatus()` showing unfinished tasks as `in_progress` while a run is active and `done` when the run succeeds.
- `getAgentDisplayStates()` marking CodingAgent/BuildAgent/ReviewerAgent from run, sandbox, build, and event progress.

- [x] **Step 3: Implement display-state helpers**

Add front-end display-state helpers that derive icons from persisted task status plus run/sandbox/build state. This keeps historical runs visually correct without requiring a migration or backfill.

- [x] **Step 4: Use derived display state in Agent Panel**

Render Agent timeline and task checklist icons from the derived display state:

- `done`: green completed icon.
- `in_progress`: spinning loader.
- `todo`: neutral pending icon.

- [x] **Step 5: Verify**

Run:

```bash
pnpm --filter @smota/web test
pnpm --filter @smota/web typecheck
```

Expected: both commands pass.

### Self-Review

- Spec coverage: covers removing Template/Settings, moving recent projects into sidebar, and independent sidebar/main scrolling.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: helper names and component imports match the files above.
