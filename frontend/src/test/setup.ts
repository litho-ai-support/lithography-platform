// src/test/setup.ts

// Ant Design 的响应式能力依赖 window.matchMedia，jsdom 未提供，
// 按 frontend/docs/testing.md 只在测试 setup 中补齐最小 shim。
import '@testing-library/jest-dom/vitest';

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: (query: string) => ({
    addEventListener: () => {},
    addListener: () => {},
    dispatchEvent: () => false,
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: () => {},
    removeListener: () => {},
  }),
  writable: false,
});

// Popconfirm / Tooltip 等浮层组件依赖 ResizeObserver，jsdom 同样未提供，补最小 stub。
class ResizeObserverStub {
  disconnect(): void {}
  observe(): void {}
  unobserve(): void {}
}

Object.defineProperty(window, 'ResizeObserver', {
  configurable: true,
  value: ResizeObserverStub,
  writable: false,
});
