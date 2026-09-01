// e2e/repair-request-manage.spec.ts
// 客户「我的维修申请」列表 / 详情 / 删除 e2e（阶段一）。
//
// 数据来源说明：当前 barrel 指向前端 Mock adapter（模块内静态数据，不产生 GraphQL 请求），
// 因此本文件用 seedAuthSession 纯前端种会话即可运行，不依赖真实后端；
// 阶段三（T-01/T-02）barrel 切换真实 adapter 后，路由守卫与交互流程用例原样保留，
// 数据断言改为对齐后端 seed（T-08 届时再补真实链路与越权数据用例）。

import { expect, test } from '@playwright/test';

import { seedAuthSession } from './helpers/auth-session-seed';

const LIST_PATH = '/customer/repair-requests';
const CUSTOMER_HOME_PATH = '/customer';
// Mock 数据集（repair-request-read-mock-data.ts）：920001 未接单可删、920002 已接单带回复
const DETAIL_UNACCEPTED_ID = 920001;
const DETAIL_ACCEPTED_ID = 920002;

// ---------- 路由守卫（protectedRouteLoader 复用，角色语义与创建页同源） ----------

test('anonymous visit to the list is redirected to login with returnTo', async ({ page }) => {
  await page.goto(LIST_PATH);
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fcustomer%2Frepair-requests$/);
});

test('anonymous visit to the detail is redirected to login with returnTo', async ({ page }) => {
  await page.goto(`${LIST_PATH}/${DETAIL_ACCEPTED_ID}`);
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fcustomer%2Frepair-requests%2F920002$/);
});

test('engineer visit to the list is redirected to the role home', async ({ page }) => {
  await seedAuthSession(page, 'ENGINEER');
  await page.goto(LIST_PATH);
  await expect(page).toHaveURL(/\/engineer$/);
});

// 负责人裁定 2：不扩大 SUPER_ADMIN 拒绝范围（拒绝清单仅拒 /new）；
// 超管继承放行列表与详情，数据过滤（本人名下=空态）由阶段三后端按身份保证。
test('super admin can enter the list like a customer (deny list not widened)', async ({ page }) => {
  await seedAuthSession(page, 'SUPER_ADMIN');
  await page.goto(LIST_PATH);

  await expect(page).toHaveURL(new RegExp(LIST_PATH));
  await expect(page.getByText('我的维修申请').first()).toBeVisible();
});

// ---------- 可发现性（负责人裁定：不留只能手输 URL 到达的页面） ----------

test('customer reaches the list by clicking the entry on the customer home', async ({ page }) => {
  await seedAuthSession(page, 'CUSTOMER');

  await page.goto(CUSTOMER_HOME_PATH);
  await page.getByRole('button', { name: '查看维修申请' }).click();

  await expect(page).toHaveURL(new RegExp(LIST_PATH));
  await expect(page.getByText('我的维修申请').first()).toBeVisible();
});

// ---------- 列表 → 详情 → 删除交互流（Mock 数据驱动，流程选择器阶段三保留） ----------

test('customer sees the mock list, opens the newest detail and returns to the list', async ({
  page,
}) => {
  await seedAuthSession(page, 'CUSTOMER');

  await page.goto(LIST_PATH);
  // Mock 数据 createdAt DESC：0005 最新在首行
  const firstRow = page.getByRole('row', { name: /MOCK-RR-2026-0005/ });
  await expect(firstRow).toBeVisible();
  await expect(firstRow.getByText('待接单')).toBeVisible();

  await firstRow.getByRole('button', { name: '查看详情' }).click();
  await expect(page).toHaveURL(new RegExp(`${LIST_PATH}/920005`));
  await expect(page.getByText('MOCK-RR-2026-0005').first()).toBeVisible();
  // 920005 无回复：不渲染回复时间线
  await expect(page.getByText(/工程师回复/)).toHaveCount(0);

  await page.getByRole('button', { name: '返回列表' }).click();
  await expect(page).toHaveURL(new RegExp(LIST_PATH));
});

test('detail with responses renders the nickname timeline and hides delete when accepted', async ({
  page,
}) => {
  await seedAuthSession(page, 'CUSTOMER');

  await page.goto(`${LIST_PATH}/${DETAIL_ACCEPTED_ID}`);
  await expect(page.getByText('MOCK-RR-2026-0002').first()).toBeVisible();
  // 已接单详情：接单状态呈现且不提供删除入口（前端先按契约隐藏）
  await expect(page.getByText(/已接单（/)).toBeVisible();
  await expect(page.getByRole('button', { name: '删除申请' })).toHaveCount(0);
  // 回复时间线：实时昵称 + 两条回复 + PENDING/RESOLVED 标签，无任何账号 ID 字样
  await expect(page.getByText('李工')).toHaveCount(2);
  await expect(page.getByText('处理中')).toBeVisible();
  await expect(page.getByText('已解决')).toBeVisible();
  await expect(page.getByText(/engineerAccountId|accountId/)).toHaveCount(0);
});

test('customer deletes an unaccepted request from the detail and lands back on the list', async ({
  page,
}) => {
  await seedAuthSession(page, 'CUSTOMER');

  await page.goto(`${LIST_PATH}/${DETAIL_UNACCEPTED_ID}`);
  await expect(page.getByText('MOCK-RR-2026-0001').first()).toBeVisible();

  await page.getByRole('button', { name: '删除申请' }).click();
  await page.getByRole('button', { name: '确认删除' }).click();

  // 删除成功回列表；SPA 内导航保留 Mock 模块状态，已删条目从列表消失
  await expect(page).toHaveURL(new RegExp(LIST_PATH));
  await expect(page.getByText('维修申请已删除。')).toBeVisible();
  await expect(page.getByRole('row', { name: /MOCK-RR-2026-0001/ })).toHaveCount(0);
  await expect(page.getByRole('row', { name: /MOCK-RR-2026-0005/ })).toBeVisible();
});
