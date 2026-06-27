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
