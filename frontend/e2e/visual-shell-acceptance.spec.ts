import { expect, test } from '@playwright/test';

import { seedAuthSession } from './helpers/auth-session-seed';

// 与 visual-shell.spec.ts 保持一致：壳层验收不依赖业务后端，但访问管理员页时
// 必须给 mapper 一个合法的空 DTO，不能让空响应把已种入的会话误判成失效。
test.beforeEach(async ({ page }) => {
  await page.route('**/graphql', async (route) => {
    const requestBody = route.request().postDataJSON() as { operationName?: string } | null;
    const data =
      requestBody?.operationName === 'AdminUsers'
        ? { adminUsers: { items: [], page: 1, pageSize: 20, total: 0 } }
        : {};

    await route.fulfill({
      body: JSON.stringify({ data }),
      contentType: 'application/json',
      status: 200,
    });
  });
});

async function setFontScale(page: import('@playwright/test').Page, value: string) {
  await page.evaluate((scale) => localStorage.setItem('font-scale', scale), value);
  await page.reload();
}

test('M 档在真实 AppLayout 中匹配 gkj 共享视觉数值', async ({ page }, testInfo) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  await seedAuthSession(page, 'SUPER_ADMIN');
  await page.goto('/dev/shared-ui');
  await page.evaluate(() => document.fonts.ready);

  const snapshot = await page.evaluate(() => {
    const style = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`missing selector: ${selector}`);
      return getComputedStyle(element);
    };
    const pill = style('.status-pill--ok');
    const panel = style('.data-card');
    const title = style('.page-title');
    const description = style('.page-description');
    const nav = style('.app-nav-item');
    const sidebar = style('.app-sidebar');
    const workspace = style('.app-workspace');

    return {
      description: {
        color: description.color,
        fontSize: description.fontSize,
        lineHeight: description.lineHeight,
        marginTop: description.marginTop,
      },
      nav: { color: nav.color, fontSize: nav.fontSize, fontWeight: nav.fontWeight },
      panel: {
        backgroundColor: panel.backgroundColor,
        borderRadius: panel.borderRadius,
        boxShadow: panel.boxShadow,
      },
      pill: {
        backgroundColor: pill.backgroundColor,
        color: pill.color,
        fontSize: pill.fontSize,
        lineHeight: pill.lineHeight,
      },
      rootFontSize: getComputedStyle(document.documentElement).fontSize,
      sidebar: {
        backgroundColor: sidebar.backgroundColor,
        borderRightColor: sidebar.borderRightColor,
        boxShadow: sidebar.boxShadow,
        width: sidebar.width,
      },
      title: { color: title.color, fontSize: title.fontSize, lineHeight: title.lineHeight },
      workspace: { backgroundImage: workspace.backgroundImage, paddingTop: workspace.paddingTop },
    };
  });

  expect(snapshot.rootFontSize).toBe('16px');
  expect(snapshot.nav).toEqual({ color: 'rgb(71, 85, 105)', fontSize: '12px', fontWeight: '600' });
  expect(snapshot.title).toEqual({
    color: 'rgb(30, 41, 59)',
    fontSize: '24px',
    lineHeight: '32px',
  });
  expect(snapshot.description).toEqual({
    color: 'rgb(100, 116, 139)',
    fontSize: '14px',
    lineHeight: '20px',
    marginTop: '4px',
  });
  expect(snapshot.pill).toEqual({
    backgroundColor: 'rgb(220, 252, 231)',
    color: 'rgb(22, 101, 52)',
    fontSize: '10px',
    lineHeight: '15px',
  });
  expect(snapshot.workspace.backgroundImage).toContain('linear-gradient');
  expect(snapshot.workspace.backgroundImage).toContain('rgb(248, 250, 252)');
  expect(snapshot.workspace.backgroundImage).toContain('rgb(238, 242, 247)');
  expect(snapshot.workspace.paddingTop).toBe('22px');
  expect(snapshot.sidebar.width).toBe('210px');
  expect(snapshot.sidebar.backgroundColor).toBe('rgb(248, 250, 252)');
  expect(snapshot.sidebar.borderRightColor).toBe('rgb(203, 213, 225)');
  expect(snapshot.sidebar.boxShadow).toBe('rgba(15, 23, 42, 0.08) 8px 0px 24px 0px');
  expect(snapshot.panel.backgroundColor).toBe('rgba(255, 255, 255, 0.92)');
  expect(snapshot.panel.borderRadius).toBe('14px');
  expect(snapshot.panel.boxShadow).toBe('rgba(15, 23, 42, 0.06) 0px 10px 30px 0px');

  await testInfo.attach('computed-style-M-1440x900.json', {
    body: JSON.stringify(snapshot, null, 2),
    contentType: 'application/json',
  });
  await page.screenshot({
    path: testInfo.outputPath('shared-shell-M-1440x900.png'),
    fullPage: true,
  });
});

test('导航 hover/active、三种状态底色和 S/M/L 往返均在真实浏览器生效', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ height: 768, width: 1366 });
  await seedAuthSession(page, 'SUPER_ADMIN');
  await page.goto('/dev/shared-ui');

  const nav = page.getByRole('navigation', { name: '主导航' });
  const link = nav.getByRole('link', { name: '用户管理' });
  await link.hover();
  await expect(link).toHaveCSS('background-color', 'rgb(229, 231, 235)');
  await expect(link).toHaveCSS('color', 'rgb(17, 24, 39)');
  await link.click();
  await page.mouse.move(0, 0);
  await expect(link).toHaveClass(/app-nav-item--active/);
  await expect(link).toHaveCSS('background-color', 'rgb(219, 234, 254)');
  await expect(link).toHaveCSS('color', 'rgb(29, 78, 216)');

  // active+hover（验收报告 20260916 P1）：悬停已激活项不得丢失 active 视觉
  await link.hover();
  await expect(link).toHaveClass(/app-nav-item--active/);
  await expect(link).toHaveCSS('background-color', 'rgb(219, 234, 254)');
  await expect(link).toHaveCSS('color', 'rgb(29, 78, 216)');
  await page.mouse.move(0, 0);

  await page.goto('/dev/shared-ui');
  await expect(page.locator('.status-pill--ok').first()).toHaveCSS(
    'background-color',
    'rgb(220, 252, 231)',
  );
  await expect(page.locator('.status-pill--warn').first()).toHaveCSS(
    'background-color',
    'rgb(254, 243, 199)',
  );
  await expect(page.locator('.status-pill--critical').first()).toHaveCSS(
    'background-color',
    'rgb(254, 226, 226)',
  );

  const measure = () =>
    page.evaluate(() => ({
      antd: getComputedStyle(document.querySelector('.ant-segmented-item-label')!).fontSize,
      nav: getComputedStyle(document.querySelector('.app-nav-item')!).fontSize,
      pill: getComputedStyle(document.querySelector('.status-pill')!).fontSize,
      root: getComputedStyle(document.documentElement).fontSize,
    }));

  expect(await measure()).toEqual({ antd: '14px', nav: '12px', pill: '10px', root: '16px' });
  await setFontScale(page, 'compact');
  expect(await measure()).toEqual({ antd: '12px', nav: '10.5px', pill: '8.75px', root: '14px' });
  await setFontScale(page, 'comfortable');
  expect(await measure()).toEqual({ antd: '16px', nav: '13.5px', pill: '11.25px', root: '18px' });
  await setFontScale(page, 'standard');
  expect(await measure()).toEqual({ antd: '14px', nav: '12px', pill: '10px', root: '16px' });
  await page.reload();
  expect((await measure()).root).toBe('16px');
  await page.screenshot({
    path: testInfo.outputPath('shared-shell-M-1366x768.png'),
    fullPage: true,
  });
});
