// src/features/reference-document/infrastructure/browser-file-download-adapter.ts

/**
 * 浏览器文件保存适配（feature/infrastructure）：把已取得的 Blob 交给浏览器保存。
 *
 * 归属理由：`URL.createObjectURL` + 临时 `<a download>` 属浏览器技术边界，
 * 与 API client / storage 同层；放在 ui 会让「详情面板」同时承担编排与 DOM 副作用。
 *
 * 约束（安全口径）：只用 blob + `a[download]`，不使用 `window.open` 或直链，
 * 下载请求仍走带 Authorization 头的 REST 通道。
 * 生命周期：无论点击是否成功都立即 `remove()` 并从 URL 表撤销——`click()` 抛错时
 * 若不回收，会残留游离的 `<a>` 节点与永不释放的 blob URL，短命 URL 反而变成泄漏。
 */
export function saveBlobAsFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);

  try {
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
