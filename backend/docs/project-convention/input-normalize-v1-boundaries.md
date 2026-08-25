<!-- docs/project-convention/input-normalize-v1-boundaries.md -->

Purpose: Define function-level guardrails and boundaries for input normalize v1 primitives.
Read when: You are implementing, reviewing, or refactoring normalizeRequiredText and related normalize helpers.
Do not read when: Your task does not change input normalization function boundaries.
Source of truth: This file defines input normalize boundaries; code examples elsewhere must not override it.

# input normalize v1：函数职责与边界建议

- 整个 input normalize 是一次通用输入收敛尝试，不是强制一次性替换；接入后要配套测试
- 在迁移阶段，normalize 是语义防线，DTO 层不是唯一规则强制入口
- 迁移期间可以按入口逐步接入：未接入入口保持既有行为，已接入入口通过 normalize 获得稳定输入契约

## 1. `normalizeRequiredText(input: unknown)`

### 建议职责

- 对 `required text` 做 `trim` 与非空校验。
- 产出稳定 `string`。
- 失败时抛通用 `DomainError`。

### 禁止做的事

- 禁止吞掉非法输入并返回兜底文本。
- 禁止顺手做业务字段映射。
- 禁止拼接业务错误文案模板。

## 2. `normalizeOptionalText(input: unknown, policy: EmptyPolicy)`

### 建议职责

- 对 `optional text` 做 `trim` 收敛。
- 空白值按策略处理（`to_undefined` / `to_null` / `reject` / `keep_empty_string`）。
- 保持返回类型可预测。

### 禁止做的事

- 禁止隐式选择空白策略。
- 禁止把 `null`、`undefined`、空白字符串混为同一语义。
- 禁止推断“这个字段应该必填”。

## 3. `normalizeTextList(input: unknown, policy: ListPolicy)`

### 建议职责

- 校验是否为字符串列表。
- 对每项执行 `trim` 与空白过滤。
- 空输入是否允许，不由函数名暗示，统一由 `ListPolicy` 决定。
- 按策略处理空列表（`keep` / `to_undefined` / `to_null` / `reject`）。
- 可选执行去重并保持顺序。
- 固定支持策略字段：`filter_empty`、`reject_invalid_item`、`dedupe`、`empty_result`。

### 禁止做的事

- 禁止忽略非法元素类型。
- 禁止在该层做分页、排序业务决策。
- 禁止自动补默认列表项。

## 4. `normalizeEnumValue<T>(input: unknown, allowed: readonly T[])`

### 建议职责

- 校验输入是否属于允许集合。
- 可选支持大小写收敛后匹配。
- 输出稳定枚举值。

### 禁止做的事

- 禁止猜测近似值并强行放行。
- 禁止混入权限与角色规则。

## 5. `normalizeLimit(input: unknown, range: { min: number; max: number; fallback: number })`

### 建议职责

- 把分页类数字收敛到稳定范围。
- 明确 `fallback / min / max` 策略。
- 保证返回整数且可预测。

### 禁止做的事

- 禁止读取数据库或配置中心决定边界。
- 禁止把调用方未声明的限制硬编码到多个 usecase。

## 6. Usecase 侧错误处理约束

### 建议职责

- Normalize 层统一抛通用 `DomainError`。
- Usecase 层默认透传通用 `error_code`。
- 若为了兼容既有外部契约或场景语义，Usecase 层允许显式映射为场景错误码。

### 禁止做的事

- 禁止在 adapter/service 散落错误映射逻辑。
- 禁止隐式吞并或模糊化错误语义。
- 禁止在 adapter 层做业务错误编排。

## 7. 整个模块统一边界

### 这个模块应该做的

- 输入值收敛前所需的局部类型识别。
- 输入值收敛。
- 边界校验。
- 稳定输出契约。

### 这个模块不应该做的

- 不做 I/O。
- 不读配置。
- 不依赖框架。
- 不碰数据库。
- 不做 DTO 组装。
- 不做业务流程编排。
- 不做跨 domain 协调。

## 8. 附录：`parseInputValue(input: unknown)`（局部辅助）

### 建议职责

- 接收外部未知输入。
- 识别基础类型（`string`、`number`、`boolean`、`null`、`undefined`、`array`）。
- 产出中性结构，不绑定业务语义。
- 仅作为局部辅助函数，不作为全局总入口。

### 禁止做的事

- 禁止推断业务语义。
- 禁止补业务默认值。
- 禁止读取配置或上下文状态。
- 禁止执行 I/O。
- 禁止演变为混合解析、语义判定、错误编排的万能函数。
- 禁止暴露为公共主入口 API。

## 9. 一句总原则

- `normalize` 只负责“收敛成什么”，`usecase` 只负责“业务上怎么用”。
- `parse` 仅在局部辅助场景下负责“先识别输入是什么”。

## 10. 附录：文件归属建议

- `core/common/input-normalize/*`：primitive normalize。
- `usecases/<scene>/*.input.normalize.ts`：场景专用输入语义组合。
- 单个 usecase 独占规则：可先保留在 usecase 内部。
- 2 个以上 usecase 共享：抽到同目录 `*.input.normalize.ts`。
- 跨场景复用稳定后：再提升到 `core/common`。

## 11. 附录：历史兼容场景例外

- 若某场景已有稳定对外行为，迁移时应优先保持行为兼容。
- 可将原先位于 Adapter 的场景语义迁入该场景本地 normalize，而非直接提升到通用层。
- 例如 registration 场景可保留历史昵称/邮箱行为，但不应直接并入 `core/common`。
