<!-- docs/worker/email-worker-delivery.rules.md -->
Purpose: Define email worker delivery, sendmail invocation, and Postfix boundary guardrails.
Read when: You are implementing, reviewing, or refactoring email queue delivery and sender handling.
Do not read when: Your task does not change email worker delivery boundaries.
Source of truth: This file defines email worker delivery rules; code examples elsewhere must not override it.

# Email Worker Delivery 说明

## 分层落位

- 发送逻辑位于 modules(service) 层的 EmailDeliveryService。
- 由 Usecase 调用 EmailDeliveryService。
- Worker adapter 仅做 job 输入输出适配。
- Worker adapter 不直接触达发送实现。
- 外部系统由 Postfix 负责。
- 模块仅调用 sendmail 命令交给系统处理。

## Postfix 转发与 465 说明

- sendmail 调用只负责把邮件交给本机 Postfix 队列。
- 后续由 Postfix 负责转发。
- 465 转发配置在 Postfix 内部生效，不会被 sendmail 调用方式影响。
- 发件人改写依赖 Postfix sender 规则。

## 配置约定

- EMAIL_SEND_AS_USER：可选，用于以指定系统用户执行 sendmail。
- EMAIL_SENDMAIL_PATH：可选，用于指定 sendmail 命令路径；默认 `/usr/sbin/sendmail`。
