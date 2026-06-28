export function buildPlaceholderProjectName(prompt: string): string {
  const trimmed = prompt.trim();
  const base = trimmed ? Array.from(trimmed).slice(0, 10).join("") : "未命名项目";
  return `${base}...`;
}

export function shouldAutoStartPlanning(runStatus: string, currentStep: string | null): boolean {
  return runStatus === "planning" && currentStep === "planning_queued";
}

export function shouldAutoStartSandbox(runStatus: string, currentStep: string | null): boolean {
  return runStatus === "approved" && currentStep === "approved_waiting_for_sandbox";
}

export function canStartContinuationRun(runStatus: string): boolean {
  return runStatus === "succeeded" || runStatus === "failed";
}

export function canRevisePendingPlan(runStatus: string, currentStep: string | null): boolean {
  return runStatus === "pending_approval" && currentStep === "plan_ready";
}

export function shouldDisablePlanApproval(revisionPrompt: string, revisionSubmitting = false, approvalSubmitting = false): boolean {
  return revisionSubmitting || approvalSubmitting || revisionPrompt.trim().length > 0;
}
