# Realtime Sandbox Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users see Sandbox files in Files and Editor during creation, and see the default Vite home page in the application browser as soon as the Sandbox project is installed.

**Architecture:** Keep Sandbox SDK access on the server. The runner indexes `/workspace` into Supabase after each meaningful phase and starts the Vite dev server right after `init_vite + pnpm install`, before OpenCode changes the app. The workbench keeps using its existing polling loop to refresh Preview, Editor, and Files.

**Tech Stack:** Next.js App Router, Supabase, Vercel Sandbox SDK, Vite React TypeScript, Vitest.

---

### Task 1: File Index Sync

**Files:**
- Modify: `packages/sandbox-runner/src/sandbox-files.ts`
- Test: `packages/sandbox-runner/src/sandbox-runner.test.ts`

- [ ] Add a failing test proving workspace scans upsert rows instead of deleting everything first.
- [ ] Add a `phase` option to `scanWorkspaceFiles`.
- [ ] Implement `upsert` with `onConflict: "owner_id,project_id,run_id,path"` and emit `file.indexed` with the phase.
- [ ] Run `pnpm --filter @smota/sandbox-runner test`.

### Task 2: Early Preview Workflow

**Files:**
- Modify: `packages/sandbox-runner/src/sandbox-workflow.ts`
- Test: `packages/sandbox-runner/src/sandbox-runner.test.ts`

- [ ] Add failing tests for preview startup args and workflow helper expectations.
- [ ] Scan files after Harness write, after Vite init, after OpenCode, after install/build/fix phases.
- [ ] Move `corepack enable`, `pnpm install`, `smota.vite.config.ts`, and `pnpm dev` before OpenCode.
- [ ] Persist preview URL immediately after starting the dev server so the application browser can show the default home page.
- [ ] Re-run `pnpm install` after OpenCode so new dependencies are available before build.

### Task 3: Workbench Copy And Visibility

**Files:**
- Modify: `apps/web/src/lib/workbench.ts`
- Modify: `apps/web/src/components/workbench-client.tsx`
- Test: `apps/web/src/lib/workbench.test.ts`

- [ ] Add tests for phase-aware empty state copy.
- [ ] Update Preview empty state to say the default app will appear after initialization.
- [ ] Update Files and Editor empty states to say files appear during Sandbox creation.
- [ ] Keep polling-based data flow unchanged.

### Task 4: Schema And Documentation

**Files:**
- Create: `supabase/migrations/0005_workspace_file_upsert.sql`
- Modify: `README.md`

- [ ] Add a unique index for `workspace_files(owner_id, project_id, run_id, path)`.
- [ ] Document that preview starts after Vite initialization and files are indexed throughout creation.
- [ ] Run `pnpm test`, `pnpm -r typecheck`, and `pnpm build`.
