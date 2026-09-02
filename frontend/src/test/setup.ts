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

// Ant Design 的 Table 等组件经 rc-resize-observer 依赖全局 ResizeObserver，
// jsdom 同样未提供；与 matchMedia 同源处理，只补最小空实现，
// 不模拟尺寸回调（布局尺寸不是本仓库 UI 测试的断言对象）。
class ResizeObserverStub {
  observe(): void {}

  unobserve(): void {}

  disconnect(): void {}
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  value: ResizeObserverStub,
  writable: true,
});
