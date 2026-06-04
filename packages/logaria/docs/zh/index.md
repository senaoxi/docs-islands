---
layout: home

hero:
  name: Logaria
  text: 发布时悄然消失的日志器
  tagline: 框架无关的 TypeScript 日志器，结合规则化的运行时过滤与保守的构建期裁剪——开发时尽情记录，生产构建保持干净。
  image:
    src: /logo.svg
    alt: Logaria
  actions:
    - theme: brand
      text: 快速开始
      link: /zh/getting-started
    - theme: alt
      text: 特性一览
      link: /zh/features
    - theme: alt
      text: 为什么是 Logaria
      link: /zh/why
    - theme: alt
      text: GitHub
      link: https://github.com/XiSenao/docs-islands

features:
  - title: 精简的框架无关 API
    details: 三个根函数即可创建日志器并掌管默认作用域——不绑定框架、不耦合打包工具，也没有全局状态需要对抗。
  - title: 级别模式，一个开关
    details: 用 `levels` 这个允许列表决定 `info`/`success`/`warn`/`error` 是否输出；`debug` 则是独立的开关。
  - title: 规则模式，聚焦输出
    details: 加入 `rules`，Logaria 即切换为按 `main`、`group`、消息与级别匹配的聚焦允许列表。
  - title: 可组合的预设
    details: 把可复用的规则模板封装为预设插件，通过 `extends` 启用，并按项目在 `rules` 中逐条覆盖。
  - title: 构建期自动消失
    details: 可选的 unplugin 适配器会静态证明并删除被关闭的日志调用——运行时始终是唯一事实来源。
  - title: 面向集成的作用域
    details: 框架通过 `logaria/core` 注册独立作用域，永不改动应用所拥有的运行时配置。
---
