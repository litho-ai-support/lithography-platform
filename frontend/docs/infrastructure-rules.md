<!-- docs/infrastructure-rules.md -->

# Infrastructure Rules

本文件定义项目中 `infrastructure` 的收束标准。

它关注的是“外部技术边界放哪、mock 放哪、哪些代码不能乱跑”，不是第二维是否启用的问题。

一句话定义：

- `infrastructure` 只承接 external/runtime implementation，不承载业务编排

## 目标

- 让外部技术边界有稳定落点
- 让 mock、API、storage、URL 参数、SDK 不再散落在 `pages`、`widgets`、`entities/domain`
- 让 `stable`、`labs`、`sandbox` 都有明确收束方式

## 什么算 infrastructure

以下内容都按 `infrastructure` 处理：

- API client
- repository adapter
- storage 读写
- URL search params 读写
- SDK 初始化与封装
- mapper、序列化、反序列化
- mock 数据源
- mock / real 数据源切换

一句话判断：

- 只要某段实现的职责是对接外部系统、浏览器能力、路由参数、持久化介质或替代数据源，它就是 `infrastructure`

## 通用规则

- `infrastructure` 不放业务规则
- `infrastructure` 不放页面装配
- `infrastructure` 不放纯展示组件
- mock 视为 `infrastructure`，不是 `domain`
- 不允许把 mock 放进 `entities/domain`
- 不允许把 API、storage、URL 参数读写直接散落在 `pages`、`widgets`、`app/layout`

## 防腐职责

- 当外部 API 数据结构脏、命名混乱、字段不稳定或可空情况复杂时，`infrastructure` 必须承担防腐职责
- `infrastructure` 负责通过 mapper、decoder、adapter 将外部响应转换为仓库内部可直接使用的干净结构
- 外部 API 原始 DTO 只允许停留在 `infrastructure`
- `application` 不直接消费第三方或后端原始响应类型
- `domain` 不直接承担“兼容外部脏字段”的职责
- env 读取、base URL 解析、endpoint 拼接等运行时配置适配，按 `infrastructure` 处理

防腐层负责：

- 字段重命名与结构归一
- 空值、缺省值、脏枚举、兼容字段的兜底处理
- 外部响应到内部对象的映射
- 序列化、反序列化与协议差异适配

防腐层不负责：

- 业务流程编排
- 业务规则判定
- 页面展示逻辑

一句话要求：

- 外部世界的脏数据，先在 `infrastructure` 清洗后，再进入 `application` 或 `domain`

Mapper 落点规则：

- 只要某段数据格式转换逻辑涉及外部协议、外部 DTO、后端响应、第三方 SDK 返回结构或 URL 参数结构，它一律收束在 `infrastructure`
- 这类实现优先放在 `infrastructure/mapper.ts`、`dto.ts`、`decoder.ts` 等文件中
- `application` 可以调用这些 mapper，但不自己承接外部 DTO 到内部结构的转换逻辑
- 只有纯业务语义内的对象重组、且不涉及任何外部协议时，才不按 `infrastructure` 处理

## URL Params 边界

- URL search params 的解析、读取、回写实现属于 `infrastructure`
- 但“何时触发写 URL”“哪些业务状态需要同步到 URL”的决策属于 `application`
- `application` 可以调用 `infrastructure` 提供的 URL adapter，但不把触发时机反向下沉到 `infrastructure`
- `infrastructure` 负责参数格式适配、序列化与反序列化，不负责决定业务流程何时更新 URL

## Port 装配边界

- 当 UI 需要通过 port 调用外部能力时，优先在所属 feature 内部的 entry、boundary 或 composition 文件完成 concrete adapter 装配
- 不因为要做 port 注入，就把具体 adapter 的装配上抬到 `pages` 或 `app`
- `pages` 与 `app` 继续只感知 feature 的公开入口，不感知 feature 内部的基础设施细节

## stable

### 收束规则

- `stable` 中的 `infrastructure` 跟随拥有它的 `feature`
- 默认放在 `src/features/<feature>/infrastructure/`
- `entities` 保持 `domain` 纯净，不承接 mock、API、storage、URL adapter
- `shared` 只保留跨域通用技术能力，不承接具体业务切片自己的数据源
- 不设仓库级默认 `src/infrastructure/` 目录作为统一落点
- 具体业务 adapter、DTO、mapper、repository 必须留在拥有它的 `feature/infrastructure/`
- 只有真正跨域复用、且不携带具体业务语义的技术底座，才允许进入 `shared`

### shared 与 feature 的边界

- 通用 HTTP client、通用鉴权 header 注入、通用重试/超时、通用日志、通用 storage 包装、通用 URL 编解码工具、通用 SDK bootstrap，可放在 `shared`
- 某个业务切片自己的 API DTO、mapper、repository、带业务字段语义的 URL params adapter，不放进 `shared`
- 判断标准不是“多个地方可能会调用”，而是“它是否仍然带着明确业务拥有者”
- 只要还带具体业务语义，就继续留在拥有它的 `feature/infrastructure/`

### mock 规则

- `stable` 中允许存在 mock，但必须作为临时或演示数据源放在对应 `feature/infrastructure/`
- 若以后要切 real 数据源，应在同一 `feature/infrastructure/` 内替换或并存，不回流到 `entity`

### 推荐结构

```txt
src/features/<feature>/
  application/
  infrastructure/
    dto.ts
    mapper.ts
    <adapter>.ts
    <mock-repository>.ts
  ui/
  index.ts
```

## labs

### 收束规则

- `labs` 不要求完整第二维
- 但 `labs` 的外部技术边界也必须在实验模块内部收束
- `labs` 中出现 API、storage、URL 参数、SDK、mock 时，不直接散落在 `index.tsx` 或 `ui/`
- 简单实验可用 `mock.ts`
- 一旦边界增多，改为 `infrastructure/`

### 推荐结构

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

### 迁入 stable 前

- 先判断这些 `labs` 内的外部边界未来归属哪个 `feature`
- 不把 `labs` 的 mock、API adapter 直接原样搬进 `stable`

## sandbox

### 收束规则

- `sandbox` 也要收束外部边界，但不要求正式命名和完整结构
- `sandbox` 的目标是自包含，不是目录工整
- 原型专用的 API 封装、数据映射、临时 mock、字段兼容逻辑，留在当前 prototype 内

### 判断

- 若只有一个轻量 mock 文件，保留 `mock.ts`
- 若出现多个 adapter、多个 mock、mock / real 切换，再考虑补 `infrastructure/` 或 `data/`
- 在 `sandbox` 里，收束比命名更重要

### 推荐结构

```txt
src/sandbox/<prototype-name>/
  index.tsx
  mock.ts
  api.ts        # optional
  infrastructure/  # optional
  assets/
```

## mock 规则

- mock 是替代数据源，不是业务模型
- mock 跟着消费它的模块走
- `stable` mock 跟 `feature`
- `labs` mock 跟实验模块
- `sandbox` mock 跟原型模块
- 不把 mock 提升到 `shared`，除非它已经退化成跨域通用测试夹具

## 快速规则

1. 先找拥有者，再放 `infrastructure`
2. mock 一律按 `infrastructure` 处理
3. `stable` 的 `infrastructure` 默认跟 `feature`
4. `labs` 收束边界，但不强补完整第二维
5. `sandbox` 保持自包含，命名可以轻，边界不能乱跑

## 找拥有者的兜底规则

- 若暂时无法确定唯一拥有者，且该外部边界当前由某个 `feature` 发起使用，优先暂存于该调用发起方所在的 `feature/infrastructure/`
- 不因为“暂时看不清拥有者”就把 API、storage、URL adapter 提升到 `shared`
- 也不因为归属未定就把外部边界直接散落回 `pages`、`widgets` 或 `app/layout`
- 等真实调用关系稳定后，再决定是否迁移到更合适的拥有者
