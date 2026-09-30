// src/widgets/customer-repair-workspace/index.tsx

import { Button } from 'antd';
import { useNavigate } from 'react-router';

import { isAuthSessionRoleAllowedAt, useAuthSession } from '@/features/auth-session';
import {
  CustomerRepairRequestDetailPanel,
  CustomerRepairRequestListPanel,
  type CustomerRepairRequestListView,
  RepairRequestForm,
  type RepairRequestRecord,
  useCustomerRepairRequestDetailFlow,
  useCustomerRepairRequestList,
} from '@/features/repair-request';

import { DataCard } from '@/shared/ui/data-card';
import { EmptyState } from '@/shared/ui/empty-state';
import { ErrorState } from '@/shared/ui/error-state';
import { LoadingState } from '@/shared/ui/loading-state';
import { useMessageFeedback } from '@/shared/ui/message-feedback';
import { PageHeader } from '@/shared/ui/page-header';

/**
 * 客户维修工作台（PR5 整合工作台，负责人 2026-09-29 裁定）。
 *
 * 四个客户 URL（/customer、/customer/repair-requests/new、/customer/repair-requests、
 * /customer/repair-requests/:requestId）复用同一工作台与同一固定页头（title="客户页面"）：
 * - 首页默认 create 态：左侧保留「我的维修申请」列表上下文，右侧显示创建表单；
 * - 点击左侧「我的维修申请」入口或申请项进入 history-list / history-detail 态；
 * - 页头「发起维修申请」按钮始终保留：历史态点击恢复默认创建态，
 *   create 态重复点击 no-op（不重复挂载、不清空未提交输入）；
 * - 窄屏（<960px）单面板：create 显示表单、history-list 显示列表、history-detail 显示详情
 *   （显隐由 index.css `.customer-workspace-grid[data-mode]` 控制），标题始终保持「客户页面」。
 *
 * 边界（计划 S1）：本组件只做页面组合、选中 ID 与导航意图；列表/详情/创建/删除的
 * 请求状态机继续由 repair-request feature 的 application hook 持有，不直调 adapter、
 * 不复制 DTO / 错误映射 / 权限判断。
 *
 * 选中项真值（计划 S0-6）：URL 的 requestId 是详情目标唯一真值；列表态以当前页第一项
 * 作为默认详情；create 态不派生任何历史详情；仅当目标存在于当前已加载分页时才显示
 * active；深链目标不在本页时不误选、不伪造。
 */

const CUSTOMER_CREATE_PATH = '/customer';
// 创建兼容入口：与角色放行判断（SUPER_ADMIN 例外）共用同一路径常量
const REPAIR_REQUEST_CREATE_ENTRY_PATH = '/customer/repair-requests/new';
const REPAIR_REQUESTS_LIST_PATH = '/customer/repair-requests';
const repairRequestDetailPath = (id: number) => `${REPAIR_REQUESTS_LIST_PATH}/${id}`;

export type CustomerRepairWorkspaceMode = 'create' | 'history-list' | 'history-detail';

type CustomerRepairWorkspaceProps = {
  mode: CustomerRepairWorkspaceMode;
  /** history-detail 的目标申请 ID（路由参数解析结果；非数字时为 NaN，走详情 not-found 口径） */
  requestId?: number;
};

/**
 * 详情容器：详情 hook 只在具备详情目标时挂载（create 态不发起详情查询）。
 * 删除命令按模式编排（计划 S0-6）：
 * - history-list：走列表 hook 删除（内建分页回退与回刷），右栏随回刷结果更新为新第一项；
 * - history-detail：优先走详情 hook 删除（目标代次守卫）；从左栏删除当前 URL 目标时
 *   同样在成功后进入列表路由，列表刷新完成后选择当前页第一项。
 */
function WorkspaceDetailPane({
  deleteViaDetailFlow,
  deletingFromList,
  detailId,
  onBackToList,
  onDeleteFromList,
  onNavigateToList,
}: {
  deleteViaDetailFlow: boolean;
  deletingFromList: boolean;
  detailId: number;
  onBackToList?: () => void;
  onDeleteFromList: (id: number) => void;
  onNavigateToList: () => void;
}) {
  const notify = useMessageFeedback();
  const { state, deleting, deleteRequest } = useCustomerRepairRequestDetailFlow(detailId, notify);

  const handleDelete = () => {
    if (deleteViaDetailFlow) {
      void deleteRequest().then((deleted) => {
        if (deleted) {
          onNavigateToList();
        }
      });

      return;
    }

    onDeleteFromList(detailId);
  };

  return (
    <CustomerRepairRequestDetailPanel
      deleting={deleteViaDetailFlow ? deleting : deletingFromList}
      onBackToList={onBackToList}
      onDelete={handleDelete}
      state={state}
    />
  );
}

/** 历史态但暂无详情目标时（列表加载中 / 失败 / 空库 / 越界空页）的右栏占位。 */
function ListPlaceholderPane({
  onCreateRequest,
  onRetry,
  state,
}: {
  onCreateRequest: () => void;
  onRetry: () => void;
  state: CustomerRepairRequestListView;
}) {
  return (
    <DataCard title="维修申请详情">
      {state.status === 'loading' ? <LoadingState label="正在加载维修申请…" /> : null}

      {state.status === 'failed' ? (
        <ErrorState
          action={
            <Button onClick={onRetry} size="small">
              重试
            </Button>
          }
          title="维修申请列表加载失败，详情暂不可用。"
        />
      ) : null}

      {state.status === 'ready' && state.data.total === 0 ? (
        <EmptyState
          action={
            <Button onClick={onCreateRequest} type="primary">
              发起维修申请
            </Button>
          }
          description="设备出现异常时，提交故障信息创建维修申请。"
          title="还没有维修申请。"
        />
      ) : null}

      {state.status === 'ready' && state.data.total > 0 ? (
        <EmptyState title="当前页暂无申请，请切换页码查看。" />
      ) : null}
    </DataCard>
  );
}

/**
 * create 态右栏：主表单 + 约 230px「填写提示」（仅真实业务规则，无 AI / 统计 / 演示内容）。
 * 被拒角色（SUPER_ADMIN 创建页例外）不渲染表单也不发起型号查询，展示明确说明。
 */
function CreatePane({
  canCreateRepairRequest,
  onCreated,
  onOpenMyRequests,
  onViewCreated,
}: {
  canCreateRepairRequest: boolean;
  onCreated: (record: RepairRequestRecord) => void;
  onOpenMyRequests: () => void;
  onViewCreated: (record: RepairRequestRecord) => void;
}) {
  if (!canCreateRepairRequest) {
    return (
      <DataCard title="发起维修申请">
        <EmptyState
          description="创建维修申请仅对客户账号开放，管理员不能代客户发起。"
          title="当前账号不能发起维修申请。"
        />
      </DataCard>
    );
  }

  return (
    <DataCard title="发起维修申请">
      <div className="flex flex-col gap-4">
        {/* 窄屏单面板下左栏被收起，此处提供进入「我的维修申请」的明确入口 */}
        <div className="customer-workspace-narrow-entry">
          <Button block onClick={onOpenMyRequests}>
            查看我的维修申请
          </Button>
        </div>

        <div className="customer-create-grid">
          <RepairRequestForm onCreated={onCreated} onViewCreated={onViewCreated} />

          <aside className="flex flex-col gap-3">
            <div className="rounded-xl border border-border bg-bg-container p-3.5">
              <div className="text-[9px] font-extrabold tracking-[0.12em] text-text-tertiary uppercase">
                填写提示
              </div>
              <ul className="mt-2 flex list-disc flex-col gap-2 pl-4 text-xs text-text-secondary">
                <li>设备型号仅可选择管理员已启用的型号。</li>
                <li>设备错误码必填，不超过 100 个字符。</li>
                <li>故障描述必填，不超过 5000 个字符。</li>
                <li>提交后申请内容不可修改；未接单的申请可自行删除。</li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </DataCard>
  );
}

export function CustomerRepairWorkspace({ mode, requestId }: CustomerRepairWorkspaceProps) {
  const navigate = useNavigate();
  const notify = useMessageFeedback();
  const { session, status } = useAuthSession();
  const { state, deletingId, deleteRequest, goToPage, retry } =
    useCustomerRepairRequestList(notify);

  // 与路由层同一判断函数对齐（2026-08-29 裁定：拒绝清单禁止超管进创建页）：
  // 被拒角色的页头按钮置灰并附文字说明，右栏 create 态不渲染可用表单。
  const canCreateRepairRequest =
    status !== 'authenticated' ||
    isAuthSessionRoleAllowedAt(session.role, REPAIR_REQUEST_CREATE_ENTRY_PATH);

  const listItems = state.status === 'ready' ? state.data.items : [];

  // 详情目标：create 态不派生（计划 S0-6 第一条）；列表态在 ready 且非空时以当前页
  // 第一项作为右栏默认详情；详情态以 URL requestId 为唯一真值（含 NaN 的 not-found 口径）。
  const detailTargetId: number | null =
    mode === 'history-detail'
      ? (requestId ?? null)
      : mode === 'history-list'
        ? (listItems[0]?.id ?? null)
        : null;

  // active 高亮只在目标真实存在于当前已加载分页时显示（深链不在本页时不误选、不伪造）。
  const selectedRequestId =
    detailTargetId !== null && listItems.some((item) => item.id === detailTargetId)
      ? detailTargetId
      : null;

  const navigateToCreate = () => navigate(CUSTOMER_CREATE_PATH);
  const navigateToList = () => navigate(REPAIR_REQUESTS_LIST_PATH);

  const handleCreateButton = () => {
    if (mode === 'create') {
      return; // 已处于创建态：不重复挂载、不清空未提交输入
    }

    navigateToCreate();
  };

  const handleOpenMyRequests = () => {
    if (mode !== 'history-list') {
      navigateToList();
    }
  };

  const handleSelect = (id: number) => {
    navigate(repairRequestDetailPath(id));
  };

  const handleDeleteFromList = (id: number) => {
    // 详情态从左栏删除当前 URL 目标：删除成功后进入列表路由（列表刷新后选第一项）；
    // 其余情况（列表态、或删除非当前目标）保持在列表路由并沿用列表 hook 的回刷规则。
    if (mode === 'history-detail' && detailTargetId === id) {
      void deleteRequest(id).then((deleted) => {
        if (deleted) {
          navigateToList();
        }
      });

      return;
    }

    void deleteRequest(id);
  };

  return (
    <div className="page-stack">
      <PageHeader
        description="提交设备维修申请，并跟踪接单情况、处理进度与工程师回复。"
        eyebrow="Customer Workspace"
        extra={
          <div className="flex flex-col items-end gap-1">
            <Button disabled={!canCreateRepairRequest} onClick={handleCreateButton} type="primary">
              发起维修申请
            </Button>
            {canCreateRepairRequest ? null : (
              <div className="text-xs text-text-secondary">超管不能代客户发起维修申请</div>
            )}
          </div>
        }
        title="客户页面"
      />

      <div className="customer-workspace-grid" data-mode={mode}>
        <div className="customer-workspace-list-pane min-w-0">
          <CustomerRepairRequestListPanel
            deletingId={deletingId}
            onCreateRequest={navigateToCreate}
            onDelete={handleDeleteFromList}
            onGoToPage={goToPage}
            onOpenMyRequests={handleOpenMyRequests}
            onRetry={retry}
            onSelect={handleSelect}
            selectedRequestId={selectedRequestId}
            state={state}
          />
        </div>

        <div className="customer-workspace-detail-pane min-w-0">
          {mode === 'create' ? (
            <CreatePane
              canCreateRepairRequest={canCreateRepairRequest}
              onCreated={() => retry()}
              onOpenMyRequests={handleOpenMyRequests}
              onViewCreated={(record) => navigate(repairRequestDetailPath(record.id))}
            />
          ) : detailTargetId !== null ? (
            <WorkspaceDetailPane
              deleteViaDetailFlow={mode === 'history-detail'}
              deletingFromList={deletingId === detailTargetId}
              detailId={detailTargetId}
              onBackToList={mode === 'history-detail' ? navigateToList : undefined}
              onDeleteFromList={handleDeleteFromList}
              onNavigateToList={navigateToList}
            />
          ) : (
            <ListPlaceholderPane onCreateRequest={navigateToCreate} onRetry={retry} state={state} />
          )}
        </div>
      </div>
    </div>
  );
}
