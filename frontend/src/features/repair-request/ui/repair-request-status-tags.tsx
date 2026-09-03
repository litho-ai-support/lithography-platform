// src/features/repair-request/ui/repair-request-status-tags.tsx

import { Tag } from 'antd';

import type { EngineerResolutionStatusValue } from '../infrastructure/engineer-repair-request.types';

/**
 * 维修申请切片内接单/处理状态标签的唯一实现（列表与详情共用），
 * 保证两处视觉语义一致，不在多个文件里各写一份。
 */
export function AcceptanceTag({ accepted }: { accepted: boolean }) {
  return accepted ? <Tag color="success">已接单</Tag> : <Tag color="processing">待接单</Tag>;
}

export function ResolutionTag({ status }: { status: EngineerResolutionStatusValue | null }) {
  if (!status) {
    return <span>暂无回复</span>;
  }
  return status === 'RESOLVED' ? <Tag color="success">已解决</Tag> : <Tag>处理中</Tag>;
}
