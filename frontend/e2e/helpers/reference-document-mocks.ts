// e2e/helpers/reference-document-mocks.ts
//
// 参考资料视觉 spec 共用的仓库内确定性 GraphQL mock（PR5 视觉证据采集的收口）：
// 独立资料列表页（/reference-documents）与资料详情页由本文件统一提供，
// 各视觉 spec 一律导入本文件，不再各自复制一份（避免同一模板出现平行实现）。
//
// - 按 operationName 精确应答，字段与 features/reference-document 各 adapter 的
//   GraphQL 契约逐一对齐；
// - **失败关闭**：未登记的 operationName（新增请求 / 拼错名字 / 详情 id 未登记）
//   一律抛错并让用例失败，不使用「成功空 data」兜底 —— 空 data 会被 mapper 判为
//   外部契约异常，污染日志并掩盖真实报错；
// - 会话不经过登录接口：spec 用 helpers/auth-session-seed 预置 sessionStorage，
//   因此本文件不需要任何账号、Token、开发库或 backend/env/.env.development。
//
// 搬移说明（PR5 S6）：fixture 与 stub 自 reference-library-visual.spec.ts 原样搬移，
// 导出名与签名不变。

import type { Page } from '@playwright/test';

export const LIST_ITEMS = [
  {
    id: 980001,
    title: '光源模块维护指南',
    documentType: 'MAINTENANCE_GUIDE',
    equipmentModelId: 49,
    equipmentModelName: 'ASML TWINSCAN NXT:1980Di',
    description: '按季度执行的光源模块保养步骤与力矩表。',
    originalFilename: 'light-source-maintenance.pdf',
    creatorNickname: '系统管理员',
    createdAt: '2026-08-10T08:00:00.000Z',
  },
  {
    id: 980002,
    title: '通用安全规范',
    documentType: 'SAFETY_STANDARD',
    equipmentModelId: null,
    equipmentModelName: null,
    description: null,
    originalFilename: null,
    creatorNickname: '系统管理员',
    createdAt: '2026-08-11T09:30:00.000Z',
  },
];

export type ListItem = (typeof LIST_ITEMS)[number];

/** PR5 S3-5 长文本夹具：三列均为「远超列宽也不得撑破」的真实字段极值。 */
export const LONG_TITLE = `光源模块维护指南-${'超长标题占位'.repeat(18)}`;
export const LONG_DESCRIPTION =
  '按季度执行的光源模块保养步骤与力矩表，包含拆装顺序、清洁剂选型与复装后的光强校准记录。'.repeat(
    6,
  );
export const LONG_FILENAME =
  'light-source-maintenance-manual-with-an-extremely-long-file-name-2026Q3-rev12-final.pdf';

export const LONG_TEXT_ITEMS: ListItem[] = [
  {
    id: 980101,
    title: LONG_TITLE,
    documentType: 'MAINTENANCE_GUIDE',
    equipmentModelId: 49,
    equipmentModelName: 'ASML TWINSCAN NXT:1980Di',
    description: LONG_DESCRIPTION,
    originalFilename: LONG_FILENAME,
    creatorNickname: '系统管理员',
    createdAt: '2026-08-10T08:00:00.000Z',
  },
];

/** 资料页 GraphQL 端点（列表页与状态页共用同一分发入口）。 */
export const REFERENCE_DOCUMENT_MOCK_ROUTE = '**/graphql';

/** 设备型号兜底夹具：两个 spec 共用同一载荷，避免同一后端契约出现两份副本。 */
export const EQUIPMENT_MODELS = [
  { id: 49, modelCode: 'ASML-TWINSCAN-NXT-1980DI', modelName: 'ASML TWINSCAN NXT:1980Di' },
];

/** 单次 GraphQL 请求中分发所需的字段（其余字段与本 mock 无关）。 */
export type ReferenceDocumentOperationRequest = {
  operationName?: string;
  variables?: { id?: number };
};

/**
 * operationName → 响应 `data` 载荷的处理表。
 * 未登记（新增请求 / 拼错名字 / 漏登记状态）由分发器抛错失败关闭，不做「成功空 data」兜底。
 */
export type ReferenceDocumentOperationHandlers = Record<
  string,
  (request: ReferenceDocumentOperationRequest) => unknown
>;

/**
 * 参考资料 GraphQL 路由的唯一分发器（Codex S0–S6 Review P3-2 收敛）：
 * 本函数只负责「按 operationName 精确分发 + 失败关闭 + 可选留痕」这三件机械事，
 * 夹具与各 operation 的响应形态由调用方自备 —— 列表页与状态页的夹具/记录需求不同，
 * 不合并成「万能 mock」，只共享分发骨架。
 *
 * `label` 只用于失败信息定位来源 spec；`recorded` 供「未确认软删时不得发出删除 mutation」
 * 一类断言读取。
 */
export async function installReferenceDocumentGraphqlRoutes(
  page: Page,
  params: {
    handlers: ReferenceDocumentOperationHandlers;
    label: string;
    recorded?: string[];
  },
): Promise<void> {
  const { handlers, label, recorded } = params;

  await page.route(REFERENCE_DOCUMENT_MOCK_ROUTE, async (route) => {
    const request =
      (route.request().postDataJSON() as ReferenceDocumentOperationRequest | null) ?? {};
    const operationName = request.operationName;

    if (operationName) {
      recorded?.push(operationName);
    }

    const handler = operationName ? handlers[operationName] : undefined;

    if (!handler) {
      throw new Error(`[${label}] 未登记的 GraphQL operation：${operationName ?? '(缺少)'}`);
    }

    await route.fulfill({
      body: JSON.stringify({ data: handler(request) }),
      contentType: 'application/json',
      status: 200,
    });
  });
}

/**
 * 独立资料列表页（`/reference-documents`）与资料详情页的就绪态 mock。
 *
 * 只登记本页真实发出的 operation：多一个（新增请求 / 拼错名字）会抛错并让用例失败，
 * 不使用「成功空 data」兜底 —— 空 data 会被 mapper 判为外部契约异常，污染日志并掩盖真实报错。
 * 详情查询为「详情入口仍可操作」的落地页提供合法响应，不新增被验收能力。
 */
export async function installReferenceLibraryMocks(
  page: Page,
  items: ListItem[] = LIST_ITEMS,
): Promise<void> {
  await installReferenceDocumentGraphqlRoutes(page, {
    handlers: {
      EquipmentModels: () => ({ equipmentModels: EQUIPMENT_MODELS }),
      ReferenceDocument: (request) => {
        const item = items.find((candidate) => candidate.id === request.variables?.id);

        if (!item) {
          throw new Error(
            `[reference-library-visual] 详情 stub 未登记 id：${String(request.variables?.id)}`,
          );
        }

        return {
          referenceDocument: {
            ...item,
            contentText: null,
            hasFile: item.originalFilename !== null,
            mimeType: item.originalFilename === null ? null : 'application/pdf',
            updatedAt: item.createdAt,
          },
        };
      },
      ReferenceDocuments: () => ({
        referenceDocuments: { items, page: 1, pageSize: 10, total: items.length },
      }),
    },
    label: 'reference-library-visual',
  });
}
