// e2e/login-flow.spec.ts

import { expect, type Page, test } from '@playwright/test';

const AUTH_SESSION_STORAGE_KEY = 'lithography-platform.auth-session.v1';

// 预置会话快照的唯一收口：字段布局与版本跟随 auth-session-storage 的持久化格式，
// 格式升版时只需要改这里。
async function seedAuthSession(page: Page, role: 'CUSTOMER' | 'ENGINEER' | 'SUPER_ADMIN') {
  await page.evaluate(
    ({ key, role: seededRole }) => {
      sessionStorage.setItem(
        key,
        JSON.stringify({
          accessToken: 'test-only-access-token',
          accountId: 900201,
          role: seededRole,
          userInfo: {
            accessGroup: [seededRole],
            nickname: '测试会话',
          },
          version: 1,
        }),
      );
    },
    { key: AUTH_SESSION_STORAGE_KEY, role },
  );
}

test('anonymous engineer visit completes the public login flow and returns to the target', async ({
  page,
}) => {
  let loginAuthorization: string | undefined;

  await page.route('**/graphql', async (route) => {
    const request = route.request();
    const payload = request.postDataJSON() as {
      query?: string;
      variables?: {
        input?: Record<string, unknown>;
      };
    };

    expect(payload.query).toContain('mutation LoginWithPassword');
    expect(payload.variables?.input).toMatchObject({
      audience: 'SSTSWEB',
      loginName: 'mock_engineer_chen',
      loginPassword: 'test-only-password',
      type: 'PASSWORD',
    });
    loginAuthorization = request.headers().authorization;

    await route.fulfill({
      body: JSON.stringify({
        data: {
          login: {
            accessToken: 'test-only-access-token',
            accountId: 900101,
            role: 'ENGINEER',
            userInfo: {
              accessGroup: ['ENGINEER'],
              nickname: '陈工',
            },
          },
        },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.goto('/engineer');
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fengineer$/);

  await page.getByLabel('账号或邮箱').fill('mock_engineer_chen');
  await page.getByLabel('密码').fill('test-only-password');
  await page.getByRole('button', { name: /登\s*录/ }).click();

  await expect(page).toHaveURL(/\/engineer$/);
  await expect(page.getByText('登录成功')).toBeVisible();
  await expect(page.getByText('ENGINEER').first()).toBeVisible();
  expect(loginAuthorization).toBeUndefined();

  const storedSession = await page.evaluate(
    (key) => sessionStorage.getItem(key),
    AUTH_SESSION_STORAGE_KEY,
  );
  expect(storedSession).toContain('"accessToken":"test-only-access-token"');
  expect(storedSession).not.toContain('refreshToken');
});

test('credential rejection keeps the login name, clears the password and creates no session', async ({
  page,
}) => {
  await page.route('**/graphql', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        errors: [
          {
            extensions: { code: 'UNAUTHENTICATED' },
            message: 'internal credential detail',
          },
        ],
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.goto('/login');
  await page.getByLabel('账号或邮箱').fill('mock_engineer_chen');
  await page.getByLabel('密码').fill('wrong-password');
  await page.getByRole('button', { name: /登\s*录/ }).click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('账号或密码错误，请检查后重试。')).toBeVisible();
  await expect(page.getByLabel('账号或邮箱')).toHaveValue('mock_engineer_chen');
  await expect(page.getByLabel('密码')).toHaveValue('');
  await expect(page.getByText('internal credential detail')).toHaveCount(0);

  const storedSession = await page.evaluate(
    (key) => sessionStorage.getItem(key),
    AUTH_SESSION_STORAGE_KEY,
  );
  expect(storedSession).toBeNull();
});

test('entry route dispatches by login state', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);

  await seedAuthSession(page, 'CUSTOMER');

  await page.goto('/');
  await expect(page).toHaveURL(/\/customer$/);
});
