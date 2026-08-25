// src/features/error-feedback/ui/error-403.tsx

import { StopOutlined } from '@ant-design/icons';

import { ErrorBlock } from './error-block';

export function Error403() {
  return (
    <ErrorBlock
      actions={[{ label: '返回工作台', to: '/' }]}
      description="当前环境或权限不允许访问这个页面。如果你认为这是一个错误，请检查访问入口或联系维护者。"
      icon={<StopOutlined />}
      statusCode={403}
      title="访问被拒绝"
      tone="warning"
    />
  );
}
