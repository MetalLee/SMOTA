import { describe, expect, it } from "vitest";
import {
  formatProjectCardDate,
  getMyProjectsGridClass,
  getDeleteConfirmationOverlayClass,
  getPreviewPlaceholderClasses,
  getProjectCardMenuItems,
  getProjectCardMenuClass,
  getProjectCardShellClass,
  getProjectStatusBadgeClass,
  getStableSharedProjectIds,
  toDiscoveryProjectCards,
  groupLatestSandboxRunsByProject,
  shouldCloseProjectMenuOnPointerDown,
  shouldPlaceProjectMenuAbove,
  toProjectCards
} from "./my-projects";

describe("my projects helpers", () => {
  it("formats update dates as YYYY/MM/DD", () => {
    expect(formatProjectCardDate("2026-06-27T08:30:00.000Z")).toBe("2026/06/27");
  });

  it("keeps the newest sandbox run for each project", () => {
    expect(
      groupLatestSandboxRunsByProject([
        {
          project_id: "project-1",
          preview_url: "https://old.example.dev",
          preview_image_url: null,
          updated_at: "2026-06-26T00:00:00.000Z"
        },
        {
          project_id: "project-1",
          preview_url: "https://latest.example.dev",
          preview_image_url: "https://assets.example.dev/latest.png",
          updated_at: "2026-06-27T00:00:00.000Z"
        }
      ])
    ).toEqual([
      {
        project_id: "project-1",
        preview_url: "https://latest.example.dev",
        preview_image_url: "https://assets.example.dev/latest.png",
        updated_at: "2026-06-27T00:00:00.000Z"
      }
    ]);
  });

  it("projects database rows into project cards", () => {
    expect(
      toProjectCards(
        [
          {
            id: "project-1",
            owner_id: "user-1",
            name: "开发蜘蛛纸牌游戏",
            description: "prompt",
            prompt: "prompt",
            app_type: "Web App",
            mode: "plan-first",
            status: "succeeded",
            created_at: "2026-06-20T00:00:00.000Z",
            updated_at: "2026-06-27T00:00:00.000Z"
          }
        ],
        [
          {
            project_id: "project-1",
            preview_url: "https://preview.example.dev",
            preview_image_url: "https://assets.example.dev/preview.png",
            updated_at: "2026-06-27T01:00:00.000Z"
          }
        ]
      )
    ).toEqual([
      {
        id: "project-1",
        name: "开发蜘蛛纸牌游戏",
        href: "/projects/project-1",
        openUrl: "https://preview.example.dev",
        previewImageUrl: "https://assets.example.dev/preview.png",
        updatedDate: "2026/06/27",
        published: true,
        showMenu: true,
        statusBadge: "published"
      }
    ]);
  });

  it("marks owned projects as developing when they have an unfinished run", () => {
    const [card] = toProjectCards(
      [
        {
          id: "project-1",
          owner_id: "user-1",
          name: "像素Roguelike游戏宣发页",
          description: "prompt",
          prompt: "prompt",
          app_type: "Web App",
          mode: "plan-first",
          status: "succeeded",
          created_at: "2026-06-20T00:00:00.000Z",
          updated_at: "2026-06-28T00:00:00.000Z"
        }
      ],
      [
        {
          project_id: "project-1",
          preview_url: "https://preview.example.dev",
          preview_image_url: "https://assets.example.dev/preview.png",
          updated_at: "2026-06-27T01:00:00.000Z"
        }
      ],
      [
        { project_id: "project-1", status: "succeeded", created_at: "2026-06-27T00:00:00.000Z" },
        { project_id: "project-1", status: "running", created_at: "2026-06-28T00:00:00.000Z" }
      ]
    );

    expect(card?.published).toBe(true);
    expect(card?.statusBadge).toBe("developing");
  });

  it("falls back to project workspace when preview is missing", () => {
    const [card] = toProjectCards(
      [
        {
          id: "project-2",
          owner_id: "user-1",
          name: "",
          description: null,
          prompt: "prompt",
          app_type: "Web App",
          mode: "plan-first",
          status: "planning",
          created_at: "2026-06-20T00:00:00.000Z",
          updated_at: "2026-06-21T00:00:00.000Z"
        }
      ],
      []
    );

    expect(card?.name).toBe("未命名项目");
    expect(card?.href).toBe("/projects/project-2");
    expect(card?.openUrl).toBe("/projects/project-2");
    expect(card?.previewImageUrl).toBeNull();
    expect(card?.published).toBe(false);
    expect(card?.showMenu).toBe(true);
    expect(card?.statusBadge).toBeNull();
  });

  it("projects shared discovery rows into card links without owner-only controls", () => {
    const [card] = toDiscoveryProjectCards(
      [
        {
          id: "project-3",
          owner_id: "user-2",
          name: "销售页",
          description: "prompt",
          prompt: "prompt",
          app_type: "Landing Page",
          mode: "plan-first",
          status: "succeeded",
          is_shared_to_discovery: true,
          shared_at: "2026-06-27T00:00:00.000Z",
          source_project_id: null,
          created_at: "2026-06-20T00:00:00.000Z",
          updated_at: "2026-06-27T00:00:00.000Z"
        }
      ],
      [
        {
          project_id: "project-3",
          preview_url: "https://preview.example.dev",
          preview_image_url: null,
          updated_at: "2026-06-27T01:00:00.000Z"
        }
      ],
      [
        {
          projectId: "project-3",
          creatorName: "Cauã Martins Ribeiro",
          creatorAvatarUrl: "https://assets.example.dev/avatar.png",
          viewCount: 270
        }
      ]
    );

    expect(card).toMatchObject({
      href: "/share/project-3",
      openUrl: "https://preview.example.dev",
      published: true,
      showMenu: false,
      statusBadge: null,
      creatorName: "Cauã Martins Ribeiro",
      creatorAvatarUrl: "https://assets.example.dev/avatar.png",
      viewCount: 270
    });
  });

  it("hides shared projects while their latest run is not terminal", () => {
    expect(
      getStableSharedProjectIds([
        { project_id: "project-1", status: "succeeded", created_at: "2026-06-27T00:00:00.000Z" },
        { project_id: "project-2", status: "succeeded", created_at: "2026-06-27T00:00:00.000Z" },
        { project_id: "project-2", status: "running", created_at: "2026-06-28T00:00:00.000Z" },
        { project_id: "project-3", status: "failed", created_at: "2026-06-28T00:00:00.000Z" }
      ])
    ).toEqual(new Set(["project-1", "project-3"]));
  });

  it("keeps project card actions limited to browser, copy, and delete", () => {
    expect(getProjectCardMenuItems().map((item) => item.label)).toEqual(["在浏览器打开", "复制链接", "删除"]);
  });

  it("uses a fixed-width card grid so each row can fit more stable cards", () => {
    expect(getMyProjectsGridClass()).toContain("grid-cols-[repeat(auto-fill,360px)]");
  });

  it("uses distinct status badge styles for published and developing projects", () => {
    const publishedBadgeClass = getProjectStatusBadgeClass("published");
    const developingBadgeClass = getProjectStatusBadgeClass("developing");

    expect(publishedBadgeClass).toContain("bg-primary");
    expect(developingBadgeClass).toContain("bg-amber");
    expect(developingBadgeClass).not.toBe(publishedBadgeClass);
  });

  it("uses line-based preview placeholder classes instead of block or circle skeletons", () => {
    const classes = getPreviewPlaceholderClasses();

    expect(classes.surface).toContain("bg-slate-100");
    expect(classes.surface).toContain("aspect-video");
    expect(`${classes.surface} ${classes.artwork}`).not.toContain("rounded-full");
    expect(`${classes.surface} ${classes.artwork}`).not.toContain("grid");
    expect(classes.artwork).toContain("repeating-linear-gradient");
  });

  it("keeps project cards at a fixed 360px width and raises open menus above sibling cards", () => {
    expect(getProjectCardShellClass(false)).toContain("w-[360px]");
    expect(getProjectCardShellClass(false)).not.toContain("z-30");
    expect(getProjectCardShellClass(true)).toContain("z-30");
  });

  it("closes the project menu when clicking outside its trigger and panel", () => {
    expect(
      shouldCloseProjectMenuOnPointerDown({
        menuOpen: true,
        clickInsideMenu: false,
        clickInsideTrigger: false
      })
    ).toBe(true);
    expect(
      shouldCloseProjectMenuOnPointerDown({
        menuOpen: true,
        clickInsideMenu: true,
        clickInsideTrigger: false
      })
    ).toBe(false);
    expect(
      shouldCloseProjectMenuOnPointerDown({
        menuOpen: false,
        clickInsideMenu: false,
        clickInsideTrigger: false
      })
    ).toBe(false);
  });

  it("uses a full-screen fixed overlay for delete confirmation", () => {
    const overlayClass = getDeleteConfirmationOverlayClass();

    expect(overlayClass).toContain("fixed");
    expect(overlayClass).toContain("inset-0");
    expect(overlayClass).toContain("z-50");
    expect(overlayClass).not.toContain("absolute");
  });

  it("places the project menu above the trigger when viewport bottom space is tight", () => {
    expect(
      shouldPlaceProjectMenuAbove({
        triggerTop: 720,
        triggerBottom: 760,
        viewportHeight: 800,
        menuHeight: 220,
        margin: 16
      })
    ).toBe(true);
    expect(
      shouldPlaceProjectMenuAbove({
        triggerTop: 280,
        triggerBottom: 320,
        viewportHeight: 800,
        menuHeight: 220,
        margin: 16
      })
    ).toBe(false);
  });

  it("uses opposite vertical menu anchors for above and below placement", () => {
    expect(getProjectCardMenuClass("below")).toContain("top-16");
    expect(getProjectCardMenuClass("below")).not.toContain("bottom-16");
    expect(getProjectCardMenuClass("above")).toContain("bottom-16");
    expect(getProjectCardMenuClass("above")).not.toContain("top-16");
  });
});
