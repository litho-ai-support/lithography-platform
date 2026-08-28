// src/pages/repair-request-list/index.tsx

import { PageHeader } from '@/shared/ui/page-header';

/**
 * 维修申请列表占位页面。
 *
 * 创建成功后的“查看申请列表”跳转需要真实落点，本页仅作占位：
 * 不提供实际业务（不查询、不展示申请记录），仅以文字说明列表功能后续提供。
 * 列表能力实现后在原地替换内容，路由与跳转方无需再改。
 */
export function RepairRequestListPage() {
  return (
    <div className="page-stack">
      <PageHeader description="查看您提交的维修申请记录。" title="维修申请列表" />
      <div className="surface-panel">
        <p>列表功能正在建设中，当前页面仅作为创建成功后的跳转落点。</p>
        <p>如需提交新的维修申请，请使用“创建维修申请”页面。</p>
      </div>
    </div>
  );
}
