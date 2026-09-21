<!-- docs/testing.md -->

# Testing

- Use Vitest for unit tests close to pure logic.
- Keep route and UI tests focused on the behavior being changed.
- For narrow changes, prefer `npx tsc --noEmit` and `npm run lint`.
- For larger shell or routing changes, add browser-level coverage before production use.

## 账号设置专用真实联调（test:e2e:account-real）

入口：`npm run test:e2e:account-real`（`playwright.account-settings-real.config.ts`）。
该链路会对专用库执行破坏性操作（清空表 → 全量迁移 → Mock Seed），物理清理授权
必须由执行者显式提供，脚本与代码均不设默认值。

前置条件（全部满足才允许运行）：

- 数据库连接五项（`DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASS`/`DB_NAME`）来自进程环境或
  `backend/env/.env.development`（本地文件，不入库），由
  `e2e-real/dedicated-e2e-environment.ts` 一次性解析并校验；
- `DB_NAME` 必须严格等于 `lithography_e2e`（npm script 已注入）；
- 本机 MySQL 中已创建空库 `lithography_e2e`（链路只清空表，不创建库）。

Linux / macOS：

```bash
E2E_ALLOW_PHYSICAL_CLEANUP=1 npm run test:e2e:account-real
```

Windows PowerShell：

```powershell
$env:E2E_ALLOW_PHYSICAL_CLEANUP = "1"
npm run test:e2e:account-real
Remove-Item Env:E2E_ALLOW_PHYSICAL_CLEANUP
```

硬性约束：

- 只能连接专用 `lithography_e2e`，不得连接开发库、验收库或真实数据环境；
  配置模块对外部继承的 `MIGRATION_DRILL_DATABASE`（指向其他库）、
  `MIGRATION_DRILL_CREATE_TEMP_DB=true`、`MIGRATION_DRILL_DOTENV`、`SEED_DOTENV`
  一律失败关闭；
- `E2E_ALLOW_PHYSICAL_CLEANUP` 不写入任何 npm script，必须由执行者在启动前显式设置；
- `--list` 只验证入口跨平台可启动，不代表真实联调通过。
