# 数据库基线工作区

本目录用于保存已经确认的 Schema、ER 图、字段说明和数据库决策。

## 首次基线流程

1. 确认唯一的业务 Schema。
2. 复用底座已有账户和基础设施表，不建立重复用户表。
3. 为新增业务表同时编写 Entity 和基线 Migration。
4. 在全新空库中仅通过 Migration 重建结构。
5. 比较字段、类型、默认值、索引、外键和约束。
6. 通过独立、幂等的 Seed 导入开发 Mock Data。
7. 基线合并后再开始页面并行开发。

## 全量 Mock Data

全部 14 张表的开发模拟数据通过独立、幂等的后端 Seed 导入，不写入 Migration。执行前需在 Seed 使用的环境文件中配置 `MOCK_SEED_PASSWORD`，该密码供三类 Mock 账号登录；`FIELD_ENCRYPTION_KEY` 和 `FIELD_ENCRYPTION_IV` 也必须与 API 使用的值一致：

```bash
cd backend
npm run seed:mock
```

脚本默认读取 `backend/env/.env.e2e`，其次读取 `backend/env/.env.development`；可通过 `SEED_DOTENV` 指定其他文件。它会检查 Migration 是否已创建全部 14 张表，只更新保留的 Mock 主键/业务键，不清空其他数据，并在同一事务内校验账号密码、角色密文、各表数据量及业务外键链路。除设备型号外，Mock 自增主键保留在 `900000-999999` 区间。数据库名必须包含 `test`、`drill`、`dev` 或 `local`；其他非生产库还需显式设置 `SEED_ALLOW_NON_TEST_DB=true`。

Schema 设计稿是首次基线的审核输入；代码合并后，Entity 表达当前 ORM 映射，Migration 是数据库可执行交付记录。禁止通过个人数据库中的手工改表代替 Migration。
