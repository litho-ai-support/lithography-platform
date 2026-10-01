// src/pages/customer/repair-request-detail/repair-request-id-param.ts

/**
 * 客户维修申请详情路由参数解析（窄作用域，2026-10-02 复审修复；路由边界唯一契约）。
 *
 * 只接受规范十进制正整数（`[1-9]\d*`：无前导零 / 符号 / 小数 / 科学计数法 /
 * 十六进制 / 空白），并同时满足 Number.isSafeInteger 与 GraphQL Int 正数范围
 * 1..2147483647；其余（空 / 缺失 / 0 / 负数 / 小数 / 上溢 / NaN / Infinity）一律归为 null。
 *
 * 非法值绝不进入工作台详情 hook 与 adapter：NaN 曾触发详情 hook 渲染期 setState
 * 死循环（Too many re-renders），数值型非法值也会以非法 Int! 变量打到后端。
 * 非法详情 URL 由工作台按统一 not-found 直显（与后端防探测一致，不发起详情 I/O）。
 *
 * 与路由组件分离为独立模块：页面文件只允许导出组件
 * （react-refresh/only-export-components），解析边界矩阵由 index.spec.tsx
 * 直接针对本模块断言（页面目录内多文件组织同 shared-ui-gallery 先例）。
 */

/** GraphQL Int 最大值（2^31−1）：详情目标 ID 以 Int! 变量下传，超出即非法 */
const MAX_GRAPHQL_INT = 2_147_483_647;

export function parseRepairRequestIdParam(raw: string | undefined): number | null {
  if (raw === undefined || !/^[1-9]\d*$/.test(raw)) {
    return null;
  }

  const parsed = Number(raw);

  return Number.isSafeInteger(parsed) && parsed <= MAX_GRAPHQL_INT ? parsed : null;
}
