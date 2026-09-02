// e2e/engineer-repair-request-flow.spec.ts

import { expect, type Page, type Route, test } from '@playwright/test';

import { seedAuthSession } from './helpers/auth-session-seed';

const ENGINEER_HOME_PATH = '/engineer';
const LIST_PAGE_PATH = '/engineer/repair-requests';

type GraphQLOperationPayload = {
  query?: string;
  variables?: { id?: number; scope?: string };
};

// 与后端真实契约对齐的 mock 数据：字段见 repair-request-read.dto / engineer-repair-request-adapter
const MOCK_MODEL = { id: 8801, modelCode: 'E2E-LS', modelName: '光刻机 E2E' };

function buildDetailDTO(id: number, isAccepted: boolean) {
  return {
    id,
    requestNo: `RR20260902000000AC${id}`,
    equipmentModel: MOCK_MODEL,
    errorCode: 'E-9001',
    faultDescription: '曝光平台漂移，需现场检修',
    contentMd: '# E2E 测试申请',
    createdAt: '2026-09-01T08:00:00.000Z',
    isAccepted,
    acceptedAt: isAccepted ? '2026-09-02T09:00:00.000Z' : null,
    latestResolutionStatus: null,
    responses: [],
  };
}

function fulfillList(route: Route, scope: 'AVAILABLE' | 'MINE') {
  const items =
    scope === 'AVAILABLE'
      ? [
          {
            id: 8802,
            requestNo: 'RR20260902000000AC8802',
            equipmentModel: MOCK_MODEL,
            errorCode: 'E-9001',
            createdAt: '2026-09-01T08:00:00.000Z',
            isAccepted: false,
            acceptedAt: null,
            latestResolutionStatus: null,
          },
        ]
      : [];

  return route.fulfill({
    body: JSON.stringify({
      data: {
        engineerRepairRequests: { items, total: items.length, page: 1, pageSize: 10 },
      },
    }),
    contentType: 'application/json',
    status: 200,
  });
}

function fulfillDetail(route: Route, id: number, isAccepted: boolean) {
  return route.fulfill({
    body: JSON.stringify({ data: { engineerRepairRequest: buildDetailDTO(id, isAccepted) } }),
    contentType: 'application/json',
    status: 200,
  });
}

function fulfillConflict(route: Route) {
  // 与后端 DomainError 真实输出对齐：CONFLICT + REPAIR_REQUEST_ALREADY_ACCEPTED
  return route.fulfill({
    body: JSON.stringify({
      errors: [
        {
          extensions: {
            code: 'CONFLICT',
            errorCode: 'REPAIR_REQUEST_ALREADY_ACCEPTED',
            errorMessage: '维修申请已被接单，请刷新后查看最新状态',
            details: { requestId: 8802 },
          },
          message: 'internal detail',
        },
      ],
    }),
    contentType: 'application/json',
    status: 200,
  });
}

function fulfillAcceptSuccess(route: Route, id: number) {
  return route.fulfill({
    body: JSON.stringify({
      data: { acceptRepairRequest: buildDetailDTO(id, true) },
    }),
    contentType: 'application/json',
    status: 200,
  });
}

function fulfillNotAccessible(route: Route) {
  return route.fulfill({
    body: JSON.stringify({
      errors: [
        {
          extensions: {
            code: 'NOT_FOUND',
            errorCode: 'REPAIR_REQUEST_NOT_FOUND',
            errorMessage: '维修申请不存在或已删除',
          },
          message: 'internal detail',
        },
      ],
    }),
    contentType: 'application/json',
    status: 200,
  });
}

// 按操作名分派 GraphQL mock：列表按 scope 变量区分，详情/接单由各测试注入
async function routeEngineerGraphQL(
  page: Page,
  handlers: {
    onDetail?: (route: Route) => Promise<void> | void;
    onAccept?: (route: Route) => Promise<void> | void;
  } = {},
) {
  let listRequests = 0;
  let acceptRequests = 0;

  await page.route('**/graphql', async (route) => {
    const payload = route.request().postDataJSON() as GraphQLOperationPayload;

    if (payload.query?.includes('query EngineerRepairRequests')) {
      listRequests += 1;
      await fulfillList(route, payload.variables?.scope === 'MINE' ? 'MINE' : 'AVAILABLE');
      return;
    }

    if (payload.query?.includes('mutation AcceptRepairRequest')) {
      acceptRequests += 1;
      await (handlers.onAccept ?? ((r: Route) => fulfillAcceptSuccess(r, 8802)))(route);
      return;
    }

    if (payload.query?.includes('query EngineerRepairRequest')) {
      await (handlers.onDetail ?? ((r: Route) => fulfillDetail(r, 8802, false)))(route);
      return;
    }

    await route.fulfill({ status: 500 });
  });

  return { getListRequests: () => listRequests, getAcceptRequests: () => acceptRequests };
}

async function openDetailFromList(page: Page) {
  await page.goto(ENGINEER_HOME_PATH);
  await page.getByRole('button', { name: '进入维修申请' }).click();
  await expect(page).toHaveURL(new RegExp(LIST_PAGE_PATH));
  await expect(page.getByText('RR20260902000000AC8802')).toBeVisible();

  await page.getByText('RR20260902000000AC8802').click();
  await expect(page).toHaveURL(/\/engineer\/repair-requests\/8802$/);
}

// ---------- 前端浏览器流程测试（GraphQL Mock）：覆盖工程师列表查看与接单闭环 ----------

test('engineer discovers the list from the home entry and opens the detail', async ({ page }) => {
  await seedAuthSession(page, 'ENGINEER');
  await routeEngineerGraphQL(page);

  await openDetailFromList(page);

  await expect(page.getByText('RR20260902000000AC8802')).toBeVisible();
  await expect(page.getByText('曝光平台漂移，需现场检修')).toBeVisible();
  await expect(page.getByRole('button', { name: /^(loading\s+)?接\s*单$/ })).toBeVisible();
});

test('engineer accepts with confirm: exactly one mutation and the panel turns accepted', async ({
  page,
}) => {
  await seedAuthSession(page, 'ENGINEER');
  const { getAcceptRequests, getListRequests } = await routeEngineerGraphQL(page, {
    // 列表失效由 application 层单测覆盖；本浏览器用例只验证接单后详情原子更新
  });

  await openDetailFromList(page);

  await page.getByRole('button', { name: /^(loading\s+)?接\s*单$/ }).click();
  await expect(page.getByText('确认接单该维修申请？')).toBeVisible();
  // 未确认不发送 Mutation
  expect(getAcceptRequests()).toBe(0);

  await page.getByRole('button', { name: '确认接单' }).click();

  await expect(page.getByText('你已接单该维修申请，后续请跟进处理。')).toBeVisible();
  await expect(page.getByText('已接单', { exact: true }).first()).toBeVisible();
  // 只发送一次 Mutation，详情来自 Mutation 返回值，不重查详情
  expect(getAcceptRequests()).toBe(1);
  expect(getListRequests()).toBe(1);
});

test('accept conflict keeps the backend message and offers a way back to the list', async ({
  page,
}) => {
  await seedAuthSession(page, 'ENGINEER');
  let routeDetailRequests = 0;
  const { getAcceptRequests } = await routeEngineerGraphQL(page, {
    // 接单冲突后重查：申请已被接走，当前工程师不再可读
    onAccept: fulfillConflict,
    onDetail: (route) => {
      if (!routeDetailRequests) {
        routeDetailRequests += 1;
        return fulfillDetail(route, 8802, false);
      }

      return fulfillNotAccessible(route);
    },
  });

  await page.goto(`${LIST_PAGE_PATH}/8802`);
  await page.getByRole('button', { name: /^(loading\s+)?接\s*单$/ }).click();
  await page.getByRole('button', { name: '确认接单' }).click();

  // 冲突提示不被通用不可访问文案掩盖
  await expect(page.getByText('维修申请已被接单，请刷新后查看最新状态')).toBeVisible();
  await expect(page.getByRole('button', { name: '返回维修申请列表' })).toBeVisible();
  expect(getAcceptRequests()).toBe(1);

  await page.getByRole('button', { name: '返回维修申请列表' }).click();
  await expect(page).toHaveURL(new RegExp(LIST_PAGE_PATH));
});

test('super admin can read the detail but never sees the accept action', async ({ page }) => {
  await seedAuthSession(page, 'SUPER_ADMIN');
  await routeEngineerGraphQL(page);

  await page.goto(`${LIST_PAGE_PATH}/8802`);

  await expect(page.getByText('RR20260902000000AC8802')).toBeVisible();
  await expect(page.getByRole('button', { name: /^(loading\s+)?接\s*单$/ })).toHaveCount(0);
  await expect(page.getByText('当前账号仅可查看详情，接单需使用工程师账号。')).toBeVisible();
});

test('empty available scope shows the scoped empty state', async ({ page }) => {
  await seedAuthSession(page, 'ENGINEER');
  await routeEngineerGraphQL(page);

  await page.goto(LIST_PAGE_PATH);
  // 默认 AVAILABLE 范围有数据；切到 MINE 范围返回空态
  await page.getByText('我的接单').click();

  await expect(page.getByText('暂无你的接单记录。')).toBeVisible();
});

test('list load failure shows the error with a retry entry', async ({ page }) => {
  await seedAuthSession(page, 'ENGINEER');

  let listRequests = 0;
  await page.route('**/graphql', async (route) => {
    const payload = route.request().postDataJSON() as GraphQLOperationPayload;

    if (payload.query?.includes('query EngineerRepairRequests')) {
      listRequests += 1;
      // 首次 transport 失败（共享错误模型文案），重试放行
      if (listRequests === 1) {
        return route.abort('failed');
      }

      return fulfillList(route, 'AVAILABLE');
    }

    return route.fulfill({ status: 500 });
  });

  await page.goto(LIST_PAGE_PATH);
  await expect(page.getByText('网络连接异常，请稍后重试。')).toBeVisible();

  await page.getByRole('button', { name: /^重\s*试$/ }).click();
  await expect(page.getByText('RR20260902000000AC8802')).toBeVisible();
  expect(listRequests).toBe(2);
});
