<!-- docs/project-convention/e2e-test-groups.md -->

# E2E 测试分组与使用说明

## 分组区别

| 分组 | 目标 | 包含范围 | 依赖检查 |
| --- | --- | --- | --- |
| core | 主业务链路回归 | app、auth、register、roles、identity、pagination 等 | mysql |
| worker | 队列与异步处理回归 | `test/08-qm-worker/*` | mysql + redis + bullmq |
| smoke | 第三方联调冒烟 | `test/99-third-party-live-smoke/*` | mysql + redis + bullmq + external（AI 相关仅在开关开启时检查） |

## 常用命令

- 跑 core 分组：`npm run test:e2e:core`
- 跑 worker 分组：`npm run test:e2e:worker`
- 跑 smoke 分组：`npm run test:e2e:smoke`
- 跑常规全量（不含 smoke）：`npm run test:e2e:all`

## 单文件运行

- 跑单文件（默认 core）：`npm run test:e2e:file -- test/01-auth/auth-identity.e2e-spec.ts`
- 跑 worker 单文件：`npm run test:e2e:file -- worker test/08-qm-worker/email-queue-consume.e2e-spec.ts`
- 跑 AI workflow worker 单文件：`npm run test:e2e:file -- worker test/08-qm-worker/ai-workflow-generic-handler.e2e-spec.ts`
- 跑 smoke 单文件：`npm run test:e2e:file -- smoke test/99-third-party-live-smoke/email-delivery-real.e2e-spec.ts`
- 跑 AI 真实链路 E2E：`RUN_REAL_AI_E2E=true AI_PROVIDER_MODE=remote NODE_ENV=e2e node ./test/run-e2e-group.js smoke test/99-third-party-live-smoke/ai-qwen-generate-real.e2e-spec.ts`
- watch 单文件：`npm run test:e2e:watch -- test/01-auth/auth-identity.e2e-spec.ts`
- debug 单文件：`npm run test:e2e:debug -- test/01-auth/auth-identity.e2e-spec.ts`
- `test:e2e:file`、`test:e2e:watch`、`test:e2e:debug` 都要求且只接受 1 个 `*.e2e-spec.ts` 参数。
- 单文件参数使用仓库相对路径或绝对路径，不再自动补 `test/` 前缀。
- `file` 模式与其他 E2E 一样，会在执行前做 MySQL 清理；执行结束后不会再次做 MySQL 清理。

## 选择规则（优先级）

- 优先级顺序：
  - 分组：命令行分组参数 > `E2E_GROUP` > 默认 `core`
  - 用例：命令行 `*.e2e-spec.ts` 参数 > `E2E_SPECS` > 当前分组清单
  - 依赖：命令行 `--needs=...` > `E2E_NEEDS` > 当前分组默认 needs
- 未传任何参数时，按 `core` 分组清单执行。
- `E2E_NEEDS` 未显式设置时，会按当前分组自动推导。

## smoke external 规则

- `external` 检查在 smoke 分组开启，但会按当前执行用例做子能力校验。
- 仅执行 AI / email smoke 用例时，不强制要求微信环境变量。
- 执行 weapp smoke 用例时，强制要求 `WECHAT_APP_ID` 与 `WECHAT_APP_SECRET`。
- 邮件真实发送用例不强制要求 `E2E_EMAIL_TO`，未配置时由用例内默认值兜底。
- AI 相关 env 仅在 `RUN_REAL_AI_E2E=true` 或 `RUN_REAL_AI_AUTH_FAIL_E2E=true` 时强制校验。
- AI workflow 基线 E2E 属于 `worker` 分组，不依赖真实第三方 provider；下游项目若新增 workflow 真实
  provider smoke，建议放入 `smoke` 分组，并通过显式 env 开关启用。
- 真实 provider smoke 如果需要打印控制台摘要，只能包含 jobId / workflowId、traceId、provider、model、
  脱敏错误摘要等排障字段；不得打印 API key、请求头、base URL、原始 provider request body、
  input payload、output payload 或 prompt。

## 维护入口

- 分组清单与选择逻辑：`test/jest-e2e.js`
- 逐文件执行器：`test/run-e2e-group.js`
- 分组脚本入口：`package.json` 的 `test:e2e:*` 脚本
- 基础设施检查：`test/global-setup-e2e.ts`

## 日常建议

- 日常开发优先使用 `test:e2e:file` 定位问题，再使用 `test:e2e:core` 做回归。
- `smoke` 仅在需要验证外部系统可用性时执行，不纳入常规回归。
- 新增 E2E 用例时，先判断属于 `core`、`worker` 还是 `smoke`，再加入对应分组清单。
