import { describe, expect, it } from "vitest";
import {
  buildProjectShareUrl,
  getResourceTabs,
  getShareActionItems,
  getShareStatsLabels,
  isProjectShareable,
  normalizeResourceTab
} from "./project-sharing";

describe("project sharing helpers", () => {
  it("only enables sharing for completed previewing runs with a preview URL", () => {
    expect(isProjectShareable({ runStatus: "succeeded", sandboxStatus: "previewing", previewUrl: "https://preview.example.dev" })).toBe(true);
    expect(isProjectShareable({ runStatus: "running", sandboxStatus: "previewing", previewUrl: "https://preview.example.dev" })).toBe(false);
    expect(isProjectShareable({ runStatus: "succeeded", sandboxStatus: "building", previewUrl: "https://preview.example.dev" })).toBe(false);
    expect(isProjectShareable({ runStatus: "succeeded", sandboxStatus: "previewing", previewUrl: "" })).toBe(false);
  });

  it("builds stable in-app share URLs", () => {
    expect(buildProjectShareUrl("https://smota.example.com", "project-1")).toBe("https://smota.example.com/share/project-1");
  });

  it("normalizes resource tabs and exposes discovery before templates", () => {
    expect(normalizeResourceTab("templates")).toBe("templates");
    expect(normalizeResourceTab("unknown")).toBe("discover");
    expect(getResourceTabs().map((tab) => tab.label)).toEqual(["发现", "模板"]);
  });

  it("uses compact share menu actions and enabled discovery toggle by default", () => {
    expect(getShareActionItems()).toEqual([
      { action: "open", label: "在浏览器打开" },
      { action: "copy", label: "复制链接" }
    ]);
  });

  it("formats share detail counters for views and clones", () => {
    expect(getShareStatsLabels({ viewCount: 166, cloneCount: 1 })).toEqual(["浏览人数 166", "克隆次数 1"]);
  });
});
