// src/modules/lithography/queries/admin-ai-message.query.service.spec.ts

import { AdminAiMessageQueryService } from './admin-ai-message.query.service';

/**
 * PR3 S4：管理员 AI 消息读侧 QueryService 单测。
 *
 * 计划表 S4.2 的核心契约：消息严格按 `messageSeq ASC, id ASC` 稳定排序
 * （排序由服务冻结，不采纳客户端排序），100 轮会话可经分页完整顺序读取。
 */
describe('AdminAiMessageQueryService', () => {
  const makeMessageRepo = () => ({
    find: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  });

  const messageEntity = (overrides: Record<string, unknown> = {}) => ({
    id: 770001,
    conversationId: 660001,
    messageSeq: 1,
    turnNo: 1,
    role: 'USER',
    contentText: '正文',
    createdAt: new Date('2026-09-02T09:00:00.000Z'),
    ...overrides,
  });

  it('消息固定排序 messageSeq ASC, id ASC 透传，OFFSET 分页与真实 total 并行', async () => {
    const messageRepo = makeMessageRepo();
    messageRepo.find.mockResolvedValue([messageEntity()]);
    const service = new AdminAiMessageQueryService(messageRepo as never);

    const page = await service.listByConversation({
      conversationId: 660001,
      pagination: { page: 2, pageSize: 50, withTotal: true },
    });

    expect(messageRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { conversationId: 660001 },
        order: { messageSeq: 'ASC', id: 'ASC' },
        skip: 50,
        take: 50,
      }),
    );
    expect(messageRepo.count).toHaveBeenCalledWith({ where: { conversationId: 660001 } });
    expect(page.total).toBe(0);
    expect(page.items[0]).toMatchObject({
      id: 770001,
      conversationId: 660001,
      messageSeq: 1,
      turnNo: 1,
      role: 'USER',
      contentText: '正文',
    });
  });

  it('100 轮消息分页读取语义：pageSize = 100 时一次查询可覆盖满轮会话', async () => {
    const messageRepo = makeMessageRepo();
    const service = new AdminAiMessageQueryService(messageRepo as never);

    await service.listByConversation({
      conversationId: 660001,
      pagination: { page: 1, pageSize: 100, withTotal: true },
    });

    expect(messageRepo.find).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 100 }));
  });

  it('withTotal 为 false 时不执行 count 查询', async () => {
    const messageRepo = makeMessageRepo();
    const service = new AdminAiMessageQueryService(messageRepo as never);

    await service.listByConversation({
      conversationId: 660001,
      pagination: { page: 1, pageSize: 50, withTotal: false },
    });

    expect(messageRepo.count).not.toHaveBeenCalled();
  });

  it('非法分页参数二级防御钳制', async () => {
    const messageRepo = makeMessageRepo();
    const service = new AdminAiMessageQueryService(messageRepo as never);

    await service.listByConversation({
      conversationId: 660001,
      pagination: { page: -1, pageSize: 0, withTotal: true },
    });

    expect(messageRepo.find).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 1 }));
  });

  it('列表只投影必要字段：不携带实体上未进契约的内部字段', async () => {
    const messageRepo = makeMessageRepo();
    messageRepo.find.mockResolvedValue([
      messageEntity({ metadata: { internal: true }, tokenUsage: 120 }),
    ]);
    const service = new AdminAiMessageQueryService(messageRepo as never);

    const page = await service.listByConversation({
      conversationId: 660001,
      pagination: { page: 1, pageSize: 50, withTotal: true },
    });

    expect(page.items[0]).not.toHaveProperty('metadata');
    expect(page.items[0]).not.toHaveProperty('tokenUsage');
  });
});
