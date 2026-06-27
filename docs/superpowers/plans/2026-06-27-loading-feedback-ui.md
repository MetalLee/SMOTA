# Loading Feedback UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent duplicate request submissions and show loading feedback for route transitions.

**Architecture:** Add small client-side UI primitives for pending submit buttons and navigation overlays. Use global route overlay for app-level navigation and a workspace-scoped overlay for workbench tab/file navigation.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, Vitest.

---

### Task 1: Loading Helper Contracts

**Files:**
- Modify: `apps/web/src/lib/workbench.ts`
- Test: `apps/web/src/lib/workbench.test.ts`

- [x] **Step 1: Write failing tests**

Add tests requiring loading overlay classes to contain `backdrop-blur` and requiring workspace overlay classes to be absolute/inset scoped.

- [x] **Step 2: Implement helper classes**

Add `getLoadingOverlayClasses()` with `globalOverlay`, `workspaceOverlay`, and `panel` class names.

- [x] **Step 3: Verify**

Run `pnpm --filter @smota/web test -- src/lib/workbench.test.ts`.

### Task 2: Pending Submit Buttons

**Files:**
- Create: `apps/web/src/components/pending-button.tsx`
- Modify: `apps/web/src/components/auth-card.tsx`
- Modify: `apps/web/src/components/project-form.tsx`
- Modify: `apps/web/src/components/sidebar.tsx`
- Modify: `apps/web/src/components/workbench-client.tsx`

- [x] **Step 1: Implement `PendingButton`**

Use `useFormStatus()` so server-action form submissions disable the button and show a spinner.

- [x] **Step 2: Replace server-action submit buttons**

Use `PendingButton` for login, signup, project creation, sign out, and approve plan.

- [x] **Step 3: Preserve client request buttons**

Ensure Sandbox start/stop and preview refresh already disable while pending and show spinner.

### Task 3: Route Loading Overlays

**Files:**
- Create: `apps/web/src/components/route-loading.tsx`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/components/sidebar.tsx`
- Modify: `apps/web/src/components/auth-card.tsx`
- Modify: `apps/web/src/components/workbench-client.tsx`

- [x] **Step 1: Implement provider and links**

Add `RouteLoadingProvider`, `RouteLoadingLink`, and `WorkspaceLoadingLink`.

- [x] **Step 2: Global overlay**

Wrap the app in `RouteLoadingProvider`; global links show a fixed glass overlay.

- [x] **Step 3: Workspace overlay**

Workbench tab and file links use `WorkspaceLoadingLink`, showing an absolute glass overlay only over the right work area.

### Task 4: Rules And Verification

**Files:**
- Modify: `CODEX_TASK_RULES.md`

- [x] **Step 1: Document loading UI rules**

Add rules requiring pending-disabled request buttons and route transition loading masks.

- [x] **Step 2: Verify**

Run:

```bash
pnpm --filter @smota/web test
pnpm --filter @smota/web typecheck
pnpm --filter @smota/web build
```

### Self-Review

- Covers request buttons, global route transitions, workspace-local route transitions, and CODEX task rules.
- No unrelated backend behavior changes.
