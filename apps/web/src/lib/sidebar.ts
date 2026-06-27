import { Box, Home, Layers, type LucideIcon } from "lucide-react";

export interface SidebarNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface SidebarRecentProjectInput {
  id: string;
  name: string | null;
}

export interface SidebarRecentProject {
  id: string;
  name: string;
  href: string;
}

export function getSidebarNavItems(): SidebarNavItem[] {
  return [
    { label: "首页", href: "/dashboard", icon: Home },
    { label: "资源", href: "/resource", icon: Box },
    { label: "我的项目", href: "/my-projects", icon: Layers }
  ];
}

export function isSidebarNavItemActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function getSidebarRecentProjects(projects: SidebarRecentProjectInput[]): SidebarRecentProject[] {
  return projects.map((project) => ({
    id: project.id,
    name: project.name?.trim() || "未命名项目",
    href: `/projects/${project.id}`
  }));
}
