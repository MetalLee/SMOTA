# Task Status Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `tasks` the single source of truth for work tracking and let CodingAgent update task status through a scoped HTTP API.

**Architecture:** PlannerAgent continues to generate persisted `tasks`; ROADMAP.md remains readable context only. Sandbox Runner passes CodingAgent task ids plus a short-lived task update endpoint/token into OpenCode, and the Web API validates token, run, owner, status, and `agent_name = CodingAgent` before updating `tasks.status` without touching `agent_runs`.

**Tech Stack:** Next.js route handlers, Supabase, Vercel Sandbox Runner, TypeScript, Vitest.

---

### Task 1: Shared Task Status Types

**Files:**
- Modify: `packages/shared/src/types.ts`
- Test: existing TypeScript/Vitest suite

- [ ] Add `failed` to generated task status typing so persisted and displayed task states match existing UI support.

### Task 2: Task Status API Validation

**Files:**
- Create: `apps/web/src/lib/task-status-update.ts`
- Create: `apps/web/src/lib/task-status-update.test.ts`
- Create: `apps/web/src/app/api/runs/[runId]/tasks/[taskId]/status/route.ts`

- [ ] Write failing tests for valid status, invalid status, invalid token, and non-CodingAgent task rejection.
- [ ] Implement token comparison, status parsing, task select/update, and optional `run_events` insert.
- [ ] Keep `agent_runs` untouched.

### Task 3: CodingAgent Prompt Protocol

**Files:**
- Modify: `packages/sandbox-runner/src/sandbox-workflow.ts`
- Modify: `packages/sandbox-runner/src/sandbox-security.ts`
- Modify: `packages/sandbox-runner/src/sandbox-runner.test.ts`

- [ ] Write failing tests that prompts include task ids, single-source instructions, and curl status update examples.
- [ ] Pass task update URL/token env vars to OpenCode while keeping service role keys out of Sandbox.
- [ ] Query `id,status,agent_name,sort_order` for tasks and include only the persisted tasks in the prompt.

### Task 4: UI Task Display Decoupling

**Files:**
- Modify: `apps/web/src/lib/workbench.ts`
- Modify: `apps/web/src/lib/workbench.test.ts`

- [ ] Write a failing test showing `run.status = succeeded` does not force a `todo` task to display as `done`.
- [ ] Prefer persisted task status for the checklist; Agent timeline may still derive Agent state from run/events.

### Task 5: Documentation

**Files:**
- Modify: `ARCHITECTURE.md`
- Modify: `CODEX_TASK_RULES.md`
- Modify: `AGENTS.md`
- Modify: `README.md`

- [ ] Document that `tasks` is the canonical plan/task source.
- [ ] Document that CodingAgent updates task status through scoped HTTP requests and task status is independent from AgentRun status.

### Verification

- [ ] Run targeted Vitest suites for web helper and sandbox runner.
- [ ] Run package typecheck or full test suite if targeted checks pass.
