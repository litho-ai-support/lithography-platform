<!-- docs/stable-clean/architecture.md -->

# Stable Clean Architecture

本文件定义 `stable` 区内部在何时、以何种方式引入 Clean Architecture / Hexagonal Architecture。

它不是 `FSD` 的替代，而是 `stable` 区内部的第二维职责分层规则。

## 目标

本项目采用二维治理：

- 第一维：`stable / labs / sandbox` 与 `app / pages / widgets / features / entities / shared`
- 第二维：仅在 `stable` 内部，对高复杂度业务切片引入 `domain / application / infrastructure / ui`

本文件只回答一个问题：

- 当某段代码已经确定属于 `stable` 时，它在切片内部是否需要按 Clean 分层

本文件不回答：

- 代码应该先进入 `stable`、`labs` 还是 `sandbox`
- 代码应该先落在 `pages`、`features`、`entities` 还是 `shared`

这些问题仍由 [../layer-model.md](../layer-model.md) 与 [../ai-workflow.md](../ai-workflow.md) 处理。

## 方法说明

- 先用 [checklist.md](./checklist.md) 做第一次判断
- 真实边界案例再写入 [decisions.md](./decisions.md)
- 决策记录可以反向修订清单

## 核心原则

### 1. Clean 只作用于 `stable`

- `labs` 与 `sandbox` 默认不做 `domain / application / infrastructure / ui` 分层
- 第二维只在 `stable` 内评估

### 2. 不是所有前端代码都需要 Clean

以下内容默认不引入第二维：

- `app/layout` 这类应用壳层与组合根
- 纯页面装配
- 简单展示组件
- 一次性静态面板
- 仅做样式组织的 UI 区块
- 没有稳定业务规则的轻交互

判断标准：

- 去掉接口、存储、路由后，若代码只剩展示和组合，不需要第二维
- 若复杂度主要来自排版、响应式或组件拼装，不需要第二维

### 3. 只有高复杂度稳定业务切片才引入第二维

出现以下信号时，再考虑第二维：

- 稳定业务对象与明确业务规则
- 可命名的 use case、command、query 或 workflow
- 多个异步步骤的流程编排
- 权限判断、状态机或跨上下文协作
- API、本地存储、URL、SDK 等外部适配点
- 需要替换 mock / real repository，或需要显式 port / adapter
- 带业务语义的逻辑若脱离单一 page 的展示壳层后仍然成立
- 若它还能被多个 page / feature 复用，这是增强信号，不是前置条件

机械信号：

- 如果一段实现去掉当前 page 的布局与展示外壳后，仍然是有意义的业务规则、筛选、查询、校验或流程编排，按业务逻辑评估，不按页面展示编排处理
- 如果它还能被多个 page / feature 复用，这是进一步的正向信号，不是必要条件

避免误判：

- “可复用” 不等于一定是业务逻辑
- “只服务一个 page” 也不等于一定不需要第二维
- 若它只是通用 UI 结构、样式组合或无业务语义的工具，按 `widgets` 或 `shared` 处理
- 只要“保留业务语义”成立，就应评估第二维；“可复用”只是增强信号

### 4. Reducer / State Machine 的使用边界

Reducer 不是默认状态管理方案，也不等同于第二维分层。只有当一组状态已经形成“流程状态机”时，才应引入 reducer 或显式 state machine。

Reducer 的判断单位是状态组，不是页面。一个页面可以只把查询流程放进 reducer，同时继续用 `useState` 管理 tab、modal、输入值或动画状态；不同流程也不应为了“统一”而塞进同一个 reducer。

同时满足以下两个条件时，应使用 reducer / state machine，而不是继续堆多个 `useState`：

1. 这些状态共同描述同一个业务流程或交互流程，而不是彼此独立的 UI 小状态。
2. 存在不合法状态组合，或多个状态必须随同一个事件原子更新。

典型进入信号：

- 一个流程存在明确阶段，例如 `idle` / `loading` / `partialSuccess` / `success` / `failed` / `expired`。
- 同一个事件需要同时修改多个状态，例如“开始查询”必须同时清空旧结果、清空错误、进入 loading、递增 requestId。
- 某些状态组合不应该出现，例如：
  - `loading === false` 但请求仍被 in-flight 锁住
  - 有补充结果错误但没有主结果
  - 新查询开始后旧的保存反馈仍显示
  - stale request 返回后覆盖了当前结果
- 异步流程会分阶段返回结果，例如主查询先返回，补充数据随后返回。
- 流程需要统一处理竞态、重复提交、session 过期、retry、rollback 或局部成功。
- 页面中多个 `useState` 的更新总是成组出现，且这些状态字段共同表达同一个流程。

不进入 reducer 的情况：

- 单个输入值、modal open、当前 tab、hover、简单展开折叠、纯动画状态。
- 多个状态虽然在同一组件里，但彼此没有流程不变量。
- 只是为了减少 `useState` 数量，或为了让代码看起来更工程化。
- 状态变化没有事件语义，只是简单展示派生值。

归属规则：

- 若 reducer 描述的是纯 UI lifecycle，例如表单草稿、卡片展开、动画过渡，留在 `ui` 内。
- 若 reducer 描述的是业务 use case / query / command / workflow 的状态转换，进入 `feature/application`。
- 若只是业务对象本身的纯规则，不使用 React reducer，优先进入 `entity/domain` 的纯函数或 policy。

一句话判断：

如果这些状态需要靠开发者记住“哪些字段必须一起改、哪些组合不能出现”，就应使用 reducer / state machine 把规则写进事件转换里。

## 推荐映射

在当前仓库中，推荐这样理解两套结构的关系：

- `app`：composition root / app shell
- `pages`：page adapter / route entry
- `widgets`：跨页面 UI 组合
- `features`：最适合承载 use case 的稳定业务切片
- `entities`：最适合承载 domain object 与业务规则
- `shared`：技术共享层，不作为第二维承载点

第二维只出现在：

- `features/<slice>/`
- `entities/<entity>/`

当前强规则：

- 第二维只治理 `features` 与 `entities`
- `widgets` 不采用第二维，也不保留例外通道
- `shared` 不采用第二维，也不保留例外通道
- 若 `widget` 变复杂，把业务规则、流程编排与 adapter 需求下沉到 `features` 或 `entities`
- 若 `shared` 中出现明显业务语义，先判断它是否属于某个 `feature` 或 `entity`
- `widget` 自身只保留跨页面 UI composition 与展示装配职责
- `shared` 自身只保留技术共享、通用 UI、基础类型与弱业务语义约定

操作规则：

- 不在复杂 `widget` 原地补 `domain / application`
- 先判断这段复杂性属于哪个 `feature` 或 `entity`
- 只有在下沉到对应 `feature / entity` 之后，才继续判断是否需要第二维
- `shared` 同理：不在 `shared/lib` 内补第二维，先判断归属

`widget` 下沉操作方式：

- 将业务逻辑抽离为独立函数或模块
- 业务对象规则移入对应 `entity/domain`
- use case、query、command、workflow 移入对应 `feature/application`
- `widget` 只通过 import 使用这些能力，不在内部保留带业务语义的核心逻辑
- 不允许通过局部函数、闭包或组件内部私有实现，继续包裹应下沉的业务逻辑

`shared/lib` 规则：

- 纯技术共享不受第二维约束
- 常见例子包括：通用类型、无业务语义的工具函数、基础格式化、ID 生成、底层浏览器/运行时辅助函数
- 若一段共享逻辑带有明确业务语义，例如权限规则、业务状态判断、特定领域筛选或特定业务时间语义，它不应因为“多个地方会用”就默认进入 `shared/lib`
- 这类逻辑先按拥有者判断：
  - 若它描述业务对象本身的规则，归 `entity`
  - 若它描述用户动作、页面流程、权限门槛或业务场景编排，归 `feature`
  - 若它不描述具体业务对象或具体业务流程，只提供跨域通用的技术能力或极弱业务语义约定，才保留在 `shared`
- 只有在它确实跨多个业务切片、且没有明确单一拥有者时，才允许继续留在 `shared`
- 即使继续留在 `shared`，它也不作为第二维治理对象

## 推荐目录

### entities

```txt
src/entities/<entity>/
  domain/
    <entity>.ts
    <entity>-policy.ts
  index.ts
```

- `entities` 放 `domain`
- 若只是简单类型与纯业务判断，也可以暂时不继续拆子目录

### features

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

- `application` 放 use case、workflow、query、command
- `infrastructure` 放所有外部技术边界与适配实现，例如 API client、storage、URL search params 读写、SDK 初始化与封装、mapper、repository adapter
- `ui` 放该 feature 自己的交互入口和展示适配

统一收束标准见 [../infrastructure-rules.md](../infrastructure-rules.md)。

`infrastructure` 包括：

- `localStorage` / `sessionStorage` 读写
- URL search params 解析与回写
- 第三方 SDK client 初始化
- 请求 client 与远端 API adapter
- 数据格式 mapper 与序列化/反序列化适配

### pages / app

```txt
src/pages/home/
  index.tsx

src/app/layout/
  app-layout.tsx
  entry-sidecar.tsx
```

- `pages` 与 `app` 主要保持组合和挂载职责
- 它们不要求机械补齐 `domain / application / infrastructure / ui`

## 当前项目中的直接判断

### 当前更适合保持简单的部分

- `app/router`：路由组合根与暴露治理
- `app/layout`：壳层、Sidecar 挂载、全局布局协调
- 简单 `pages` 页面装配
- `widgets/*`：跨页面 UI composition
- `shared/*`：技术共享层
- `labs/*` 与 `sandbox/*` 中的实验模块

### 当前最适合试点第二维的部分

- `entities/upstream-access`
- 未来若 Sidecar 协作流程出现稳定 use case，可在对应 `features` 中引入第二维，而不是堆在 `app/layout`
- 当前没有达到第二维阈值的稳定切片时，不为了推进计划而硬拆新 feature

## 最小落地规则

1. 默认不建第二维目录。
2. 当 `stable` 切片出现明确业务规则与流程编排时，再补 `domain / application / infrastructure / ui`。
3. `widgets` 不引入第二维；若变复杂，把职责下沉到 `features` 或 `entities`。
4. `shared` 不引入第二维；若出现明显业务语义，先做归属判断，不在 `shared/lib` 内补层。
5. 一旦引入第二维，`ui` 不直接吞掉所有业务逻辑。
6. `application` 不依赖具体 UI 组件实现。
7. `domain` 不依赖 React、路由、请求库和浏览器细节。

## 一句话判断法

- 这是长期维护的稳定业务切片吗？
- 它的复杂度来自业务规则和流程编排，而不只是 UI 组合吗？
- 去掉当前 page 的展示外壳后，它仍然是一个带业务语义的实现吗？
- 如果它还能被多个 page / feature 复用，这是增强信号，不是前置条件

前两个答案为“是”时，再评估第三个问题。

## 相关文档

- [checklist.md](./checklist.md)
- [decisions.md](./decisions.md)
- [templates.md](./templates.md)
