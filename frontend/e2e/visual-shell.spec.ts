// e2e/visual-shell.spec.ts
// PR1 视觉底座浏览器级验收（外审 R2 P1-01）：真实浏览器 + 真实路由树（protectedRouteLoader
// 参与执行），会话经 seedAuthSession 种入；GraphQL 一律 stub——壳层验收不依赖后端业务数据。

import { expect, test } from '@playwright/test';

import { seedAuthSession } from './helpers/auth-session-seed';

// GraphQL stub：壳层验收只关心导航/布局，但仍返回已访问页面所需的最小合法 DTO。
// 不能把 `{ data: {} }` 当成空态：管理员 mapper 会把它判为外部契约异常，污染
// 浏览器日志并掩盖真正的壳层报错。
test.beforeEach(async ({ page }) => {
  await page.route('**/graphql', async (route) => {
    const requestBody = route.request().postDataJSON() as { operationName?: string } | null;
    const data =
      requestBody?.operationName === 'AdminUsers'
        ? {
            adminUsers: {
              items: [],
              page: 1,
              pageSize: 20,
              total: 0,
            },
          }
        : {};

    await route.fulfill({
      body: JSON.stringify({ data }),
      contentType: 'application/json',
      status: 200,
    });
  });
});

test('seeded roles see only their own stable menu items in the sidebar', async ({ page }) => {
  const expectations: Array<{
    path: string;
    role: 'CUSTOMER' | 'ENGINEER' | 'SUPER_ADMIN';
    visible: string[];
    hidden: string[];
  }> = [
    {
      hidden: ['维修申请', '参考资料', '用户管理'],
      path: '/customer',
      role: 'CUSTOMER',
      visible: ['首页', '发起申请', '我的申请'],
    },
    {
      hidden: ['发起申请', '我的申请', '用户管理'],
      path: '/engineer',
      role: 'ENGINEER',
      visible: ['首页', '维修申请', '参考资料'],
    },
    {
      hidden: ['发起申请', '我的申请', '维修申请'],
      path: '/admin/users',
      role: 'SUPER_ADMIN',
      visible: ['首页', '参考资料', '用户管理'],
    },
  ];

  for (const expectation of expectations) {
    await seedAuthSession(page, expectation.role);
    await page.goto(expectation.path);

    const nav = page.getByRole('navigation', { name: '主导航' });

    for (const label of expectation.visible) {
      await expect(nav.getByRole('link', { name: label })).toBeVisible();
    }
    for (const label of expectation.hidden) {
      await expect(nav.getByRole('link', { name: label })).toHaveCount(0);
    }
  }
});

test('refreshing a business child route restores the active menu item by prefix', async ({
  page,
}) => {
  await seedAuthSession(page, 'SUPER_ADMIN');
  // 直接打开子路由等价于刷新场景：完整路由树 + loader 参与执行
  await page.goto('/admin/users');

  const userManagement = page.getByRole('navigation', { name: '主导航' }).getByRole('link', {
    name: '用户管理',
  });

  await expect(userManagement).toBeVisible();
  await expect(userManagement).toHaveAttribute('aria-current', 'page');
  await expect(
    page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '首页' }),
  ).not.toHaveAttribute('aria-current', 'page');
});

test('anonymous direct access to a protected URL is redirected to login with returnTo', async ({
  page,
}) => {
  await page.goto('/admin/users');

  await expect(page).toHaveURL(/\/login\?returnTo=%2Fadmin%2Fusers$/);
  // 匿名态侧栏仍渲染（登录页位于壳层内），但受保护入口不出现
  await expect(
    page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '用户管理' }),
  ).toHaveCount(0);
  await expect(page.getByLabel('账号或邮箱')).toBeVisible();
});

test('collapse toggle switches the sidebar between expanded and collapsed', async ({ page }) => {
  await seedAuthSession(page, 'CUSTOMER');
  await page.goto('/customer');

  const collapseButton = page.getByRole('button', { name: '折叠导航' });

  await expect(page.getByText('光刻维护平台')).toBeVisible();
  await collapseButton.click();
  await expect(page.getByRole('button', { name: '展开导航' })).toBeVisible();
  await expect(page.getByText('光刻维护平台')).toBeHidden();
  await page.getByRole('button', { name: '展开导航' }).click();
  await expect(page.getByRole('button', { name: '折叠导航' })).toBeVisible();
  await expect(page.getByText('光刻维护平台')).toBeVisible();
});

test.describe('task-book viewports show no horizontal overflow and keep the user card reachable', () => {
  for (const viewport of [
    { height: 768, name: '1366x768', width: 1366 },
    { height: 900, name: '1440x900', width: 1440 },
  ] as const) {
    test(`viewport ${viewport.name}: no horizontal scroll, sidebar and logout visible`, async ({
      page,
    }) => {
      await page.setViewportSize({ height: viewport.height, width: viewport.width });
      await seedAuthSession(page, 'CUSTOMER');
      await page.goto('/customer');

      // 无横向滚动：根元素滚动宽度不超过视口
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);

      // 侧栏与底部退出入口都落在视口内（用户卡不被长内容推离）
      const sidebar = page.locator('aside.app-sidebar');
      await expect(sidebar).toBeVisible();
      const sidebarBox = await sidebar.boundingBox();
      expect(sidebarBox).not.toBeNull();
      expect(sidebarBox?.y).toBe(0);
      expect(sidebarBox?.height).toBeLessThanOrEqual(viewport.height);

      // 页面内可能有同名按钮（如客户页自带的会话面板），只认侧栏里的这个
      const logoutButton = page
        .getByRole('complementary')
        .getByRole('button', { name: /退出登录/ });
      await expect(logoutButton).toBeVisible();
      const logoutBox = await logoutButton.boundingBox();
      expect(logoutBox).not.toBeNull();
      expect((logoutBox?.y ?? 0) + (logoutBox?.height ?? 0)).toBeLessThanOrEqual(viewport.height);
    });
  }

  test('viewport 375x667: sidebar auto-collapses (S4 narrow viewport policy)', async ({ page }) => {
    await page.setViewportSize({ height: 667, width: 375 });
    await seedAuthSession(page, 'CUSTOMER');
    await page.goto('/customer');

    await expect(page.getByRole('button', { name: '展开导航' })).toBeVisible();
  });
});
