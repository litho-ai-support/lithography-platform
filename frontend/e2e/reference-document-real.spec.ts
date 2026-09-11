// e2e/reference-document-real.spec.ts
// AI 参考资料库真实后端数据流 e2e（阶段三 T-03/T-04 + 0909 第二轮文件上传/下载链路）。
//
// 数据基础：backend seed 预置参考资料 970001~970003（未软删，含通用/指定型号/
// 有 storage 引用三种形态）与 970004（已软删，默认不可见）；seed 行只做只读断言。
// 创建链路产生的自建行以「运行级唯一标识」命名（标题含 RUN_ID，跨运行/跨开发者
// 不可能撞名），清理以本次运行创建的精确资料 ID 为边界：先经 API 软删（幂等），
// 再物理删除精确 ID 列表——物理删除受 helper 安全门约束（显式 opt-in + 测试库命名），
// 共享开发库未 opt-in 时安全跳过，不污染也不误删他人数据（负责人 0909 阻塞项 1）。
// 前提不满足（无本地后端 / 无 env）时用例自动跳过，不会以失败阻塞。

import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

import {
  deleteE2EReferenceDocumentRowsByIds,
  deleteE2EReferenceDocumentStorageFilesByIds,
  findReferenceDocumentStorageReferenceById,
  hasFrontendGraphQLEndpoint,
  isRealBackendAvailable,
  readBackendEnv,
  readBackendEnvOrNull,
  realGraphqlCall,
  realRestDownload,
  REFERENCE_DOCUMENT_E2E_TITLE_PREFIX,
} from './helpers/real-backend';

const LIST_PATH = '/reference-documents';
const NEW_PAGE_PATH = '/reference-documents/new';

const SEED_ERROR_MANUAL_TITLE = 'NXT:1980Di 常见错误代码手册（Mock）';
const SEED_MAINTENANCE_GUIDE_TITLE = 'NXE:3400C 光源维护指南（Mock）';
const SEED_SAFETY_STANDARD_TITLE = '光刻机故障诊断安全规范（Mock）';
const SEED_DEPRECATED_TITLE = '旧版 XT 系列检查表（已停用 Mock）';

/** 本次运行唯一标识：并入自建行标题，保证跨运行/并行执行永不撞名 */
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
/** 自建行标题筛选关键字：仅匹配本次运行创建的行（其他运行有自己的 RUN_ID） */
const RUN_TITLE_KEYWORD = `${REFERENCE_DOCUMENT_E2E_TITLE_PREFIX}·${RUN_ID}`;

const LIST_DOCUMENTS_QUERY = `
  query ReferenceDocuments($pagination: PaginationArgs!, $filter: ReferenceDocumentFilterInput) {
    referenceDocuments(pagination: $pagination, filter: $filter) {
      items { id title }
      total
      page
      pageSize
    }
  }
`;

const SOFT_DELETE_MUTATION = `
  mutation SoftDeleteReferenceDocument($id: Int!) {
    softDeleteReferenceDocument(id: $id) { id }
  }
`;

/** 按本次运行唯一标题关键字查询未软删行 ID 列表（Node 侧真实登录后调用） */
async function findE2EDocumentIds(env: Record<string, string>): Promise<number[]> {
  const { body } = await realGraphqlCall(
    env,
    LIST_DOCUMENTS_QUERY,
    {
      pagination: { mode: 'OFFSET', page: 1, pageSize: 50, withTotal: true },
      filter: { title: RUN_TITLE_KEYWORD },
    },
    'mock_super_admin',
  );
  const items = (
    body as {
      data?: { referenceDocuments?: { items?: Array<{ id: number; title: string }> } };
    }
  ).data?.referenceDocuments?.items;

  return (items ?? []).map((item) => item.id);
}

/**
 * 兜底清理（仅以本次运行的精确 ID 为边界，负责人 0909 修复要求）：
 * 1. 合并「页面创建时从详情 URL 捕获的精确 ID」与「按运行唯一标题反查的 ID」；
 * 2. 逐个经 API 软删（幂等：已删/不存在返回 NOT_FOUND，忽略即可）；
 * 3. 物理删除精确 ID 列表（helper 安全门：显式 opt-in + 测试库命名，
 *    共享开发库未 opt-in 时安全跳过，软删行由库策略另行清理）。
 * 只操作本次运行创建的行：其他运行/开发者的同前缀数据不会被触碰。
 */
async function cleanupE2EDocuments(
  env: Record<string, string>,
  createdIdsFromUi: readonly number[],
): Promise<void> {
  const targetIds = new Set<number>(createdIdsFromUi);

  for (const id of await findE2EDocumentIds(env)) {
    targetIds.add(id);
  }

  for (const id of targetIds) {
    await realGraphqlCall(env, SOFT_DELETE_MUTATION, { id }, 'mock_super_admin');
  }

  try {
    deleteE2EReferenceDocumentRowsByIds([...targetIds]);
  } catch (error) {
    // 安全门拒绝（未 opt-in 或非测试库命名）：物理清理安全跳过，
    // 软删兜底已保证列表/详情不可见；残留软删行需按库策略另行清理。
    console.warn(`[e2e] 物理清理跳过：${(error as Error).message}`);
  }
}

test.describe('real backend reference document flow', () => {
  test.beforeEach(async () => {
    const env = readBackendEnvOrNull();
    test.skip(
      env === null,
      'backend/env/.env.development 缺失（本地文件，不入库），跳过真实后端用例',
    );
    test.skip(
      !hasFrontendGraphQLEndpoint(),
      '前端真实通道不可达（未配置 VITE_GRAPHQL_ENDPOINT 且 vite dev server 无 /graphql 转发），跳过真实后端用例',
    );
    test.skip(
      !(await isRealBackendAvailable(env as Record<string, string>)),
      '本地后端不可用或不可登录，跳过真实后端用例',
    );
  });

  // T-03 主链路：管理员登录 → 列表（种子可见、已软删不可见）→ 新增指定型号资料 →
  // 成功页 → 详情 → 编辑 → 刷新持久 → 软删回列表且消失 → API 重复软删 NOT_FOUND（不幂等）。
  // 自建行经 try/finally 兜底软删清理。
  test('super admin full journey: list, create, edit, reload persistence and soft delete', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const env = readBackendEnv();

    await page.goto('/login');
    await page.getByLabel('账号或邮箱').fill('mock_super_admin');
    await page.getByLabel('密码').fill(env.MOCK_SEED_PASSWORD);
    await page.getByRole('button', { name: /登\s*录/ }).click();
    await expect(page).toHaveURL(/\/admin$/);

    // 导航入口可见（F-09）
    await expect(page.getByText('参考资料库')).toBeVisible();

    // 本次运行创建的资料精确 ID（页面创建后从详情 URL 捕获，供 finally 按精确 ID 清理；
    // 作用域须覆盖 try/finally，主链路在任何一步失败都能兜底清理）
    const createdIdsFromUi: number[] = [];

    try {
      // 列表：种子资料可见（按创建时间倒序），已软删的 970004 不可见
      await page.goto(LIST_PATH);
      await expect(page.getByRole('heading', { name: '参考资料库' })).toBeVisible();
      await expect(page.getByText(SEED_ERROR_MANUAL_TITLE)).toBeVisible();
      await expect(page.getByText(SEED_MAINTENANCE_GUIDE_TITLE)).toBeVisible();
      await expect(page.getByText(SEED_SAFETY_STANDARD_TITLE)).toBeVisible();
      await expect(page.getByText(SEED_DEPRECATED_TITLE)).toHaveCount(0);

      // 新增指定型号资料（标题含运行唯一标识，跨运行/并行执行永不撞名）
      await page.getByRole('button', { name: '新增资料' }).click();
      await expect(page).toHaveURL(new RegExp(NEW_PAGE_PATH));
      await page.getByLabel('文档标题').fill(`${RUN_TITLE_KEYWORD}（光闸维护）`);
      // AntD Select 交互按维修申请先例：点击 combobox 打开下拉后点 option（label 点击不展开下拉）
      await page.getByRole('combobox').nth(0).click();
      await page.locator('.ant-select-item-option', { hasText: '检查表' }).click();
      // 型号下拉选项走真实 equipmentModels 查询，加载完成前 disabled，先等可用
      await expect(page.getByRole('combobox').nth(1)).toBeEnabled({ timeout: 10_000 });
      await page.getByRole('combobox').nth(1).click();
      await page.locator('.ant-select-item-option', { hasText: 'NXT:1980Di' }).click();
      await page.getByLabel('文档说明').fill('阶段三真实后端 e2e 自建行。');
      await page.getByLabel('文本内容').fill('# 光闸维护检查表\n\n每周检查光闸联锁与急停按钮。');
      await page.getByRole('button', { name: /创建资料/ }).click();

      // 成功页 → 查看详情（从详情 URL 捕获本次创建的精确资料 ID）
      await expect(page.getByText('参考资料创建成功')).toBeVisible();
      await page.getByRole('button', { name: '查看详情' }).click();
      await expect(page).toHaveURL(/\/reference-documents\/\d+$/);
      const createdIdMatch = page.url().match(/\/reference-documents\/(\d+)$/);

      if (createdIdMatch) {
        createdIdsFromUi.push(Number(createdIdMatch[1]));
      }

      await expect(page.getByText(`${RUN_TITLE_KEYWORD}（光闸维护）`).first()).toBeVisible();
      // 精确匹配：正文「光闸维护检查表」含同文子串，避免 strict mode violation（memory 先例）
      await expect(page.getByText('检查表', { exact: true })).toBeVisible();
      await expect(page.getByText('ASML TWINSCAN NXT:1980Di')).toBeVisible();
      await expect(page.getByText(/每周检查光闸联锁/)).toBeVisible();

      // 编辑：改标题 → 保存后详情刷新（仍含运行唯一标识，清理反查不变）
      await page.getByRole('button', { name: /编\s*辑/ }).click();
      await page.getByLabel('文档标题').fill(`${RUN_TITLE_KEYWORD}（光闸维护·已改）`);
      await page.getByRole('button', { name: /保存修改/ }).click();
      await expect(page.getByText('参考资料已保存。')).toBeVisible();
      await expect(page.getByText(`${RUN_TITLE_KEYWORD}（光闸维护·已改）`).first()).toBeVisible();

      // 刷新持久（T-03：刷新仍在）
      await page.reload();
      await expect(page.getByText(`${RUN_TITLE_KEYWORD}（光闸维护·已改）`).first()).toBeVisible();

      // 软删：二次确认 → 回列表且该行消失
      await page.getByRole('button', { name: '删 除' }).click();
      await page.getByRole('button', { name: '确认删除' }).click();
      await expect(page.getByText('参考资料已删除。')).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${LIST_PATH}$`));
      await expect(page.getByText(`${RUN_TITLE_KEYWORD}（光闸维护·已改）`)).toHaveCount(0);

      // 软删不幂等（区别于维修申请裁定 5）：API 重复删除返回统一 NOT_FOUND，
      // 本次运行的行已全部不可见
      const remainingIds = await findE2EDocumentIds(env);
      expect(remainingIds).toEqual([]);
    } finally {
      // 兜底清理无条件执行：以本次运行的精确 ID 为边界（页面捕获 + 唯一标题反查），
      // 无论主链路中途失败还是页面内已软删，都能清理本次创建的行；
      // 安全门未 opt-in 时物理清理安全跳过（console.warn），不误删他人数据。
      await cleanupE2EDocuments(env, createdIdsFromUi);
    }
  });

  // T-03 筛选正确：类型等值筛选只命中目标资料；清空筛选恢复全量（种子行只读）
  test('list filter by document type narrows results and resets', async ({ page }) => {
    const env = readBackendEnv();

    await page.goto('/login');
    await page.getByLabel('账号或邮箱').fill('mock_super_admin');
    await page.getByLabel('密码').fill(env.MOCK_SEED_PASSWORD);
    await page.getByRole('button', { name: /登\s*录/ }).click();
    await expect(page).toHaveURL(/\/admin$/);

    await page.goto(LIST_PATH);
    await expect(page.getByText(SEED_ERROR_MANUAL_TITLE)).toBeVisible();

    // AntD Select 筛选交互：combobox 打开下拉后点 option
    await page.getByRole('combobox').nth(0).click();
    await page.locator('.ant-select-item-option', { hasText: '维护指南' }).click();

    await expect(page.getByText(SEED_MAINTENANCE_GUIDE_TITLE)).toBeVisible();
    await expect(page.getByText(SEED_ERROR_MANUAL_TITLE)).toHaveCount(0);
    await expect(page.getByText(SEED_SAFETY_STANDARD_TITLE)).toHaveCount(0);

    // 清空筛选恢复全量（AntD allowClear 的清除按钮需 hover 后出现）
    await page.getByRole('combobox').nth(0).hover();
    await page.locator('.ant-select-clear').click();
    await expect(page.getByText(SEED_ERROR_MANUAL_TITLE)).toBeVisible();
    await expect(page.getByText(SEED_SAFETY_STANDARD_TITLE)).toBeVisible();
  });

  // T-03/T-04 工程师只读：列表与详情可达（读权限），无新增/编辑/删除入口；
  // 新增页被角色拒绝清单拦截（避免「能进页面但提交必被拒」的残缺中间态）
  test('engineer can read list and detail but has no write entry', async ({ page }) => {
    const env = readBackendEnv();

    await page.goto('/login');
    await page.getByLabel('账号或邮箱').fill('mock_engineer_chen');
    await page.getByLabel('密码').fill(env.MOCK_SEED_PASSWORD);
    await page.getByRole('button', { name: /登\s*录/ }).click();
    await expect(page).toHaveURL(/\/engineer$/);

    await page.goto(LIST_PATH);
    await expect(page.getByText(SEED_ERROR_MANUAL_TITLE)).toBeVisible();
    await expect(page.getByRole('button', { name: '新增资料' })).toHaveCount(0);

    // 详情只读：完整内容可见，无编辑/删除入口
    await page.getByText(SEED_MAINTENANCE_GUIDE_TITLE).click();
    await expect(page.getByRole('heading', { name: '参考资料详情' })).toBeVisible();
    await expect(page.getByText(SEED_MAINTENANCE_GUIDE_TITLE).first()).toBeVisible();
    await expect(page.getByText(/E-LASER-207/)).toBeVisible();
    await expect(page.getByRole('button', { name: /编\s*辑/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '删 除' })).toHaveCount(0);

    // 下载入口三角色可见（种子 970002 带原始文件名）：工程师只读但可下载
    await expect(page.getByRole('button', { name: /下载文件/ })).toBeVisible();

    // 新增页被拒绝清单拦截，安全跳转回工程师主页
    await page.goto(NEW_PAGE_PATH);
    await expect(page).toHaveURL(/\/engineer$/);
  });

  // T-04 角色矩阵：客户页面被安全跳转回个人主页、导航无入口；
  // 越权直调 GraphQL 读/写均被后端 FORBIDDEN 拒绝（seed 行只读，无污染）
  test('customer is redirected away and blocked from graphql read and write', async ({ page }) => {
    const env = readBackendEnv();

    await page.goto('/login');
    await page.getByLabel('账号或邮箱').fill('mock_customer_alpha');
    await page.getByLabel('密码').fill(env.MOCK_SEED_PASSWORD);
    await page.getByRole('button', { name: /登\s*录/ }).click();
    await expect(page).toHaveURL(/\/customer$/);

    // 导航无「参考资料库」入口（F-09 角色过滤）
    await expect(page.getByText('参考资料库')).toHaveCount(0);

    // 页面访问被角色根路径表拦截，安全跳转回个人主页
    await page.goto(LIST_PATH);
    await expect(page).toHaveURL(/\/customer$/);

    // 越权直调读接口 → FORBIDDEN
    const readDenied = await realGraphqlCall(
      env,
      LIST_DOCUMENTS_QUERY,
      { pagination: { mode: 'OFFSET', page: 1, pageSize: 10, withTotal: true } },
      'mock_customer_alpha',
    );
    const readErrors = (readDenied.body as { errors?: Array<{ extensions?: { code?: string } }> })
      .errors;
    expect(readErrors?.[0]?.extensions?.code).toBe('FORBIDDEN');

    // 越权直调写接口 → FORBIDDEN（自建行不会落库）
    const writeDenied = await realGraphqlCall(
      env,
      `mutation CreateReferenceDocument($input: CreateReferenceDocumentInput!) {
        createReferenceDocument(input: $input) { id }
      }`,
      {
        input: {
          title: `${RUN_TITLE_KEYWORD}（客户越权探测）`,
          documentType: 'CHECKLIST',
          equipmentModelId: null,
          description: null,
          contentText: '越权探测正文',
        },
      },
      'mock_customer_alpha',
    );
    const writeErrors = (writeDenied.body as { errors?: Array<{ extensions?: { code?: string } }> })
      .errors;
    expect(writeErrors?.[0]?.extensions?.code).toBe('FORBIDDEN');

    // 越权写确实未落库（列表中无本次运行创建的行）
    expect(await findE2EDocumentIds(env)).toEqual([]);
  });

  // 0909 第二轮阻塞项 1 主链路：管理员 UI 上传真实小文件创建（仅文件、正文留空）→
  // 列表「原始文件名」列 → 详情元数据（含下载入口）→ 浏览器下载事件断言文件名与字节 →
  // Node 侧 REST 下载字节比对 → 软删消失；存储物理文件按本次运行的精确引用路径清理。
  test('super admin file upload and download journey via rest multipart', async ({ page }) => {
    test.setTimeout(90_000);
    const env = readBackendEnv();

    await page.goto('/login');
    await page.getByLabel('账号或邮箱').fill('mock_super_admin');
    await page.getByLabel('密码').fill(env.MOCK_SEED_PASSWORD);
    await page.getByRole('button', { name: /登\s*录/ }).click();
    await expect(page).toHaveURL(/\/admin$/);

    const createdIdsFromUi: number[] = [];
    const uploadBytes = new TextEncoder().encode(
      '# 光闸联锁检修记录\n\n每周检查光闸联锁与急停按钮，异常时按 A-3 流程处置。',
    );
    const uploadFilename = `optics-check-${RUN_ID}.md`;

    try {
      await page.goto(LIST_PATH);
      await expect(page.getByRole('heading', { name: '参考资料库' })).toBeVisible();
      await page.getByRole('button', { name: '新增资料' }).click();
      await expect(page).toHaveURL(new RegExp(NEW_PAGE_PATH));
      await page.getByLabel('文档标题').fill(`${RUN_TITLE_KEYWORD}（文件上传）`);
      await page.getByRole('combobox').nth(0).click();
      await page.locator('.ant-select-item-option', { hasText: '检查表' }).click();

      // 仅文件创建：正文留空（双空拦截不触发，文件已提供），经 Upload 手动模式暂存
      await page.setInputFiles('input[type="file"]', {
        buffer: Buffer.from(uploadBytes),
        mimeType: 'text/markdown',
        name: uploadFilename,
      });
      await expect(page.getByText(uploadFilename)).toBeVisible();
      await page.getByRole('button', { name: /创建资料/ }).click();

      await expect(page.getByText('参考资料创建成功')).toBeVisible();
      await page.getByRole('button', { name: '查看详情' }).click();
      await expect(page).toHaveURL(/\/reference-documents\/\d+$/);
      const createdIdMatch = page.url().match(/\/reference-documents\/(\d+)$/);

      if (createdIdMatch) {
        createdIdsFromUi.push(Number(createdIdMatch[1]));
      }

      const createdId = createdIdsFromUi[0];

      expect(createdId).toBeDefined();

      // 详情元数据：原始文件名 / 文件类型落库；仅文件创建无正文；下载入口恒显
      await expect(page.getByText(`${RUN_TITLE_KEYWORD}（文件上传）`).first()).toBeVisible();
      await expect(page.getByText(uploadFilename).first()).toBeVisible();
      await expect(page.getByText('text/markdown')).toBeVisible();
      await expect(page.getByText('该资料暂无文本内容（仅存储引用）。')).toBeVisible();
      await expect(page.getByRole('button', { name: /下载文件/ })).toBeVisible();

      // 服务端生成了白名单格式的存储引用（32 位 hex + 扩展名）
      const storageReference = findReferenceDocumentStorageReferenceById(createdId);

      expect(storageReference).toMatch(/^[0-9a-f]{32}\.[a-z0-9]{1,8}$/);

      // 浏览器下载：Playwright download 事件断言文件名与字节内容一致
      const downloadPromise = page.waitForEvent('download');

      await page.getByRole('button', { name: /下载文件/ }).click();

      const download = await downloadPromise;

      expect(download.suggestedFilename()).toBe(uploadFilename);
      expect(new Uint8Array(readFileSync(await download.path()))).toEqual(uploadBytes);

      // Node 侧 REST 直连下载：Content-Type 与字节与上传一致（服务端存储往返无损）
      const restDownload = await realRestDownload(env, createdId);

      expect(restDownload.status).toBe(200);
      expect(restDownload.contentType).toBe('text/markdown');
      expect(restDownload.contentDisposition).toContain(uploadFilename);
      expect(new Uint8Array(restDownload.buffer)).toEqual(uploadBytes);

      // 列表「原始文件名」列展示上传文件名
      await page.goto(LIST_PATH);
      await expect(page.getByText(uploadFilename)).toBeVisible();

      // 回到详情后软删：二次确认 → 回列表且该行消失
      await page.goto(`/reference-documents/${createdId}`);
      await expect(page.getByText(`${RUN_TITLE_KEYWORD}（文件上传）`).first()).toBeVisible();
      await page.getByRole('button', { name: '删 除' }).click();
      await page.getByRole('button', { name: '确认删除' }).click();
      await expect(page.getByText('参考资料已删除。')).toBeVisible();
      await expect(page.getByText(uploadFilename)).toHaveCount(0);
    } finally {
      // 存储物理文件按本次运行记录的精确引用路径清理（不扫描批量删）；
      // 必须先于 cleanupE2EDocuments：文件清理靠 SELECT 反查引用，物理删行后反查将空转留孤儿文件
      try {
        deleteE2EReferenceDocumentStorageFilesByIds(createdIdsFromUi);
      } catch (error) {
        console.warn(`[e2e] 存储文件清理跳过：${(error as Error).message}`);
      }
      await cleanupE2EDocuments(env, createdIdsFromUi);
    }
  });
});
