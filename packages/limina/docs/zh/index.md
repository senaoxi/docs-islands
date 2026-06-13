---
layout: home

hero:
  name: Limina
  text: 项目引用图编译器与架构治理 CLI
  tagline: 用显式项目引用管理 TypeScript 的构建边界。
  image:
    src: /logo.svg
    alt: Limina
  actions:
    - theme: brand
      text: 快速开始
      link: /zh/getting-started
    - theme: alt
      text: 为什么需要 Limina
      link: /zh/why
    - theme: alt
      text: 在 GitHub 查看
      link: https://github.com/senaoxi/docs-islands/tree/main/packages/limina

features:
  - icon: 🧭
    title: 零配置发现项目图
    details: 从现有 workspace、tsconfig 与源码导入中发现项目边界，推导真实的项目依赖关系，让普通 TypeScript monorepo 也能直接接入类型图治理。
    link: /zh/getting-started
    linkText: 开始接入
  - icon: 🕸️
    title: 自动生成类型图
    details: 为 TypeScript、Vue、Svelte 等检查器生成独立的类型检查图，让不同技术栈在统一模型下完成构建、检查与诊断。
    link: /zh/config/checkers
    linkText: 配置检查器
  - icon: 🧱
    title: 治理项目引用关系
    details: 检查缺失引用、非法依赖、跨运行时调用和架构规则违约，确保项目关系符合声明过的边界。
    link: /zh/built-in-tasks
    linkText: 查看图检查
  - icon: 🛡️
    title: 保护包边界
    details: 阻止跨包相对导入、漏写依赖、私有入口逃逸和绕过 workspace 协议的内部依赖，确保每个包只能通过公开入口被访问。
    link: /zh/built-in-tasks
    linkText: 查看源码检查
  - icon: 🎯
    title: 确认检查覆盖
    details: 将源码文件与 TypeScript、Vue、Svelte、test、tools、docs 等检查范围对齐，发现未覆盖、重复覆盖或落入错误项目图的文件。
    link: /zh/config/checkers
    linkText: 配置覆盖范围
  - icon: 📦
    title: 验证发布产物
    details: 检查消费者真正安装到的 npm tarball，确认 package metadata、exports、types、运行时入口和类型解析保持一致。
    link: /zh/config/package-checks
    linkText: 配置包检查
  - icon: 🚦
    title: 发布前发现风险
    details: 在发布前检查 README、license、误带文件、缺失文件、source map 和 registry 基线差异，确认发布内容符合预期。
    link: /zh/config/release-checks
    linkText: 配置发布检查
  - icon: 🧩
    title: 融入现有工作流
    details: 接入本地开发、PR、CI 和发布流程，并与 Nx、Turborepo 等任务运行器协作，让类型图治理成为现有工具链的一部分。
    link: /zh/workflows
    linkText: 配置工作流
---
