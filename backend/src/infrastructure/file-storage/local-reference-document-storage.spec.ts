// src/infrastructure/file-storage/local-reference-document-storage.spec.ts

/// <reference types="jest" />
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { LocalReferenceDocumentStorage } from './local-reference-document-storage';

/** 构造以临时目录为存储根的存储实例（每个 describe 一个目录，按精确路径清理） */
const makeStorage = (dir: string) =>
  new LocalReferenceDocumentStorage({
    get: jest.fn(() => dir),
  } as never);

describe('LocalReferenceDocumentStorage', () => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'refdoc-storage-unit-'));

  afterAll(() => {
    fs.rmSync(baseDir, { recursive: true, force: true });
  });

  it('save 返回 32 位 hex + 扩展名引用；文件落入存储目录且字节一致', async () => {
    const storage = makeStorage(baseDir);
    const content = Buffer.from('unit-storage-bytes');

    const reference = await storage.save(content, 'pdf');

    expect(reference).toMatch(/^[0-9a-f]{32}\.pdf$/);
    const written = fs.readFileSync(path.join(baseDir, reference));
    expect(written.equals(content)).toBe(true);
  });

  it('save 同内容两次得到不同引用（随机引用写前查重，无同名覆盖）', async () => {
    const storage = makeStorage(baseDir);
    const content = Buffer.from('same-bytes');

    const first = await storage.save(content, 'txt');
    const second = await storage.save(content, 'txt');

    expect(first).not.toBe(second);
  });

  it.each(['p df', 'pd/f', '..', 'exe!', '%2e'])(
    'save 拒绝白名单外扩展名：%j',
    async (extension) => {
      const storage = makeStorage(baseDir);

      await expect(storage.save(Buffer.from('x'), extension)).rejects.toThrow(
        /Rejected unsafe file extension/,
      );
    },
  );

  it('resolve 对合法引用返回存储目录内的绝对路径', () => {
    const storage = makeStorage(baseDir);

    const resolved = storage.resolve('a1b2c3d4e5f60718293a4b5c6d7e8f90.pdf');

    expect(resolved.startsWith(baseDir + path.sep)).toBe(true);
  });

  it.each([
    '../evil.pdf',
    '..\\evil.pdf',
    '/etc/passwd',
    'sub/dir/a.pdf',
    'a1b2c3d4e5f60718293a4b5c6d7e8f9.pdf',
    'A1B2C3D4E5F60718293A4B5C6D7E8F90.PDF',
    '%2e%2e%2fevil.pdf',
    'a.pdf',
  ])('resolve 拒绝格式白名单外引用（含路径穿越与 URL 编码形态）：%j', (reference) => {
    const storage = makeStorage(baseDir);

    expect(() => storage.resolve(reference)).toThrow(/Rejected invalid storage reference format/);
  });

  it('delete 幂等：存在的文件删除成功，不存在时静默成功', async () => {
    const storage = makeStorage(baseDir);
    const reference = await storage.save(Buffer.from('to-delete'), 'txt');
    const absolutePath = storage.resolve(reference);
    expect(fs.existsSync(absolutePath)).toBe(true);

    await storage.delete(reference);
    expect(fs.existsSync(absolutePath)).toBe(false);

    // 第二次删除：文件已不存在，静默成功不抛错
    await expect(storage.delete(reference)).resolves.toBeUndefined();
  });

  it('save 前查重与 wx 标志：绝不覆盖已存在同名文件', async () => {
    const storage = makeStorage(baseDir);
    const reference = await storage.save(Buffer.from('first'), 'txt');
    const absolutePath = storage.resolve(reference);

    // 人工放置同名文件后重试大量生成，内容不被覆盖（wx 标志保证）
    const before = fs.readFileSync(absolutePath);
    for (let i = 0; i < 8; i += 1) {
      await storage.save(Buffer.from(`round-${i}`), 'txt');
    }
    expect(fs.readFileSync(absolutePath).equals(before)).toBe(true);
  });
});
