import type { ReactNode } from 'react';

import './css/site-devtools-docs.css';

type Locale = 'en' | 'zh';

interface ComponentProps {
  locale?: string;
}

interface LabeledParagraph {
  label: string;
  value: string;
}

interface TextGroup {
  label: string;
  paragraphs: string[];
}

interface OverviewSection {
  paragraphs: string[];
  title: string;
}

interface OverviewCopy {
  intro: string[];
  kicker: string;
  sections: OverviewSection[];
  subtitle: string;
  title: string;
}

interface PanelsCardCopy {
  caption: string;
  groups: TextGroup[];
  title: string;
}

interface PanelsCopy {
  cards: PanelsCardCopy[];
  kicker: string;
  subtitle: string;
  title: string;
}

interface WorkflowStep {
  caption: string;
  paragraphs: string[];
  title: string;
}

interface WorkflowCopy {
  kicker: string;
  steps: WorkflowStep[];
  subtitle: string;
  title: string;
}

const normalizeLocale = (locale?: string): Locale =>
  locale === 'zh' ? 'zh' : 'en';

const overviewCopy: Record<Locale, OverviewCopy> = {
  en: {
    intro: [
      'Turn on Site DevTools with the query entry or the docs logo shortcut, then stay in the same mode while you move through different kinds of questions.',
      'The choice is usually simple: use Page Overlay for the active component, Debug Logs for page runtime state, and Build Reports for build-time evidence.',
      'Query: ?site-devtools=1. Shortcut: top-left logo x3. Feedback: top toast.',
    ],
    kicker: 'Entry and surfaces',
    sections: [
      {
        paragraphs: [
          'Page Overlay keeps the explanation close to the component itself. It is the first place to look when you need the resolved render mode, current stage, timing, or the latest HMR movement.',
          'It also helps answer whether the active container is mostly paying for total bundle cost, JavaScript, CSS, or asset weight before you jump into deeper debugging.',
        ],
        title: 'Page Overlay',
      },
      {
        paragraphs: [
          'Debug Logs is the runtime-facing surface. Use it when the question is no longer "what happened on the page?" but "what does the page runtime currently know?"',
          'It is the right place to inspect injected globals, render metrics, HMR metrics, and snapshotRuntime() output when you need something you can copy into an issue, PR, or teammate handoff.',
        ],
        title: 'Debug Logs',
      },
      {
        paragraphs: [
          'Build Reports becomes useful when runtime symptoms are not enough and you need a build-time explanation for page cost or regressions.',
          'When analysis is enabled, this view gives you a page-level report and lets you continue that explanation through chunks and modules without switching to a different mental model.',
        ],
        title: 'Build Reports',
      },
    ],
    subtitle:
      'Site DevTools works best when it reads like documentation: start from the question you have, then move to the surface that answers it.',
    title: 'Open Site DevTools and choose the right surface!',
  },
  zh: {
    intro: [
      '先通过 query 参数或文档站 logo 快捷方式打开 Site DevTools，后续就一直在同一个调试模式里切换不同视图即可。',
      '选择通常很简单：组件本身的问题先看页面浮层，页面级运行时问题看 Debug Logs，需要构建证据时再看构建报告。',
      'Query：?site-devtools=1。Shortcut：左上角 logo x3。Feedback：顶部 toast。',
    ],
    kicker: '入口与视图',
    sections: [
      {
        paragraphs: [
          '页面浮层把说明贴着当前组件本身展开。只要你关心的是实际渲染模式、当前阶段、耗时，或者最近一次 HMR 变化，就应该先从这里看起。',
          '它也适合先做第一层归因，帮助判断当前容器的主要成本到底来自整体体积、JavaScript、CSS，还是资源文件。',
        ],
        title: '页面浮层',
      },
      {
        paragraphs: [
          'Debug Logs 面向运行时真相。它回答的不是“页面上发生了什么”，而是“当前页面运行时到底持有什么状态”。',
          '当你需要查看 Injected Globals、渲染指标、HMR 指标，或者导出 snapshotRuntime() 结果发到 issue、PR、评论或交接说明里时，这里才是主入口。',
        ],
        title: 'Debug Logs',
      },
      {
        paragraphs: [
          '构建报告适合处理“只看运行时还不够”的情况，尤其是页面成本突然变重、构建回归需要解释时。',
          '只要 analysis 已开启，这里就会给出 page-level 报告，并把同一套解释继续串到 chunk 和 module 证据上。',
        ],
        title: '构建报告',
      },
    ],
    subtitle:
      '把 Site DevTools 当成说明文档来使用会更顺手：先确定问题，再去看负责解释它的那一部分。',
    title: '打开 Site DevTools 后先选对说明视图',
  },
};

const panelsCopy: Record<Locale, PanelsCopy> = {
  en: {
    cards: [
      {
        caption: 'Component-first diagnosis',
        groups: [
          {
            label: 'What it shows',
            paragraphs: [
              'Page Overlay explains the current container in place, including resolved mode, stage, timing, and the latest HMR activity.',
              'It also gives you the fastest path to bundle composition filters when you want to see whether the current cost is mainly JS, CSS, assets, or total bundle weight.',
            ],
          },
          {
            label: 'Best for',
            paragraphs: [
              'Use it when the symptom is visible during navigation, hydration, or interaction startup and you want to localize the issue before reading runtime state.',
            ],
          },
          {
            label: 'Primary output',
            paragraphs: [
              'The output is a component-scoped explanation: what mode ran, what stage it reached, and where the cost is most likely coming from.',
            ],
          },
        ],
        title: 'Page Overlay',
      },
      {
        caption: 'Runtime-first diagnosis',
        groups: [
          {
            label: 'What it shows',
            paragraphs: [
              'Debug Logs exposes the page-level runtime state, including injected globals, render metrics, HMR metrics, and collected runtime entries.',
              'It also keeps snapshotRuntime() close at hand when you need a shareable record rather than an on-screen observation.',
            ],
          },
          {
            label: 'Best for',
            paragraphs: [
              'Use it when you already know which page or component is involved and now need evidence you can inspect, compare, or share with someone else.',
            ],
          },
          {
            label: 'Primary output',
            paragraphs: [
              'The output is a runtime snapshot you can reason about outside the UI, especially in issues, PR reviews, and debugging handoffs.',
            ],
          },
        ],
        title: 'Debug Logs',
      },
      {
        caption: 'Build-time explanation',
        groups: [
          {
            label: 'What it shows',
            paragraphs: [
              'Build Reports reads page-level analysis generated during docs build and keeps that explanation connected to chunk and module evidence.',
            ],
          },
          {
            label: 'Best for',
            paragraphs: [
              'Use it when page cost changes need a build-time explanation, or when runtime symptoms alone are too indirect to explain a regression.',
            ],
          },
          {
            label: 'Primary output',
            paragraphs: [
              'The output is one page-centered explanation that ties together page cost, chunk evidence, and module evidence.',
              'This surface only appears when build-time analysis is enabled.',
            ],
          },
        ],
        title: 'Build Reports',
      },
    ],
    kicker: 'Core capabilities',
    subtitle:
      'Each surface is best understood as a different kind of explanation rather than a different visual panel.',
    title: 'Three views, three kinds of explanation',
  },
  zh: {
    cards: [
      {
        caption: '从组件本身开始说明',
        groups: [
          {
            label: '你会看到',
            paragraphs: [
              '页面浮层直接在当前容器附近解释问题，包括实际模式、当前阶段、耗时，以及最近一次 HMR 动作。',
              '如果你只想先判断成本主要来自 JS、CSS、资源文件还是整体体积，这里也是最快的入口。',
            ],
          },
          {
            label: '最适合',
            paragraphs: [
              '适合那些在切页、hydration 或交互初始化阶段就已经能看见症状的问题，先把范围缩到组件本身，再决定要不要继续看运行时。',
            ],
          },
          {
            label: '主要输出',
            paragraphs: [
              '输出的是一份围绕当前组件的解释：到底跑了什么模式、走到了什么阶段、成本大概率落在哪一侧。',
            ],
          },
        ],
        title: '页面浮层',
      },
      {
        caption: '从运行时真相开始说明',
        groups: [
          {
            label: '你会看到',
            paragraphs: [
              'Debug Logs 暴露的是页面级运行时状态，包括 Injected Globals、渲染指标、HMR 指标，以及收集到的运行时记录。',
              '当你需要 snapshotRuntime() 这种可以拿去复制、比较、共享的结果时，这里比页面浮层更合适。',
            ],
          },
          {
            label: '最适合',
            paragraphs: [
              '适合已经知道问题页面或问题组件在哪里，但需要更稳定的证据来分析、对比或分享给其他人。',
            ],
          },
          {
            label: '主要输出',
            paragraphs: [
              '输出的是运行时快照本身，它更适合脱离界面继续讨论，尤其是在 issue、PR 评审和交接说明里。',
            ],
          },
        ],
        title: 'Debug Logs',
      },
      {
        caption: '从构建阶段开始说明',
        groups: [
          {
            label: '你会看到',
            paragraphs: [
              '构建报告读取的是 docs build 期间生成的 page-level 分析结果，并把解释继续延伸到 chunk 和 module 证据。',
            ],
          },
          {
            label: '最适合',
            paragraphs: [
              '适合页面成本变化需要构建期解释的场景，尤其是只看运行时症状还不足以说明回归原因的时候。',
            ],
          },
          {
            label: '主要输出',
            paragraphs: [
              '输出的是一份以页面为中心的解释，把页面成本、chunk 证据和 module 证据串在一起。',
              '只有开启构建期 analysis 后，这一部分才会出现。',
            ],
          },
        ],
        title: '构建报告',
      },
    ],
    kicker: '核心能力',
    subtitle: '每个视图更像一种解释路径，而不是一组独立的界面控件。',
    title: '三种视图，对应三类说明方式',
  },
};

const workflowCopy: Record<Locale, WorkflowCopy> = {
  en: {
    kicker: 'Suggested flow',
    steps: [
      {
        caption: 'Start from what is already visible.',
        paragraphs: [
          'Open with the component-facing explanation first. If the symptom is already visible on the page, Page Overlay usually gives the shortest path to a useful answer.',
        ],
        title: '1. Localize the component',
      },
      {
        caption: 'Move to runtime only when the question changes.',
        paragraphs: [
          'Switch to Debug Logs when the question becomes about runtime state, shareable evidence, or the exact values the page is carrying at that moment.',
        ],
        title: '2. Confirm the runtime state',
      },
      {
        caption: 'Bring in build-time evidence only when needed.',
        paragraphs: [
          'Open Build Reports when the problem is really about page cost, regressions, or where build output became heavier than expected.',
        ],
        title: '3. Explain the cost',
      },
    ],
    subtitle:
      'The usual path is narrow: component first, runtime second, build evidence last.',
    title: 'A compact way to work through an issue',
  },
  zh: {
    kicker: '建议顺序',
    steps: [
      {
        caption: '先从已经能看见的问题开始。',
        paragraphs: [
          '如果症状已经在页面上出现，优先看组件视角的解释。页面浮层通常是拿到第一个有效答案的最短路径。',
        ],
        title: '1. 先定位组件',
      },
      {
        caption: '只有问题变化时再切到运行时。',
        paragraphs: [
          '当你真正关心的是运行时状态、共享证据，或者页面当下携带的具体值时，再进入 Debug Logs。',
        ],
        title: '2. 再确认运行时',
      },
      {
        caption: '需要时才补上构建期证据。',
        paragraphs: [
          '如果问题本质上是页面成本、回归来源，或者构建产物为什么变重，再打开构建报告继续解释。',
        ],
        title: '3. 最后解释成本',
      },
    ],
    subtitle: '最常见的顺序很收敛：先组件，再运行时，最后才是构建证据。',
    title: '一套更紧凑的排查顺序',
  },
};

function DebugDocFrame({
  children,
  kicker,
  subtitle,
  title,
}: {
  children: ReactNode;
  kicker: string;
  subtitle: string;
  title: string;
}) {
  return (
    <section className="site-devtools-docs">
      <div className="site-devtools-docs__header">
        <p className="site-devtools-docs__kicker">{kicker}</p>
        <h3 className="site-devtools-docs__title">{title}</h3>
        <p className="site-devtools-docs__subtitle">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function ParagraphStack({ items }: { items: string[] }) {
  return (
    <div className="site-devtools-docs__paragraphs">
      {items.map((item) => (
        <p key={item} className="site-devtools-docs__paragraph">
          {item}
        </p>
      ))}
    </div>
  );
}

function LabeledParagraphStack({ items }: { items: LabeledParagraph[] }) {
  return (
    <div className="site-devtools-docs__labeled-paragraphs">
      {items.map((item) => (
        <p key={item.label} className="site-devtools-docs__paragraph">
          <strong>{item.label}:</strong> {item.value}
        </p>
      ))}
    </div>
  );
}

function TextGroupSection({ group }: { group: TextGroup }) {
  return (
    <section className="site-devtools-docs__text-group">
      <p className="site-devtools-docs__section-label">{group.label}</p>
      <ParagraphStack items={group.paragraphs} />
    </section>
  );
}

export function SiteDevToolsConsoleOverview(props: ComponentProps) {
  const copy = overviewCopy[normalizeLocale(props.locale)];

  const metadata: Record<Locale, LabeledParagraph[]> = {
    en: [
      { label: 'Query', value: '?site-devtools=1' },
      { label: 'Shortcut', value: 'Top-left logo x3' },
      { label: 'Feedback', value: 'Top toast' },
    ],
    zh: [
      { label: 'Query', value: '?site-devtools=1' },
      { label: 'Shortcut', value: '左上角 logo x3' },
      { label: 'Feedback', value: '顶部 toast' },
    ],
  };

  return (
    <DebugDocFrame
      kicker={copy.kicker}
      subtitle={copy.subtitle}
      title={copy.title}
    >
      <div className="site-devtools-docs__body">
        <section className="site-devtools-docs__content-section">
          <h4>
            {normalizeLocale(props.locale) === 'zh'
              ? '如何进入'
              : 'How to Enter'}
          </h4>
          <ParagraphStack items={copy.intro} />
          <LabeledParagraphStack
            items={metadata[normalizeLocale(props.locale)]}
          />
        </section>

        {copy.sections.map((section) => (
          <section
            key={section.title}
            className="site-devtools-docs__content-section"
          >
            <h4>{section.title}</h4>
            <ParagraphStack items={section.paragraphs} />
          </section>
        ))}
      </div>
    </DebugDocFrame>
  );
}

export function SiteDevToolsConsolePanels(props: ComponentProps) {
  const copy = panelsCopy[normalizeLocale(props.locale)];

  return (
    <DebugDocFrame
      kicker={copy.kicker}
      subtitle={copy.subtitle}
      title={copy.title}
    >
      <div className="site-devtools-docs__body">
        {copy.cards.map((card) => (
          <section
            key={card.title}
            className="site-devtools-docs__content-section"
          >
            <p className="site-devtools-docs__surface-caption">
              {card.caption}
            </p>
            <h4>{card.title}</h4>
            {card.groups.map((group) => (
              <TextGroupSection key={group.label} group={group} />
            ))}
          </section>
        ))}
      </div>
    </DebugDocFrame>
  );
}

export function SiteDevToolsConsoleWorkflow(props: ComponentProps) {
  const copy = workflowCopy[normalizeLocale(props.locale)];

  return (
    <DebugDocFrame
      kicker={copy.kicker}
      subtitle={copy.subtitle}
      title={copy.title}
    >
      <div className="site-devtools-docs__body">
        {copy.steps.map((step) => (
          <section
            key={step.title}
            className="site-devtools-docs__content-section"
          >
            <h4>{step.title}</h4>
            <p className="site-devtools-docs__step-summary">{step.caption}</p>
            <ParagraphStack items={step.paragraphs} />
          </section>
        ))}
      </div>
    </DebugDocFrame>
  );
}
