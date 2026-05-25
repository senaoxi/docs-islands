# Config File

Limina reads configuration from `limina.config.mjs` inside the workspace. It usually lives at the workspace root:

```js
import { defineConfig } from 'limina';

export default defineConfig({
  config: {},
});
```

Config can also be a function:

```js
export default defineConfig(({ command, mode }) => ({
  config: {
    // return different entries for CI, local, or release usage
  },
}));
```

`mode` comes from `--mode`, then `NODE_ENV`, then `default`.

## `mode`

Function configs are useful when local, CI, or release workflows need different checkers or package targets. The environment-specific differences stay in one reviewable config file.

For example, if built package output only needs to be checked before release, `--mode release` can return extra `packageChecks.targets`. Running:

```sh
pnpm exec limina --mode release package check
```

loads those release targets, while the normal local `limina check` can stay lighter.

## `command`

`command` is the command family currently loading the config, such as `check`, `graph`, `paths`, or `package`. Use it when expensive configuration only matters for one command family.

For example, declare package output targets only for package commands:

```js
export default defineConfig(({ command }) => ({
  packageChecks:
    command === 'package'
      ? {
          targets: [
            {
              name: '@acme/core',
              outDir: 'packages/core/dist',
            },
          ],
        }
      : undefined,
}));
```

Normal graph and proof checks then stay independent from release output configuration.

In a fuller example, the directory can look like this:

```text
limina.config.mjs
packages/core/
  src/index.ts
  dist/package.json
```

The config can declare package output only in release mode:

```js
export default defineConfig(({ mode }) => ({
  config: {
    checkers: {
      typescript: {
        preset: 'tsc',
        entry: 'tsconfig.build.json',
      },
    },
  },
  packageChecks:
    mode === 'release'
      ? {
          targets: [
            {
              name: '@acme/core',
              outDir: 'packages/core/dist',
            },
          ],
        }
      : undefined,
}));
```

When `pnpm exec limina check` runs, Limina loads the default mode and analyzes the pieces needed for graph, source, proof, checker build, and checker typecheck. When `pnpm exec limina --mode release package check` runs, Limina loads the config again in release mode and reads `packageChecks.targets`.

The result is that everyday local checks do not care whether `dist` exists, while release checks explicitly require `packages/core/dist` to be built and valid as package output.
