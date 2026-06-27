import { describe, expect, it } from "vitest";
import { getEditorLanguage, getFileContentErrorLabel, getRunControls, getWorkbenchLayoutClasses } from "./workbench";

describe("workbench helpers", () => {
  it("maps run status to the available primary action", () => {
    expect(getRunControls("draft", null).primaryAction).toBe("approve");
    expect(getRunControls("pending_approval", null).primaryAction).toBe("approve");
    expect(getRunControls("approved", "ready").primaryAction).toBe("start");
    expect(getRunControls("running", "building").primaryAction).toBe("stop");
    expect(getRunControls("succeeded", "previewing").primaryAction).toBe("complete");
    expect(getRunControls("failed", "failed").primaryAction).toBe("error");
  });

  it("normalizes file-content API failures into MVP editor messages", () => {
    expect(getFileContentErrorLabel({ code: "sandbox_not_ready" })).toBe("Sandbox not ready");
    expect(getFileContentErrorLabel({ code: "sandbox_stopped" })).toBe("Sandbox stopped");
    expect(getFileContentErrorLabel({ code: "file_too_large" })).toBe("File too large");
    expect(getFileContentErrorLabel({ code: "binary_file" })).toBe("Binary file is not supported");
    expect(getFileContentErrorLabel({ code: "invalid_file_path" })).toBe("Invalid file path");
    expect(getFileContentErrorLabel({ error: "anything else" })).toBe("Sandbox not ready");
  });

  it("selects a readable Monaco language from the file path", () => {
    expect(getEditorLanguage("src/App.tsx")).toBe("typescript");
    expect(getEditorLanguage("src/index.css")).toBe("css");
    expect(getEditorLanguage("package.json")).toBe("json");
    expect(getEditorLanguage("README.md")).toBe("markdown");
    expect(getEditorLanguage("scripts/build.sh")).toBe("shell");
    expect(getEditorLanguage("unknown.env")).toBe("plaintext");
  });

  it("keeps project detail sidebar and workspace scrolling independent", () => {
    const classes = getWorkbenchLayoutClasses();

    expect(classes.root).toContain("h-screen");
    expect(classes.root).toContain("overflow-hidden");
    expect(classes.sidebar).toContain("h-screen");
    expect(classes.sidebar).toContain("overflow-y-auto");
    expect(classes.main).toContain("h-screen");
    expect(classes.content).toContain("overflow-y-auto");
  });
});
