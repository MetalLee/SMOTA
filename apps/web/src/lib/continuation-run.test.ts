import { describe, expect, it } from "vitest";
import { selectContinuationWorkspaceSource } from "./continuation-run";

const baseRun = {
  id: "run-current",
  sandbox_name: "smota-current",
  sandbox_preview_url: "https://current.example.test",
  current_step: "succeeded",
  status: "succeeded",
  sandbox_status: "previewing",
  created_at: "2026-06-28T10:00:00.000Z"
};

describe("continuation workspace source selection", () => {
  it("prefers the current run when it has a reusable sandbox and indexed files", () => {
    const source = selectContinuationWorkspaceSource({
      project: { source_project_id: null },
      currentRunId: "run-current",
      runs: [
        baseRun,
        {
          ...baseRun,
          id: "run-older",
          sandbox_name: "smota-older",
          sandbox_preview_url: "https://older.example.test",
          created_at: "2026-06-27T10:00:00.000Z"
        }
      ],
      files: [{ run_id: "run-current", path: "src/App.tsx" }]
    });

    expect(source).toEqual({
      sourceRunId: "run-current",
      sourceSandboxName: "smota-current",
      sourcePreviewUrl: "https://current.example.test",
      isClonedWorkspace: false,
      workspaceFiles: [{ run_id: "run-current", path: "src/App.tsx" }]
    });
  });

  it("uses a cloned project workspace even when there is no semantic parent run", () => {
    const source = selectContinuationWorkspaceSource({
      project: { source_project_id: "source-project" },
      currentRunId: "run-clone",
      runs: [
        {
          id: "run-clone",
          sandbox_name: "smota-clone",
          sandbox_preview_url: "https://clone.example.test",
          current_step: "cloned_previewing",
          status: "succeeded",
          sandbox_status: "previewing",
          created_at: "2026-06-28T10:00:00.000Z"
        }
      ],
      files: [
        { run_id: "run-clone", path: "package.json" },
        { run_id: "run-clone", path: "src/App.tsx" }
      ]
    });

    expect(source?.sourceRunId).toBe("run-clone");
    expect(source?.sourceSandboxName).toBe("smota-clone");
    expect(source?.isClonedWorkspace).toBe(true);
    expect(source?.workspaceFiles.map((file) => file.path)).toEqual(["package.json", "src/App.tsx"]);
  });

  it("rejects runs without indexed workspace files", () => {
    expect(
      selectContinuationWorkspaceSource({
        project: { source_project_id: null },
        currentRunId: "run-current",
        runs: [baseRun],
        files: []
      })
    ).toBeNull();
  });
});
