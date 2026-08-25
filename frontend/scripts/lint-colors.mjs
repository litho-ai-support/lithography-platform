// scripts/lint-colors.mjs

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const SOURCE_ROOT = path.resolve('src');
const CHECKED_EXTENSIONS = new Set(['.css', '.ts', '.tsx']);
const MAGIC_COLOR_PATTERN = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|hsl)a?\s*\(/gi;
const INDEX_CSS_PATH = path.normalize('src/index.css');
const THEME_PATH = path.normalize('src/app/theme/index.ts');
const ALLOWED_INDEX_CSS_COLOR_TOKENS = new Set(['--color-ai-accent', '--color-ai-accent-hover']);
const ALLOWED_THEME_TOKEN_NAMES = new Set([
  'colorPrimary',
  'colorError',
  'colorLink',
  'colorBgLayout',
  'colorBgContainer',
]);

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

function isAllowedMagicColor(relativeFile, line) {
  const normalizedFile = path.normalize(relativeFile);

  if (normalizedFile === INDEX_CSS_PATH) {
    const tokenName = line.match(/^\s*(--[\w-]+)\s*:/)?.[1];
    return tokenName ? ALLOWED_INDEX_CSS_COLOR_TOKENS.has(tokenName) : false;
  }

  if (normalizedFile === THEME_PATH) {
    return [...ALLOWED_THEME_TOKEN_NAMES].some((tokenName) =>
      new RegExp(`\\b${tokenName}\\s*:`).test(line),
    );
  }

  return false;
}

const files = await collectFiles(SOURCE_ROOT);
const violations = [];

for (const file of files) {
  const content = await readFile(file, 'utf8');
  const lines = content.split(/\r?\n/);
  const relativeFile = path.relative(process.cwd(), file);

  lines.forEach((line, index) => {
    MAGIC_COLOR_PATTERN.lastIndex = 0;

    if (!MAGIC_COLOR_PATTERN.test(line) || isAllowedMagicColor(relativeFile, line)) {
      return;
    }

    violations.push({
      file: relativeFile,
      line: index + 1,
      message:
        'Use Ant Design tokens, shared CSS variables, or a documented global token instead of a raw color.',
      source: line.trim(),
    });
  });
}

if (violations.length > 0) {
  console.error('color lint failed:');

  for (const violation of violations) {
    console.error(
      `${violation.file}:${violation.line} ${violation.message}\n  ${violation.source}`,
    );
  }

  process.exitCode = 1;
}
