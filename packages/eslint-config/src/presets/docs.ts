import markdownESlintPlugin from '@eslint/markdown';
import tsParser from '@typescript-eslint/parser';
import eslintPluginJsxA11y from 'eslint-plugin-jsx-a11y';
import eslintPluginN from 'eslint-plugin-n';
import eslintPluginReact from 'eslint-plugin-react';
import eslintPluginReactHooks from 'eslint-plugin-react-hooks';
import eslintPluginVue from 'eslint-plugin-vue';
import type { defineConfig } from 'eslint/config';
import globals from 'globals';
import vueParser from 'vue-eslint-parser';
import { supportedEcmaVersion, untypedTypeScriptRules } from '../config';
import eslintGeneralConfig from '../general';

type Config = ReturnType<typeof defineConfig>;

const config: Config = [
  ...eslintGeneralConfig,

  // Vue recommended config (includes plugin registration)
  ...eslintPluginVue.configs['flat/recommended'],

  {
    plugins: { n: eslintPluginN },
    rules: {
      'n/no-unsupported-features/node-builtins': [
        'error',
        {
          // ideally we would like to allow all experimental features
          // https://github.com/eslint-community/eslint-plugin-n/issues/199
          ignores: ['fetch', 'import.meta.dirname'],
        },
      ],
    },
  },

  // Vue configuration overrides
  {
    name: 'Vue',
    files: ['**/*.vue'],
    settings: {
      vue: {
        version: 'detect',
      },
    },
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        extraFileExtensions: ['.vue'],
        sourceType: 'module',
        ecmaVersion: supportedEcmaVersion,
      },
    },
    rules: {
      // Vue-specific quality rules (non-formatting)
      'vue/block-order': ['error', { order: ['script', 'template', 'style'] }],
      'vue/component-api-style': ['error', ['script-setup']],
      'vue/component-name-in-template-casing': ['error', 'PascalCase'],
      'vue/custom-event-name-casing': ['error', 'camelCase'],
      'vue/define-emits-declaration': ['error', 'type-based'],
      'vue/define-props-declaration': ['error', 'type-based'],
      'vue/html-button-has-type': 'error',
      'vue/html-comment-content-spacing': 'error',
      'vue/no-boolean-default': 'error',
      'vue/no-duplicate-attr-inheritance': 'error',
      'vue/no-empty-component-block': 'error',
      'vue/no-multiple-objects-in-class': 'error',
      'vue/no-potential-component-option-typo': 'error',
      'vue/no-required-prop-with-default': 'error',
      'vue/no-static-inline-styles': 'error',
      'vue/no-template-target-blank': 'error',
      'vue/no-this-in-before-route-enter': 'error',
      'vue/no-undef-components': 'error',
      'vue/no-undef-properties': 'error',
      'vue/no-unused-properties': 'error',
      'vue/no-unused-refs': 'error',
      'vue/no-use-v-else-with-v-for': 'error',
      'vue/no-useless-mustaches': 'error',
      'vue/no-useless-v-bind': 'error',
      'vue/no-v-text-v-html-on-component': 'error',
      'vue/padding-line-between-blocks': 'error',
      'vue/prefer-define-options': 'error',
      'vue/prefer-separate-static-class': 'error',
      'vue/prefer-true-attribute-shorthand': 'error',
      'vue/require-macro-variable-name': 'error',
      'vue/static-class-names-order': 'error',
      'vue/v-for-delimiter-style': ['error', 'in'],
      'vue/valid-define-options': 'error',

      // Disable formatting rules - let Prettier handle these
      'vue/html-indent': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/first-attribute-linebreak': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/html-closing-bracket-spacing': 'off',
      'vue/html-self-closing': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      'vue/singleline-html-element-content-newline': 'off',

      // Relaxed rules for Vue
      'vue/no-v-html': 'off',
      'vue/require-v-for-key': 'off',

      // TypeScript rules adjustments for Vue
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      'no-return-await': 'off',
      'require-await': 'off',
    },
  },

  // React recommended configurations - only apply to React files
  {
    files: ['**/*.{jsx,mjsx,tsx,mtsx}'],
    ...eslintPluginReact.configs.flat.recommended,
  },
  {
    files: ['**/*.{jsx,mjsx,tsx,mtsx}'],
    ...eslintPluginReactHooks.configs.flat.recommended,
  },
  {
    files: ['**/*.{jsx,mjsx,tsx,mtsx}'],
    ...eslintPluginJsxA11y.flatConfigs.recommended,
  },

  // React configuration overrides and customization
  {
    name: 'React',
    files: ['**/*.{jsx,mjsx,tsx,mtsx}'],
    settings: {
      react: {
        version: 'detect',
      },
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
        sourceType: 'module',
        ecmaVersion: supportedEcmaVersion,
      },
      globals: {
        ...globals.serviceworker,
        ...globals.browser,
      },
    },
    rules: {
      // TypeScript provides type checking
      'react/prop-types': 'off',
      // Not needed in React 17+
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',

      // Warn about dangerouslySetInnerHTML
      'react/no-danger': 'warn',
      // Prevent javascript: URLs
      'react/jsx-no-script-url': 'error',
      // Enhanced target="_blank" security
      'react/jsx-no-target-blank': [
        'error',
        {
          allowReferrer: false,
          enforceDynamicLinks: 'always',
        },
      ],
      'react/jsx-key': [
        'error',
        {
          checkFragmentShorthand: true,
          checkKeyMustBeforeSpread: true,
          warnOnDuplicates: true,
        },
      ],
      // Avoid array index as key
      'react/no-array-index-key': 'warn',
      // Enforce self-closing tags
      'react/self-closing-comp': 'error',
      // Style must be object
      'react/style-prop-object': 'error',
      // Void elements can't have children
      'react/void-dom-elements-no-children': 'error',
      // Omit true value for boolean props
      'react/jsx-boolean-value': ['error', 'never'],
      // Use <> instead of <Fragment>
      'react/jsx-fragments': ['error', 'syntax'],
      // Avoid unnecessary fragments
      'react/jsx-no-useless-fragment': [
        'error',
        {
          allowExpressions: true,
        },
      ],
      'react/jsx-pascal-case': [
        'error',
        {
          allowAllCaps: true,
          allowNamespace: true,
        },
      ],
      'react/no-unstable-nested-components': [
        'error',
        {
          allowAsProps: true,
        },
      ],
      // Consistent function component style
      'react/function-component-definition': [
        'error',
        {
          namedComponents: 'function-declaration',
          unnamedComponents: 'arrow-function',
        },
      ],

      // useState naming convention [value, setValue]
      'react/hook-use-state': 'error',
      // Enforce Hooks rules
      'react-hooks/rules-of-hooks': 'error', // Enforce Hooks rules
      // Verify effect dependencies
      'react-hooks/exhaustive-deps': 'warn', // Verify effect dependencies

      // Accessibility (a11y) - Essential for inclusive web
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-has-content': 'error',
      'jsx-a11y/anchor-is-valid': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-proptypes': 'error',
      'jsx-a11y/aria-unsupported-elements': 'error',
      'jsx-a11y/heading-has-content': 'error',
      'jsx-a11y/html-has-lang': 'error',
      'jsx-a11y/iframe-has-title': 'error',
      'jsx-a11y/img-redundant-alt': 'warn',
      'jsx-a11y/no-access-key': 'warn',
      'jsx-a11y/no-autofocus': 'warn',
      'jsx-a11y/no-distracting-elements': 'error',
      'jsx-a11y/no-redundant-roles': 'warn',
      'jsx-a11y/role-has-required-aria-props': 'error',
      'jsx-a11y/role-supports-aria-props': 'error',
      'jsx-a11y/scope': 'error',
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
      'jsx-a11y/mouse-events-have-key-events': 'warn',
      // Avoid recreating context values
      'react/jsx-no-constructed-context-values': 'warn',
      // Detect unused state
      'react/no-unused-state': 'warn',
      'react/jsx-no-leaked-render': [
        'warn',
        {
          validStrategies: ['ternary', 'coerce'],
        },
      ],
      // iframe should have sandbox
      'react/iframe-missing-sandbox': 'warn',
      'react/jsx-child-element-spacing': 'off',
      'react/jsx-closing-bracket-location': 'off',
      'react/jsx-closing-tag-location': 'off',
      // Let Prettier handle this
      'react/jsx-curly-brace-presence': 'off',
      'react/jsx-curly-newline': 'off',
      'react/jsx-curly-spacing': 'off',
      'react/jsx-equals-spacing': 'off',
      'react/jsx-first-prop-new-line': 'off',
      'react/jsx-indent': 'off',
      'react/jsx-indent-props': 'off',
      'react/jsx-max-props-per-line': 'off',
      'react/jsx-newline': 'off',
      'react/jsx-one-expression-per-line': 'off',
      'react/jsx-props-no-multi-spaces': 'off',
      'react/jsx-tag-spacing': 'off',
      'react/jsx-wrap-multilines': 'off',
    },
  },

  ...markdownESlintPlugin.configs.processor,
  // Markdown
  {
    name: 'Markdown',
    files: ['**/*.md'],
    plugins: {
      markdown: markdownESlintPlugin,
    },
  },

  {
    name: 'Markdown Code Blocks - TypeScript/JavaScript',
    files: ['**/*.md/*.{js,ts,jsx,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        // Markdown code blocks are virtual files, don't require tsconfig.json.
        projectService: false,
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      ...untypedTypeScriptRules,
      '@typescript-eslint/await-thenable': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/adjacent-overload-signatures': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/consistent-indexed-object-style': 'off',
      '@typescript-eslint/consistent-type-assertions': 'off',
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/member-ordering': 'off',
      '@typescript-eslint/method-signature-style': 'off',
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/no-confusing-non-null-assertion': 'off',
      '@typescript-eslint/no-dynamic-delete': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/no-extra-non-null-assertion': 'off',
      '@typescript-eslint/no-for-in-array': 'off',
      '@typescript-eslint/no-inferrable-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-this-alias': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/prefer-for-of': 'off',
      '@typescript-eslint/prefer-literal-enum-member': 'off',
      'no-console': 'off',
      'no-unused-vars': 'off',
      'no-unused-expressions': 'off',
      'no-restricted-syntax': 'off',
      'dot-notation': 'off',
      'import/no-unresolved': 'off',
      'no-constant-binary-expression': 'off',
      'no-constant-condition': 'off',
      'no-empty': 'off',
      'no-func-assign': 'off',
      'no-import-assign': 'off',
      'no-redeclare': 'off',
      'no-undef': 'off',
      'no-unused-private-class-members': 'off',
      'no-var': 'off',
      'prefer-rest-params': 'off',
      'no-return-await': 'off',
      'require-await': 'off',
    },
  },

  {
    name: 'Markdown Code Blocks - Vue',
    files: ['**/*.md/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        projectService: false,
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
  },
];

export default config;
