import {
  type RefObject,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  demoReducer,
  type DemoStage,
  type DemoState,
  getActiveChange,
  getDemoStages,
  getEditorAction,
  getEditorBuffer,
  getEditorCursor,
  getHoldDuration,
  getPlaybackPlan,
  getViCommand,
  getViMode,
  getVisibleText,
  initialDemoState,
} from './landing-demo-playback';
import { getIntegrationSnippets } from './landing-demo-source';
import LandingCounter from './LandingCounter';
import './LandingDemo.css';

function getEditorInstruction(
  stage: DemoStage,
  state: DemoState,
  chinese: boolean,
) {
  if (state.editor === 'open')
    return chinese ? '先阅读原有内容' : 'Read the existing buffer';
  const action = getEditorAction(stage, state);
  if (action === 'open-line')
    return chinese
      ? '先开空行，原有内容下移'
      : 'Open a line; move existing content down';
  if (action === 'pair')
    return chinese
      ? '自动配对，光标进入内部'
      : 'Auto-pair; cursor moves inside';
  if (action === 'newline')
    return chinese ? '换行并自动缩进' : 'New line with auto-indent';
  return getActiveChange(stage, state.edit)?.label;
}

interface ViEditorProps {
  stage: DemoStage;
  state: DemoState;
  reducedMotion: boolean;
  chinese: boolean;
  terminalRef: RefObject<HTMLTextAreaElement>;
  onFocus: () => void;
}
function ViEditor({
  stage,
  state,
  reducedMotion,
  chinese,
  terminalRef,
  onFocus,
}: ViEditorProps) {
  const [scroll, setScroll] = useState({ top: 0, left: 0 });
  const caret = useRef<HTMLSpanElement>(null);
  const buffer = getEditorBuffer(stage, state, reducedMotion);
  const cursor = getEditorCursor(stage, state, reducedMotion);
  const mode = getViMode(state.editor);
  const lines = buffer.split('\n').length;
  const numbers = Array.from({ length: Math.max(lines, 18) }, (_, index) =>
    index < lines ? String(index + 1) : '~',
  ).join('\n');
  const newFile = stage.parts?.every((part) =>
    typeof part === 'string' ? part === '' : part.before === '',
  );
  const command = getViCommand(stage, state, reducedMotion);
  useEffect(() => {
    const element = terminalRef.current;
    const marker = caret.current;
    if (!element || !marker) return;
    const area = element.getBoundingClientRect();
    const position = marker.getBoundingClientRect();
    const lineHeight = position.height;
    if (position.bottom > area.bottom - lineHeight)
      element.scrollTop += position.bottom - area.bottom + lineHeight;
    else if (position.top < area.top + 4)
      element.scrollTop = Math.max(
        0,
        element.scrollTop + position.top - area.top - 4,
      );
    if (position.right > area.right - 16)
      element.scrollLeft += position.right - area.right + 16;
    else if (position.left < area.left + 12)
      element.scrollLeft = Math.max(
        0,
        element.scrollLeft + position.left - area.left - 12,
      );
  }, [buffer, cursor.line, cursor.column, state.editor, terminalRef]);
  return (
    <div className="demo-vi-editor" data-mode={mode}>
      <div className="demo-vi-title">
        <span>
          vi <span>{stage.file}</span>
        </span>
        <span>
          {newFile ? '[New File]' : chinese ? '已有文件' : 'Existing file'}
        </span>
      </div>
      <div className="demo-vi-buffer">
        <div className="demo-vi-gutter" aria-hidden="true">
          <pre style={{ transform: `translateY(-${scroll.top}px)` }}>
            {numbers}
          </pre>
        </div>
        <textarea
          ref={terminalRef}
          readOnly
          spellCheck={false}
          wrap="off"
          aria-label={
            chinese ? '模拟 vi 编辑缓冲区' : 'Simulated vi editor buffer'
          }
          value={buffer}
          onFocus={onFocus}
          onScroll={(event) =>
            setScroll({
              top: event.currentTarget.scrollTop,
              left: event.currentTarget.scrollLeft,
            })
          }
        />
        <span
          ref={caret}
          className={`demo-vi-cursor ${state.editor === 'insert' ? 'is-insert' : ''}`}
          aria-hidden="true"
          style={{
            top: `calc(${cursor.line - 1} * 1.85em + 4px - ${scroll.top}px)`,
            left: `calc(46px + ${cursor.column}ch - ${scroll.left}px)`,
          }}
        />
      </div>
      <div className="demo-vi-status">
        <span className={state.editor === 'insert' ? 'is-insert' : ''}>
          {mode}
        </span>
        <span>{getEditorInstruction(stage, state, chinese)}</span>
        <span>
          {cursor.line}:{cursor.column + 1}
        </span>
      </div>
      <div className="demo-vi-command">
        <span>
          {state.editor === 'save' ||
          (state.editor === 'normal' && state.edit > 0)
            ? 'Esc'
            : ''}
        </span>
        <code>
          {state.editor === 'save' || state.editor === 'normal' ? command : ''}
        </code>
        {state.editor === 'save' && (
          <span className="demo-vi-save-note">
            {chinese ? '保存并退出' : 'Save and quit'}
          </span>
        )}
      </div>
    </div>
  );
}

interface DemoCopy {
  reduced: string;
  done: string;
  interaction: string;
  try: string;
  phases: string[];
  pause: string;
  play: string;
  update: string;
  resume: string;
}
function getDemoStatus(copy: DemoCopy, state: DemoState, reduced: boolean) {
  if (reduced) return copy.reduced;
  if (state.phase === 9) return copy.done;
  if (state.interaction) return copy.interaction;
  if (state.phase === 6) return copy.try;
  return copy.phases[state.phase];
}
function getPreviewNote(copy: DemoCopy, phase: number, chinese: boolean) {
  if (phase === 9) return copy.done;
  if (phase >= 6) return copy.try;
  return chinese
    ? '静态文档内容先呈现在这里。'
    : 'Your static document starts here.';
}
function getPlayLabel(copy: DemoCopy, phase: number, playing: boolean) {
  if (playing) return copy.pause;
  if (phase === 0) return copy.play;
  if (phase === 6) return copy.update;
  return copy.resume;
}
function getActiveGroup(phase: number) {
  if (phase < 5) return 0;
  return phase < 7 ? 1 : 2;
}

const getReducedMotion = () =>
  globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
const subscribeMotion = (listener: () => void) => {
  const query = globalThis.matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
};
const getVisibility = () => !globalThis.document.hidden;
const subscribeVisibility = (listener: () => void) => {
  globalThis.document.addEventListener('visibilitychange', listener);
  return () =>
    globalThis.document.removeEventListener('visibilitychange', listener);
};
const serverSnapshot = () => false;

interface LandingDemoProps {
  locale?: 'en' | 'zh';
}

export default function LandingDemo({ locale = 'en' }: LandingDemoProps) {
  const chinese = locale === 'zh';
  const snippets = useMemo(() => getIntegrationSnippets(locale), [locale]);
  const copy = chinese
    ? {
        title: '从 Hello, world! 到可交互的小岛。',
        description:
          '在已有 VitePress 站点中，用带配对和缩进辅助的 vi 增补接入，再更新文案。',
        simulated: '模拟接入 · 实际 React 预览',
        terminal: '控制台 · 模拟 vi',
        preview: '页面预览',
        source: '复制源码',
        copied: '已复制',
        fallback: '请选中代码并复制。',
        play: '播放演示',
        pause: '暂停',
        resume: '继续',
        update: '继续更新文案',
        next: '下一步',
        restart: '重新开始',
        done: '更新完成，计数仍保留。',
        try: '试着点击计数器，再继续修改文案。',
        interaction: '演示已暂停，优先保留你的操作。',
        reduced: '已减少动态效果，可逐步查看。',
        disclaimer:
          '步骤回放已验证的代码、控制台日志与开发事件；预览中是实际可点击的 React 组件。回放不修改文件，也不启动开发服务器。',
        hmrNote: '本例仅修改文案，保持组件导出与 hook 结构不变。',
        groups: ['接入', '渲染', '更新'],
        phases: [
          '原始 Markdown 页面',
          '配置构建插件',
          '注册客户端运行时',
          '创建 React 组件',
          '在 Markdown 中引入',
          '查看渲染日志',
          '小岛已可交互',
          '修改组件文案',
          '查看 HMR 日志与事件',
          '文案更新，计数保留',
        ],
      }
    : {
        title: 'From Hello, world! to an interactive island.',
        description:
          'Start in an existing VitePress site. Edit in vi with pairing and indent assistance, then update the copy.',
        simulated: 'Simulated setup · live React preview',
        terminal: 'Terminal · simulated vi',
        preview: 'Page preview',
        source: 'Copy source',
        copied: 'Copied',
        fallback: 'Select the code to copy it.',
        play: 'Play demo',
        pause: 'Pause',
        resume: 'Continue',
        update: 'Continue to the copy update',
        next: 'Next step',
        restart: 'Restart demo',
        done: 'Copy updated. Your count stays.',
        try: 'Try the counter, then continue to the copy update.',
        interaction: 'Playback paused for your interaction.',
        reduced: 'Motion reduced. Explore one step at a time.',
        disclaimer:
          'Steps replay verified code, console excerpts, and dev events. The preview is a real React counter. Playback does not edit files or start a dev server.',
        hmrNote:
          'This edit changes copy while keeping the component export and hook structure stable.',
        groups: ['SETUP', 'RENDER', 'UPDATE'],
        phases: [
          'Original Markdown page',
          'Configure the build plugin',
          'Register the client runtime',
          'Create a React component',
          'Import it in Markdown',
          'Inspect the render logs',
          'The island is interactive',
          'Edit the component copy',
          'Inspect HMR logs and events',
          'New copy. Same count.',
        ],
      };
  const stages = useMemo(() => getDemoStages(snippets), [snippets]);
  const [state, dispatch] = useReducer(demoReducer, initialDemoState(stages));
  const stage = stages[state.phase]!;
  const reducedMotion = useSyncExternalStore(
    subscribeMotion,
    getReducedMotion,
    serverSnapshot,
  );
  const visible = useSyncExternalStore(
    subscribeVisibility,
    getVisibility,
    serverSnapshot,
  );
  const root = useRef<HTMLDivElement>(null);
  const terminal = useRef<HTMLTextAreaElement>(null);
  const [inView, setInView] = useState(true);
  const [copyMessage, setCopyMessage] = useState('');
  const copyTimer = useRef<ReturnType<typeof globalThis.setTimeout>>(undefined);
  const plan = getPlaybackPlan(stage, state.editor, state.edit);
  const editorActive = ['open', 'normal', 'insert', 'save'].includes(
    state.editor,
  );
  const visibleText = getVisibleText(stage, state, reducedMotion);
  const savedText = `${stage.command}\n${chinese ? '[模拟 vi]' : '[simulated vi]'} ${stage.file} ${chinese ? '已保存' : 'saved'} (:wq)\n$`;

  useEffect(() => {
    let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
    if (state.playing && !reducedMotion && visible && inView) {
      const delay =
        plan[state.frame]?.delay ?? getHoldDuration(stage, state.editor);
      timer = globalThis.setTimeout(
        () => dispatch({ type: 'tick', stages }),
        delay,
      );
    }
    return () => {
      if (timer !== undefined) globalThis.clearTimeout(timer);
    };
  }, [
    inView,
    plan,
    reducedMotion,
    stage,
    stages,
    state.editor,
    state.frame,
    state.playing,
    visible,
  ]);
  useEffect(() => {
    const query = globalThis.matchMedia('(prefers-reduced-motion: reduce)');
    const stop = () => {
      if (query.matches) dispatch({ type: 'reduce', frame: plan.length });
    };
    query.addEventListener('change', stop);
    return () => query.removeEventListener('change', stop);
  }, [plan.length]);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      setInView(entry?.isIntersecting ?? false);
    });
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);

  useEffect(
    () => () => {
      if (copyTimer.current !== undefined)
        globalThis.clearTimeout(copyTimer.current);
    },
    [],
  );

  const play = () => dispatch({ type: 'start', stages });
  const pauseForInteraction = () =>
    dispatch({ type: 'pause', interaction: true });
  const copySource = async () => {
    if (copyTimer.current !== undefined)
      globalThis.clearTimeout(copyTimer.current);
    try {
      await globalThis.window.navigator.clipboard.writeText(stage.source);
      setCopyMessage(copy.copied);
    } catch {
      setCopyMessage(copy.fallback);
    }
    copyTimer.current = globalThis.setTimeout(() => setCopyMessage(''), 2500);
  };
  const complete = reducedMotion || state.frame >= plan.length;
  const playing = state.playing && !reducedMotion;
  const counterShown = state.phase >= 6;
  const updated = state.phase === 9;
  const status = getDemoStatus(copy, state, reducedMotion);
  const previewNote = getPreviewNote(copy, state.phase, chinese);
  const playLabel = getPlayLabel(copy, state.phase, playing);
  const activeGroup = getActiveGroup(state.phase);
  const logStage = [5, 6, 8, 9].includes(state.phase);

  return (
    <div
      ref={root}
      className="integration-demo"
      data-phase={stage.id}
      data-playing={playing}
      data-complete={complete}
      data-editor-step={state.editor}
      data-edit-index={state.edit}
      data-edit-action={getEditorAction(stage, state)}
      data-frame={state.frame}
      data-vi-mode={editorActive ? getViMode(state.editor) : 'SHELL'}
    >
      <div className="demo-heading">
        <div>
          <h2>{copy.title}</h2>
          <p>{copy.description}</p>
        </div>
        <span className="demo-simulation-label">{copy.simulated}</span>
      </div>
      <div className="demo-workspace">
        <div className="demo-console">
          <div className="demo-pane-toolbar">
            <span>
              <span className="demo-terminal-symbol" aria-hidden="true">
                ›_
              </span>
              {copy.terminal}
            </span>
            <span className="demo-file">{stage.file}</span>
          </div>
          <div className="demo-stage-bar">
            <span>
              {String(state.phase + 1).padStart(2, '0')} /{' '}
              {String(stages.length).padStart(2, '0')}
            </span>
            <span>{copy.phases[state.phase]}</span>
          </div>
          <div className="demo-terminal-code">
            {editorActive ? (
              <ViEditor
                key={state.phase}
                stage={stage}
                state={state}
                reducedMotion={reducedMotion}
                chinese={chinese}
                terminalRef={terminal}
                onFocus={() => dispatch({ type: 'pause' })}
              />
            ) : (
              <textarea
                ref={terminal}
                readOnly
                spellCheck={false}
                aria-label={copy.terminal}
                value={state.editor === 'saved' ? savedText : visibleText}
                onFocus={() => dispatch({ type: 'pause' })}
              />
            )}
            <pre className="demo-screen-reader">
              <code>{stage.source}</code>
            </pre>
          </div>
          <div className="demo-console-footer">
            <ol className="demo-journey" aria-label={copy.title}>
              {copy.groups.map((group, index) => (
                <li
                  key={group}
                  aria-current={activeGroup === index ? 'step' : undefined}
                >
                  {group}
                </li>
              ))}
            </ol>
            <button type="button" onClick={copySource}>
              {logStage ? (chinese ? '复制日志' : 'Copy logs') : copy.source}
            </button>
          </div>
        </div>
        <div className="demo-page-preview">
          <div className="demo-pane-toolbar">
            <span>{copy.preview}</span>
            <span className="demo-file">index.md</span>
          </div>
          <div className="demo-rendered-page">
            <p className="demo-document-label">VITEPRESS / MARKDOWN</p>
            <h3>Hello, world!</h3>
            <div
              className="demo-counter-container"
              hidden={!counterShown}
              onPointerDown={pauseForInteraction}
              onFocusCapture={pauseForInteraction}
            >
              <LandingCounter
                key={state.generation}
                locale={locale}
                title={updated ? snippets.updatedTitle : snippets.title}
              />
            </div>
            <p className="demo-preview-note">{previewNote}</p>
          </div>
          <div className="demo-preview-boundary">
            <code>
              {counterShown ? '<Counter client:visible />' : 'index.md'}
            </code>
            <span>{counterShown ? 'React' : 'Markdown'}</span>
          </div>
        </div>
      </div>
      <div className="demo-controls">
        <div>
          <button
            className="demo-play"
            type="button"
            disabled={reducedMotion || updated}
            onClick={() => (playing ? dispatch({ type: 'pause' }) : play())}
          >
            <span aria-hidden="true">{playing ? 'Ⅱ' : '▷'}</span>
            {playLabel}
          </button>
          <button
            type="button"
            disabled={updated}
            onClick={() => dispatch({ type: 'next', stages })}
          >
            {copy.next}
          </button>
          <button
            type="button"
            onClick={() =>
              dispatch({
                type: 'restart',
                state: initialDemoState(stages, state.generation + 1),
              })
            }
          >
            {copy.restart}
          </button>
        </div>
        <p role="status" aria-live="polite">
          {copyMessage || status}
        </p>
      </div>
      <p className="demo-disclaimer">
        {copy.disclaimer} <span>{copy.hmrNote}</span>
      </p>
    </div>
  );
}
