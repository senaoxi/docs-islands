---
layout: home

hero:
  name: Limina
  text: TypeScript monorepo 架构治理
  tagline: 将 project references、源码检查、包边界和发布前校验收敛到一条显式流水线。
  image:
    src: /logo.svg
    alt: Limina
  actions:
    - theme: brand
      text: 阅读指南
      link: /zh/limina
    - theme: alt
      text: 查看 npm
      link: https://www.npmjs.com/package/limina

features:
  - title: 理解构建图
    details: 用同一份配置校验 TypeScript project references、源码覆盖、generated paths 兼容和依赖方向。
  - title: 发布更可靠
    details: 发布前检查 package exports、类型解析、运行时 import 和依赖声明，提前发现 dist 产物问题。
  - title: 显式治理
    details: 将自定义 checker、package target、runtime 边界和 allowlist 写进 limina.config.mjs，而不是依赖隐藏 preset。
---
