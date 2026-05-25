# Package checks

Package checks 针对构建后的 output directory 运行。

```js
import { defineConfig } from 'limina';

export default defineConfig({
  packageChecks: {
    targets: [
      {
        name: '@acme/core',
        outDir: 'packages/core/dist',
        checks: ['publint', 'attw', 'boundary'],
        attw: {
          profile: 'esm-only',
        },
        boundary: {
          environment: 'browser',
          ignoredExternalPackages: ['@acme/runtime-polyfill'],
        },
      },
    ],
  },
});
```

## `name`

`name` 是这个 package check target 的友好名称。CLI 的 `--package <name>` 会用它筛选单个 target。

## `outDir`

`outDir` 指向消费者实际安装到的构建后 package 目录，通常是 `packages/*/dist`。这个目录里应该有发布用的 `package.json`、JavaScript、declarations、README 和 license 文件。

## `checks`

`checks` 控制启用哪些工具：

- `publint`：检查 package metadata 和发布问题；
- `attw`：用 Are The Types Wrong 检查类型解析；
- `boundary`：扫描构建后的 JavaScript imports，检查 runtime 和依赖边界。

## `publint.strict`

`publint.strict` 控制 publint 是否使用严格模式，默认开启。

## `attw.profile`

`attw.profile` 控制 Are The Types Wrong 的检查 profile，常见值包括 `esm-only`、`node16` 和 `strict`。

## `boundary.environment`

`boundary.environment` 可以是字符串，也可以是接收 emitted relative file path 的函数。整个 package 都是 browser output 时可以写 `'browser'`；同一个 output 里同时有 node/browser 文件时，可以按文件路径返回不同 environment。

## `boundary.ignoredExternalPackages`

`boundary.ignoredExternalPackages` 用来声明少数外部 import 是有意允许的，即使它们没有写在构建后 package manifest 里。

例如源码中没有类型错误，但构建后的产物里有这些问题：

```jsonc
// packages/core/dist/package.json
{
  "name": "@acme/core",
  "exports": "./index.js",
  "types": "./missing.d.ts",
}
```

```js
// packages/core/dist/index.js
import { readFileSync } from 'node:fs';
```

`limina package check --package @acme/core` 会在 output 层检查 `types`、exports 和 runtime imports。若这个 target 的 `boundary.environment` 是 `browser`，残留的 `node:fs` 也会被当作浏览器产物边界问题报告出来。

完整一点看，目录可以是：

```text
packages/core/
  src/index.ts
  dist/package.json
  dist/index.js
```

源码 `src/index.ts` 可能已经通过 checker build/source execution，但发布时消费者安装的是 `dist`。运行 `pnpm exec limina package check --package @acme/core` 时，Limina 会读取 `packageChecks.targets` 里 `name` 匹配的 target，然后在 `outDir` 指向的 `packages/core/dist` 中运行配置好的 `publint`、`attw` 和 `boundary`。

结果可能是多个层面的失败：`attw` 发现 `types` 指向 `missing.d.ts`；`boundary` 在 browser target 中发现 `node:fs`；公开 package 还会被要求包含 README 和 license。这样发布前检查的是消费者实际拿到的产物，而不是开发态源码。
