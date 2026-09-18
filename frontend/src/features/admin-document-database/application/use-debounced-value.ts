// src/features/admin-document-database/application/use-debounced-value.ts

import { useEffect, useState } from 'react';

/** 输入防抖：即时回显由调用方本地 state 负责，防抖值用于触发列表重载 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [value, delayMs]);

  return debouncedValue;
}
