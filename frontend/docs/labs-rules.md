<!-- docs/labs-rules.md -->

# Labs Rules

本文件是当前 labs 主题的直接规则文档。

## 定位

`labs` 用于可受控进入生产的实验功能：

- 已有明确用途
- 可快速验证真实效果
- 不默认等同于正式功能

环境暴露语义见 [environment-exposure.md](./environment-exposure.md)。
当前默认：`dev / test` 可暴露，`prod` 必须显式配置 access list 后才允许受控暴露。

## 基本要求

- 必须有 `access list`
- 必须有用途说明
- 必须有负责人
- 必须有复查时间
- 必须说明撤回方式
- `reviewAt` 到期后必须复查，并给出“删除 / 延期 / 迁入 stable”之一的结论

## 推荐结构

```txt
src/labs/<lab-name>/
  index.tsx
  access.ts
  meta.ts
  ui/
  lib/
  infrastructure/   # optional
  mock.ts           # optional
```

补充：

- `labs` 不要求完整第二维
- 但 API、storage、URL 参数、SDK、mock 等外部边界，应收束在当前实验模块内
- 简单实验可用 `mock.ts`
- 边界增多时，改为 `infrastructure/`
- 具体收束规则见 [infrastructure-rules.md](./infrastructure-rules.md)

## 借用方向

- `labs` 不建立与 `stable-clean` 对等的 `labs-clean` 体系
- `labs` 不强制补齐 `domain / application / infrastructure / ui`
- 但当实验开始出现稳定外部边界、轻量流程编排或 mock / real 切换时，优先借用 `stable-clean` 的边界收束思路
- 这里的“借用”只表示优先让职责更清晰，不表示必须把实验模块工程化为完整 Clean 分层
- 若实验仍然是轻量验证、一次性观察或短生命周期实现，继续保持简单结构即可
- 若实验后续被确认长期保留，再在迁入 `stable` 时判断是否需要正式进入第二维

## 迁入 Stable

- `labs` 迁入 `stable` 时，默认不是让正式区继续依赖 `labs` 实现
- 更稳的做法是把已验证的能力重新落到 `stable` 内部的拥有者切片中，再由 `pages` 或其他正式模块消费
- `labs` 更像验证场与过渡形态，不作为正式区长期依赖目标
- 若迁入后已形成稳定业务切片，再按 `stable-clean` 判断是否需要第二维

## access.ts

`labs` 若要出现在 `prod`，必须带轻量 access list。

统一结构：

```ts
{
  env: ['dev', 'prod'],
  roles: ['admin'],
  menu: false,
}
```

访问语义：

- 未命中 access list 时，不得暴露入口
- 未命中 access list 时，不得直接访问成功
- access list 不是“只隐藏菜单”，而是实验功能的暴露控制
- 若 `env` 不包含 `prod`，生产环境不得暴露入口，直达路由也必须被 guard 挡住

## meta.ts

最小模板：

```ts
export const demoLabMeta = {
  name: 'demo',
  purpose: '用于验证某个实验功能的真实使用效果',
  owner: 'frontend',
  reviewAt: '2026-04-30',
  rollback: '移除实验路由并隐藏入口',
  exception: ['依赖 @/entities/user 的公开内容'],
} as const;
```

字段说明：

- `name`：实验标识
- `purpose`：实验用途说明
- `owner`：负责人
- `reviewAt`：复查时间，使用 `YYYY-MM-DD`
- `rollback`：撤回方式
- `exception`：可选，记录经过确认的例外依赖或特殊规则

## 当前落地示例

- `/labs/game-2048`
  - 用于受控验证一个本地 2048 交互实验
  - 保持轻量实验形态，不承担正式业务入口职责
  - 当前仅 `dev / test` 暴露，不进入 `prod`

若后续新增 upstream access 相关实验页，只允许演示访问形态、token 生命周期和失败恢复；
不得把具体 upstream 业务接口、接口载荷加解密工具或其他私有流程带入本分支。

## 例外声明位置

- 若 `labs` 需要使用规则之外的例外依赖，必须记录在该实验自己的 `meta.ts` 中
- 不使用文档尾部集中例外列表，也不依赖单独 `README.md` 口头说明
- `exception` 只记录已确认例外，不作为默认字段滥用
