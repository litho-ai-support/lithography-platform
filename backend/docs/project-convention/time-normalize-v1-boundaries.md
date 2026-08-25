<!-- docs/project-convention/time-normalize-v1-boundaries.md -->

# time normalize v1：函数职责与边界建议

- 整个 time normalize 是我的一次项目（前后端数据库等）所有时间时区处理的纯函数归一化尝试，并不是强制要求，如果用到一定要做充分测试
- 在迁移阶段，time normalize 是语义防线，DTO 层不是唯一规则强制入口
- 迁移期间可以按入口逐步接入：未接入入口保持既有行为，已接入入口通过 normalize 获得稳定时间规则保障
- format 层只接收 normalize 语义载体，不接收裸 `Date`，并支持跨拷贝传递
- 语义载体是可序列化结构：`{ normalizedKind, semantic, epochMilliseconds }`
- format 层校验目标是防误用，不承担不可信输入鉴权职责

## 1. `parseTimeInput(input: unknown)`

### 建议职责

- 接收外部未知输入。
- 判断是否属于可解析时间输入。
- 解析成功后产出中性结构 `ParsedTimeInput`。
- 识别输入形态特征，包括：是 `date` 还是 `datetime`、是否显式带时区、是否带毫秒。

### 禁止做的事

- 禁止推断业务语义。
- 禁止决定它最终属于 `TIMESTAMP(3)` 还是 `DATETIME`。
- 禁止补默认值。
- 禁止把非法值“尽量修正后放过”。
- 禁止读取系统配置、环境变量、数据库配置。
- 禁止做业务层时区策略决策。

## 2. `normalizeSystemEventTime(input: ParsedTimeInput)`

### 建议职责

- 调用方显式声明“这是系统事件时间”后，对输入进行收敛。
- 保证输出可安全进入系统事件时间链路。
- 为后续 `TIMESTAMP(3)` 格式化提供稳定输入。
- 输出 `SystemEventTime` 语义载体：`normalizedKind='normalized_time'`、`semantic='system_event_time'`、`epochMilliseconds=number`。

### 禁止做的事

- 禁止自动改判为业务时间。
- 禁止根据字段名、上下文、值内容猜测语义。
- 禁止承担字符串解析职责。
- 禁止直接输出数据库字符串。
- 禁止做持久化、日志、DTO 拼装。
- 禁止处理时长语义。

## 3. `normalizeBusinessDateTime(input: ParsedTimeInput)`

### 建议职责

- 调用方显式声明“这是业务日期时间”后，对输入进行收敛。
- 保证输出可安全进入业务时间链路。
- 为后续 `DATETIME` 格式化提供稳定输入。
- 在 Core 层硬拒绝 `Date`、`epoch`、带时区字符串输入。
- 输出 `BusinessDateTime` 语义载体：`normalizedKind='normalized_time'`、`semantic='business_datetime'`、`epochMilliseconds=number`。

### 禁止做的事

- 禁止自动改判为系统事件时间。
- 禁止承担字符串解析职责。
- 禁止根据调用现场推断业务规则。
- 禁止补 `today` / `now` / 零点等默认值。
- 禁止直接输出数据库字符串。
- 禁止处理纯日期字段的业务补时逻辑，除非后续另有明确规则。

## 4. `validateTimeRangeOrder(input: TimeRangeOrderInput)`

### 建议职责

- 只校验时间区间的顺序关系。
- 只回答一个问题：`start <= end` 是否成立。

### 禁止做的事

- 禁止检查“必须同时存在”。
- 禁止检查“不得晚于当前时间”。
- 禁止检查“不得超过 N 天”。
- 禁止检查业务模块自己的上下限规则。
- 禁止替调用方补空值。
- 禁止承担 normalize 职责。

## 5. `formatForTimestamp3(input: SystemEventTime)`

### 建议职责

- 把已归一化的系统事件时间输出为稳定字符串。
- 输出口径固定服务于 `TIMESTAMP(3)`。

### 禁止做的事

- 禁止接收未归一化输入并顺手纠正。
- 禁止再做业务语义判断。
- 禁止做数据库写入。
- 禁止输出多种格式供调用方选择。
- 禁止依赖本地时区默认行为。

## 6. `formatForDateTime(input: BusinessDateTime)`

### 建议职责

- 把已归一化的业务日期时间输出为稳定字符串。
- 输出口径固定服务于 `DATETIME`。

### 禁止做的事

- 禁止顺手把它转成系统事件时间格式。
- 禁止做额外时区猜测。
- 禁止兼容多套历史格式。
- 禁止做数据库写入。
- 禁止承担 parse 或 normalize 职责。

## 7. 整个模块统一边界

### 这个模块应该做的

- 时间输入解析。
- 时间语义收敛。
- 时间顺序校验。
- 稳定格式输出。

### 这个模块不应该做的

- 不做 I/O。
- 不读配置。
- 不依赖框架。
- 不碰数据库。
- 不碰 DTO 组装。
- 不做字段名推断。
- 不做业务默认值补齐。
- 不做通用字符串清洗。
- 不做布尔值、数值、枚举 normalize。
- 不处理时长，时长统一走 `*_ms`。

## 8. 一句总原则

`parse` 只负责“能不能读懂”，`normalize` 只负责“按显式语义收敛”，`format` 只负责“稳定输出”，`guard` 只负责“边界校验”。
