// src/features/repair-request/application/use-engineer-repair-request-detail-flow.ts

import { useCallback, useRef, useState } from 'react';

import type {
  AcceptRepairRequestResult,
  CreateEngineerResponseInput,
  CreateEngineerResponseResult,
} from '../infrastructure/engineer-repair-request.types';

import { useAcceptRepairRequest } from './use-accept-repair-request';
import { useCreateEngineerResponse } from './use-create-engineer-response';
import {
  type EngineerRepairRequestDetailLoadOutcome,
  useEngineerRepairRequestDetail,
} from './use-engineer-repair-request-detail';

/**
 * 工程师详情 + 接单/回复编排（详情页唯一业务入口，收束在 feature application）。
 *
 * - 组合详情 query 状态机与接单/回复 command 状态，页面不直接触碰任何 adapter；
 * - 接单成功后用 Mutation 返回的最新详情原子更新当前展示（Plan P0-6 首选项，
 *   同一数据源的写后读，不发起额外查询，不产生骨架屏闪现）；
 * - 回复成功后用 Mutation 返回的新回复经 apply-response 事件原子注入当前详情，
 *   同一事件内同步 responses 与 latestResolutionStatus，不重查、不闪现；
 * - 接单冲突（申请已被接单）或 not-accessible（后端视角申请已不存在/
 *   无权）后重新查询详情：冲突 → 展示最新接单状态，按钮随之消失；
 *   not-accessible → 收敛到统一不可访问反馈，不保留可继续接单的过期按钮；
 * - accept-failed（接单结果不确定：事务可能已提交但事务外详情读取/传输失败）
 *   只重新查询当前详情确认最新状态，绝不自动重发接单 Mutation：
 *   重查发现已接单 → 展示已接单状态，按钮随 isAccepted 消失，
 *   反馈同步收敛为成功，不保留矛盾的失败提示；
 *   重查仍未接单 → 保留失败反馈，允许用户手动重试；
 *   重查失败 → 进入既有加载失败/重试状态；
 *   两个范围的列表失效宣告已由 useAcceptRepairRequest 内部完成，不重复宣告；
 * - response-failed（回复结果不确定：Mutation 可能已在服务端生效）只静默重查详情
 *   （不切 loading，详情与表单不卸载，草稿保留），绝不自动重发回复 Mutation；
 *   重查由 reconciling 状态标记进行中：表单与提交按钮禁用，
 *   提交锁覆盖「Mutation + 收敛重查」全过程，无重复提交窗口（无幂等键）；
 *   重查时以提交前 response ID 集合、规范化正文
 *   和状态确认是否出现匹配的新回复（Plan P0-6）：
 *   能确认已写入 → 收敛为成功（详情已随重查更新，不重复注入），草稿清空；
 *   无法确认（重查失败/详情不可读/无匹配）→ 保留当前详情、不确定反馈与用户草稿，
 *   由用户检查时间线后决定是否手动重试；
 *   确定拒绝（not-accepted/not-accessible/insufficient-permission/invalid-input）
 *   保留当前详情，仅展示对应反馈；
 *   两个范围的列表失效宣告已由 useCreateEngineerResponse 内部完成，不重复宣告；
 * - 重查后若详情因权限收紧落入 not-accessible，状态照常返回，
 *   由 UI 引导返回工程师列表，不泄露申请归属；
 * - requestId 为 null（路由参数无效）时接单/回复调用直接拒绝，不产生请求；
 * - auth 错误不在这里重复处理，仍由共享 GraphQL + auth-session 全局链路负责。
 */

export function useEngineerRepairRequestDetailFlow(requestId: number | null) {
  const { state, reload, recheckSilently, applyDetail, applyResponse } =
    useEngineerRepairRequestDetail(requestId);
  const {
    accept,
    accepting,
    result: lastAcceptResult,
    convergeToAccepted,
  } = useAcceptRepairRequest();
  const {
    submit,
    submitting,
    result: lastCreateResponseResult,
    convergeToSubmitted,
  } = useCreateEngineerResponse();

  /**
   * 回复收敛中：response-failed 后的静默重查进行中（表单禁用态）。
   * 提交锁（busyRef）覆盖「Mutation + 不确定结果收敛重查」全过程，
   * 收敛期间不会出现可再次提交的窗口。
   */
  const [reconciling, setReconciling] = useState(false);
  const responseBusyRef = useRef(false);

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
    // accept-failed → 接单结果不确定（事务可能已提交但事务外详情读取/传输失败），
    // 只重查详情确认，不自动重发接单 Mutation；
    // 重查确认已接单 → 反馈随展示状态同步收敛为成功，不保留矛盾的失败提示；
    // 重查仍未接单 → 保留失败反馈，允许用户手动重试；
    // 重查失败 → 进入既有加载失败/重试状态，失败反馈照常保留；
    // insufficient-permission 是确定的拒绝，申请数据未变，不刷新，仅提示。
    if (acceptResult.ok) {
      applyDetail(acceptResult.detail);
    } else if (acceptResult.reason === 'accept-failed') {
      const recheck = await reload();

      // 详情仍可读且已接单 ⇒ 接单者就是当前工程师：申请被他人接走后当前工程师
      // 不再可读，重查会落入 not-accessible 而非已接单详情
      if (recheck?.ok && recheck.detail.isAccepted) {
        convergeToAccepted(recheck.detail);
      }
    } else if (
      acceptResult.reason === 'already-accepted' ||
      acceptResult.reason === 'not-accessible'
    ) {
      void reload();
    }

    return acceptResult;
  }, [requestId, accept, reload, applyDetail, convergeToAccepted]);

  /**
   * 发起回复。返回：
   * - null：无效 ID、命令与当前详情不一致，或上一次回复（含收敛重查）仍在进行中；
   * - 显式结果：成功或业务拒绝，调用方按 ok / reason 决定展示。
   */
  const createResponse = useCallback(
    async (input: CreateEngineerResponseInput): Promise<CreateEngineerResponseResult | null> => {
      if (requestId === null || input.requestId !== requestId) {
        return null;
      }

      // 提交锁覆盖「Mutation + 不确定结果收敛重查」全过程：
      // 收敛期间 reconciling 置位由 UI 禁用表单，本锁兜底拒绝并行提交，
      // 避免无幂等键时产生第二次回复
      if (responseBusyRef.current) {
        return null;
      }
      responseBusyRef.current = true;

      // 提交前快照：结果不确定重查时用于「提交前 response ID 集合 +
      // 规范化正文 + 状态」匹配确认是否已写入（详情未就绪时无法确认）
      const preResponseIds =
        state.status === 'ready' ? new Set(state.detail.responses.map((item) => item.id)) : null;
      const normalizedText = input.responseText.trim();

      try {
        const submitResult = await submit(input);

        if (submitResult === null) {
          return null;
        }

        // 成功 → Mutation 返回的就是服务端新回复，经 apply-response 事件原子注入，
        // 不重查、不闪现；确定拒绝 → 申请数据未变，保留当前详情仅反馈；
        // response-failed → 结果不确定，只静默重查确认，绝不自动重发回复 Mutation。
        if (submitResult.ok) {
          applyResponse(submitResult.response);
          return submitResult;
        }

        if (submitResult.reason === 'response-failed') {
          // 静默重查（不切 loading、不卸载详情与表单，草稿保留），
          // 收敛期间 reconciling 置位禁用表单与提交按钮，无重复提交窗口
          setReconciling(true);
          try {
            const recheck = await recheckSilently();

            if (recheck?.ok && preResponseIds !== null) {
              const matched = recheck.detail.responses.find(
                (item) =>
                  !preResponseIds.has(item.id) &&
                  item.responseText === normalizedText &&
                  item.resolutionStatus === input.resolutionStatus,
              );

              // 重查详情已含新回复 ⇒ 已写入：反馈随重查结果同步收敛为成功，
              // 不再重复注入（静默重查已原子更新整个详情）；
              // 表单按 ok 结果清空草稿
              if (matched) {
                convergeToSubmitted(matched);
                return { ok: true, response: matched };
              }
            }

            // 无法确认（重查失败/详情未就绪/无匹配）→ 保留当前详情、
            // 不确定反馈与用户草稿，由用户检查时间线后决定是否手动重试
            return submitResult;
          } finally {
            setReconciling(false);
          }
        }

        return submitResult;
      } finally {
        responseBusyRef.current = false;
      }
    },
    [requestId, state, submit, recheckSilently, applyResponse, convergeToSubmitted],
  );

  /**
   * 手动确认回复结果（语义明确的“重新加载详情”入口，UI 唯一重查动作）。
   *
   * 与回复提交共用同一把 responseBusyRef 锁，保证手动重查、自动收敛重查
   * 与回复提交三者互斥：
   * - 重查开始前获取锁，锁已被提交或另一个重查占用时直接返回 null；
   * - 重查期间置 reconciling=true，UI 据此禁用正文/状态/提交/重新加载；
   * - 重查完成或失败后在 finally 中释放锁与 reconciling，恢复手动重查入口；
   * - 只做静默重查（不切 loading、不卸载详情与表单、草稿保留），
   *   绝不自动重发回复 Mutation；重查失败或未匹配时保留当前详情与不确定提示。
   */
  const confirmResponseResult =
    useCallback(async (): Promise<EngineerRepairRequestDetailLoadOutcome | null> => {
      if (requestId === null || responseBusyRef.current) {
        return null;
      }
      responseBusyRef.current = true;
      setReconciling(true);
      try {
        return await recheckSilently();
      } finally {
        setReconciling(false);
        responseBusyRef.current = false;
      }
    }, [requestId, recheckSilently]);

  return {
    state,
    accepting,
    lastAcceptResult,
    accept: acceptRequest,
    submitting,
    reconciling,
    lastCreateResponseResult,
    createResponse,
    reload,
    confirmResponseResult,
  };
}
