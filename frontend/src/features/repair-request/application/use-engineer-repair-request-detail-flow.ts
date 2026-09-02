// src/features/repair-request/application/use-engineer-repair-request-detail-flow.ts

import { useCallback } from 'react';

import type { AcceptRepairRequestResult } from '../infrastructure/engineer-repair-request.types';

import { useAcceptRepairRequest } from './use-accept-repair-request';
import { useEngineerRepairRequestDetail } from './use-engineer-repair-request-detail';

/**
 * 工程师详情 + 接单编排（详情页唯一业务入口，收束在 feature application）。
 *
 * - 组合详情 query 状态机与接单 command 状态，页面不直接触碰任何 adapter；
 * - 接单成功后用 Mutation 返回的最新详情原子更新当前展示（Plan P0-6 首选项，
 *   同一数据源的写后读，不发起额外查询，不产生骨架屏闪现）；
 * - 接单冲突（申请已被接单）或 not-accessible（后端视角申请已不存在/
 *   无权）后重新查询详情：冲突 → 展示最新接单状态，按钮随之消失；
 *   not-accessible → 收敛到统一不可访问反馈，不保留可继续接单的过期按钮；
 *   两个范围的列表失效宣告已由 useAcceptRepairRequest 内部完成，不重复宣告；
 * - 重查后若详情因权限收紧落入 not-accessible，状态照常返回，
 *   由 UI 引导返回工程师列表，不泄露申请归属；
 * - requestId 为 null（路由参数无效）时接单调用直接拒绝，不产生请求；
 * - auth 错误不在这里重复处理，仍由共享 GraphQL + auth-session 全局链路负责。
 */

export function useEngineerRepairRequestDetailFlow(requestId: number | null) {
  const { state, reload, applyDetail } = useEngineerRepairRequestDetail(requestId);
  const { accept, accepting, result: lastAcceptResult } = useAcceptRepairRequest();

  /**
   * 发起接单。返回：
   * - null：无效 ID 或上一次接单仍在进行中（连点被拒）；
   * - 显式结果：成功或业务拒绝，调用方按 ok / reason 决定展示。
   */
  const acceptRequest = useCallback(async (): Promise<AcceptRepairRequestResult | null> => {
    if (requestId === null) {
      return null;
    }

    const acceptResult = await accept(requestId);

    if (acceptResult === null) {
      return null;
    }

    // 成功 → Mutation 返回的就是服务器最新详情，原子注入不重查（不闪现）；
    // 冲突 / not-accessible → 现状已变（申请已被接单 / 申请不可访问），重查收敛，
    // 不保留可继续接单的过期按钮状态；
    // insufficient-permission / accept-failed 不改变申请数据，不刷新，仅提示。
    if (acceptResult.ok) {
      applyDetail(acceptResult.detail);
    } else if (
      acceptResult.reason === 'already-accepted' ||
      acceptResult.reason === 'not-accessible'
    ) {
      reload();
    }

    return acceptResult;
  }, [requestId, accept, reload, applyDetail]);

  return { state, accepting, lastAcceptResult, accept: acceptRequest, reload };
}
