---
layout: home

hero:
  name: Logaria
  text: 发布时悄然消失的 Logger
  tagline: 框架无关的 TypeScript Logger，结合规则化的 runtime 过滤与保守的构建期裁剪——开发时尽情记录，生产构建保持干净。
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
    - theme: alt
      text: GitHub
      link: https://github.com/SenaoXi/docs-islands

features:
  - title: 精简的框架无关 API
    details: 几个函数即可创建 logger 与配置可见性——不绑定框架、不耦合打包工具，也没有全局状态需要对抗。
  - title: 基于规则的可见性
    details: 通过 levels、debug、glob 匹配与 preset 驱动的 allowlist，让开发、CI 与生产中的每一行日志都目标明确。
  - title: 构建期自动消失
    details: 可选的 unplugin 适配器会静态证明并移除被关闭的日志调用，生产 bundle 不留任何痕迹。
  - title: 覆盖主流打包工具
    details: 一份插件，七个适配器——Vite、Rollup、Rolldown、esbuild、webpack、Rspack、Farm——共享同一份 runtime 语义。
  - title: 可组合的 Preset 体系
    details: 把可复用的规则模板封装为 preset 插件，通过 `extends` 启用，必要时按项目逐条覆盖。
  - title: 面向集成的 Scope
    details: 框架与工具链可注册独立的 logger scope，永远不会污染应用层的 runtime 配置——库依赖也能安心引入。
---
