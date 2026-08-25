<!-- File: src/infrastructure/typeorm/search/README.md -->

# TypeORM 搜索引擎使用说明（SearchEngine / Paginator）

本文档整理了针对**文本搜索**与**分页**能力的设计、语义约束与最佳实践，覆盖：

 - `TypeOrmSearch`：负责在 **QueryBuilder** 上应用文本搜索 / 过滤 / 排序，并执行 **OFFSET / CURSOR** 两种分页。
- `TypeOrmPaginator`：独立的分页器（可复用在非搜索场景），对 **after / before** 游标翻页有对称实现。

> 目标：沉淀一套可在不同模块稳定复用的“读层”管线，同时保证**排序稳定性**与**游标一致性**。

---

## 目录与核心文件

- 搜索引擎实现：`src/infrastructure/typeorm/search/typeorm-search.ts`
- 分页器实现：`src/infrastructure/typeorm/pagination/typeorm-paginator.ts`
- 类型定义：
  - `src/core/search/search.types.ts`
  - `src/core/pagination/pagination.types.ts`

 - 领域错误码：`src/core/common/errors/domain-error`

---

## 改动摘要（近期）

- **文本搜索最小长度** `minQueryLength`：`applyTextSearch` 会对输入 `trim()` 后短路，避免 `LIKE '%%'` 造成全表扫描。
- **统一游标分页语义**：同时支持 `after`（下一页）与 `before`（上一页）。`before` 在查询阶段**反向排序**拉取，再**翻转为正序**返回。
- **`pageInfo` 更稳健**：
  - 非 `before`：`hasNext = hasExtra`，`hasPrev = undefined`；
  - `before`：`hasPrev = hasExtra`，`hasNext = undefined`（如需严格布尔可在适配层做轻查询或置为 `false`）。

- **`CursorToken` 字段统一**：`primaryValue` / `tieValue` / `tieField`。
- **计数增强**：支持 `countDistinctBy`（安全列或 `别名.列`）用于 join 场景的准确总数。
- **稳定性增强**：在任意模式下，若有 `cursorKey` 则通过 `ensureTieBreaker` 自动补齐副键排序，提升稳定排序。

---

## 能力总览

### 1) 文本搜索（Text Search）

**选项（见 `SearchOptions`）**

- `searchColumns: string[]`：参与文本搜索的**物理列**（可含别名）。
- `searchMode: 'OR' | 'AND'`：列间匹配逻辑，默认 `OR`。
- `minQueryLength?: number`：最小搜索词长度（建议 2~3）。
- `buildTextSearch?(input)`：自定义构建（多词 AND、前缀匹配、全文索引等）。返回 `{ clause, params }` 即优先使用。
- `addSortColumnsToSelect?: boolean`：是否将排序列加入 `SELECT` 以提升不同方言下稳定性（**谨慎**，见下“注意事项”）。

**内置行为**

- 统一大小写比较：`LOWER(col) LIKE LOWER(:q)`。
- 转义 `%`、`_`、`\` 并使用 `ESCAPE '\'`。
- `minQueryLength` 不达标时**不追加任何 WHERE**，避免退化为全表扫描。

> **建议**：简单场景用 LIKE；复杂场景通过 `buildTextSearch` 封装（如 PostgreSQL `tsvector`），保持 core/infrastructure 的解耦。

---

### 2) 过滤（Filters）

**选项**

- `allowedFilters?: string[]`：**业务字段**白名单。
- `resolveColumn(field)`：业务字段 → 安全列（或别名列）。必须与白名单一一对应。
- `normalizeFilterValue?({ field, raw })`：将 `"false"/"0"` 等归一化为 `boolean/number`。
- `buildFilter?({ field, column, value })`：返回 `{ clause, params }` 自定义子句（`IN`/`BETWEEN`/`IS NULL` 等）；未提供则回退为等值匹配 `column = :f_field`。

**示例片段**

```ts
normalizeFilterValue: ({ field, raw }) => {
  if (field === 'enabled') return raw === true || raw === 'true' || raw === '1';
  if (field === 'minAge') return Number(raw);
  return raw;
},
buildFilter: ({ field, column, value }) => {
  if (field === 'ids' && Array.isArray(value)) {
    return { clause: `${column} IN (:...ids)`, params: { ids: value } };
  }
  if (field === 'dateTo') {
    return { clause: `${column} <= :to`, params: { to: value } };
  }
  return null; // 回退等值
},
```

---

### 3) 排序（Sorting）

**选项**

- `defaultSorts: SortParam[]`：缺省排序（如 `[{ field: 'createdAt', direction: 'DESC' }, { field: 'id', direction: 'DESC' }]`）。
- `allowedSorts: string[]`：**业务字段**白名单；与 `resolveColumn` 必须一致。
- `cursorKey?: { primary: string; tieBreaker: string }`：启用游标稳定性（**CURSOR 模式下必须提供**）。

**实现要点**

- 始终通过白名单 + `resolveColumn` 解析，**禁止**直接使用外部传入列名。
- 若提供了 `cursorKey`，即使在 OFFSET 模式，也会**尽量补齐副键排序**以稳定顺序。

---

### 4) 分页（Pagination）

**OFFSET 模式**

- 入参：`page`, `pageSize`, `withTotal?`。
- 计数：
  - join 或多行同实体时，建议传入 `countDistinctBy`（安全列或 `别名.列`），内部执行 `COUNT(DISTINCT ...)`。
  - 计数时会清理 `ORDER BY` 提升性能。

**CURSOR 模式**

- `after` / `before` 互斥（违规抛 `INVALID_CURSOR`）。
- SearchEngine 仅返回 `items` 与 `pageInfo.hasNext/hasPrev`，不生成 `nextCursor/prevCursor` 文本；如需游标字符串，请在上层通过 signer 生成。
- `after`：按已应用的排序方向拉取数据，`pageInfo.hasNext = hasExtra`，`pageInfo.hasPrev = undefined`。
- `before`：查询阶段反向排序拉取，随后翻转为正序返回；`pageInfo.hasPrev = hasExtra`，`pageInfo.hasNext = undefined`（如需严格布尔可在适配层轻查询或置为 `false`）。
- 当提供 `after` 或 `before` 时，必须同时通过 `options.cursorToken` 传入已验证的游标令牌（由上层 `signer.verify(cursor)` 解析）；缺失将抛出 `INVALID_CURSOR`。

---

### 5) 游标（Cursor）

**`CursorToken` 值对象**

```ts
interface CursorToken {
  key: string; // 应与 cursorKey.primary 一致
  primaryValue: string | number; // 游标主键比较值
  tieField?: string; // 应与 cursorKey.tieBreaker 一致（可选）
  tieValue: string | number; // 游标副键比较值
}
```

**一致性与类型建议**

- **强一致校验**：签名游标签名与 `cursorKey.primary` 不一致 → `INVALID_CURSOR`。
- 数值列 → 使用 **number**；日期列 → 使用 **ISO 字符串**或**epoch**，前后保持一致，避免不同驱动的比较差异。

---

## SearchEngine 与 Paginator 的边界

- `TypeOrmSearch`：
  - **负责**搜索/过滤/排序与分页查询；
  - **不生成** `nextCursor/prevCursor` 文本，由上层统一用 signer 生成（保持 core 纯净）。

- `TypeOrmPaginator`：
  - 专注分页；
  - 内部调用 signer，**直接生成** `nextCursor/prevCursor`；
  - 适合“无文本搜索但需要游标翻页”的列表页。

> 二者可并存：复杂搜索用 SearchEngine；通用列表可直接用 Paginator。团队需按场景选用，避免混用职责。

---

 

## 使用示例（简版伪代码）

```ts
/**
 * 演示 SearchEngine 在 CURSOR 模式下的调用：
 * 1. 通过 signer.verify 解析 after 游标为 CursorToken，并传入 options.cursorToken
 * 2. SearchEngine 返回 items 与 pageInfo（hasNext/hasPrev），不生成游标文本
 */
const token: CursorToken = signer.verify(after);

const options: SearchOptions = {
  searchColumns: ['u.name', 'u.email'],
  minQueryLength: 2,
  defaultSorts: [
    { field: 'createdAt', direction: 'DESC' },
    { field: 'id', direction: 'DESC' },
  ],
  allowedSorts: ['createdAt', 'id'],
  cursorKey: { primary: 'createdAt', tieBreaker: 'id' },
  resolveColumn: (f) => (f === 'createdAt' ? 'u.created_at' : f === 'id' ? 'u.id' : null),
  cursorToken: token,
};

const res = await searchService.search<UserDTO>({
  qb,
  params: { mode: 'CURSOR', limit: 20, after },
  options,
});
```

> `before` 的示例与上类似，只是 `params` 用 `before`。
> OFFSET 模式可传 `countDistinctBy: 'u.id'` 保证总数准确。

---

## 对齐与约束（**务必阅读**）

1. **排序对齐**
   - **Paginator 假设调用方已设置与 `cursor.directions` 一致的排序**；
   - `before` 分支内部会反向排序；**`after` 分支依赖外部排序**与游标边界一致；
   - **必须确保主键与副键排序项位于前两位**，否则游标边界可能失效或出现跳页/重复。

2. **`allowedSorts` 与 `resolveColumn` 一致性**
   - 开发态建议对 `allowedSorts` **全量校验**：任一字段无法被 `resolveColumn` 解析即抛错。

3. **`addSortColumnsToSelect` 与 DISTINCT 冲突**
   - 若上层使用 `SELECT DISTINCT` 或 `qb.expressionMap.distinct === true`，**请勿**开启 `addSortColumnsToSelect`，否则可能改变去重列集造成结果膨胀。

4. **计数与性能**
   - join / group by 场景请提供 `countDistinctBy`；
   - 计数前会清理 `ORDER BY`；
   - 文本搜索请配置合理的 `minQueryLength`（建议 ≥2）。

5. **安全**
   - 所有值通过命名参数传入；
   - 列名一律走白名单 + `resolveColumn` 解析，**禁止**透传来自外部的原始列名。

---

## 与 GraphQL / DTO 的适配

- 若 GraphQL 的 `PageInfo.hasNext` 定义为**必填布尔**而需要支持 `before`：
  - 方案 A：把 GraphQL schema 改为可选；
  - 方案 B：在 resolver 层对 `before` 做一次轻查询得出布尔，或回退为 `false`。

- DTO / Resolver 层不要直接做副作用；统一走模块内的 service 与本 Search/Paginator 管线。

---

## 常见问题排查（FAQ）

- **翻页重复/跳页**
  - 检查排序：主键 + 副键是否为前两位？`cursorKey` 是否与排序字段一致？
  - 检查游标类型：日期/数值的序列化是否前后不一致？

- **搜索没有生效**
  - `searchColumns` 是否为空？
  - `query.trim().length` 是否小于 `minQueryLength`？
  - `buildTextSearch` 是否覆盖了内置逻辑且返回了 `null`？

- **计数不准确**
  - join 场景是否提供了 `countDistinctBy`？
  - 计数是否受 DISTINCT / GROUP BY 影响？

- **排序字段报错**
  - `allowedSorts` 与 `resolveColumn` 是否完全一致？
  - 是否把**业务字段**误当成了**物理列名**？

---

## 测试清单（建议覆盖）

1. **游标对称性**：`after` 与 `before` 在大量副键重复时无重/漏，`before` 返回顺序为正序。
2. **外部排序缺失**：`after` 分支若未按主键/副键排序，能否通过测试捕获不稳定（期望抛错或文档强约束）。
3. **`countDistinctBy`**：多表 join + DISTINCT 计数准确。
4. **类型一致性**：主键 int、副键 datetime（ISO/epoch）两种 token 组合比较正确。
5. **`minQueryLength`**：`"   "` 不触发搜索；`"a"`（当阈值为 1）触发；当阈值为 2 时 `"a"` 不触发。
6. **`buildFilter`**：`IN` / `BETWEEN` / `IS NULL` 的正确参数绑定。
7. **`addSortColumnsToSelect` 与 DISTINCT**：启用时会拒绝/告警，或在文档约束下通过用例验证禁止组合。

---

## 迁移指引（从旧实现）

- 如果旧实现手动拼接 `LIKE '%q%'`：迁移到 `buildTextSearch` 或使用内置模式（记得配置 `minQueryLength`）。
- 如果旧实现的游标字段命名为 `value/id/tieKey`：统一为 `primaryValue/tieValue/tieField`。
- GraphQL 的 `PageInfo` 若将 `hasNext` 设为必填，且需要 `before`：参见“与 GraphQL / DTO 的适配”。

---

## 附：示例约定（建议）

- **默认排序**：所有支持游标的列表，默认排序约定为 **`[primary DESC, tieBreaker DESC]`** 或 **`[primary ASC, tieBreaker ASC]`**，避免跨页插入/删除引发顺序漂移。
- **日期/时间列**：统一在查询层将 `Date` 转为 ISO 字符串或 epoch（数值），签名与比较的类型保持一致。
- **字段命名**：`cursorKey.primary/tieBreaker` 使用**业务字段名**，并通过 `resolveColumn` 映射到具体列；对外不暴露物理列名。

---

如需扩展（前缀匹配、词干还原、字段权重、多语言分词），请通过 `buildTextSearch` 注入定制逻辑；保持 **core 零副作用 / 零驱动依赖** 的原则，把具体实现放在 infrastructure 层或通过模块 service 注入。

---

## 实现校验差异说明（SearchEngine 与 Paginator）

- `TypeOrmSearch` 在解析游标时会校验：
  - `token.key` 必须与 `cursorKey.primary` 一致；
  - 若提供了 `token.tieField`，则必须与 `cursorKey.tieBreaker` 一致；
  - 任一不一致将抛出 `INVALID_CURSOR`。

- `TypeOrmPaginator` 当前仅校验：
  - `token.key` 与 `cursor.key.primary` 一致；
  - 不强制校验 `token.tieField`（允许缺省）。

> 若业务需要在分页器侧也强制副键校验，可在 `paginateCursor` 的 `after/before` 分支加入对 `token.tieField === cursor.key.tieBreaker` 的校验，保持更严格的一致性。

---

## 集成检查清单（落地前务必自检）

- 排序对齐
  - 外部 `ORDER BY` 与 `cursor.directions` 必须一致；
  - 主键与副键位于排序前两位；
  - `before` 模式内部会反向排序并在返回前翻转结果为正序。

- 游标键与列解析
  - 提供 `cursorKey.primary/tieBreaker`（CURSOR 模式必需）；
  - `resolveColumn` 能解析到安全物理列或别名列；
  - `allowedSorts` 与 `resolveColumn` 一致（建议开发态全量校验）。

- 文本搜索与过滤
  - 配置合理的 `minQueryLength`（建议 ≥ 2），避免退化为全表扫描；
  - 自定义 `buildTextSearch`/`buildFilter` 返回 `{ clause, params }` 保证参数化；
  - 统一大小写比较与字符转义（`ESCAPE '\'`）。

- 计数与性能
  - join 场景提供 `countDistinctBy`；
  - COUNT 前清理排序；
  - 避免与 `SELECT DISTINCT` 同时启用 `addSortColumnsToSelect` 导致结果膨胀。

- GraphQL / DTO 适配
  - 若暴露 `before` 语义，`PageInfo.hasNext` 建议改为可选，或在适配层按需回退为严格布尔；
  - DTO / Resolver 不做副作用注册，统一走模块内 service 与 schema.init。

- 类型一致性（游标值）
  - 数值用 `number`，日期统一为 ISO 字符串或 epoch；
  - 签名与比较的类型保持一致，避免驱动差异导致边界不稳定。

---

## 错误码对照（domain-error）

- `INVALID_CURSOR`：游标参数非法、签名与 `cursorKey` 不一致、`after`/`before` 互斥违规等。
- `SORT_FIELD_NOT_ALLOWED`：排序字段未通过白名单与列解析校验。
- `DB_QUERY_FAILED`：底层查询错误或 COUNT 表达式非法（如 `countDistinctBy` 传入表达式）。
