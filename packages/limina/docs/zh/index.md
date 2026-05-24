---
layout: home

hero:
  name: Limina
  text: TypeScript monorepo 架构治理
  tagline: 在 CI 和发布前，确认 project references、package 边界、checker 覆盖和发布产物没有各说各话。
  image:
    src: /logo.svg
    alt: Limina
  actions:
    - theme: brand
      text: 快速开始
      link: /zh/getting-started
    - theme: alt
      text: 查看 npm
      link: https://www.npmjs.com/package/limina

features:
  - title: 看清真实依赖图
    details: 用 TypeScript 解析源码 imports，再和 project references、workspace 协议、架构规则逐一对照。
  - title: 让 package 边界清楚
    details: 发现跨 package 相对导入、漏写的依赖声明，以及逃出当前 package 的 #imports。
  - title: 知道每个文件被检查
    details: 把 declaration leaf、local typecheck companion 和框架 checker 对起来，生成代码也用显式 allowlist 说明。
  - title: 发布真正可用的产物
    details: 用 publint、Are The Types Wrong、README/license 检查和 runtime import 边界验证构建后的 package。
---
