<!-- docs/stable-clean/templates.md -->

# Stable Clean Templates

本文件提供 `stable` 第二维的最小模板。

用途：

- 给 `entities` 和 `features` 提供最小可复用结构
- 说明模块何时保持简单，何时升级到第二维
- 避免为了形式补空目录

本文件不负责判断是否要引入第二维。

是否需要第二维，先看 [checklist.md](./checklist.md) 与 [architecture.md](./architecture.md)。

## 基本原则

- 先有职责，再建目录
- 目录数量服从职责数量
- 不补空的 `domain / application / infrastructure / ui`
- 第二维只用于 `features` 与 `entities`

## entities 最小模板

适用条件：

- 已有稳定业务对象
- 已有稳定业务规则

最小结构：

```txt
src/entities/<entity>/
  domain/
    <entity>.ts
    <entity>-policy.ts
  index.ts
```

通用样板：

```txt
src/entities/<entity>/
  domain/
    <entity>.ts
    <entity>-policy.ts
  index.ts
```

职责：

- `domain/<entity>.ts`：类型、值对象、核心结构
- `domain/<entity>-policy.ts`：纯业务规则与判定
- `index.ts`：模块公开出口

不放的内容：

- mock 数据
- API client
- storage
- 路由参数读写
- 页面状态

## features 最小模板

适用条件：

- 已有明确 use case、query、command 或 workflow
- 该能力已是稳定业务切片

注意：

- 这是最小全量模板，不是强制目录清单
- 实际落地时，缺哪个职责就建哪个目录
- 只有一个 use case、没有外部技术边界时，不建空的 `infrastructure/`
- 只有 `application` 和 `ui` 时，就只保留这两个目录与 `index.ts`
- 不允许为了形式补空目录

最小结构：

```txt
src/features/<feature>/
  application/
    <use-case>.ts
    ports.ts
  infrastructure/
    <adapter>.ts
  ui/
    <feature-entry>.tsx
  index.ts
```

通用样板：

```txt
src/features/<feature>/
  application/
    <use-case>.ts
    ports.ts
  infrastructure/
    <adapter>.ts
  ui/
    <feature-entry>.tsx
  index.ts
```

职责：

- `application/`：use case、query、command、workflow、port
- `application/` 可以包含 reducer / state machine，但仅限描述 use case、query、command 或 workflow 的流程状态；纯 UI lifecycle reducer 留在 `ui`
- `infrastructure/`：外部技术边界与 adapter
- `ui/`：feature 自己的交互入口与展示适配
- `index.ts`：模块公开出口

不放的内容：

- 其他 feature 的内部实现
- page 级路由装配
- app 壳层逻辑

## 升级顺序

### 1. 先保持简单

若模块还只是页面展示编排、一次性区块或轻交互：

- 留在 `pages`、`widgets` 或 `shared`
- 不引入第二维

### 2. 出现稳定业务对象，再补 entity domain

若模块已经有稳定业务对象和纯业务规则：

- 新建 `entities/<entity>/domain`

### 3. 出现明确 use case，再补 feature application

若模块已经有明确的 query、command、workflow：

- 新建 `features/<feature>/application`
- 将 page 中的业务流程下沉到 feature

### 4. 出现外部技术边界，再补 infrastructure

若模块开始接触：

- API
- storage
- URL search params
- SDK
- mock / real 数据源切换

则在对应 `feature` 下补 `infrastructure/`

### 5. 始终通过公开出口消费

- 跨模块导入走 `index.ts`
- 不扩散深层 import

## 不升级的情况

以下情况保持简单，不进入第二维：

- `pages` 的页面装配
- `widgets` 的跨页面 UI composition
- `shared` 的技术共享
- `app` 的壳层、路由、provider

## 一句话模板法

- 有稳定对象，先补 `entity/domain`
- 有明确用例，补 `feature/application`
- 有外部适配，补 `feature/infrastructure`
- 页面只做装配，模块只通过公开出口消费
