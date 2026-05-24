---
layout: home

hero:
  name: Logaria
  text: 可以在构建期消失的 runtime logging
  tagline: 面向 TypeScript 包、脚本和工具链的小型框架无关 logger，支持 runtime 过滤、scope 归属和保守的生产构建裁剪。
  image:
    src: /logo.svg
    alt: Logaria
  actions:
    - theme: brand
      text: 快速开始
      link: /zh/getting-started
    - theme: alt
      text: API 参考
      link: /zh/api-reference

features:
  - title: 精简 runtime API
    details: 创建 main logger，再派生 group logger，用少量 API 管理可见性，不绑定具体框架。
  - title: 基于规则的可见性
    details: 用 levels、debug、preset rules、glob 匹配和 allowlist 语义，让日志输出更可控。
  - title: 构建期裁剪
    details: 可选 unplugin adapter 会在生产构建中移除静态可证明被隐藏的调用，同时仍以 runtime 过滤为最终依据。
---
