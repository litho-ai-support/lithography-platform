// src/usecases/admin-document-database/list-admin-ai-messages.usecase.spec.ts

import type { OffsetParams, PaginationParams } from '@core/pagination/pagination.types';
import { PERMISSION_ERROR } from '@core/common/errors/domain-error';
import type { AdminAiMessageQueryService } from '@src/modules/lithography/queries/admin-ai-message.query.service';
import {
  captureThrownError,
  createSuperAdminSession,
  createUnauthorizedSessions,
} from '../../../test/support/account/admin-user.fixture';
import { ListAdminAiMessagesUsecase } from './list-admin-ai-messages.usecase';

/**
 * PR3 S4：管理员按会话读取 AI 消息列表用例单测。
 *
 * 计划表 S4.2：消息顺序契约（messageSeq ASC, id ASC）由 QueryService 冻结，
 * 用例层只透传分页；页大小钳制 100 与「100 轮会话一次读取」语义对齐。
 */
describe('ListAdminAiMessagesUsecase', () => {
  const offsetPagination = (overrides: Partial<OffsetParams> = {}): PaginationParams => ({
    mode: 'OFFSET' as const,
    page: 1,
    pageSize: 50,
    withTotal: true,
    ...overrides,
  });

  const adminAiMessageQueryService = {
    listByConversation: jest.fn().mockResolvedValue({
      items: [
        {
          id: 770001,
          conversationId: 660001,
          messageSeq: 1,
          turnNo: 1,
          role: 'USER',
          contentText: '正文',
          createdAt: new Date('2026-09-02T09:00:00.000Z'),
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    }),
  } as unknown as AdminAiMessageQueryService;

  const usecase = new ListAdminAiMessagesUsecase(adminAiMessageQueryService);

  beforeEach(() => {
    (adminAiMessageQueryService.listByConversation as jest.Mock).mockClear();
  });

  it.each(createUnauthorizedSessions().map(([label, session]) => ({ label, session })))(
    '$label 时授权先行拒绝，不触发消息查询',
    async ({ session }) => {
      const error = (await captureThrownError(
        usecase.execute({
          session,
          conversationId: 660001,
          pagination: offsetPagination(),
        }),
      )) as { code?: string };

      expect(error.code).toBe(PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS);
      expect(adminAiMessageQueryService.listByConversation).not.toHaveBeenCalled();
    },
  );

  it.each([0, -1, 1.5, Number.NaN])('会话 ID %j 非法时在查询前拒绝', async (conversationId) => {
    const error = (await captureThrownError(
      usecase.execute({
        session: createSuperAdminSession(),
        conversationId,
        pagination: offsetPagination(),
      }),
    )) as { code?: string };

    expect(error.code).toBe('ADMIN_DOCUMENT_DATABASE_INVALID_PARAMS');
    expect(adminAiMessageQueryService.listByConversation).not.toHaveBeenCalled();
  });

  it('conversationId 与分页透传（排序由 QueryService 冻结，不采纳客户端排序）', async () => {
    await usecase.execute({
      session: createSuperAdminSession(),
      conversationId: 660001,
      pagination: offsetPagination({ page: 2 }),
    });

    expect(adminAiMessageQueryService.listByConversation).toHaveBeenCalledWith({
      conversationId: 660001,
      pagination: { page: 2, pageSize: 50, withTotal: true },
    });
  });

  it('页大小钳制 100：满 100 轮会话可一次顺序读取', async () => {
    await usecase.execute({
      session: createSuperAdminSession(),
      conversationId: 660001,
      pagination: offsetPagination({ pageSize: 500 }),
    });

    const call = (adminAiMessageQueryService.listByConversation as jest.Mock).mock.calls[0][0];
    expect(call.pagination.pageSize).toBe(100);
  });
});
