// src/features/repair-request/ui/repair-request-status-tags.tsx

import { StatusPill, type StatusPillTone } from '@/shared/ui/status-pill';

import type {
  EngineerRepairAcceptanceViewStatus,
  EngineerResolutionStatusValue,
} from '../infrastructure/engineer-repair-request.types';

/**
 * 维修申请切片内接单/处理状态胶囊的唯一实现（列表、详情与首页共用），
 * 保证多处视觉语义一致，不在多个文件里各写一份。
 *
 * 视觉统一消费 PR1 公共 StatusPill（状态胶囊），不另造标签样式：
 * 待接单/处理中为待办语义（warn），已由本人接单/已解决为完成语义（ok），
 * 他人已接单为事实分类（neutral）。
 *
 * 视角标签按后端 RepairRequestAcceptanceViewStatus 表达事实分类：
 * AVAILABLE 仅表示未接单事实，不代表当前会话可接单；
 * 可接单/可回复能力由详情/列表操作区按会话单值业务角色另行控制。
 */
const VIEW_STATUS_META: Record<
  EngineerRepairAcceptanceViewStatus,
  { label: string; tone: StatusPillTone }
> = {
  AVAILABLE: { label: '待接单', tone: 'warn' },
  MINE: { label: '我的接单', tone: 'ok' },
  TAKEN_BY_OTHER: { label: '他人已接单', tone: 'neutral' },
};

export function AcceptanceViewStatusTag({
  viewStatus,
}: {
  viewStatus: EngineerRepairAcceptanceViewStatus | null;
}) {
  if (!viewStatus) {
    // 视角状态缺失（后端保证工程师入口非空，此处为防腐兜底）：按未接单事实展示
    return <StatusPill tone="warn">待接单</StatusPill>;
  }
  const meta = VIEW_STATUS_META[viewStatus];
  return <StatusPill tone={meta.tone}>{meta.label}</StatusPill>;
}

export function ResolutionTag({ status }: { status: EngineerResolutionStatusValue | null }) {
  if (!status) {
    return <span>暂无回复</span>;
  }
  return (
    <StatusPill tone={status === 'RESOLVED' ? 'ok' : 'warn'}>
      {status === 'RESOLVED' ? '已解决' : '处理中'}
    </StatusPill>
  );
}
