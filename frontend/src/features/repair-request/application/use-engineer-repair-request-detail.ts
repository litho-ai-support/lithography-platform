// src/features/repair-request/application/use-engineer-repair-request-detail.ts

import { useCallback, useEffect, useReducer, useRef } from 'react';

import { isGraphQLIngressError } from '@/shared/graphql';

import type {
  EngineerRepairRequestDetail,
  EngineerRepairRequestDetailFailureReason,
  EngineerRepairRequestResponseItem,
} from '../infrastructure/engineer-repair-request.types';
import {
  ENGINEER_DETAIL_NOT_ACCESSIBLE_MESSAGE,
  fetchEngineerRepairRequestDetail,
} from '../infrastructure/engineer-repair-request-adapter';

/**
 * 工程师维修申请详情流程（query 状态机，收束在 feature application）。
 *
 * - 加载中 / 就绪 / 失败（含重试）；请求序号防竞态；
 * - 无效/非法申请 ID（如路由参数不是正整数）不发请求，
 *   静态落入统一不可访问反馈，文案与 adapter 兜底共用单一真源；
 * - 业务拒绝（不存在 / 已删除 / 越权）走显式失败原因：
 *   not-accessible 为统一不可访问反馈，不泄露申请归属；
 * - transport 失败转为共享错误模型的用户文案；
 * - auth 错误不在这里特殊处理，仍由共享 GraphQL + auth-session 全局链路负责；
 * - 支持编排层原子注入写后数据（不发起查询、不产生骨架屏闪现）：
 *   applyDetail 注入接单返回的最新整份详情，
 *   applyResponse 按服务端回复 ID 去重后注入回复 Mutation 返回的新回复。
 */

/**
 * 详情加载/重查的完整结果（含 transport 失败 reason=null 的形态）。
 * reload 返回该结果，供编排层在接单结果不确定（accept-failed）场景做反馈收敛决策。
 */
export type EngineerRepairRequestDetailLoadOutcome =
  | { ok: true; detail: EngineerRepairRequestDetail }
  | { ok: false; reason: EngineerRepairRequestDetailFailureReason | null; message: string };

export type EngineerRepairRequestDetailState =
  | { status: 'loading'; requestSeq: number }
  | { status: 'ready'; requestSeq: number; detail: EngineerRepairRequestDetail }
  | {
      status: 'failed';
      requestSeq: number;
      reason: EngineerRepairRequestDetailFailureReason | null;
      message: string;
    };

type EngineerRepairRequestDetailAction =
  | { type: 'load-start'; requestId: number }
  | { type: 'load-ready'; requestId: number; detail: EngineerRepairRequestDetail }
  | { type: 'apply-detail'; requestId: number; detail: EngineerRepairRequestDetail }
  | { type: 'apply-response'; requestId: number; response: EngineerRepairRequestResponseItem }
  | {
      type: 'load-failed';
      requestId: number;
      reason: EngineerRepairRequestDetailFailureReason | null;
      message: string;
    };

/**
 * 回复按 createdAt ASC + id ASC 排序（公共读模型契约）。
 * 新回复的服务端 createdAt 晚于既有回复，但并发下其他工程师可能刚追加过回复，
 * 排序后取末条与后端 QueryService「createdAt DESC + id DESC 取末条」完全同口径。
 */
function mergeEngineerResponseSorted(
  responses: EngineerRepairRequestResponseItem[],
  response: EngineerRepairRequestResponseItem,
): EngineerRepairRequestResponseItem[] {
  return [...responses, response].sort((a, b) => {
    if (a.createdAt !== b.createdAt) {
      return a.createdAt < b.createdAt ? -1 : 1;
    }
    return a.id - b.id;
  });
}

function toDetailUserMessage(error: unknown): string {
  return isGraphQLIngressError(error) ? error.userMessage : '维修申请详情加载失败，请稍后重试。';
}

function engineerRepairRequestDetailReducer(
  state: EngineerRepairRequestDetailState,
  action: EngineerRepairRequestDetailAction,
): EngineerRepairRequestDetailState {
  switch (action.type) {
    case 'load-start':
      return { status: 'loading', requestSeq: action.requestId };
    case 'load-ready':
      if (action.requestId !== state.requestSeq) {
        return state;
      }
      return { status: 'ready', requestSeq: action.requestId, detail: action.detail };
    case 'apply-detail':
      // 接单 Mutation 返回的服务器最新详情原子注入（同一数据源的写后读，
      // 非第二真源）：不发起查询，避免整面板切回骨架屏造成闪现；
      // 序号随当前在飞请求保持，不制造新的在飞请求语义。
      if (state.status !== 'ready' || action.requestId !== state.requestSeq) {
        return state;
      }
      return { status: 'ready', requestSeq: state.requestSeq, detail: action.detail };
    case 'apply-response':
      // 回复 Mutation 返回的新回复原子注入：按服务端回复 ID 去重后追加，
      // 同一事件内同步更新 responses 与 latestResolutionStatus，
      // 不允许 UI 自行拼接并维护第二份详情状态；
      // 排序口径与后端读取契约一致（见 mergeEngineerResponseSorted）。
      if (state.status !== 'ready' || action.requestId !== state.requestSeq) {
        return state;
      }
      if (state.detail.responses.some((item) => item.id === action.response.id)) {
        return state;
      }
      {
        const responses = mergeEngineerResponseSorted(state.detail.responses, action.response);
        return {
          status: 'ready',
          requestSeq: state.requestSeq,
          detail: {
            ...state.detail,
            responses,
            latestResolutionStatus: responses[responses.length - 1].resolutionStatus,
          },
        };
      }
    case 'load-failed':
      if (action.requestId !== state.requestSeq) {
        return state;
      }
      return {
        status: 'failed',
        requestSeq: action.requestId,
        reason: action.reason,
        message: action.message,
      };
  }
}

/**
 * requestId 为 null 表示路由参数无效；不发请求，直接静态落入统一不可访问反馈。
 */
export function useEngineerRepairRequestDetail(requestId: number | null) {
  const [state, dispatch] = useReducer(engineerRepairRequestDetailReducer, {
    status: 'loading',
    requestSeq: 0,
  });
  const sequenceRef = useRef(0);
  /** 静默重查防并发标记：同一时间只允许一个静默重查在飞 */
  const recheckBusyRef = useRef(false);

  const loadDetail = useCallback(
    async (targetId: number): Promise<EngineerRepairRequestDetailLoadOutcome> => {
      sequenceRef.current += 1;
      const sequence = sequenceRef.current;
      dispatch({ type: 'load-start', requestId: sequence });

      try {
        const result = await fetchEngineerRepairRequestDetail(targetId);

        if (result.ok) {
          dispatch({ type: 'load-ready', requestId: sequence, detail: result.detail });
        } else {
          dispatch({
            type: 'load-failed',
            requestId: sequence,
            reason: result.reason,
            message: result.message,
          });
        }

        return result;
      } catch (error) {
        const message = toDetailUserMessage(error);
        dispatch({
          type: 'load-failed',
          requestId: sequence,
          reason: null,
          message,
        });

        return { ok: false, reason: null, message };
      }
    },
    [],
  );

  useEffect(() => {
    if (requestId === null) {
      // 先推进序号再落静态失败：reducer 的竞态守卫只接受与当前序号一致的 action，
      // 缺少 load-start 会让下面的 load-failed 被守卫丢弃、状态永久停在骨架屏。
      // load-start 在此只表达「作废此前所有在飞请求并进入新序号」，不发起查询；
      // 两次 dispatch 在同一 effect 内被 React 批处理，不会产生 loading 闪现。
      sequenceRef.current += 1;
      const sequence = sequenceRef.current;
      dispatch({ type: 'load-start', requestId: sequence });
      dispatch({
        type: 'load-failed',
        requestId: sequence,
        reason: 'not-accessible',
        message: ENGINEER_DETAIL_NOT_ACCESSIBLE_MESSAGE,
      });
      return;
    }

    void loadDetail(requestId);
  }, [requestId, loadDetail]);

  /**
   * 重查当前详情（沿用查询状态机推进：重查失败落入既有加载失败/重试状态）。
   * 返回本次重查结果供编排层决策（requestId 为 null 时不发请求，返回 null）。
   */
  const reload = useCallback((): Promise<EngineerRepairRequestDetailLoadOutcome | null> => {
    if (requestId === null) {
      return Promise.resolve(null);
    }

    return loadDetail(requestId);
  }, [requestId, loadDetail]);

  /**
   * 静默重查当前详情：不把查询状态机切回 loading（不卸载已渲染的详情与表单），
   * 供回复结果不确定（response-failed）的收敛重查使用，避免表单草稿丢失。
   *
   * - 序号守卫：进入时快照当前序号，请求完成后用快照 dispatch；
   *   若请求期间序号已被其他查询流程推进，旧结果由 reducer 序号守卫丢弃，
   *   状态由新流程接管（完成后读取 sequenceRef.current 会把旧结果
   *   误贴上最新序号，反而可能覆盖新状态，因此必须开始时快照）；
   * - 失败（业务拒绝或 transport）：不改动查询状态机，保留当前详情与既有反馈，
   *   结果由编排层决策（是否收敛成功/保留不确定提示）；
   * - 防并发：同一时间只允许一个静默重查在飞，重入时直接返回 null
   *   （调用方按未确认处理），不叠加并行请求。
   */
  const recheckSilently =
    useCallback((): Promise<EngineerRepairRequestDetailLoadOutcome | null> => {
      if (requestId === null || recheckBusyRef.current) {
        return Promise.resolve(null);
      }

      recheckBusyRef.current = true;
      const sequence = sequenceRef.current;

      return (async () => {
        try {
          const result = await fetchEngineerRepairRequestDetail(requestId);

          if (result.ok) {
            dispatch({ type: 'apply-detail', requestId: sequence, detail: result.detail });
          }

          return result;
        } catch (error) {
          return { ok: false, reason: null, message: toDetailUserMessage(error) };
        } finally {
          recheckBusyRef.current = false;
        }
      })();
    }, [requestId]);

  /**
   * 用接单 Mutation 返回的最新详情原子更新当前展示（不发起查询）。
   * 仅在详情已就绪时生效；其余状态由查询流程自行推进。
   */
  const applyDetail = useCallback((detail: EngineerRepairRequestDetail) => {
    dispatch({ type: 'apply-detail', requestId: sequenceRef.current, detail });
  }, []);

  /**
   * 用回复 Mutation 返回的新回复原子更新当前展示（不发起查询）。
   * 仅在详情已就绪时生效；按服务端回复 ID 去重，同一事件内同步
   * responses 与 latestResolutionStatus（编排层用，UI 不手工拼装）。
   */
  const applyResponse = useCallback((response: EngineerRepairRequestResponseItem) => {
    dispatch({ type: 'apply-response', requestId: sequenceRef.current, response });
  }, []);

  return { state, reload, recheckSilently, applyDetail, applyResponse };
}
