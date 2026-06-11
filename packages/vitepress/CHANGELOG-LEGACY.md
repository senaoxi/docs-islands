<!-- markdownlint-disable MD024 -->

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.15] - 2025-09-25

### Bug Fixes

- fix(ci): github ci error ([b597edc](https://github.com/senaoxi/vitepress-rendering-strategies/commit/b597edc))

### Documentation

- docs: compliance documentation ([e15aade](https://github.com/senaoxi/vitepress-rendering-strategies/commit/e15aade))

### Maintenance

- refactor: improve typescript types and code consistency ([40ae786](https://github.com/senaoxi/vitepress-rendering-strategies/commit/40ae786))
- chore(comments): polish comments ([2d1d966](https://github.com/senaoxi/vitepress-rendering-strategies/commit/2d1d966))
- chore: add vite as a dependency ([02a2fb0](https://github.com/senaoxi/vitepress-rendering-strategies/commit/02a2fb0))

## [0.0.14] - 2025-09-24

### Bug Fixes

- fix(hmr): ssr:only rendering component hmr anomaly issue when dependent environment api is used ([84566af](https://github.com/senaoxi/vitepress-rendering-strategies/commit/84566af))

### Maintenance

- refactor: enhance eslint config and fix e2e test stability issues ([773d43c](https://github.com/senaoxi/vitepress-rendering-strategies/commit/773d43c))
- chore: remove bundled cheerio package to reduce package size ([6f7c7b2](https://github.com/senaoxi/vitepress-rendering-strategies/commit/6f7c7b2))
- chore(audit): upgrade dependency packages for security audit ([1b3b90c](https://github.com/senaoxi/vitepress-rendering-strategies/commit/1b3b90c))

## [0.0.13] - 2025-09-17

### Features

- feat: e2e tests ([ce6e936](https://github.com/senaoxi/vitepress-rendering-strategies/commit/ce6e936))

### Bug Fixes

- fix: edge case problems ([2038b60](https://github.com/senaoxi/vitepress-rendering-strategies/commit/2038b60))
- fix: path resolution exception and forcibly prohibit client:only instruction from carrying spa:sync-render instruction ([e71cf50](https://github.com/senaoxi/vitepress-rendering-strategies/commit/e71cf50))
- fix(deps): revert prettier to ~3.5.3 to avoid markdown formatting regressions ([4171b97](https://github.com/senaoxi/vitepress-rendering-strategies/commit/4171b97))

### Documentation

- docs: contribution guidelines ([b670694](https://github.com/senaoxi/vitepress-rendering-strategies/commit/b670694))
- docs: update contribution guidelines ([dfc915d](https://github.com/senaoxi/vitepress-rendering-strategies/commit/dfc915d))
- docs: update contribution guidelines ([c9884e9](https://github.com/senaoxi/vitepress-rendering-strategies/commit/c9884e9))
- docs: update the landing page copywriting and description copywriting ([b34187f](https://github.com/senaoxi/vitepress-rendering-strategies/commit/b34187f))
- docs: add development environment limitations for spa:sync-render feature ([964eb64](https://github.com/senaoxi/vitepress-rendering-strategies/commit/964eb64))

### Maintenance

- chore: translate css comments to English ([7c8b128](https://github.com/senaoxi/vitepress-rendering-strategies/commit/7c8b128))
- chore: clean packageJson ([09dabe7](https://github.com/senaoxi/vitepress-rendering-strategies/commit/09dabe7))

### Other Changes

- optimize: development experience optimization and reduce client runtime size ([127e739](https://github.com/senaoxi/vitepress-rendering-strategies/commit/127e739))
- update: README.md & README.zh-CN.md ([eda06bf](https://github.com/senaoxi/vitepress-rendering-strategies/commit/eda06bf))
- optimze: development experience optimization ([dd45e62](https://github.com/senaoxi/vitepress-rendering-strategies/commit/dd45e62))

## [0.0.12] - 2025-09-09

### Features

- feat: optimize CSS injection and fix pre-render component logic ([7bb3cc1](https://github.com/senaoxi/vitepress-rendering-strategies/commit/7bb3cc1))
- feat: enhance spa:sync-render with CSS loading runtime to prevent FOUC ([b8edfc2](https://github.com/senaoxi/vitepress-rendering-strategies/commit/b8edfc2))

### Bug Fixes

- fix: compatibility package development mode ([d9e5ee0](https://github.com/senaoxi/vitepress-rendering-strategies/commit/d9e5ee0))
- fix: enhance runtime stability and resolve configuration errors ([457760f](https://github.com/senaoxi/vitepress-rendering-strategies/commit/457760f))
- fix: base url ([939f450](https://github.com/senaoxi/vitepress-rendering-strategies/commit/939f450))

### Documentation

- docs: enhance spa:sync-render documentation with video demos and detailed analysis ([b574293](https://github.com/senaoxi/vitepress-rendering-strategies/commit/b574293))
- docs: update component attribute names and improve HMR configuration ([1069499](https://github.com/senaoxi/vitepress-rendering-strategies/commit/1069499))

### Other Changes

- optimize: add client-runtime module preloading support ([c923c88](https://github.com/senaoxi/vitepress-rendering-strategies/commit/c923c88))
- update: homepage link ([8eb8fe7](https://github.com/senaoxi/vitepress-rendering-strategies/commit/8eb8fe7))

## [0.0.11] - 2025-09-05

### Features

- feat: generate release changelog ([4f5c185](https://github.com/senaoxi/vitepress-rendering-strategies/commit/4f5c185))
- feat: vitepress inline path resolver ([6331de0](https://github.com/senaoxi/vitepress-rendering-strategies/commit/6331de0))
- feat: docs ([785a6e7](https://github.com/senaoxi/vitepress-rendering-strategies/commit/785a6e7))

### Bug Fixes

- fix: deadlock problem ([bb5e13c](https://github.com/senaoxi/vitepress-rendering-strategies/commit/bb5e13c))
- fix: type error ([a5bbc8e](https://github.com/senaoxi/vitepress-rendering-strategies/commit/a5bbc8e))
- fix(plugin): delay judgment on whether the inline path is hit ([12a5a21](https://github.com/senaoxi/vitepress-rendering-strategies/commit/12a5a21))
- fix: type error ([e5e2155](https://github.com/senaoxi/vitepress-rendering-strategies/commit/e5e2155))

### Documentation

- doc: documentation sites are distributed under the docs.senao.me domain ([f9fb18f](https://github.com/senaoxi/vitepress-rendering-strategies/commit/f9fb18f))
- docs: github contributing ([6ccfb23](https://github.com/senaoxi/vitepress-rendering-strategies/commit/6ccfb23))

### Maintenance

- chore: enforce strict pnpm dependency management ([1a2cf21](https://github.com/senaoxi/vitepress-rendering-strategies/commit/1a2cf21))
- chore: github hooks ([1db9a48](https://github.com/senaoxi/vitepress-rendering-strategies/commit/1db9a48))
- chore: MIT License ([b93c293](https://github.com/senaoxi/vitepress-rendering-strategies/commit/b93c293))
- chore: add version nav menu and clean scripts ([cd4fd52](https://github.com/senaoxi/vitepress-rendering-strategies/commit/cd4fd52))
- chore: format code ([ca58da7](https://github.com/senaoxi/vitepress-rendering-strategies/commit/ca58da7))
- chore: supplementary test cases ([bceeace](https://github.com/senaoxi/vitepress-rendering-strategies/commit/bceeace))
- chore: init vscode config ([cca4304](https://github.com/senaoxi/vitepress-rendering-strategies/commit/cca4304))
- chore: add prettier, eslint, husky ([d9b4c02](https://github.com/senaoxi/vitepress-rendering-strategies/commit/d9b4c02))

### Other Changes

- update: README.md icon ([974627d](https://github.com/senaoxi/vitepress-rendering-strategies/commit/974627d))
- update: README.md ([6844a48](https://github.com/senaoxi/vitepress-rendering-strategies/commit/6844a48))
