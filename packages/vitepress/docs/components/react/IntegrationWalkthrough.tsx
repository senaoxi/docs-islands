import {
  type CSSProperties,
  type RefObject,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { getIntegrationWalkthroughSnippets } from './integration-walkthrough-content';
import {
  getActiveChange,
  getEditorAction,
  getEditorBuffer,
  getEditorCursor,
  getPrototypeMotion,
  getTerminalTranscript,
  getViCommand,
  getViMode,
  getWalkthroughStages,
  getWalkthroughTimeline,
  initialWalkthroughState,
  walkthroughReducer,
  type WalkthroughStage,
  type WalkthroughState,
} from './integration-walkthrough-playback';
import './IntegrationWalkthrough.css';
import IslandPrototype from './IslandPrototype';
import TerminalCode from './TerminalCode';

function getEditorInstruction(
  stage: WalkthroughStage,
  state: WalkthroughState,
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
  stage: WalkthroughStage;
  state: WalkthroughState;
  reducedMotion: boolean;
  chinese: boolean;
  terminalRef: RefObject<HTMLDivElement>;
}
function ViEditor({
  stage,
  state,
  reducedMotion,
  chinese,
  terminalRef,
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
    <div className="walkthrough-vi-editor" data-mode={mode}>
      <div className="walkthrough-vi-title">
        <span>
          vi <span>{stage.file}</span>
        </span>
        <span>
          {newFile ? '[New File]' : chinese ? '已有文件' : 'Existing file'}
        </span>
      </div>
      <div className="walkthrough-vi-buffer">
        <div className="walkthrough-vi-gutter" aria-hidden="true">
          <pre style={{ transform: `translateY(-${scroll.top}px)` }}>
            {numbers}
          </pre>
        </div>
        <div
          ref={terminalRef}
          className="walkthrough-code"
          role="textbox"
          aria-readonly="true"
          aria-multiline="true"
          tabIndex={0}
          aria-label={chinese ? 'vi 回放缓冲区' : 'vi playback buffer'}
          onScroll={(event) =>
            setScroll({
              top: event.currentTarget.scrollTop,
              left: event.currentTarget.scrollLeft,
            })
          }
        >
          <pre>
            <TerminalCode
              source={buffer}
              language={stage.file.endsWith('.css') ? 'css' : 'markdown'}
            />
          </pre>
        </div>
        <span
          ref={caret}
          className={`walkthrough-vi-cursor ${state.editor === 'insert' ? 'is-insert' : ''}`}
          aria-hidden="true"
          style={{
            top: `calc(${cursor.line - 1} * 1.85em + 4px - ${scroll.top}px)`,
            left: `calc(46px + ${cursor.column}ch - ${scroll.left}px)`,
          }}
        />
      </div>
      <div className="walkthrough-vi-status">
        <span className={state.editor === 'insert' ? 'is-insert' : ''}>
          {mode}
        </span>
        <span>{getEditorInstruction(stage, state, chinese)}</span>
        <span>
          {cursor.line}:{cursor.column + 1}
        </span>
      </div>
      <div className="walkthrough-vi-command">
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
          <span className="walkthrough-vi-save-note">
            {chinese ? '保存并退出' : 'Save and quit'}
          </span>
        )}
      </div>
    </div>
  );
}

const getReducedMotion = () =>
  globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
const subscribeMotion = (listener: () => void) => {
  const query = globalThis.matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
};
const serverSnapshot = () => false;
const getPageVisible = () => document.visibilityState !== 'hidden';
const subscribeVisibility = (listener: () => void) => {
  document.addEventListener('visibilitychange', listener);
  return () => document.removeEventListener('visibilitychange', listener);
};

interface IntegrationWalkthroughProps {
  locale?: 'en' | 'zh';
  pet?: 'sunset';
}
interface RouteSize {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export default function IntegrationWalkthrough({
  locale = 'en',
  pet,
}: IntegrationWalkthroughProps) {
  const chinese = locale === 'zh';
  const snippets = useMemo(
    () => getIntegrationWalkthroughSnippets(locale),
    [locale],
  );
  const stages = useMemo(() => getWalkthroughStages(snippets), [snippets]);
  const timeline = useMemo(() => getWalkthroughTimeline(stages), [stages]);
  const [state, dispatch] = useReducer(
    walkthroughReducer,
    initialWalkthroughState(),
  );
  const reducedMotion = useSyncExternalStore(
    subscribeMotion,
    getReducedMotion,
    serverSnapshot,
  );
  const pageVisible = useSyncExternalStore(
    subscribeVisibility,
    getPageVisible,
    serverSnapshot,
  );
  const [inView, setInView] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const consoleRef = useRef<HTMLDivElement>(null);
  const terminal = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const [route, setRoute] = useState<RouteSize | null>(null);
  const stage = stages[state.phase]!;
  const updated =
    stage.id === 'updated' || (stage.id === 'hmr' && state.frame > 0);
  const motion = getPrototypeMotion(state, timeline, reducedMotion);
  const editorActive = ['open', 'normal', 'insert', 'save'].includes(
    state.editor,
  );
  const copy = chinese
    ? {
        title: '让 Sunset 跑进这页文档。',
        description:
          '在本页 Markdown 接入已有 React 组件；Sunset 从左跑向右，途中通过 CSS 热更新转身跑回。',
        badge: '辅助回放 · 真实 React 原型',
        terminal: 'Terminal · vi 回放 / 实测日志回放',
        phases: [
          `编辑本页 ${snippets.page.file}`,
          '刷新预览，渲染 Sunset',
          '修改已有 CSS 方向',
          '接收 HMR 更新',
          'Sunset 转身跑回',
        ],
        groups: ['本页', '样式', 'HMR'],
      }
    : {
        title: 'Let Sunset run through this page.',
        description:
          'Connect an existing React component in Markdown. Sunset runs left to right as CSS HMR sends it running back.',
        badge: 'Assisted playback · live React prototype',
        terminal: 'Terminal · vi playback / recorded logs',
        phases: [
          `Edit this ${snippets.page.file}`,
          'Reload preview; render Sunset',
          'Edit the existing CSS direction',
          'Receive the HMR update',
          'Sunset runs back',
        ],
        groups: ['THIS PAGE', 'STYLES', 'HMR'],
      };

  useEffect(() => {
    if (reducedMotion)
      dispatch({
        type: 'finish',
        stages,
        endAt: timeline.finishAt,
        now: Date.now(),
      });
  }, [reducedMotion, stages, timeline.finishAt]);
  useEffect(() => {
    const timer =
      state.playing && !reducedMotion && pageVisible && inView
        ? globalThis.setTimeout(
            () =>
              dispatch({
                type: 'tick',
                now: Date.now(),
                stages,
                ms: motion.duration,
                endAt: motion.finishAt,
                direction:
                  (motion.pose === 'jumping' ||
                    motion.pose === 'running-right') &&
                  root.current?.querySelector(
                    '.walkthrough-character > span',
                  ) &&
                  getComputedStyle(
                    root.current.querySelector(
                      '.walkthrough-character > span',
                    )!,
                  )
                    .getPropertyValue('--run-direction')
                    .trim() === 'left'
                    ? 'left'
                    : 'right',
              }),
            motion.duration,
          )
        : undefined;
    return () => globalThis.clearTimeout(timer);
  }, [
    motion.duration,
    motion.finishAt,
    motion.pose,
    pageVisible,
    inView,
    reducedMotion,
    stages,
    state.clock,
    state.editor,
    state.frame,
    state.playing,
    timeline.finishAt,
  ]);
  useEffect(() => {
    const element = root.current;
    const observer = new IntersectionObserver(([entry]) => {
      setInView(entry?.isIntersecting ?? false);
      if (entry?.isIntersecting && !started.current) {
        started.current = true;
        if (getReducedMotion())
          dispatch({
            type: 'finish',
            stages,
            endAt: timeline.finishAt,
            now: Date.now(),
          });
        else dispatch({ type: 'start', stages });
      }
    });
    if (element) observer.observe(element);
    return () => observer.disconnect();
  }, [stages, timeline.finishAt]);
  useEffect(() => {
    const element = consoleRef.current;
    const parent = shell.current;
    const measure = () => {
      if (!element || !parent) return;
      const box = element.getBoundingClientRect();
      const origin = parent.getBoundingClientRect();
      setRoute({
        left: box.left - origin.left,
        right: box.right - origin.left,
        top: box.top - origin.top,
        bottom: box.bottom - origin.top,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (element) observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const transcript = getTerminalTranscript(stages, state, reducedMotion);
  useEffect(() => {
    if (!editorActive && terminal.current)
      terminal.current.scrollTo({
        top: terminal.current.scrollHeight,
        behavior: reducedMotion ? 'instant' : 'smooth',
      });
  }, [editorActive, transcript, reducedMotion]);
  const markerStyle: CSSProperties = route
    ? {
        offsetPath: `path('M ${route.left} ${route.bottom} L ${route.right} ${route.bottom}')`,
        offsetDistance: `${motion.progress * 100}%`,
        offsetRotate: '0deg',
        offsetAnchor: '50% 100%',
        transitionDuration: `${reducedMotion ? 0 : motion.duration}ms`,
      }
    : {
        top: 'auto',
        left: 'var(--walkthrough-rail)',
        bottom: 'var(--walkthrough-rail)',
        transform: 'translateX(-50%)',
      };
  return (
    <div
      ref={root}
      className="integration-walkthrough"
      data-phase={stage.id}
      data-playing={reducedMotion ? false : state.playing}
      data-editor-step={state.editor}
      data-edit-index={state.edit}
      data-frame={state.frame}
      data-edit-action={getEditorAction(stage, state)}
      data-vi-mode={editorActive ? getViMode(state.editor) : 'SHELL'}
      data-progress={motion.progress}
    >
      <div className="walkthrough-heading">
        <div>
          <h2>{copy.title}</h2>
          <p>{copy.description}</p>
        </div>
        <span className="walkthrough-caption">{copy.badge}</span>
      </div>
      <div ref={shell} className="walkthrough-route-shell">
        <div ref={consoleRef} className="walkthrough-console">
          <div className="walkthrough-terminal-inner">
            <div className="walkthrough-pane-toolbar">
              <span>
                <span
                  className="walkthrough-terminal-symbol"
                  aria-hidden="true"
                >
                  ›_
                </span>
                {copy.terminal}
              </span>
              <span className="walkthrough-file">{stage.file}</span>
            </div>
            <div className="walkthrough-stage-bar">
              <span>
                {String(state.phase + 1).padStart(2, '0')} /{' '}
                {String(stages.length).padStart(2, '0')}
              </span>
              <span>{copy.phases[state.phase]}</span>
            </div>
            <div className="walkthrough-terminal-code">
              {editorActive ? (
                <ViEditor
                  key={state.phase}
                  stage={stage}
                  state={state}
                  reducedMotion={reducedMotion}
                  chinese={chinese}
                  terminalRef={terminal}
                />
              ) : (
                <div
                  ref={terminal}
                  className="walkthrough-code walkthrough-shell-code"
                  role="textbox"
                  aria-readonly="true"
                  aria-multiline="true"
                  tabIndex={0}
                  aria-label={copy.terminal}
                >
                  <pre>
                    <TerminalCode source={transcript} language="shell" />
                  </pre>
                </div>
              )}
              <pre className="walkthrough-screen-reader">
                <code>{stage.source}</code>
              </pre>
            </div>
            <div className="walkthrough-console-footer">
              <ol className="walkthrough-journey" aria-label={copy.title}>
                {copy.groups.map((group, index) => (
                  <li
                    key={group}
                    aria-current={
                      (state.phase < 2 ? 0 : state.phase < 3 ? 1 : 2) === index
                        ? 'step'
                        : undefined
                    }
                  >
                    {group}
                  </li>
                ))}
              </ol>
              <span className="walkthrough-playground">Playground</span>
            </div>
          </div>
        </div>
        {motion.visible && pet === 'sunset' ? (
          <div
            className="walkthrough-prototype"
            style={markerStyle}
            data-progress={motion.progress}
            data-updated={updated}
            aria-hidden="true"
          >
            <div
              className="walkthrough-character"
              data-pose={motion.pose}
              style={
                {
                  '--sprite-x': `${(motion.column / 7) * 100}%`,
                  '--sprite-y': `${motion.row * 10}%`,
                  '--pet-play-state':
                    pageVisible && inView ? 'running' : 'paused',
                } as CSSProperties
              }
            >
              <IslandPrototype />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
