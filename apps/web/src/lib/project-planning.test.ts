import { describe, expect, it } from "vitest";
import {
  buildPlaceholderProjectName,
  canRevisePendingPlan,
  canStartContinuationRun,
  shouldAutoStartPlanning,
  shouldAutoStartSandbox,
  shouldDisablePlanApproval
} from "./project-planning";

describe("project planning helpers", () => {
  it("uses the first ten prompt characters plus ellipsis as the placeholder project name", () => {
    expect(buildPlaceholderProjectName("为宠物诊所创建预约管理后台")).toBe("为宠物诊所创建预约管...");
    expect(buildPlaceholderProjectName("CRM")).toBe("CRM...");
    expect(buildPlaceholderProjectName("   ")).toBe("未命名项目...");
  });

  it("auto-starts planning only for queued planning runs", () => {
    expect(shouldAutoStartPlanning("planning", "planning_queued")).toBe(true);
    expect(shouldAutoStartPlanning("planning", "planning_running")).toBe(false);
    expect(shouldAutoStartPlanning("pending_approval", "plan_ready")).toBe(false);
  });

  it("auto-starts Sandbox only immediately after plan approval", () => {
    expect(shouldAutoStartSandbox("approved", "approved_waiting_for_sandbox")).toBe(true);
    expect(shouldAutoStartSandbox("approved", "creating_sandbox")).toBe(false);
    expect(shouldAutoStartSandbox("failed_retryable", "approved_waiting_for_sandbox")).toBe(false);
    expect(shouldAutoStartSandbox("running", "creating_sandbox")).toBe(false);
  });

  it("allows continuation prompts only after terminal run states", () => {
    expect(canStartContinuationRun("succeeded")).toBe(true);
    expect(canStartContinuationRun("failed")).toBe(true);
    expect(canStartContinuationRun("planning")).toBe(false);
    expect(canStartContinuationRun("pending_approval")).toBe(false);
    expect(canStartContinuationRun("running")).toBe(false);
  });

  it("allows pending plans to be revised before approval", () => {
    expect(canRevisePendingPlan("pending_approval", "plan_ready")).toBe(true);
    expect(canRevisePendingPlan("planning", "planning_running")).toBe(false);
    expect(canRevisePendingPlan("approved", "approved_waiting_for_sandbox")).toBe(false);
  });

  it("disables plan approval while a revision prompt is being edited or submitted", () => {
    expect(shouldDisablePlanApproval("")).toBe(false);
    expect(shouldDisablePlanApproval("   ")).toBe(false);
    expect(shouldDisablePlanApproval("请改成深色模式")).toBe(true);
    expect(shouldDisablePlanApproval("", true)).toBe(true);
  });
});
