// scripts/lint-z-index.mjs

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const SOURCE_ROOT = path.resolve('src');
const CHECKED_EXTENSIONS = new Set(['.css', '.ts', '.tsx']);

const RULES = [
  {
    message: 'Use a semantic z-index token or a named local CSS variable, not a raw number.',
    pattern: /\bz-index\s*:\s*(?:-?\d|var\([^;)]*,\s*-?\d)/i,
  },
  {
    message: 'Use semantic Tailwind z-index classes, not numeric or arbitrary z-* classes.',
    pattern: /(?:^|[\s'"`])z-(?:\d+|\[[^\]]+\])(?=$|[\s'"`])/,
  },
  {
    message: 'Use a semantic token value for inline zIndex, not a raw number.',
    pattern: /\bzIndex\s*:\s*-?\d/,
  },
];

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(absolutePath)));
      continue;
    }

    if (entry.isFile() && CHECKED_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(absolutePath);
    }
  }

  return files;
}

const files = await collectFiles(SOURCE_ROOT);
const violations = [];

for (const file of files) {
  const content = await readFile(file, 'utf8');
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    for (const rule of RULES) {
      if (rule.pattern.test(line)) {
        violations.push({
          file: path.relative(process.cwd(), file),
          line: index + 1,
          message: rule.message,
          source: line.trim(),
        });
      }
    }
  });
}

if (violations.length > 0) {
  console.error('z-index lint failed:');

  for (const violation of violations) {
    console.error(
      `${violation.file}:${violation.line} ${violation.message}\n  ${violation.source}`,
    );
  }

  process.exitCode = 1;
}
