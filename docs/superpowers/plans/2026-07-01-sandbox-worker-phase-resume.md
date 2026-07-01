# Sandbox Worker Phase Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Sandbox execution out of `/sandbox/start` request continuations and add resumable workflow phases so long runs are not cut off by Vercel Function duration.

**Architecture:** `/sandbox/start` only claims the run and queues a durable job. A new internal worker endpoint claims expired or queued jobs, runs exactly one resumable workflow phase per invocation, updates job phase and lease, and re-dispatches itself through a fire-and-forget HTTP call. The workflow checks persisted `sandbox_workflow_jobs.current_phase` and `agent_runs.current_step` before each phase so retries skip already completed work.

**Tech Stack:** Next.js route handlers, Supabase Postgres, Vercel Sandbox SDK, Vitest, TypeScript.

---

### Task 1: Worker Dispatch Boundaries

**Files:**
- Modify: `packages/sandbox-runner/src/sandbox-workflow-job.ts`
- Modify: `apps/web/src/app/api/runs/[runId]/sandbox/start/route.ts`
- Create: `apps/web/src/app/api/internal/sandbox/workflow/route.ts`
- Test: `packages/sandbox-runner/src/sandbox-runner.test.ts`

- [ ] Add tests proving queued jobs can be claimed for one phase, non-expired running jobs are skipped, and dispatch decisions never call the full workflow from `/sandbox/start`.
- [ ] Implement job helper functions for phase lease, phase completion, worker authorization token parsing, and next-dispatch payloads.
- [ ] Change `/sandbox/start` to queue only and asynchronously call the internal worker endpoint instead of importing `runVercelSandboxWorkflowJob`.
- [ ] Add the internal worker endpoint with service-role auth, claim, one-phase execution, and continuation dispatch.

### Task 2: Resumable Workflow Phases

**Files:**
- Modify: `packages/sandbox-runner/src/sandbox-workflow.ts`
- Modify: `packages/sandbox-runner/src/sandbox-workflow-job.ts`
- Test: `packages/sandbox-runner/src/sandbox-runner.test.ts`

- [ ] Add tests for phase ordering and skip behavior from persisted `current_phase`.
- [ ] Split the existing workflow into explicit phases: prepare sandbox, write harness, initialize base app, start preview, run CodingAgent, install/build, optional repair, index/review, and complete.
- [ ] After each phase, persist `sandbox_workflow_jobs.current_phase` to the next phase and refresh the lease.
- [ ] Return `{ status: "continue" }` after a phase unless the run reaches `succeeded` or `failed`.

### Task 3: Polling Protection

**Files:**
- Modify: `apps/web/src/lib/workbench.ts`
- Modify: `apps/web/src/components/workbench-client.tsx`
- Test: `apps/web/src/lib/workbench.test.ts`

- [ ] Add tests for a refresh guard that blocks overlapping polling and backs off when the document is hidden.
- [ ] Implement the helper and wire it into `WorkbenchClient`.
- [ ] Keep preview recovery one-shot per preview URL unless manually forced.

### Task 4: Documentation and Verification

**Files:**
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`
- Modify: `CODEX_TASK_RULES.md`

- [ ] Document that `/sandbox/start` no longer runs workflow code in `after()`.
- [ ] Document the internal worker endpoint and phase resume behavior.
- [ ] Run targeted package tests and type checks.
