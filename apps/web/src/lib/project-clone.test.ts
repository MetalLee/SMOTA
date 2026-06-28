import { describe, expect, it } from "vitest";
import {
  buildCloneCommandFailureMessage,
  buildCloneProjectName,
  buildCloneStepFailureMessage,
  buildCloneWorkspaceArchiveCommand,
  buildExtractCloneWorkspaceArchiveCommand,
  buildClonedArtifactRows,
  getCloneWorkspaceBootstrapCwd,
  formatCloneWorkflowError,
  getCloneStartState,
  getCloneSourceSandboxCandidates,
  shouldAutoStartClone
} from "./project-clone";

describe("project clone helpers", () => {
  it("uses a trimmed custom clone name and falls back to source name", () => {
    expect(buildCloneProjectName("源项目", "  新项目名称  ")).toBe("新项目名称");
    expect(buildCloneProjectName("源项目", "   ")).toBe("源项目（克隆）");
    expect(buildCloneProjectName("", "")).toBe("未命名项目（克隆）");
  });

  it("archives and extracts the real workspace without generated dependency folders", () => {
    const archiveCommand = buildCloneWorkspaceArchiveCommand("/tmp/clone.tgz");
    const extractCommand = buildExtractCloneWorkspaceArchiveCommand("/tmp/clone.tgz");

    expect(archiveCommand).toContain("tar -czf");
    expect(archiveCommand).toContain("--exclude='./node_modules'");
    expect(archiveCommand).toContain("--exclude='./dist'");
    expect(archiveCommand).toContain("--exclude='./.git'");
    expect(archiveCommand).toContain("-C /workspace .");
    expect(extractCommand).toContain("tar -xzf");
    expect(extractCommand).toContain("-C /workspace");
  });

  it("starts clone workspace bootstrap commands outside /workspace", () => {
    expect(getCloneWorkspaceBootstrapCwd()).toBe("/");
  });

  it("copies the latest source artifacts into the cloned run", () => {
    expect(
      buildClonedArtifactRows(
        [
          { type: "harness", title: "旧简报", path: "PROJECT_BRIEF.md", content: "old", created_at: "2026-06-27T00:00:00.000Z" },
          { type: "harness", title: "新简报", path: "PROJECT_BRIEF.md", content: "new", created_at: "2026-06-28T00:00:00.000Z" },
          { type: "harness", title: "架构", path: "ARCHITECTURE.md", content: "arch", created_at: "2026-06-27T00:00:01.000Z" }
        ],
        { ownerId: "owner-new", projectId: "project-new", runId: "run-new" }
      )
    ).toEqual([
      {
        owner_id: "owner-new",
        project_id: "project-new",
        run_id: "run-new",
        type: "harness",
        title: "架构",
        path: "ARCHITECTURE.md",
        content: "arch"
      },
      {
        owner_id: "owner-new",
        project_id: "project-new",
        run_id: "run-new",
        type: "harness",
        title: "新简报",
        path: "PROJECT_BRIEF.md",
        content: "new"
      }
    ]);
  });

  it("auto-starts clone workflow only for queued clone runs", () => {
    expect(shouldAutoStartClone("running", "clone_queued")).toBe(true);
    expect(shouldAutoStartClone("planning", "clone_queued")).toBe(false);
    expect(shouldAutoStartClone("running", "creating_clone_sandbox")).toBe(false);
  });

  it("classifies duplicate clone starts as already running", () => {
    expect(getCloneStartState("running", "clone_queued")).toBe("claimable");
    expect(getCloneStartState("running", "creating_clone_sandbox")).toBe("already_running");
    expect(getCloneStartState("running", "start_clone_preview")).toBe("already_running");
    expect(getCloneStartState("succeeded", "succeeded")).toBe("finished");
    expect(getCloneStartState("failed", "clone_failed")).toBe("finished");
    expect(getCloneStartState("planning", "planning_queued")).toBe("invalid");
  });

  it("merges source sandbox candidates from runs and sandbox snapshots", () => {
    expect(
      getCloneSourceSandboxCandidates(
        [
          { sandbox_name: " stale ", created_at: "2026-06-28T00:00:03.000Z" },
          { sandbox_name: "source-a", created_at: "2026-06-28T00:00:02.000Z" },
          { sandbox_name: "", created_at: "2026-06-28T00:00:01.000Z" }
        ],
        [
          { sandbox_name: "source-a", updated_at: "2026-06-28T00:00:04.000Z" },
          { sandbox_name: "source-b", updated_at: "2026-06-28T00:00:01.000Z" }
        ]
      )
    ).toEqual(["source-a", "stale", "source-b"]);
  });

  it("keeps useful Vercel Sandbox error details in clone failures", () => {
    const error = Object.assign(new Error("Status code 400 is not ok"), {
      status: 400,
      body: { error: "Bad Request", message: "Sandbox quota exceeded" }
    });

    const message = formatCloneWorkflowError(error, "Clone failed.");

    expect(message).toContain("Status code 400 is not ok");
    expect(message).toContain("status=400");
    expect(message).toContain("Sandbox quota exceeded");
  });

  it("adds command output to clone command failure messages", () => {
    expect(buildCloneCommandFailureMessage("Preview failed.", "stderr line\nstdout line")).toContain("stderr line");
    expect(buildCloneCommandFailureMessage("Preview failed.", "")).toBe("Preview failed.");
  });

  it("prefixes SDK clone failures with the active workflow step", () => {
    expect(buildCloneStepFailureMessage("Create sandbox failed.", new Error("Status code 400 is not ok"))).toBe(
      "Create sandbox failed.\nStatus code 400 is not ok"
    );
  });
});
