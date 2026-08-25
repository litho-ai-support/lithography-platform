<!-- docs/layer-model.md -->

# Layer Model

本文件是当前 layer model 主题的直接规则文档。

## 目标

本项目采用三层结构：

- `stable`：正式稳定区
- `labs`：实验发布区
- `sandbox`：开发试验区

核心目标：

- 正式区可维护、可演进
- AI 可快速生成实验结果
- 实验代码与正式代码隔离
- 在人工确认与监督下，实验能力可由 AI 协助整理后迁入正式区

本项目的 `stable` 区借鉴 FSD 的 ownership、切片边界与依赖方向，但目标不是追求“纯粹
FSD”。与后端一样，分层是治理工具，不是目录补齐任务。

## stable / labs / sandbox

### stable

- 面向长期保留和持续维护
- 可以进入生产
- 遵守正式目录规则与依赖方向
- 进入前必须经过人工确认；整理过程可由 AI 在人工监督下执行

### labs

- 面向可受控进入生产的实验功能
- 可以进入生产
- 必须受 access list 控制
- 更适合作为“已有明确用途、带基本分层、准备进入真实观察”的起步形态
- 后续要么删除，要么在人工确认下迁入 `stable`

### sandbox

- 面向开发期快速试错
- 仅 `dev / test` 可见
- 不进入生产
- 不纳入正式菜单
- 主要承接临时想法、一次性原型和纯开发期验证，不应被当作常规进入 `stable` 的主路径

## 上线语义

### sandbox

- 仅 `dev / test` 可见
- 不允许进入生产
- 路由只在 `dev / test` 注册或放行

### labs

- 允许进入生产
- 必须有 access list
- 必须可快速撤回

### stable

- 正式上线
- 按正常权限和菜单体系管理
- 作为长期维护对象存在

## 当前说明

- `stable` 当前指 `src/app`、`src/pages`、`src/widgets`、`src/features`、`src/entities`、`src/shared`

## stable 区当前细分职责

- `app`：全局级内容，如 provider、router、layout 骨架、全局配置、主题接入、应用启动逻辑
- `pages`：正式页面级组合，负责页面组装和布局组织
- `widgets`：跨页面复用的大块 UI 组合
- `features`：用户动作或明确业务意图
- `entities`：稳定业务对象相关内容
- `shared`：真正通用、无业务归属或业务弱相关内容

这些目录表达的是职责归属和依赖方向，而不是要求每个功能都同时存在 `page / widget / feature /
entity`。当前功能足够简单时，优先保持窄 owner 和浅结构。

当前二维治理补充：

- 第一维仍是 `stable / labs / sandbox` 与 `app / pages / widgets / features / entities / shared`
- 第二维只在 `stable` 内部按需要引入，用于高复杂度稳定业务切片的职责分层
- `labs` 与 `sandbox` 默认不采用第二维，避免把试验区过早工程化
- `stable / labs / sandbox` 的环境暴露语义见 [environment-exposure.md](./environment-exposure.md)
- 第二维的具体规则见 [stable-clean/architecture.md](./stable-clean/architecture.md)
- API、storage、URL 参数、SDK、mock 等外部技术边界的收束规则，统一见 [infrastructure-rules.md](./infrastructure-rules.md)

当前补充说明：

- `app/router` 作为组合根，可读取 `labs` 与 `sandbox` 的公开入口，用于路由注册、暴露控制与环境隔离
- 该能力不代表正式区其他模块可直接依赖 `labs` 或 `sandbox`
- `app/router` 应尽量收窄为路由树、loader / guard 与注册逻辑
- 全局 layout、入口 Sidecar、全局 provider 等应用壳层实现，应优先放在 `app/layout`、`app/providers` 等 `app/` 子目录中
- `app/` 内部不同子目录之间允许协作，但应尽量通过各自的公开出口进行导入，而不是继续堆叠深层相对路径
- `app/lib` 与 `app/providers` 的判断：
  - `app/lib` 放纯逻辑、纯数据结构、纯计算；去掉 React context / state / effect 后仍能成立的实现，优先归入 `app/lib`
  - `app/providers` 放状态宿主、Context、跨树共享状态与应用级挂载
  - `providers` 应尽量薄，复杂计算和纯逻辑应优先下沉到 `app/lib`
- 像 `HomePage` 这种正式页面内容应放在 `pages/`，不应继续堆在 `app/`
- `app/` 只负责“把页面挂起来”，不负责承载页面本身的业务展示

快速判断：

- 名字像名词对象展示，优先判断是否属于 `entities`
- 名字像动词动作能力，优先判断是否属于 `features`
- 名字像页面区块、信息面板、布局组合，优先判断是否属于 `widgets`
- 若一个实现只服务单一页面，优先先放页面附近，不要过早上收

`app` vs `pages` 的直接判断：

- 需要定义 provider、router、应用壳层、全局 layout：放 `app/`
- 需要表达某个正式页面本身的内容：放 `pages/`
- 如果一个实现删掉路由后仍然是“页面内容”，它通常属于 `pages/`
- 如果一个实现的职责是“决定这个页面何时出现、挂在哪条路由上”，它通常属于 `app/`

当前说明：

- 当前作为本文件的稳定内容存在，后续视需要可拆分
