# Editor File Tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a browsable file directory tree to the project detail Editor tab.

**Architecture:** Build a pure file-tree helper from `workspace_files.path` values, then render the Editor tab as a two-column tree plus read-only Monaco editor. File navigation stays within the right work area and uses the existing workspace-scoped loading overlay.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, Monaco Editor, Vitest.

---

### Task 1: File Tree Helpers

**Files:**
- Modify: `apps/web/src/lib/workbench.ts`
- Test: `apps/web/src/lib/workbench.test.ts`

- [x] **Step 1: Write failing tests**

Add tests for:

- `buildFileTree(["src/App.tsx", "src/components/Button.tsx", "README.md"])` returns a root with sorted directories and files.
- `getExpandedDirectorySet("src/components/Button.tsx")` returns `src` and `src/components`.

- [x] **Step 2: Implement helpers**

Add `FileTreeNode`, `buildFileTree()`, and `getExpandedDirectorySet()` in `apps/web/src/lib/workbench.ts`.

- [x] **Step 3: Verify**

Run `pnpm --filter @smota/web test -- src/lib/workbench.test.ts`.

### Task 2: Editor Tab Tree UI

**Files:**
- Modify: `apps/web/src/components/workbench-client.tsx`

- [x] **Step 1: Pass files into Editor tab**

Change `<EditorTab />` to receive `files` and `onNavigateStart`.

- [x] **Step 2: Render two-column layout**

Render a left tree panel and a right editor panel. The tree panel should have independent scrolling and folder expand/collapse state.

- [x] **Step 3: File navigation**

Use `WorkspaceLoadingLink` for file rows so clicking a file updates `?tab=editor&file=...` and shows only the right work-area loading overlay.

### Task 3: Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-06-27-editor-file-tree.md`

- [x] **Step 1: Verify**

Run:

```bash
pnpm --filter @smota/web test
pnpm --filter @smota/web typecheck
pnpm --filter @smota/web build
```

### Self-Review

- Covers file tree construction, expanded-current-path behavior, and Editor tab browsing.
- Does not add write/edit behavior.
