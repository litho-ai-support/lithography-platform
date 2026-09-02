// e2e/repair-request-manage.spec.ts
// 客户「我的维修申请」列表 / 详情 / 删除 e2e：路由守卫、可发现性与 Token 失效链路。
//
// 数据来源说明：T-02 后 barrel 已指向真实 GraphQL adapter，页面会发起真实请求；
// 本文件只保留不依赖真实数据的用例（守卫重定向、入口可达、失效链路），
// 依赖页面稳定渲染的用例通过拦截列表 Query 隔离数据层（见 fulfillEmptyListQuery）；
// 真实后端数据流用例（列表/详情/删除/越权/角色）见 repair-request-manage-real.spec.ts。

import { expect, type Page, test } from '@playwright/test';

import { seedAuthSession } from './helpers/auth-session-seed';

const LIST_PATH = '/customer/repair-requests';
const CUSTOMER_HOME_PATH = '/customer';
// 详情守卫断言用的样例 ID（不发起该 ID 的数据断言）
const DETAIL_SAMPLE_ID = 920002;

// ---------- 路由守卫（protectedRouteLoader 复用，角色语义与创建页同源） ----------

test('anonymous visit to the list is redirected to login with returnTo', async ({ page }) => {
  await page.goto(LIST_PATH);
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fcustomer%2Frepair-requests$/);
});

test('anonymous visit to the detail is redirected to login with returnTo', async ({ page }) => {
  await page.goto(`${LIST_PATH}/${DETAIL_SAMPLE_ID}`);
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fcustomer%2Frepair-requests%2F920002$/);
});

test('engineer visit to the list is redirected to the role home', async ({ page }) => {
  await seedAuthSession(page, 'ENGINEER');
  await page.goto(LIST_PATH);
  await expect(page).toHaveURL(/\/engineer$/);
});

// T-02 后页面发起真实 GraphQL 请求，但 seedAuthSession 的是假 Token：
// 不 mock 时 401 会触发全局失效链路（清会话+跳登录），与守卫断言竞态。
// 守卫 / 可发现性用例只关心路由层，统一拦截列表 Query 返回空页数据隔离数据层。
async function fulfillEmptyListQuery(page: Page): Promise<void> {
  await page.route('**/graphql', (route) =>
    route.fulfill({
      body: JSON.stringify({
        data: { myRepairRequests: { items: [], total: 0, page: 1, pageSize: 10 } },
      }),
      contentType: 'application/json',
      status: 200,
    }),
  );
}

// 负责人裁定 2：不扩大 SUPER_ADMIN 拒绝范围（拒绝清单仅拒 /new）；
// 超管继承放行列表与详情，数据过滤（本人名下=空态）由阶段三后端按身份保证。
test('super admin can enter the list like a customer (deny list not widened)', async ({ page }) => {
  await seedAuthSession(page, 'SUPER_ADMIN');
  await fulfillEmptyListQuery(page);
  await page.goto(LIST_PATH);

  await expect(page).toHaveURL(new RegExp(LIST_PATH));
  await expect(page.getByText('我的维修申请').first()).toBeVisible();
});

// ---------- 可发现性（负责人裁定：不留只能手输 URL 到达的页面） ----------

test('customer reaches the list by clicking the entry on the customer home', async ({ page }) => {
  await seedAuthSession(page, 'CUSTOMER');
  await fulfillEmptyListQuery(page);

  await page.goto(CUSTOMER_HOME_PATH);
  await page.getByRole('button', { name: '查看维修申请' }).click();

  await expect(page).toHaveURL(new RegExp(LIST_PATH));
  await expect(page.getByText('我的维修申请').first()).toBeVisible();
});

// ---------- Token 失效链路（protected 通道 401 -> 清会话 -> 登录页，复用既有失效断言口径） ----------

test('401 from the protected channel clears the session and redirects to login with returnTo', async ({
  page,
}) => {
  await seedAuthSession(page, 'CUSTOMER');

  // 拦截列表 Query 返回 UNAUTHENTICATED（与后端失效响应同一大类码），
  // 触发 createGraphQLAuthFailureHandler 收敛的一次清理 + 一次导航。
  await page.route('**/graphql', (route) =>
    route.fulfill({
      body: JSON.stringify({
        errors: [{ extensions: { code: 'UNAUTHENTICATED' }, message: 'internal auth detail' }],
      }),
      contentType: 'application/json',
      status: 200,
    }),
  );

  await page.goto(LIST_PATH);

  await expect(page).toHaveURL(
    /\/login\?reason=session-expired&returnTo=%2Fcustomer%2Frepair-requests$/,
  );
});
