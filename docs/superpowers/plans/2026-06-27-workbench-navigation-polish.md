# Workbench Navigation Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve project detail navigation by removing two inactive header controls, avoiding editor file-switch overlays, and making the dashboard sidebar logo navigate home.

**Architecture:** Keep URL-driven workspace state. Add small helper functions in `apps/web/src/lib/workbench.ts` so navigation decisions are testable, then wire them into `apps/web/src/components/workbench-client.tsx` and `apps/web/src/components/sidebar.tsx`.

**Tech Stack:** Next.js App Router, React client components, Vitest, Tailwind CSS.

---

### Task 1: Navigation Helper Tests

**Files:**
- Modify: `apps/web/src/lib/workbench.test.ts`
- Modify: `apps/web/src/lib/workbench.ts`

- [ ] **Step 1: Write failing tests**

Add tests asserting that editor file links do not request a workspace overlay, workspace tab changes do request it, and the inactive header labels are absent from allowed controls.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @smota/web test -- workbench.test.ts`

Expected: FAIL because `shouldShowWorkspaceNavigationOverlay` and `getWorkbenchHeaderActions` do not exist.

- [ ] **Step 3: Implement minimal helpers**

Add `shouldShowWorkspaceNavigationOverlay(currentTab, nextTab, currentFile, nextFile)` and `getWorkbenchHeaderActions()`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @smota/web test -- workbench.test.ts`

Expected: PASS.

### Task 2: UI Wiring

**Files:**
- Modify: `apps/web/src/components/workbench-client.tsx`
- Modify: `apps/web/src/components/sidebar.tsx`

- [ ] **Step 1: Wire workspace overlay helper**

Use the helper for workspace tab links and stop passing `onNavigateStart` for editor file links.

- [ ] **Step 2: Remove inactive header controls**

Remove “跟随智能体” and “控制台” from the project detail header.

- [ ] **Step 3: Make sidebar brand link to dashboard**

Wrap the brand block in `RouteLoadingLink href="/dashboard"`.

- [ ] **Step 4: Verify**

Run `pnpm --filter @smota/web test`, `pnpm --filter @smota/web typecheck`, and `pnpm --filter @smota/web build`.
