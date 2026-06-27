# 项目简介

## 项目名称

SMOTA

## 产品定位

面向开发者的 Atoms-like AI app builder。

SMOTA 是一个多智能体协作的 AI 驱动开发平台。开发者可以用一句话描述想要构建的应用，平台生成计划并等待用户批准，然后在受控的 Vercel Sandbox 中自动创建、编码、构建、预览和复盘一个可运行的 Web 应用。

## 核心用户

- 独立开发者
- 小型软件团队
- AI Agent 工程师
- 想用一句话快速构建 Web 应用的开发者

## 核心场景

- 一句话生成应用。
- 多 Agent 协作生成 Harness 文档。
- 用户批准计划后再开始编码。
- 在 Vercel Sandbox 中自动编码、构建和预览。
- 构建失败后自动修复一次。

## MVP 范围

- Supabase Auth 登录认证。
- Supabase Postgres 持久化。
- Supabase RLS 数据隔离。
- Atoms 风格首页。
- 项目工作台。
- 左侧 Agent Panel。
- 右侧 Preview / Editor / Plan / Terminal / Files 工作区。
- Vercel Sandbox Runner。
- 生成项目内 Harness 文件：
  - `PROJECT_BRIEF.md`
  - `ARCHITECTURE.md`
  - `ROADMAP.md`
  - `CODEX_TASK_RULES.md`
  - `AGENTS.md`
- 在 Sandbox 内生成 Vite React 应用。
- 在 Sandbox 内执行 OpenCode CLI。
- 在 Sandbox 内执行 install/build。
- 构建失败时自动修复一次。
- 通过 Preview iframe 展示 Sandbox 暴露的 dev server。

## MVP 不做

- Local Runner。
- GitHub OAuth。
- App World。
- Remix。
- 计费。
- 多人协作。
- 组织空间。
- 自建云端 Sandbox。
- 发布生成应用到生产环境。
- 复杂拖拽编辑器。

