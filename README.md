# 光刻机智能运维平台

本仓库是光刻机智能运维网页端项目的 Monorepo，同时维护前端、后端和部署配置。

## 目录

```text
.
├── backend/             NestJS + GraphQL + TypeORM 后端
├── frontend/            React + Vite + Apollo 前端
├── docs/
│   ├── database/        Schema、Entity、Migration 决策
│   └── upstream/        两个底座的来源和版本
└── .github/             CI、PR 模板和仓库协作规则
```

## 当前状态

- 已导入前端和后端底座。
- 项目 Schema、业务 Entity、业务 Migration 和开发 Seed 尚待确认与实现。
- 在数据库基线合并前，不开始并行页面开发。

## 本地安装

统一使用 Node.js 22.19.0 或兼容版本。

```bash
npm run install:all
```

分别启动前后端：

```bash
npm run dev:backend
npm run dev:frontend
```

后端启动前仍需根据 `backend/env/.env.example` 配置本地环境。数据库自动初始化命令将在 Schema、Entity 和 Migration 定稿后补充。

## 协作方式

- 不使用 `develop` 分支。
- 新功能从最新 `main` 创建短期功能分支。
- 新人只能推送功能分支，并以 `main` 为目标创建 Pull Request。
- 禁止直接推送和 force push `main`。
- 所有 PR 由项目负责人 Review 和 Merge。
- 一个页面作为一个前后端纵向切片，在同一个 PR 中完成并跑通。

详细规则见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 上游底座

本项目基于两个外部底座开始开发。来源、导入 commit 和许可状态记录在 [docs/upstream/README.md](./docs/upstream/README.md)。
