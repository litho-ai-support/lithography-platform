<!-- docs/api/reference-document-rest-current.md -->

Purpose: Snapshot the current REST file upload / download contract for the reference-document capability.
Read when: You change the REST controller, file storage infrastructure, upload validation, or download streaming behavior.
Do not read when: You only change the GraphQL contract of this capability (see GraphQL DTO / error contract docs instead).
Source of truth: `src/adapters/api/rest/reference-document/reference-document-rest.controller.ts` 与 `src/infrastructure/file-storage/` 为可执行真源；本文记录必须保持稳定的契约。
Global error contract: REST 边界不走 GraphQL error 契约；错误统一为 HTTP 状态码 + JSON 体（见下）。

# Reference Document REST Contract（文件上传 / 下载）

## 定位

- GraphQL 契约零变更：`CreateReferenceDocumentInput` 保持 contentText 必填（纯文本创建）；文件创建走 REST multipart 端点（0909 第二轮阻塞项 1 裁定）。
- 控制器前缀 `api/reference-documents`（项目无全局 prefix），显式 `@UseGuards(JwtAuthGuard, RolesGuard)`，与 resolver 同模式。
- 浏览器鉴权使用 Authorization 头（与 GraphQL 同源桥接），前端下载经 fetch blob 触发保存，不用 `window.open` 直链。

## POST /api/reference-documents/upload

multipart/form-data；权限：仅 `SUPER_ADMIN`（精确判定，不继承）。成功 HTTP 201。

### 表单字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `file` | 是 | 二进制文件；缺失或非 Buffer → `UPLOAD_FILE_MISSING` |
| `title` | 是 | 与 GraphQL 创建口径一致（必填、≤255） |
| `documentType` | 是 | 必填、≤100 |
| `equipmentModelId` | 否 | 留空表示通用资料；非法值 → `EQUIPMENT_MODEL_NOT_FOUND` |
| `description` | 否 | 可空 |
| `contentText` | 否 | 可空（仅文件创建合法）；与文件双空 → `CONTENT_SOURCE_EMPTY` |

### 文件校验（不信任客户端）

- 大小上限：`REFERENCE_DOCUMENT_UPLOAD_MAX_BYTES`（默认 20 MiB；multer 硬上限 64MB 先行拦截为 413）。超限 → `UPLOAD_FILE_TOO_LARGE`（HTTP 413）。
- 类型判定以**扩展名**为主（不信任客户端 MIME 头），扩展名与 `REFERENCE_DOCUMENT_ALLOWED_MIME_TYPES` 白名单双重校验。白名单外 → `UPLOAD_FILE_TYPE_NOT_ALLOWED`（HTTP 415）。默认白名单：pdf / doc / docx / xls / xlsx / ppt / pptx / png / jpg / jpeg / txt / md / csv。
- 文件名仅取 `basename` 并剔除控制字符与首尾空白后存 `originalFilename`（≤255，空值回落「未命名文件」），不含路径成分。

### 原子性

先经存储契约写文件 → 再事务落库；落库失败 catch 中删除已写文件（文件失败则不触库）。对偶保证：不留 DB 记录与孤儿文件。

### 成功响应

与 GraphQL mutation 同构的统一信封（全局 FormatResponseMiddleware）：

```json
{ "success": true, "data": { "id": 970123 }, "requestId": "...", "host": "..." }
```

## GET /api/reference-documents/:id/download

权限：所有已登录角色（`hasRole` 层级：SUPER_ADMIN / ENGINEER / CUSTOMER）。成功 HTTP 200。

- 复用统一 NOT_FOUND 口径：不存在 / 已软删 → `NOT_FOUND`（HTTP 404，防探测，不泄露删除状态）。
- 无 `storageReference`（纯文本资料）或存储对象缺失 → `FILE_NOT_AVAILABLE`（HTTP 404，受控错误，不泄露服务器路径）。
- 响应头：`Content-Type` 取 DB `mimeType`；`Content-Disposition: attachment; filename="..."; filename*=UTF-8''...`（RFC 5987 编码 `originalFilename`，中文不乱码）。
- 响应体：`StreamableFile` 流式返回文件字节。
- 存储引用由服务端生成（`^[0-9a-f]{32}\.[a-z0-9]{1,8}$` 白名单），读取时 `path.resolve` 后断言仍在存储目录内（双保险防路径穿越）；不接受任何客户端路径输入。

## 错误响应（REST 统一口径）

错误体为 HTTP 状态码 + `{ statusCode, code, message }`（经全局 FormatResponseMiddleware 包装为 `data` 字段）；由全局过滤器 HTTP 分支与 `resolveRestStatus`（`src/core/common/errors/rest-error-status.ts`）统一渲染，Nest `HttpException` 体系之外不走 GraphQL error 契约。

| code | HTTP | 说明 |
| --- | --- | --- |
| `JWT_ERROR` / `AUTH_ERROR` 组 | 401 | 未登录 / Token 失效 |
| `PERMISSION_ERROR` 组 | 403 | 角色不满足（如工程师上传） |
| `INPUT_NORMALIZE_*` / `REFERENCE_DOCUMENT_INVALID_PARAMS` | 400 | 字段校验失败 |
| `REFERENCE_DOCUMENT_EQUIPMENT_MODEL_NOT_FOUND` | 400 | 型号不存在 |
| `REFERENCE_DOCUMENT_CONTENT_SOURCE_EMPTY` | 400 | 正文与文件双空 |
| `REFERENCE_DOCUMENT_UPLOAD_FILE_MISSING` | 400 | multipart 缺文件 |
| `REFERENCE_DOCUMENT_UPLOAD_FILE_TOO_LARGE` | 413 | 超大小上限 |
| `REFERENCE_DOCUMENT_UPLOAD_FILE_TYPE_NOT_ALLOWED` | 415 | 白名单外类型 |
| `REFERENCE_DOCUMENT_NOT_FOUND` | 404 | 不存在 / 已软删（统一防探测） |
| `REFERENCE_DOCUMENT_FILE_NOT_AVAILABLE` | 404 | 无文件 / 存储对象缺失（受控） |
| 未登记错误 | 500 | 兜底 |

## 运行时配置（env，缺省兜底，见 `env/.env.example`）

- `REFERENCE_DOCUMENT_STORAGE_DIR`：存储目录，相对 backend 运行目录，默认 `var/reference-documents`（`var/` 已 gitignore）。
- `REFERENCE_DOCUMENT_UPLOAD_MAX_BYTES`：单文件字节上限，默认 20 MiB。
- `REFERENCE_DOCUMENT_ALLOWED_MIME_TYPES`：逗号分隔白名单，空取内置默认集合。

前端单一口径镜像：`frontend/src/features/reference-document/ui/reference-document-form.tsx` 顶部的预检常量仅为即时反馈，本文件所列 env 为唯一真源，修改需同步。
