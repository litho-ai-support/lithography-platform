// src/features/error-feedback/ui/error-500.tsx

import { ThunderboltOutlined } from '@ant-design/icons';

import { ErrorBlock } from './error-block';

export function Error500() {
  return (
    <ErrorBlock
      actions={[{ label: '返回工作台', to: '/' }]}
      description={'服务端在处理请求时遇到了意外错误。\n请稍后重试，或检查后端服务状态。'}
      icon={<ThunderboltOutlined />}
      statusCode={500}
      title="服务异常"
      tone="error"
    />
  );
}
