<!-- docs/api/account-write-current.md -->

Purpose: Snapshot the current account / userInfo write and read contract for this repository.
Read when: You change registration, account query, userInfo updates, accessGroup updates, or password reset flows.
Do not read when: You only change unrelated APIs.
Source of truth: Current resolver/usecase/type code remains executable truth; this file records the stable contract agents must preserve.

# Account / UserInfo Current Contract

## 当前范围

本项目账号语义已经对齐为项目身份层：

- `SUPER_ADMIN`
- `ENGINEER`
- `CUSTOMER`

`SUPER_ADMIN` 继承 `ENGINEER` 与 `CUSTOMER` 的访问能力，后两者互不继承。当前账号能力负责注册、登录、资料读取、资料更新和角色访问摘要，不扩展岗位或组织管理域。

## GraphQL 入口

当前通用账号相关入口：

- `register(input: RegisterInput): RegisterResult`
- `thirdPartyRegister(input: ThirdPartyRegisterInput): RegisterResult`
- `login(input: AuthLoginInput): LoginResult`
- `account(args: AccountArgs): UserAccountDTO`
- `userInfo(accountId: Int!): UserInfoDTO`
- `basicUserInfo(accountId: Int!): BasicUserInfoDTO`
- `updateUserInfo(input: UpdateUserInfoInput): UpdateUserInfoResult`
- `updateAccessGroup(input: UpdateAccessGroupInput): UpdateAccessGroupResult`
- `resetPassword(input: ResetPasswordInput): ResetPasswordResult`

`login` 详细契约见 `docs/api/auth-session-current.md`。

## 注册

`register` 当前使用 `RegisterWithEmailUsecase`。

输入字段包括：

- `loginName`
- `loginEmail`
- `loginPassword`
- `nickname`
- `type`
- `inviteToken`

`type` 默认是 `CUSTOMER`，且公开注册只允许创建 `CUSTOMER`。工程师和超级管理员账号由受控管理流程或 Seed 创建。

`thirdPartyRegister` 当前走第三方注册 usecase，属于通用第三方账号能力，不代表具体业务域身份。

## 账号读取

`account` 是受保护 query：

- 通过 `JwtAuthGuard` 鉴权。
- 使用 `mapJwtToUsecaseSession()` 构造 usecase session。
- 调用 `GetAccountByIdUsecase`。
- 返回 `UserAccountDTO`，不返回 ORM Entity。

当前输出包括：

- `id`
- `loginName`
- `loginEmail`
- `status`
- `identityHint`
- `recentLoginHistory`
- `createdAt`
- `updatedAt`

## UserInfo 读取

`userInfo` 和 `basicUserInfo` 都是受保护 query：

- Resolver 只接收 GraphQL 参数与当前用户。
- 读取与可见性规则由 `GetVisibleUserInfoUsecase` 编排。
- 完整视图返回 `UserInfoDTO`。
- 基础视图返回 `BasicUserInfoDTO`。
- DTO 映射在 adapter 内完成，不能把 GraphQL DTO 下沉到 usecase 或 modules(service)。

## UserInfo 更新

`updateUserInfo` 是受保护 mutation：

- 不传 `accountId` 时默认更新当前登录账户。
- 可更新昵称、性别、生日、头像、邮箱、签名、地址、电话、标签、地理信息、用户状态等资料字段。
- `identityHint` 可作为账号访问语义摘要的一部分传入。
- Usecase 负责权限、可见性和写语义。
- Resolver 只做输入 shape 到 usecase 参数的映射。

## AccessGroup 更新

`updateAccessGroup` 是受保护 mutation：

- 使用 `JwtAuthGuard` 与 `RolesGuard`。
- 当前 Resolver 允许 `ENGINEER` 或 `SUPER_ADMIN` 调用；Usecase 仍需执行目标账号和变更内容的权限规则。
- 输入包含 `accountId`、`accessGroup`、可选 `identityHint`。
- `accessGroup` 只允许使用 `IdentityTypeEnum` 当前通用值。
- 写入由 `UpdateAccessGroupUsecase` 编排。

## 密码重置

`resetPassword` 使用通用 verification consume flow：

- 前端应先通过验证记录读取能力预读 token 状态。
- mutation 调用 `ConsumeVerificationFlowUsecase`。
- 成功返回 `success: true` 与 `accountId`。
- 失败返回 `success: false` 与失败消息。

后续若收敛为统一 GraphQL error contract，应单独更新本 current 文档。

## 禁止项

- 不擅自新增角色、组织、岗位或其他业务域 current contract。
- 不把 adapter DTO 传入 usecase/modules/core。
- 不从 resolver 直接依赖 modules(service) 或 infrastructure。
- 不返回 ORM Entity 或 QueryBuilder。
- 不新增当前通用身份层之外的业务身份或背景字段。
