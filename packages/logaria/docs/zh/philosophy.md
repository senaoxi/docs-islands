# 项目理念

Logaria 的设计由几条反复使用的选择塑造。这些选择是 runtime 一直保持小巧、插件一直保持保守的原因。

## 小而可预测的 Runtime

Logaria 的 runtime 就是一组纯函数。再添功能其实并不难，难的是“克制不添”。

- 一个默认 scope，加可选的若干显式 scope。
- 每个 logger 都提供 5 个日志方法（`info`、`success`、`warn`、`error`、`debug`）——没有为了花哨而发明的额外日志级别。
- 不提供 runtime 配置的 transports、formatters、异步 sink。Logaria 只往 `console` 写；需要更多就在应用层包一层。
- Helper（`createElapsedTimer`、`formatErrorMessage`、`formatDebugMessage`）放在独立入口（`logaria/helper`），让根入口保持最小化。

由此，API 表面五分钟可读完，离开文档也能回想起来。

## Runtime 是最终真理

Runtime 过滤是日志是否会被输出的唯一真理来源。构建插件是它**之上的优化**，永远不是替代。

这个顺序很重要：

- 即便插件做完裁剪，留在 bundle 里的每一条调用仍然要经过同一道 runtime 过滤。
- “插件裁掉的” 与 “runtime 允许的” 之间不会发生分歧——因为插件安装时，runtime 中用于改默认 scope 的 API 会拒绝执行。
- 任何模糊地带都以 runtime 配置为准，而不是静态分析的结论。

明天关掉插件，哪些日志会出现也不会发生变化。这是我们要守住的性质。

## 默认保守

插件只在能证明一组固定的静态事实（命名导入、`main`/`group`/`message` 都是字面量、绑定未重新赋值、独立表达式、build 上下文、`treeshake: true`）时才会移除一条日志。其他任何情况都保留在 bundle 里。

在“产出零意外”与“极致裁剪”之间，我们选前者。错过一次移除的代价是几个字节；错误移除一次的代价是生产事故现场少了一条本该出现的日志。这场交易并不对称，我们就按这个不对称去交易。

## 显式归属

只有一个默认 scope，并且同一时间只允许一个所有者——要么应用（通过 `setLoggerConfig` / `resetLoggerConfig`），要么构建插件（通过注入的常量）。Runtime 会识别归属，并拒绝把两者混在一起。

宿主集成若需要私有 logger，根本不会共享默认 scope。它们通过 [`logaria/core`](./scoped-integrations.md) 注册带独立配置的显式 scope，应用永远不会察觉。

这条规则也正是让库可以安心依赖 Logaria 的原因：一个传递依赖没办法悄悄改向或静音你的日志。

## 框架无关的设计

Logaria 没有偏爱的框架，没有偏爱的打包工具，也没有为“某个流行选项”留专属通路。CLI 里调用的 `createLogger` 和 Vite 插件里调用的是同一个；同一个 `loggerPlugin` 能在 Rollup、Rolldown、esbuild、webpack、Rspack、Farm 中工作。

我们会抵制只在某一个框架里成立的功能。如果一个功能可以表达为通用的 Logaria 原语，它属于 core；否则它属于由该生态贡献的 preset 插件。

## 默认类型安全

Logaria 用 TypeScript 编写，公共类型通过 `logaria/types` 暴露。Preset 插件经过类型化，`extends` 与 `rules` 的引用会自动补全并拒绝拼写错误的标签。配置形状的变化由编译器先一步反馈给用户——这是小库能在演进中持续被信赖的基础。

## 让生态成长，而不是让库膨胀

真实项目里有意思的可见性决策几乎不是“显示 errors”，而是“在这个子系统变慢时显示它”，或者“当 CI 重跑开发构建时启用这条规则”。要在不让 core 变臃肿的前提下支持这种需求，答案是 **Preset 插件**：把规则模板与配置打成小巧、可分享的包，业务项目通过 `extends` 启用，并按项目覆盖。

Logaria 自己的工作是让原语足够锋利；生态的工作是把它们装配成各项目需要的形状。
