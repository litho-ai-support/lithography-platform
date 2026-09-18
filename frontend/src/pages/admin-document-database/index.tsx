// src/pages/admin-document-database/index.tsx

import { Alert, Button, Skeleton, Tabs } from 'antd';

import {
  AdminAiConversationsTab,
  AdminAiReportsTab,
  AdminRepairRequestsTab,
  useAdminDocumentStats,
} from '@/features/admin-document-database';
import { ReferenceDocumentList } from '@/features/reference-document';

import { PageHeader } from '@/shared/ui/page-header';
import { StatCard } from '@/shared/ui/stat-card';

/**
 * 文档数据库页（PR3 S3）：页头四类真实统计 + 四标签。
 *
 * - 路由治理复用 protectedRouteLoader 与 /admin/** 角色策略
 * *（SUPER_ADMIN 放行，ENGINEER/CUSTOMER 按角色路径表拒绝）；
 * - 四个标签各自实例化独立的列表 hook（筛选/分页/加载状态互不共享），
 *   Tabs 默认懒挂载、已挂载标签卸载保留，切换不串数据；
 * - 参考资料标签按计划表「复用当前 GraphQL/REST 契约」：直接组合
 *   features/reference-document 公开列表组件（含筛选/分页/四态与
 *   仅 SUPER_ADMIN 的上传、编辑、软删除能力），不制造平行功能；
 * - 统计口径与默认列表过滤一致（不含软删除），来自后端聚合统计查询；
 * - 本页新增的管理员聚合 Query（维修申请 / AI 会话 / AI 报告）全为只读；仅参考资料标签
 *   复用既有、只向 SUPER_ADMIN 开放的管理能力（上传 / 编辑 / 软删），故页面整体非绝对只读。
 */
export function AdminDocumentDatabasePage() {
  const stats = useAdminDocumentStats();

  return (
    <div className="page-stack">
      <PageHeader
        description="面向 SUPER_ADMIN 的数据聚合视图：维修申请、AI 会话、AI 报告为只读聚合，参考资料标签复用既有管理能力；各标签独立分页筛选。"
        title="文档数据库"
      />

      {stats.state.status === 'loading' ? <Skeleton active paragraph={{ rows: 1 }} /> : null}
      {stats.state.status === 'failed' ? (
        <Alert
          action={
            <Button onClick={stats.reload} size="small">
              重试
            </Button>
          }
          description="列表功能不受影响。"
          showIcon
          title={`统计加载失败：${stats.state.message}`}
          type="error"
        />
      ) : null}
      {stats.state.status === 'ready' ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            hint="不含软删除"
            label="维修申请"
            value={stats.state.stats.repairRequestTotal}
          />
          <StatCard
            hint="不含软删除"
            label="参考资料"
            value={stats.state.stats.referenceDocumentTotal}
          />
          <StatCard
            hint="全部工程师会话"
            label="AI 会话"
            value={stats.state.stats.aiConversationTotal}
          />
          <StatCard hint="全部生成报告" label="AI 报告" value={stats.state.stats.aiReportTotal} />
        </div>
      ) : null}

      <Tabs
        defaultActiveKey="reference-documents"
        items={[
          {
            children: <ReferenceDocumentList canManage />,
            key: 'reference-documents',
            label: '参考资料',
          },
          {
            children: <AdminRepairRequestsTab />,
            key: 'repair-requests',
            label: '维修申请',
          },
          {
            children: <AdminAiConversationsTab />,
            key: 'ai-conversations',
            label: 'AI 会话',
          },
          {
            children: <AdminAiReportsTab />,
            key: 'ai-reports',
            label: 'AI 报告',
          },
        ]}
      />
    </div>
  );
}
