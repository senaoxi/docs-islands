<!-- markdownlint-disable MD024 -->

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Breaking Changes

- refactor(vitepress)!: replace public logger accessors with factory-first `createLogger` on `@docs-islands/vitepress/logger` and remove `emitRuntimeLog` / `LightGeneralLogger(...).formatText`

## [0.3.0] - 2026-04-30

### Features

- feat(release): validate logger dist packages ([c0fe550](https://github.com/XiSenao/docs-islands/commit/c0fe550))
- feat(vitepress): bind logger facade with virtual modules ([96be8e3](https://github.com/XiSenao/docs-islands/commit/96be8e3))
- feat(logaria): add scoped utils logger bridge ([7f14e1a](https://github.com/XiSenao/docs-islands/commit/7f14e1a))
- feat(release): add workspace public package release CLI ([252c555](https://github.com/XiSenao/docs-islands/commit/252c555))
- feat(vitepress): warn on unmanaged logger facade ([7d575e6](https://github.com/XiSenao/docs-islands/commit/7d575e6))
- feat(logaria)!: add standalone logaria package ([288d12c](https://github.com/XiSenao/docs-islands/commit/288d12c))
- feat(vitepress): isolate logger scopes across runtime builds ([7dfb6e0](https://github.com/XiSenao/docs-islands/commit/7dfb6e0))
- feat(vitepress): track React HMR and dev render timing ([82f7306](https://github.com/XiSenao/docs-islands/commit/82f7306))
- feat(vitepress)!: add public logger modules and preset-based logging ([0664b0c](https://github.com/XiSenao/docs-islands/commit/0664b0c))
- feat(logging): align rule matching with spec ([5b2e8e1](https://github.com/XiSenao/docs-islands/commit/5b2e8e1))
- feat(vitepress): audit package boundary and harden publishing gates ([c3d4ed5](https://github.com/XiSenao/docs-islands/commit/c3d4ed5))
- feat(vitepress)!: introduce adapters API and site devtools ([2426539](https://github.com/XiSenao/docs-islands/commit/2426539))
- feat(logging): add structured config and scoped log groups ([fe59a9d](https://github.com/XiSenao/docs-islands/commit/fe59a9d))
- feat: introduce @docs-islands/core package ([f1e5f76](https://github.com/XiSenao/docs-islands/commit/f1e5f76))
- feat(site-debug): enrich page build report context ([d4958d2](https://github.com/XiSenao/docs-islands/commit/d4958d2))
- feat(vitepress)!: redesign site debug ai build report config ([626835a](https://github.com/XiSenao/docs-islands/commit/626835a))
- feat(site-debug): improve large-file previews and report layout ([b13b4df](https://github.com/XiSenao/docs-islands/commit/b13b4df))
- feat(vitepress): track site debug AI reports in git ([3aa9b91](https://github.com/XiSenao/docs-islands/commit/3aa9b91))
- feat(vitepress): add site debug AI reports and review UI ([d573615](https://github.com/XiSenao/docs-islands/commit/d573615))
- feat(vitepress): improve site debug console diagnostics ([db672b0](https://github.com/XiSenao/docs-islands/commit/db672b0))
- feat(vitepress): add site debug console (#57) ([d9f7c06](https://github.com/XiSenao/docs-islands/commit/d9f7c06))

### Bug Fixes

- fix(logaria): reject resetLoggerConfig in controlled runtimes ([2197e52](https://github.com/XiSenao/docs-islands/commit/2197e52))
- fix(agents): run link script through tsx ([7fe61a0](https://github.com/XiSenao/docs-islands/commit/7fe61a0))
- fix(vitepress): guard duplicate docs islands instances ([0826c60](https://github.com/XiSenao/docs-islands/commit/0826c60))
- fix(vitepress): preserve scoped logger output in docs dev ([37737f7](https://github.com/XiSenao/docs-islands/commit/37737f7))
- fix(docs): component popup exception issue ([6f77e0a](https://github.com/XiSenao/docs-islands/commit/6f77e0a))
- fix(vitepress): handle Windows boundary audit paths ([3ec185a](https://github.com/XiSenao/docs-islands/commit/3ec185a))
- fix(vitepress): publish site-debug optional fallbacks ([9507203](https://github.com/XiSenao/docs-islands/commit/9507203))
- fix: resolve VitePress integration deps from consumer root ([432fdd5](https://github.com/XiSenao/docs-islands/commit/432fdd5))
- fix(vitepress): stabilize site debug build report caching ([278671f](https://github.com/XiSenao/docs-islands/commit/278671f))
- fix(vitepress): sanitize site debug AI report paths ([6b04e34](https://github.com/XiSenao/docs-islands/commit/6b04e34))
- fix(vitepress): refine debug module source panel ([4ae3e44](https://github.com/XiSenao/docs-islands/commit/4ae3e44))
- fix(site-debug): prevent module source badge overlap ([3f3f1cf](https://github.com/XiSenao/docs-islands/commit/3f3f1cf))

### Documentation

- docs: add animated navbar logo ([0fe542a](https://github.com/XiSenao/docs-islands/commit/0fe542a))
- docs(logaria): document helper entrypoints ([03b092d](https://github.com/XiSenao/docs-islands/commit/03b092d))
- docs(vitepress): document scoped logger plugin behavior ([59946c5](https://github.com/XiSenao/docs-islands/commit/59946c5))
- docs(vitepress): document logging presets and refresh reports ([c92ba5c](https://github.com/XiSenao/docs-islands/commit/c92ba5c))
- docs(vitepress): rename site debug console to site devtools ([2894e30](https://github.com/XiSenao/docs-islands/commit/2894e30))
- docs(vitepress): polish guide copy and examples ([1a17a9b](https://github.com/XiSenao/docs-islands/commit/1a17a9b))

### Maintenance

- test(vitepress): integrate Playwright smoke checks ([3bc1a86](https://github.com/XiSenao/docs-islands/commit/3bc1a86))
- test(vitepress): add dist smoke workspace ([0447c0d](https://github.com/XiSenao/docs-islands/commit/0447c0d))
- chore(deps): bump logaria@0.0.2 ([3891d5e](https://github.com/XiSenao/docs-islands/commit/3891d5e))
- refactor(logaria): expose explicit runtime subpaths ([3cde2b8](https://github.com/XiSenao/docs-islands/commit/3cde2b8))
- refactor(logaria): centralize runtime logging ([f5daf80](https://github.com/XiSenao/docs-islands/commit/f5daf80))
- refactor(utils): expose explicit utility subpaths ([f4fd6a3](https://github.com/XiSenao/docs-islands/commit/f4fd6a3))
- refactor(logaria): centralize scoped logger runtime ([b5ca948](https://github.com/XiSenao/docs-islands/commit/b5ca948))
- test(vitepress): stabilize react rendering strategy tests ([20f2f2a](https://github.com/XiSenao/docs-islands/commit/20f2f2a))
- chore(vitepress): interface enhancements and document layout adjustments ([8a68f7c](https://github.com/XiSenao/docs-islands/commit/8a68f7c))
- chore(tsconfig): strictly restrict auto-injection of third-party package types ([5668488](https://github.com/XiSenao/docs-islands/commit/5668488))

### Other Changes

- perf(debug-console): stream source previews off the main thread ([771946c](https://github.com/XiSenao/docs-islands/commit/771946c))

## [0.2.5] - 2026-03-27

### Features

- feat(docs): integrate Vercel web analytics (#55) ([d82caff](https://github.com/XiSenao/docs-islands/commit/d82caff))

### Bug Fixes

- fix(vitepress): stabilize react loader hydration readiness on iOS Chrome ([454c383](https://github.com/XiSenao/docs-islands/commit/454c383))

### Maintenance

- chore(deps): resolve npm package security issues ([f793f7a](https://github.com/XiSenao/docs-islands/commit/f793f7a))
- chore(config): add Vercel configuration items ([abbe3cb](https://github.com/XiSenao/docs-islands/commit/abbe3cb))
- chore(vitepress): warn when re-export intermediaries contain side-effect imports ([2841ce2](https://github.com/XiSenao/docs-islands/commit/2841ce2))

## [0.2.4] - 2026-03-20

### Features

- feat(vitepress): resolve final component sources across re-export chains ([b8dd6dd](https://github.com/XiSenao/docs-islands/commit/b8dd6dd))
- feat(vitepress): stabilize dev react runtime and HMR updates ([c43aa79](https://github.com/XiSenao/docs-islands/commit/c43aa79))

### Bug Fixes

- fix(vitepress-react): stabilize dev SSR mount timing ([768a4fe](https://github.com/XiSenao/docs-islands/commit/768a4fe))

## [0.2.3] - 2026-03-17

### Bug Fixes

- fix(vitepress): stabilize pageId resolution across injected runtimes ([6f9de2c](https://github.com/XiSenao/docs-islands/commit/6f9de2c))
- fix(vitepress): unify pathname normalization across runtime and build ([cdbab8f](https://github.com/XiSenao/docs-islands/commit/cdbab8f))
- fix(vitepress): downgrade build target to es2020 and inject NODE_ENV for MPA mode ([d516b1a](https://github.com/XiSenao/docs-islands/commit/d516b1a))
- fix(utils): link-guard execution exception issue ([b15c023](https://github.com/XiSenao/docs-islands/commit/b15c023))

### Maintenance

- refactor(eslint-config): extract shared rule presets and align ecma/node version targets ([001c290](https://github.com/XiSenao/docs-islands/commit/001c290))
- chore(build): enable sourcemap support across rolldown configs ([2540095](https://github.com/XiSenao/docs-islands/commit/2540095))
- chore(eslint-config): add no-console rule and fix vscode monorepo eslint resolution ([b7d24eb](https://github.com/XiSenao/docs-islands/commit/b7d24eb))
- refactor: adopt Logger in agents and remove redundant emojis from log messages ([0038031](https://github.com/XiSenao/docs-islands/commit/0038031))
- chore(eslint-config): add flat gitignore and update prettier import ([36510ff](https://github.com/XiSenao/docs-islands/commit/36510ff))

### Other Changes

- ci(actions): migrate pnpm setup to corepack and upgrade cache ([3a71dee](https://github.com/XiSenao/docs-islands/commit/3a71dee))
- build(scripts): move \_run workspace runner to TypeScript module ([51324fb](https://github.com/XiSenao/docs-islands/commit/51324fb))
- build(workspace): enforce strict pnpm policies and align eslint deps ([68d0294](https://github.com/XiSenao/docs-islands/commit/68d0294))

## [0.2.2] - 2026-03-04

### Bug Fixes

- fix(release): clean dist directory before building ([5b4c05b](https://github.com/XiSenao/docs-islands/commit/5b4c05b))

## [0.2.1] - 2026-03-04

### Features

- feat(vitepress): add package lint gate and normalize CI env detection ([ef387cf](https://github.com/XiSenao/docs-islands/commit/ef387cf))

### Bug Fixes

- fix(vitepress): adapt test mocks and client codegen to getLoggerInstance API ([b73d1bc](https://github.com/XiSenao/docs-islands/commit/b73d1bc))
- fix(build): preserve default export signatures in rolldown DTS output ([6d71b50](https://github.com/XiSenao/docs-islands/commit/6d71b50))

### Maintenance

- refactor(utils): rewrite env module with Zod validation and namespaced API ([34ab243](https://github.com/XiSenao/docs-islands/commit/34ab243))
- refactor: unify logging through Logger and remove console module ([1dfb5f2](https://github.com/XiSenao/docs-islands/commit/1dfb5f2))
- refactor(utils): add recursive .env discovery and fix vite Plugin type compat ([4596e2b](https://github.com/XiSenao/docs-islands/commit/4596e2b))
- chore(deps): bump dependency version and patch audit issues ([5f2d220](https://github.com/XiSenao/docs-islands/commit/5f2d220))
- chore(build): enable tree-shaking of Logger class in client-runtime bundle ([dad39b4](https://github.com/XiSenao/docs-islands/commit/dad39b4))
- refactor(utils): move loadEnv into utils package as public export ([d1bc28b](https://github.com/XiSenao/docs-islands/commit/d1bc28b))
- refactor(build): centralize env management with loadEnv and .env files ([207f046](https://github.com/XiSenao/docs-islands/commit/207f046))
- chore(utils): apply shouldSuppressLog constraint to lightGeneralLogger ([f2c9782](https://github.com/XiSenao/docs-islands/commit/f2c9782))

## [0.2.0] - 2026-02-16

### Features

- feat(build): support package exclusions in build pipeline ([7d30224](https://github.com/XiSenao/docs-islands/commit/7d30224))

### Bug Fixes

- fix(build): disable logger production suppression in CI for e2e test compatibility ([c418dc6](https://github.com/XiSenao/docs-islands/commit/c418dc6))
- fix(vitepress): resolve pending compilation container Promise on error early returns ([09e8916](https://github.com/XiSenao/docs-islands/commit/09e8916))
- fix(vitepress): stabilize flaky HMR e2e tests with reload fallback ([0476d59](https://github.com/XiSenao/docs-islands/commit/0476d59))
- fix(vitepress): preserve @vite-ignore through rolldown const inlining ([284ec0b](https://github.com/XiSenao/docs-islands/commit/284ec0b))
- fix(build): enable minify other than codegen for ES lib mode ([441185b](https://github.com/XiSenao/docs-islands/commit/441185b))
- fix(vitepress): harden react integration against path traversal, code injection and state leaks ([802b78d](https://github.com/XiSenao/docs-islands/commit/802b78d))

### Maintenance

- chore(vitepress): replace throws with graceful error logging in React runtime ([84a59d7](https://github.com/XiSenao/docs-islands/commit/84a59d7))
- refactor(build): optimize rolldown configs with unified entry and consolidated DTS ([46f26b0](https://github.com/XiSenao/docs-islands/commit/46f26b0))
- chore(deps): bump markdown-it version and patch audit issues ([fbbaa7c](https://github.com/XiSenao/docs-islands/commit/fbbaa7c))
- refactor: centralize AI agent instructions into shared agents package ([e552dd8](https://github.com/XiSenao/docs-islands/commit/e552dd8))
- refactor(vitepress): replace parse5 with htmlparser2 for case-sensitive component tag parsing ([ca9f137](https://github.com/XiSenao/docs-islands/commit/ca9f137))
- refactor(vitepress): replace regex script extraction with structural tokenization ([24aeabf](https://github.com/XiSenao/docs-islands/commit/24aeabf))
- refactor(vitepress): harden component tag transform with attribute escaping and html_inline support ([679cbba](https://github.com/XiSenao/docs-islands/commit/679cbba))
- refactor(vitepress): streamline package dev workflow with subpath imports and link-guard ([9e3e7eb](https://github.com/XiSenao/docs-islands/commit/9e3e7eb))
- chore(deps): bump outdated dependency versions and patch audit issues ([7626a68](https://github.com/XiSenao/docs-islands/commit/7626a68))

### Other Changes

- release(vitepress): auto-build workspace dependencies before release build ([e5fbe42](https://github.com/XiSenao/docs-islands/commit/e5fbe42))

## [0.1.3] - 2026-02-07

### Bug Fixes

- fix(vitepress): preserve query string in module ID to avoid processing Vue SFC sub-modules as Markdown ([f1b43bd](https://github.com/XiSenao/docs-islands/commit/f1b43bd))

### Maintenance

- refactor(tsconfig): streamline include patterns and centralize exclude rules ([4673f47](https://github.com/XiSenao/docs-islands/commit/4673f47))
- refactor(vitepress): consolidate utils to monorepo and reorganize shared modules ([4a327af](https://github.com/XiSenao/docs-islands/commit/4a327af))
- refactor(tsconfig): modularize typescript configuration by module ([0bdff19](https://github.com/XiSenao/docs-islands/commit/0bdff19))

### Other Changes

- build(vitepress): enforce type check for package dist with skipLibCheck best practice ([7369a70](https://github.com/XiSenao/docs-islands/commit/7369a70))

## [0.1.2] - 2025-11-03

### ⚠️ BREAKING CHANGES

- **refactor(core)!: align internal api paths to `internal/*` namespace** ([f44616b](https://github.com/XiSenao/docs-islands/commit/f44616b))
  - `client-utils/logger` → `internal/logger`
  - `client-shared/runtime` → `internal/runtime`
  - Note: These paths were internal implementation details and not part of the public API

### Bug Fixes

- fix(deps): downgrade @swc/core version to v1.13.5 ([7ce0985](https://github.com/XiSenao/docs-islands/commit/7ce0985)) - Resolves known compatibility issues
- fix(scripts): target path parsing exception ([f10084f](https://github.com/XiSenao/docs-islands/commit/f10084f))
- fix(typescript): comments contain nbsp, causing tsconfck parsing to fail ([31b3345](https://github.com/XiSenao/docs-islands/commit/31b3345))

### Documentation

- docs: refine project introduction and key features ([9355f61](https://github.com/XiSenao/docs-islands/commit/9355f61))
- docs: improve stackblitz codeflow integration links ([6c453b9](https://github.com/XiSenao/docs-islands/commit/6c453b9))

### Maintenance

- chore(vitepress): handle internal runtime modules with empty type declarations ([0cb15e6](https://github.com/XiSenao/docs-islands/commit/0cb15e6))
- refactor(build): use pnpm exec and remove output filtering ([9550a05](https://github.com/XiSenao/docs-islands/commit/9550a05))
- chore(deps): bump actions and dev dependencies ([5b15f84](https://github.com/XiSenao/docs-islands/commit/5b15f84))
- chore(config): add npmrc and refactor client export paths ([c56ad4f](https://github.com/XiSenao/docs-islands/commit/c56ad4f))
- chore: enhance pnpm lint constraints and optimize toolchain ([f070dac](https://github.com/XiSenao/docs-islands/commit/f070dac))
- chore(deps): upgrade dependencies and migrate pnpm config to workspace ([6b6250b](https://github.com/XiSenao/docs-islands/commit/6b6250b))
- chore: refactor scripts and upgrade del-cli to v7 ([ccdcfba](https://github.com/XiSenao/docs-islands/commit/ccdcfba))
- chore(typescript): remove support for subpaths in tsconfig.json ([565a011](https://github.com/XiSenao/docs-islands/commit/565a011))
- refactor: restructure project architecture and rename e2e to playground (#26) ([b1af90f](https://github.com/XiSenao/docs-islands/commit/b1af90f)) - Major structural improvements for better code organization
- chore(npm): @docs-islands/vitepress uses self-generated license ([11225ae](https://github.com/XiSenao/docs-islands/commit/11225ae))
- refactor: standardize code formatting with prettier (#12) ([0bc714e](https://github.com/XiSenao/docs-islands/commit/0bc714e)) - Unified code style across the entire codebase
- chore(test): reset the residual artifacts during e2e execution ([b7d1821](https://github.com/XiSenao/docs-islands/commit/b7d1821))

### Build & CI

- build(vitepress): separate dts generation and optimize plugins ([d258b8c](https://github.com/XiSenao/docs-islands/commit/d258b8c)) - Improved build performance
- build(eslint-config): migrate to typescript and fix file operations ([21d6f57](https://github.com/XiSenao/docs-islands/commit/21d6f57))
- ci(workflow): fix paths-filter exclusion patterns and improve filter accuracy ([16c93e5](https://github.com/XiSenao/docs-islands/commit/16c93e5))
- ci: pkg.pr.new preview with label and comment ([a672df2](https://github.com/XiSenao/docs-islands/commit/a672df2)) - Enable PR preview deployments
- ci: optimize playwright ci configuration ([56902ca](https://github.com/XiSenao/docs-islands/commit/56902ca))
- ci: migrate to semantic-pull-request action ([42b43c9](https://github.com/XiSenao/docs-islands/commit/42b43c9))

## [0.1.1] - 2025-10-16

### Maintenance

- feat(deploy): integrate netlify deployment ([a0c6b69](https://github.com/XiSenao/docs-islands/commit/a0c6b69))
- feat(ci): improve github workflow (#6) ([315121c](https://github.com/XiSenao/docs-islands/commit/315121c))
- fix(scripts): monorepo scripts not passing parameters ([8f69466](https://github.com/XiSenao/docs-islands/commit/8f69466))
- fix(ci): playwright command not found in ci by adding root dependency ([9ad930f](https://github.com/XiSenao/docs-islands/commit/9ad930f))
- fix(serve): docs site startup script change ([7fd07dc](https://github.com/XiSenao/docs-islands/commit/7fd07dc))
- fix(ci): move matrix.skip-pr condition from job to step level ([c551010](https://github.com/XiSenao/docs-islands/commit/c551010))
- chore(ci): enhance quality checks and package publishing ([8d68e5c](https://github.com/XiSenao/docs-islands/commit/8d68e5c))
- chore(config): standardize linting and tooling setup ([2b0a7f9](https://github.com/XiSenao/docs-islands/commit/2b0a7f9))
- chore(config): add editorconfig and unify line endings ([e92c9fc](https://github.com/XiSenao/docs-islands/commit/e92c9fc))
- refactor(build): extract license plugin to standalone package ([0efddfe](https://github.com/XiSenao/docs-islands/commit/0efddfe))
- refactor(deps): optimize dependency management with pnpm catalogs and build improvements (#11) ([7b10f27](https://github.com/XiSenao/docs-islands/commit/7b10f27))
- refactor(eslint-config): restructure config by directory convention (#10) ([f51dfc6](https://github.com/XiSenao/docs-islands/commit/f51dfc6))
- chore: restore format from auto-generated license and remove useless instructions for subpackage ([d60bbb5](https://github.com/XiSenao/docs-islands/commit/d60bbb5))
- chore(project): improve compliance and ci workflows (#9) ([22a66bf](https://github.com/XiSenao/docs-islands/commit/22a66bf))
- chore(repo): update issue/pr templates and readme, and sync lock files ([71037fb](https://github.com/XiSenao/docs-islands/commit/71037fb))
- ci(workflow): add lock threads and close stale issues and prs ([6191bef](https://github.com/XiSenao/docs-islands/commit/6191bef))
- ci(workflow): optimize build artifacts caching and path detection ([6259e30](https://github.com/XiSenao/docs-islands/commit/6259e30))

## [0.1.0] - 2025-10-04

### Maintenance

- chore: readme document update and adjustment debugging optimization instructions ([7ec84ef](https://github.com/XiSenao/docs-islands/commit/7ec84ef))
- refactor(eslint): standardize code quality with comprehensive eslint and prettier integration ([8f58330](https://github.com/XiSenao/docs-islands/commit/8f58330))
- refactor: migrate from vitepress-rendering-strategies to @docs-islands/vitepress ([bb25f62](https://github.com/XiSenao/docs-islands/commit/bb25f62))

## Previous Changelogs

### [0.0.x] (2025-09-05 - 2025-09-25)

See [0.0.15 changelog](https://github.com/XiSenao/docs-islands/blob/main/packages/vitepress/CHANGELOG-LEGACY.md)
