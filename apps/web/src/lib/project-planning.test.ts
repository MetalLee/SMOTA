import { describe, expect, it } from "vitest";
import { buildPlaceholderProjectName, shouldAutoStartPlanning, shouldAutoStartSandbox } from "./project-planning";

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
});
