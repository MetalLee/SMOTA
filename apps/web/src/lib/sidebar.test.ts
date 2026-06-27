import { describe, expect, it } from "vitest";
import { getSidebarNavItems, getSidebarRecentProjects, isSidebarNavItemActive } from "./sidebar";

describe("sidebar helpers", () => {
  it("keeps the dashboard navigation focused on the three primary destinations", () => {
    expect(getSidebarNavItems().map((item) => item.label)).toEqual(["首页", "资源", "我的项目"]);
  });

  it("maps primary navigation labels to their top-level routes", () => {
    expect(getSidebarNavItems().map((item) => [item.label, item.href])).toEqual([
      ["首页", "/dashboard"],
      ["资源", "/resource"],
      ["我的项目", "/my-projects"]
    ]);
  });

  it("marks the matching top-level route as active", () => {
    expect(isSidebarNavItemActive("/dashboard", "/dashboard")).toBe(true);
    expect(isSidebarNavItemActive("/dashboard/settings", "/dashboard")).toBe(true);
    expect(isSidebarNavItemActive("/resource", "/dashboard")).toBe(false);
    expect(isSidebarNavItemActive("/resource/templates", "/resource")).toBe(true);
    expect(isSidebarNavItemActive("/my-projects", "/my-projects")).toBe(true);
    expect(isSidebarNavItemActive("/projects/project-1", "/my-projects")).toBe(false);
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
