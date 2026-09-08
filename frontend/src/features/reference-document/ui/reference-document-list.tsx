// src/features/reference-document/ui/reference-document-list.tsx

import { useEffect, useMemo, useState } from 'react';
import { PlusOutlined } from '@ant-design/icons';
import type { TableColumnsType } from 'antd';
import { Alert, Button, Card, Empty, Input, Pagination, Select, Skeleton, Table } from 'antd';
import { useNavigate } from 'react-router';

import { useReferenceDocumentList } from '../application/use-reference-document-list';
import { useReferenceEquipmentModels } from '../application/use-reference-equipment-models';
import type {
  ReferenceDocumentListFilter,
  ReferenceDocumentListItem,
} from '../infrastructure/reference-document.types';
import { REFERENCE_DOCUMENT_TYPE_LABELS } from '../infrastructure/reference-document.types';

import { formatDateTimeText } from './format-date-time';
import {
  buildReferenceDocumentDetailPath,
  REFERENCE_DOCUMENT_NEW_PATH,
} from './reference-document-paths';

/** 标题搜索防抖间隔（ms） */
const SEARCH_DEBOUNCE_MS = 300;

const columns: TableColumnsType<ReferenceDocumentListItem> = [
  { dataIndex: 'title', key: 'title', title: '文档标题', width: 260 },
  {
    dataIndex: 'documentType',
    key: 'documentType',
    render: (value: string) => REFERENCE_DOCUMENT_TYPE_LABELS[value] ?? value,
    title: '文档类型',
    width: 130,
  },
  {
    key: 'equipmentModel',
    render: (_value, record) =>
      record.equipmentModelId === null ? '通用资料' : record.equipmentModelName,
    title: '适用设备型号',
    width: 200,
  },
  {
    dataIndex: 'description',
    key: 'description',
    ellipsis: true,
    render: (value: string | null) => value ?? '—',
    title: '文档说明',
  },
  {
    dataIndex: 'originalFilename',
    key: 'originalFilename',
    ellipsis: true,
    render: (value: string | null) => value ?? '纯文本',
    title: '原始文件名',
    width: 180,
  },
  { dataIndex: 'creatorNickname', key: 'creatorNickname', title: '创建人', width: 110 },
  {
    dataIndex: 'createdAt',
    key: 'createdAt',
    render: (value: string) => formatDateTimeText(value),
    title: '创建时间',
    width: 180,
  },
];

/**
 * 参考资料列表面板。
 *
 * - 标题搜索防抖；类型下拉与型号下拉筛选（型号选项走后端 equipmentModels）；
 * - 加载中 / 空列表 / 加载失败（含重试）/ 分页交互齐全；
 * - 空态区分筛选结果为空（total = 0）与当前页为空（保留分页器可回页，不形成死路）；
 * - 点击列表项进入详情路由；新增入口仅 SUPER_ADMIN 可见（canManage 由页面层按角色判定）。
 */
export function ReferenceDocumentList({ canManage }: { canManage: boolean }) {
  const navigate = useNavigate();
  const [searchText, setSearchText] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const [documentType, setDocumentType] = useState<string | undefined>(undefined);
  const [equipmentModelId, setEquipmentModelId] = useState<number | undefined>(undefined);
  const models = useReferenceEquipmentModels();

  // 标题搜索防抖：输入即时回显，防抖后才触发列表重载
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedKeyword(searchText);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [searchText]);

  const filter = useMemo<ReferenceDocumentListFilter | undefined>(() => {
    const titleKeyword = debouncedKeyword.trim();
    const nextFilter: ReferenceDocumentListFilter = {};

    if (titleKeyword) {
      nextFilter.titleKeyword = titleKeyword;
    }

    if (documentType) {
      nextFilter.documentType = documentType;
    }

    if (equipmentModelId !== undefined) {
      nextFilter.equipmentModelId = equipmentModelId;
    }

    return Object.keys(nextFilter).length > 0 ? nextFilter : undefined;
  }, [debouncedKeyword, documentType, equipmentModelId]);

  const { state, goToPage, reload } = useReferenceDocumentList(filter);

  const hasActiveFilter =
    debouncedKeyword.trim().length > 0 ||
    documentType !== undefined ||
    equipmentModelId !== undefined;

  return (
    <Card
      extra={
        canManage ? (
          <Button
            icon={<PlusOutlined />}
            onClick={() => navigate(REFERENCE_DOCUMENT_NEW_PATH)}
            size="small"
            type="primary"
          >
            新增资料
          </Button>
        ) : null
      }
      title="参考资料列表"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            allowClear
            placeholder="按文档标题搜索"
            style={{ width: 240 }}
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
          <Select
            allowClear
            placeholder="文档类型"
            style={{ width: 160 }}
            value={documentType}
            onChange={(value) => setDocumentType(value)}
            options={Object.entries(REFERENCE_DOCUMENT_TYPE_LABELS).map(([value, label]) => ({
              label,
              value,
            }))}
          />
          <Select
            allowClear
            loading={models.state.status === 'loading'}
            placeholder="适用设备型号"
            style={{ width: 240 }}
            value={equipmentModelId}
            onChange={(value) => setEquipmentModelId(value)}
            options={
              models.state.status === 'ready'
                ? models.state.models.map((model) => ({
                    label: `${model.modelName}（${model.modelCode}）`,
                    value: model.id,
                  }))
                : []
            }
          />
        </div>

        {models.state.status === 'failed' ? (
          <Alert
            action={
              <Button onClick={models.reload} size="small">
                重试
              </Button>
            }
            title={models.state.message}
            showIcon
            type="error"
          />
        ) : null}

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
          <Empty
            description={hasActiveFilter ? '没有符合筛选条件的参考资料。' : '暂无参考资料。'}
          />
        ) : null}

        {state.status === 'ready' && state.total > 0 ? (
          <div className="flex flex-col gap-4">
            {state.items.length > 0 ? (
              <Table<ReferenceDocumentListItem>
                columns={columns}
                dataSource={state.items}
                onRow={(record) => ({
                  onClick: () => navigate(buildReferenceDocumentDetailPath(record.id)),
                  style: { cursor: 'pointer' },
                })}
                pagination={false}
                rowKey="id"
                scroll={{ x: 1100 }}
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
