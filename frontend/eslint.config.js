import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

const localRules = {
  'no-design-system-classname': {
    meta: {
      type: 'problem',
      docs: {
        description:
          'Disallow className on Ant Design and Ant Design X component bodies; use wrappers instead.',
      },
      schema: [],
      messages: {
        noClassName:
          'Do not attach `className` to {{component}} from {{source}}. Tailwind must stay on wrapper elements.',
      },
    },
    create(context) {
      const imports = new Map();

      function getTagInfo(nameNode) {
        if (nameNode.type === 'JSXIdentifier') {
          const source = imports.get(nameNode.name);
          if (source) {
            return { source, root: nameNode.name, component: nameNode.name };
          }
        }

        if (
          nameNode.type === 'JSXMemberExpression' &&
          nameNode.object.type === 'JSXIdentifier' &&
          nameNode.property.type === 'JSXIdentifier'
        ) {
          const source = imports.get(nameNode.object.name);
          if (source) {
            return {
              source,
              root: nameNode.object.name,
              component: `${nameNode.object.name}.${nameNode.property.name}`,
            };
          }
        }

        return null;
      }

      return {
        ImportDeclaration(node) {
          if (node.source.value !== 'antd' && node.source.value !== '@ant-design/x') {
            return;
          }

          for (const specifier of node.specifiers) {
            if (specifier.type === 'ImportSpecifier') {
              imports.set(specifier.local.name, node.source.value);
            }
          }
        },
        JSXOpeningElement(node) {
          const tagInfo = getTagInfo(node.name);

          if (!tagInfo) {
            return;
          }

          if (tagInfo.source === 'antd' && tagInfo.root === 'Flex') {
            return;
          }

          const classNameAttribute = node.attributes.find(
            (attribute) =>
              attribute.type === 'JSXAttribute' &&
              attribute.name.type === 'JSXIdentifier' &&
              attribute.name.name === 'className',
          );

          if (!classNameAttribute) {
            return;
          }

          context.report({
            node: classNameAttribute,
            messageId: 'noClassName',
            data: {
              component: tagInfo.component,
              source: tagInfo.source,
            },
          });
        },
      };
    },
  },
  'no-tailwind-magic-colors': {
    meta: {
      type: 'problem',
      docs: {
        description: 'Disallow magic color values inside JSX className strings.',
      },
      schema: [],
      messages: {
        noMagicColor:
          'Do not use magic color values in `className`. Use shared tokens or CSS variables instead.',
      },
    },
    create(context) {
      const magicColorPattern = /#[0-9a-fA-F]{3,8}|\b(?:rgb|hsl)a?\s*\(/;

      function getStaticClassNameValue(attributeValue) {
        if (!attributeValue) {
          return null;
        }

        if (attributeValue.type === 'Literal' && typeof attributeValue.value === 'string') {
          return attributeValue.value;
        }

        if (
          attributeValue.type === 'JSXExpressionContainer' &&
          attributeValue.expression.type === 'Literal' &&
          typeof attributeValue.expression.value === 'string'
        ) {
          return attributeValue.expression.value;
        }

        if (
          attributeValue.type === 'JSXExpressionContainer' &&
          attributeValue.expression.type === 'TemplateLiteral' &&
          attributeValue.expression.expressions.length === 0
        ) {
          return attributeValue.expression.quasis.map((quasi) => quasi.value.cooked ?? '').join('');
        }

        return null;
      }

      return {
        JSXAttribute(node) {
          if (node.name.type !== 'JSXIdentifier' || node.name.name !== 'className') {
            return;
          }

          const classNameValue = getStaticClassNameValue(node.value);
          if (!classNameValue) {
            return;
          }

          if (!magicColorPattern.test(classNameValue)) {
            return;
          }

          context.report({
            node,
            messageId: 'noMagicColor',
          });
        },
      };
    },
  },
  'no-inline-zindex': {
    meta: {
      type: 'problem',
      docs: {
        description: 'Disallow raw inline zIndex values; use semantic layer tokens instead.',
      },
      schema: [],
      messages: {
        noInlineZIndex:
          'Do not set raw `zIndex` inline. Use semantic layer tokens or shared style variables.',
      },
    },
    create(context) {
      return {
        JSXAttribute(node) {
          if (node.name.type !== 'JSXIdentifier' || node.name.name !== 'style') {
            return;
          }

          if (!node.value || node.value.type !== 'JSXExpressionContainer') {
            return;
          }

          const expression = node.value.expression;
          if (expression.type !== 'ObjectExpression') {
            return;
          }

          for (const property of expression.properties) {
            if (property.type !== 'Property') {
              continue;
            }

            const keyName =
              property.key.type === 'Identifier'
                ? property.key.name
                : property.key.type === 'Literal'
                  ? property.key.value
                  : null;

            if (keyName !== 'zIndex') {
              continue;
            }

            context.report({
              node: property,
              messageId: 'noInlineZIndex',
            });
          }
        },
      };
    },
  },
};

export default defineConfig([
  globalIgnores(['dist', 'docs/backend/**']),
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      boundaries,
      local: { rules: localRules },
      'simple-import-sort': simpleImportSort,
    },
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    settings: {
      'import/resolver': {
        typescript: {
          project: './tsconfig.app.json',
        },
      },
      'boundaries/elements': [
        { type: 'app', pattern: 'src/app/*', mode: 'folder', capture: ['moduleName'] },
        { type: 'pages', pattern: 'src/pages/*', mode: 'folder', capture: ['moduleName'] },
        { type: 'widgets', pattern: 'src/widgets/*', mode: 'folder', capture: ['moduleName'] },
        { type: 'features', pattern: 'src/features/*', mode: 'folder', capture: ['moduleName'] },
        { type: 'entities', pattern: 'src/entities/*', mode: 'folder', capture: ['moduleName'] },
        { type: 'shared', pattern: 'src/shared/*', mode: 'folder', capture: ['moduleName'] },
        { type: 'labs', pattern: 'src/labs/*', mode: 'folder', capture: ['moduleName'] },
        {
          type: 'sandbox',
          pattern: 'src/sandbox/*',
          mode: 'folder',
          capture: ['moduleName'],
        },
      ],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          message:
            'Import violates boundary rules. 请查阅 docs/dependency-rules.md。 如需例外，必须先人工评审并记录到对应 labs 模块的 meta.ts exception。禁止用深层 import 或相对路径绕过规则。',
          rules: [
            {
              from: { type: 'app' },
              allow: [
                { to: { type: 'app' } },
                { to: { type: ['pages', 'widgets', 'features', 'entities', 'shared'] } },
                {
                  from: { captured: { moduleName: 'router' } },
                  to: { type: ['labs', 'sandbox'] },
                },
              ],
            },
            {
              from: { type: 'pages' },
              allow: [
                { to: { type: 'pages', captured: { moduleName: '{{from.moduleName}}' } } },
                { to: { type: ['widgets', 'features', 'entities', 'shared'] } },
              ],
            },
            {
              from: { type: 'widgets' },
              allow: [
                { to: { type: 'widgets', captured: { moduleName: '{{from.moduleName}}' } } },
                { to: { type: ['features', 'entities', 'shared'] } },
              ],
            },
            {
              from: { type: 'features' },
              allow: [
                {
                  to: { type: 'features', captured: { moduleName: '{{from.moduleName}}' } },
                },
                { to: { type: ['entities', 'shared'] } },
              ],
            },
            {
              from: { type: 'entities' },
              allow: [
                {
                  to: { type: 'entities', captured: { moduleName: '{{from.moduleName}}' } },
                },
                { to: { type: 'shared' } },
              ],
            },
            {
              from: { type: 'shared' },
              allow: [{ to: { type: 'shared' } }],
            },
            {
              from: { type: 'labs' },
              allow: [
                // labs 依赖 entities 时仍受 no-restricted-imports 约束，只能使用 @/entities/<name> 公开入口
                { to: { type: 'labs', captured: { moduleName: '{{from.moduleName}}' } } },
                { to: { type: ['shared', 'entities'] } },
              ],
            },
            {
              from: { type: 'sandbox' },
              allow: [
                // sandbox 依赖 entities 时仍受 no-restricted-imports 约束，只能使用 @/entities/<name> 公开入口
                {
                  to: { type: 'sandbox', captured: { moduleName: '{{from.moduleName}}' } },
                },
                { to: { type: ['shared', 'entities'] } },
              ],
            },
          ],
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/app/*/*',
                '@/pages/*/*',
                '@/widgets/*/*',
                '@/features/*/*',
                '@/entities/*/*',
                '@/labs/*/*',
                '@/sandbox/*/*',
                '**/app/*/*',
                '**/pages/*/*',
                '**/widgets/*/*',
                '**/features/*/*',
                '**/entities/*/*',
                '**/labs/*/*',
                '**/sandbox/*/*',
              ],
              message:
                'Cross-module imports must use a module public API such as "@/entities/user". 如认为确需例外，请先人工评审；不要用深层 import 绕过规则。',
            },
          ],
        },
      ],
      'simple-import-sort/imports': [
        'error',
        {
          groups: [
            ['^\\u0000'],
            ['^react$', '^react-dom$', '^@?\\w'],
            ['^@/app(?:/.*|$)'],
            ['^@/pages(?:/.*|$)', '^@/widgets(?:/.*|$)', '^@/features(?:/.*|$)'],
            ['^@/entities(?:/.*|$)'],
            ['^@/shared(?:/.*|$)'],
            ['^@/labs(?:/.*|$)', '^@/sandbox(?:/.*|$)'],
            ['^\\.\\.(?!/?$)', '^\\.\\./?$'],
            ['^\\./(?=.*/)(?!/?$)', '^\\.(?!/?$)', '^\\./?$'],
            ['^.+\\.css$'],
          ],
        },
      ],
      'simple-import-sort/exports': 'error',
      'local/no-design-system-classname': 'error',
      'local/no-tailwind-magic-colors': 'error',
      'local/no-inline-zindex': 'error',
    },
  },
]);
