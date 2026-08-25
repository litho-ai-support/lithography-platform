# 项目协作规范

## 分支

- 默认分支是 `main`，不设置 `develop`。
- 禁止直接 push 或 force push `main`。
- 每个任务从最新 `main` 创建短期分支。
- 分支格式：`feat/<page-or-scope>`、`fix/<scope>`、`chore/<scope>`。
- 不创建个人长期开发分支。

示例：

```text
feat/customer-repair-create
feat/engineer-repair-detail
feat/ai-fault-diagnosis
fix/repair-status-validation
```

## Pull Request

- 所有改动通过 Pull Request 合并到 `main`。
- PR 创建人不得自行合并，由项目负责人 Review 和 Merge。
- 新提交改变已审核内容后，需要重新 Review。
- CI 未通过、讨论未解决或验收项未完成时不得合并。
- 合并使用 Squash Merge，合并后删除功能分支。

## 页面纵向切片

一个页面任务应在同一个 PR 中包含适用的内容：

- 前端路由、页面、交互和错误状态；
- GraphQL Query/Mutation 和类型契约；
- 后端 Resolver、Usecase、模块服务和查询；
- 角色权限；
- 单元测试或必要的端到端测试；
- 可复现的验收说明。

不能用前端硬编码 Mock 结果代替已经声明完成的后端联调。

## 数据库基线

- 首次数据库基线由项目负责人统一合并。
- Entity、Migration、索引、外键和约束必须保持一致。
- 普通页面 PR 不得擅自修改已确认的数据库基线。
- 发现结构问题时，应建立独立数据库修正 PR。
- 禁止依赖 `DB_SYNCHRONIZE=true` 作为团队建库和交付方式。
- Mock Data 由独立且幂等的 Seed 导入，不混入普通页面代码。

## 禁止提交

- `.env` 和任何真实密钥；
- MySQL 数据目录、数据库 Dump 和真实业务数据；
- 模型权重、训练数据和向量库文件；
- `node_modules`、`dist`、日志和测试报告；
- 个人 IDE、AI 工具缓存和本机配置。

