import { describe, expect, it } from "vitest";
import { getSidebarNavItems, getSidebarRecentProjects } from "./sidebar";

describe("sidebar helpers", () => {
  it("keeps the dashboard navigation focused on the three primary destinations", () => {
    expect(getSidebarNavItems().map((item) => item.label)).toEqual(["首页", "资源", "我的项目"]);
  });

  it("projects recent project data for compact sidebar rendering", () => {
    const projects = [
      { id: "project-1", name: "开发蜘蛛纸牌游戏", description: "Create a card game" },
      { id: "project-2", name: "", description: null }
    ];

    expect(getSidebarRecentProjects(projects)).toEqual([
      { id: "project-1", name: "开发蜘蛛纸牌游戏", href: "/projects/project-1" },
      { id: "project-2", name: "未命名项目", href: "/projects/project-2" }
    ]);
  });
});
