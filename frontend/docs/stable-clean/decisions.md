<!-- docs/stable-clean/decisions.md -->

# Stable Clean Decisions

本文件记录当前仓库中，与 `stable` 第二维治理相关的具体判定先例。

## 目标

- 沉淀真实边界案例
- 避免同类问题反复重判
- 让后续的人和 AI 可以直接参考仓库内既有结论

## 记录边界

- 禁止 AI 自行新增或虚构决策条目
- 本文件只记录人类开发者确认，或经过人工核实的真实重构结果
- 若当前问题尚未经过人工确认，不得以“先例”形式写入本文件

## 当前状态

## 001: Upstream Access 保留访问形态，不保留具体业务接口

### 场景

- 本分支从更大的项目中抽出，只需要保留 upstream 访问边界。
- 来源项目中存在多个具体 upstream 业务接口、业务目录访问示例和接口载荷加解密能力。
- 这些具体接口和加解密工具不属于本分支的通用前端基线。

### 判定

- `upstream access` 作为稳定访问能力进入 `entities/upstream-access`。
- 只保留前端持有 access token、按当前账号绑定存储、登录/刷新由外部 port 注入、滚动 token 持久化和失败恢复这类访问形态。
- 不保留任何具体 upstream 业务 query/mutation、接口载荷加解密能力或具体业务目录接口。

### 依据

- access token 生命周期与本地持有规则是稳定业务对象能力，适合放入 `entities`。
- 具体 upstream 业务接口应由未来拥有者 feature 或 lab 自己承接，不能下沉成通用 entity 默认能力。
- 接口载荷加解密属于具体协议/业务适配，不是这个极小分支的通用基线。

### 后续动作

- 未来新增 upstream 功能时，优先复用 `entities/upstream-access` 的 port 和 token 生命周期。
- 若需要调用具体 upstream 业务接口，应放在拥有它的 `feature/infrastructure` 或对应 `labs/<name>/api.ts` 内。
- 不得把具体接口再次回填到 `entities/upstream-access`。
