// src/features/repair-request/ui/engineer-repair-request-list.tsx

/**
 * 工程师维修申请列表面板。
 *
 * - “待接单（AVAILABLE）”与“我的接单（MINE）”两个视图，取值即 GraphQL 参数，
 *   不创建第三套前端状态值；
 * - 加载中 / 空列表 / 加载失败（含重试）/ 分页交互齐全；
 * - 空态区分范围为空（total = 0）与当前页为空（保留分页器可回页，不形成死路）；
 * - 点击列表项进入工程师详情路由；
 * - 页面与 UI 不解析 Apollo 原始错误：流程状态来自 feature application，
 *   transport 文案已由共享错误模型归一。
 */

import { useState } from 'react';
import type { TableColumnsType } from 'antd';
import { Alert, Button, Card, Empty, Pagination, Segmented, Skeleton, Table } from 'antd';
import { useNavigate } from 'react-router';

import { useEngineerRepairRequestList } from '../application/use-engineer-repair-request-list';
import type {
  EngineerRepairListScope,
  EngineerRepairRequestListItem,
  EngineerResolutionStatusValue,
} from '../infrastructure/engineer-repair-request.types';

import { ENGINEER_REPAIR_REQUEST_DETAIL_PATH } from './engineer-repair-request-paths';
import { formatDateTimeText } from './format-date-time';
import { AcceptanceTag, ResolutionTag } from './repair-request-status-tags';

const SCOPE_OPTIONS: Array<{ label: string; value: EngineerRepairListScope }> = [
  { label: '待接单', value: 'AVAILABLE' },
  { label: '我的接单', value: 'MINE' },
];

const EMPTY_TEXT_BY_SCOPE: Record<EngineerRepairListScope, string> = {
  AVAILABLE: '暂无待接单的维修申请。',
  MINE: '暂无你的接单记录。',
};

const columns: TableColumnsType<EngineerRepairRequestListItem> = [
  { dataIndex: 'requestNo', key: 'requestNo', title: '申请编号', width: 160 },
  {
    key: 'equipmentModel',
    render: (_value, record) =>
      `${record.equipmentModel.modelName}（${record.equipmentModel.modelCode}）`,
    title: '设备型号',
  },
  { dataIndex: 'errorCode', key: 'errorCode', title: '错误码', width: 140 },
  {
    dataIndex: 'createdAt',
    key: 'createdAt',
    render: (value: string) => formatDateTimeText(value),
    title: '创建时间',
    width: 190,
  },
  {
    dataIndex: 'isAccepted',
    key: 'isAccepted',
    render: (value: boolean) => <AcceptanceTag accepted={value} />,
    title: '接单状态',
    width: 110,
  },
  {
    dataIndex: 'latestResolutionStatus',
    key: 'latestResolutionStatus',
    render: (value: EngineerResolutionStatusValue | null) => <ResolutionTag status={value} />,
    title: '最新处理状态',
    width: 130,
  },
];

export function EngineerRepairRequestList() {
  const navigate = useNavigate();
  const [scope, setScope] = useState<EngineerRepairListScope>('AVAILABLE');
  const { state, goToPage, reload } = useEngineerRepairRequestList(scope);

  return (
    <Card title="维修申请列表">
      <div className="flex flex-col gap-4">
        <div>
          <Segmented
            onChange={(value) => setScope(value as EngineerRepairListScope)}
            options={SCOPE_OPTIONS}
            value={scope}
          />
        </div>

        {state.status === 'loading' ? <Skeleton active paragraph={{ rows: 6 }} /> : null}

        {state.status === 'failed' ? (
          <Alert
            action={
              <Button onClick={reload} size="small">
                重试
              </Button>
            }
            title={state.message}
            showIcon
            type="error"
          />
        ) : null}

        {state.status === 'ready' && state.total === 0 ? (
          <Empty description={EMPTY_TEXT_BY_SCOPE[scope]} />
        ) : null}

        {state.status === 'ready' && state.total > 0 ? (
          <div className="flex flex-col gap-4">
            {state.items.length > 0 ? (
              <Table<EngineerRepairRequestListItem>
                columns={columns}
                dataSource={state.items}
                onRow={(record) => ({
                  onClick: () => navigate(`${ENGINEER_REPAIR_REQUEST_DETAIL_PATH}${record.id}`),
                  style: { cursor: 'pointer' },
                })}
                pagination={false}
                rowKey="id"
                scroll={{ x: 880 }}
              />
            ) : (
              <Empty description="当前页暂无数据，请翻页返回。" />
            )}
            <div className="flex justify-end">
              <Pagination
                current={state.page}
                onChange={goToPage}
                pageSize={state.pageSize}
                showSizeChanger={false}
                showTotal={(total) => `共 ${total} 条`}
                total={state.total}
              />
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
