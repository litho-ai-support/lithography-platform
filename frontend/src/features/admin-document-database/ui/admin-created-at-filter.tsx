// src/features/admin-document-database/ui/admin-created-at-filter.tsx

import { DatePicker } from 'antd';

import type { AdminCreatedAtRangeState } from './admin-created-at-range';

type AdminCreatedAtFilterProps = {
  value: AdminCreatedAtRangeState;
  onChange: (range: AdminCreatedAtRangeState) => void;
};

/**
 * 创建时间范围筛选：三个标签共用，选择后立刻提交（与既有列表筛选行为一致）。
 * ISO 边界由前端构造，服务端只做 from ≤ to 与有效日期校验（S2 M-03 裁定）。
 */
export function AdminCreatedAtFilter({ value, onChange }: AdminCreatedAtFilterProps) {
  return (
    <DatePicker.RangePicker
      allowEmpty={[true, true]}
      onChange={(dates) => onChange(dates)}
      placeholder={['创建时间起', '创建时间止']}
      value={value}
    />
  );
}
