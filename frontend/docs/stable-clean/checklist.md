<!-- docs/stable-clean/checklist.md -->

# Stable Clean Checklist

本文件提供 `stable` 区第二维判断的最小清单。

定位：

- 它不是理论说明文
- 它也不是具体案例库
- 它用于判断是否需要引入 `domain / application / infrastructure / ui`

## 使用方式

1. 先用本清单完成第一次判断
2. 按判断结果实施
3. 真实边界案例再记录到 [decisions.md](./decisions.md)

## 判断清单

### 1. 这段代码已经明确属于 `stable` 吗？

- 若不是，停止第二维判断
- `labs` 与 `sandbox` 默认不进入第二维

### 2. 当前正在判断的对象是 `widget` 吗？

- 若是，停止在 `widget` 内继续判断第二维
- `widget` 不承载 `domain / application / infrastructure / ui`
- 若 `widget` 内出现业务规则、查询、校验、流程编排或 adapter 需求，判断应下沉到哪个 `feature` 或 `entity`
- `widget` 自身只保留跨页面 UI composition 与展示装配

下沉判断：

- 若这段复杂性属于“用户要完成什么动作 / 流程”，进入对应 `feature`
- 若这段复杂性属于“业务对象本身的稳定规则”，进入对应 `entity`
- 下沉完成后，再在对应 `feature / entity` 内判断是否需要第二维

下沉方式：

- 将业务逻辑抽离为独立函数或模块
- 业务对象规则移入对应 `entity/domain`
- use case、query、command、workflow 移入对应 `feature/application`
- `widget` 只通过 import 使用这些能力
- 不允许通过局部函数、闭包或组件内部私有实现，继续保留应下沉的业务逻辑

### 3. 当前正在判断的对象是 `shared` 吗？

- 若是，不在 `shared` 内继续判断第二维
- `shared` 不是 `domain / application / infrastructure / ui` 的承载点
- 若它只是通用类型、通用工具函数、基础格式化、ID 生成、底层运行时辅助函数，继续保持在 `shared`
- 若它带有明确业务语义，例如权限规则、业务状态判断、特定领域筛选或特定业务时间语义，判断它应归属哪个 `feature` 或 `entity`
- 归属规则：
  - 业务对象本身的规则，归 `entity`
  - 用户动作、页面流程、权限门槛或业务场景编排，归 `feature`
  - 只有跨域通用的技术能力或极弱业务语义约定，才继续留在 `shared`
- 只有在它确实跨多个业务切片、且没有明确单一拥有者时，才允许继续留在 `shared`
- 即使继续留在 `shared`，它也不进入第二维

### 4. 它的复杂度主要来自业务规则或流程编排吗？

- 若复杂度主要来自排版、响应式、视觉结构或组件组合，停止第二维判断，按展示编排处理

机械信号：

- 如果去掉当前 page 的布局与展示外壳后，这段实现仍然是有意义的业务筛选、查询、校验、提交流程或协作流程，按业务逻辑评估
- 如果它未来还能被多个 page / feature 复用，且复用的是业务语义而不只是 UI 外观，这是进一步的正向信号，不是必要条件
- 如果它离开当前页面后几乎不成立，只是某个页面的展示编排，停止第二维判断，按页面展示编排处理

混合情况规则：

- 遇到“既有业务逻辑也有 UI 组合”的情况时，必须做出单一判定
- 若业务逻辑可以被单独剥离并命名为规则、query、command、workflow 或 adapter，按业务逻辑处理，进入 `feature` 或 `entity` 的判断
- 若剥离后只剩少量透传、格式拼接或展示协调代码，按 UI 编排处理，不进入第二维
- 不允许以“既是业务又是 UI”为理由在原位置同时补第二维目录

### 5. 它是否存在稳定业务对象？

例如：

- 明确的 entity
- 稳定的值对象
- 可复用的业务规则

若没有，不引入 `domain`

### 6. 它是否存在可命名的 use case / command / query / workflow？

例如：

- 列表查询
- 表单提交
- 权限校验
- 协作触发流程

若没有，不引入 `application`

### 7. 它是否存在需要保护不变量的流程状态？

Reducer 的判断单位是状态组，不是页面。一个页面可以部分使用 reducer，部分继续使用 `useState`。

同时满足以下条件时，应使用 reducer / state machine：

1. 多个状态共同描述同一个业务流程或交互流程。
2. 存在不合法状态组合，或多个状态必须随同一个事件原子更新。

若只是 tab、modal、输入值、hover、简单展开折叠或纯动画状态，继续使用 `useState`。

### 8. 它是否有明确外部适配点？

例如：

- API
- storage
- URL search params
- SDK
- repository mock / real 切换

这里的“外部适配点”不只指 repository：

- 浏览器持久化，如 `localStorage`、`sessionStorage`
- 路由与 URL 参数读写
- 第三方 SDK 初始化与 client 封装
- 远端请求 client
- 序列化、反序列化与数据格式映射

若没有，不引入 `infrastructure`

### 9. 如果去掉 React、路由、请求和浏览器细节后，还剩有意义的业务规则吗？

- 若去掉这些后几乎什么都不剩，按 UI adapter 处理，不进入第二维

### 10. 该模块会被长期维护吗？

- 若它只是短期页面、静态区块或轻交互，不要为了形式补第二维

### 11. 引入第二维后，职责会更清晰，而不是只是多目录吗？

- 若只是把原来一个文件拆成四个空目录，没有实际职责收益，就不要拆

## 快速结论

### 直接进入第二维评估

- `stable` 中的复杂 feature
- 有明确业务规则的 entity
- 需要 use case、port / adapter 的稳定业务切片

### 不进入第二维

- `app/layout` 壳层
- 简单 `pages` 装配
- 所有 `widgets`
- 所有 `shared`
- 通用 `shared/ui`
- `labs/*`
- `sandbox/*`

## widgets 处理规则

- `widgets` 只承担跨页面 UI composition
- `widgets` 不引入第二维，也不保留例外通道
- 若某个 `widget` 变复杂，判断其中的复杂部分应下沉到哪个 `feature` 或 `entity`
- 只有下沉到 `feature / entity` 之后，才继续判断是否需要第二维
- 不要把复杂 `widget` 原地升级成半个 feature

## shared 处理规则

- `shared` 只承担技术共享、通用 UI、基础类型与弱业务语义约定
- `shared` 不引入第二维，也不保留例外通道
- 若 `shared/lib` 中出现明显业务语义，判断是否应归属某个 `feature` 或 `entity`
- 不要因为“多个地方都用得到”就把强业务语义逻辑直接提升为 `shared`
- 即使某段逻辑最终留在 `shared`，它也不作为第二维治理对象

## 当前提醒

- 若某次真实案例推翻了当前判断，应优先补入决策记录，再视情况修订本清单
