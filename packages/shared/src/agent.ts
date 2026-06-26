import type { AppMode, AppType, ProjectCreationInput } from "./types";

export function normalizePrompt(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export function parseProjectCreationInput(formData: FormData): ProjectCreationInput {
  const prompt = normalizePrompt(String(formData.get("prompt") ?? ""));
  const mode = String(formData.get("mode") ?? "plan-first") as AppMode;
  const appType = String(formData.get("appType") ?? "Web App") as AppType;

  if (prompt.length < 4) {
    throw new Error("请输入至少 4 个字符的项目需求。");
  }

  return {
    prompt,
    mode: mode === "quick-build" ? "quick-build" : "plan-first",
    appType: ["Web App", "Admin", "Landing Page", "SaaS Demo"].includes(appType)
      ? appType
      : "Web App"
  };
}

export function deriveProjectName(prompt: string): string {
  const cleaned = normalizePrompt(prompt)
    .replace(/[。！？.!?].*$/, "")
    .slice(0, 24);
  return cleaned || "新项目";
}
