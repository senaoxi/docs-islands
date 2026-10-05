import type { getIntegrationWalkthroughSnippets } from './integration-walkthrough-content';
import type { EditorPart } from './integration-walkthrough-source';
import {
  getSunsetArrival,
  getSunsetMotion,
  jumpDuration,
  runDuration,
  thinkingDuration,
} from './sunset-motion';

export type EditorStep =
  | 'terminal'
  | 'command'
  | 'open'
  | 'normal'
  | 'insert'
  | 'save'
  | 'saved';
export interface TypingFrame {
  position: number;
  delay: number;
}
export interface EditorFrame extends TypingFrame {
  buffer: string;
  cursor: number;
  action: 'type' | 'pair' | 'newline' | 'open-line' | 'move' | 'pause';
}
export interface WalkthroughStage {
  id: string;
  file: string;
  source: string;
  output: string;
  parts?: EditorPart[];
  command: string;
  readMs: number;
  terminalPlan: TypingFrame[];
  commandPlan: TypingFrame[];
  editPlans: EditorFrame[][];
  keyPlans: TypingFrame[][];
}
export interface WalkthroughState {
  phase: number;
  editor: EditorStep;
  edit: number;
  frame: number;
  playing: boolean;
  clock: number;
  partial: number;
  reverseAt: number | null;
  logTimestamps: Record<string, number>;
}
export type WalkthroughAction =
  | {
      type: 'tick';
      stages: WalkthroughStage[];
      ms?: number;
      endAt?: number;
      direction?: 'left' | 'right';
      now?: number;
    }
  | { type: 'start'; stages: WalkthroughStage[] }
  | {
      type: 'finish';
      stages: WalkthroughStage[];
      endAt?: number;
      now?: number;
    };

// Reproducible short bursts within code tokens, with pauses between tokens,
// statements and lines. No random per-character timing or elapsed-time catch-up.
export function developerTyping(
  text: string,
  pace: 'code' | 'command' = 'code',
): TypingFrame[] {
  const frames: TypingFrame[] = [];
  const tokens =
    text.match(/[ \t]+|\n|[A-Za-z_$][\w$]*|[\p{L}\p{N}]+|./gu) ?? [];
  const widths = [2, 3, 1, 4, 2, 1];
  const delays = [65, 95, 70, 115, 80, 60];
  let position = 0;
  let burst = 0;
  for (const token of tokens) {
    let offset = 0;
    while (offset < token.length) {
      const width = widths[burst % widths.length]!;
      const take = Math.min(width, token.length - offset);
      offset += take;
      position += take;
      frames.push({ position, delay: delays[burst % delays.length]! });
      burst++;
    }
    if (token === '\n')
      frames.push({
        position,
        delay: pace === 'code' ? 260 + (burst % 3) * 90 : 100,
      });
    else if (/^[;{}]$/.test(token))
      frames.push({ position, delay: 170 + (burst % 2) * 90 });
    else if (/^[$A-Z_a-z]/.test(token))
      frames.push({ position, delay: 75 + (burst % 3) * 35 });
  }
  return frames.map((frame) => ({ ...frame, delay: frame.delay / 1.2 }));
}

// Find the end of an opening tag without treating arrows, comparisons or
// quoted attribute values as the tag boundary.
function getTagEnd(source: string, start: number): number {
  let quote = '';
  let expressionDepth = 0;
  for (let index = start; index < source.length; index++) {
    const character = source[index]!;
    if (quote) {
      if (character === quote && source[index - 1] !== '\\') quote = '';
      continue;
    }
    switch (character) {
      case "'":
      case '"':
      case '`': {
        quote = character;
        break;
      }
      case '{': {
        expressionDepth++;
        break;
      }
      case '}': {
        expressionDepth--;
        break;
      }
      default: {
        if (character === '>' && expressionDepth === 0) return index;
      }
    }
  }
  return -1;
}
function getOpeningTag(source: string, position: number) {
  const tag = /^<([A-Za-z][\w.:-]*)(?=[\s/>])|^<(?=>)/u.exec(
    source.slice(position),
  );
  if (!tag) return null;
  const end = getTagEnd(source, position + tag[0].length);
  if (end < 0) return null;
  return {
    end,
    closing: source[end - 1] === '/' ? '' : `</${tag[1] ?? ''}>`,
  };
}

// Model an assisted vi session: insert at the cursor, preserve surrounding
// contents, auto-pair delimiters and enter/indent inside the pair. Closing
// delimiters and generated indentation are traversed instead of duplicated.
export function developerEditing(source: string): EditorFrame[] {
  const frames: EditorFrame[] = [];
  const pairs = new Map([
    ['{', '}'],
    ['(', ')'],
    ['[', ']'],
  ]);
  const widths = [2, 3, 1, 4, 2, 1];
  const delays = [65, 95, 70, 115, 80, 60];
  let buffer = '';
  let cursor = 0;
  let position = 0;
  let burst = 0;
  let quote = '';
  const tagEndings = new Map<number, string>();
  const insert = (text: string) => {
    buffer = buffer.slice(0, cursor) + text + buffer.slice(cursor);
    cursor += text.length;
  };
  const emit = (delay: number, action: EditorFrame['action']) =>
    frames.push({ position, delay, buffer, cursor, action });
  const newLine = () => {
    const indentation = /^[ \t]*/u.exec(source.slice(position + 1))![0];
    const line = `\n${indentation}`;
    if (buffer.slice(cursor, cursor + line.length) === line)
      cursor += line.length;
    else if (/^(?:[}\])]|<\/)/u.test(buffer.slice(cursor))) {
      const currentLine = buffer.slice(0, cursor).split('\n').at(-1)!;
      const closingIndent = /^[ \t]*/u.exec(currentLine)![0];
      buffer = `${buffer.slice(0, cursor) + line}\n${
        closingIndent
      }${buffer.slice(cursor)}`;
      cursor += line.length;
    } else insert(line);
    position += line.length;
    emit(80, 'newline');
    emit(560 + (burst % 3) * 90, 'pause');
  };
  const insertQuote = (character: string) => {
    if (quote === character) {
      if (buffer[cursor] === character) cursor++;
      else insert(character);
      quote = '';
      position++;
      emit(160, 'move');
    } else if (quote === '') {
      insert(character + character);
      cursor--;
      quote = character;
      position++;
      emit(80, 'pair');
      emit(320, 'pause');
    } else {
      insert(character);
      position++;
      emit(80, 'type');
    }
  };
  const insertTag = (character: string) => {
    if (quote) return false;
    if (character === '<') {
      const existingTag = /^<\/(?:[A-Za-z][\w.:-]*)?\s*>/u.exec(
        source.slice(position),
      )?.[0];
      if (existingTag && buffer.startsWith(existingTag, cursor)) {
        cursor += existingTag.length;
        position += existingTag.length;
        emit(180, 'move');
        return true;
      }
      const tag = getOpeningTag(source, position);
      if (tag?.closing) tagEndings.set(tag.end, tag.closing);
    }
    const closingTag = tagEndings.get(position);
    if (closingTag) {
      insert(character + closingTag);
      cursor -= closingTag.length;
      tagEndings.delete(position);
      position++;
      emit(80, 'pair');
      emit(480, 'pause');
      burst++;
      return true;
    }
    return false;
  };
  // Open the insertion line before typing so the existing suffix stays on
  // its own line throughout the edit, including the very first character.
  if (source.endsWith('\n')) {
    insert('\n');
    cursor = 0;
    emit(80, 'open-line');
    emit(650, 'pause');
  }
  while (position < source.length) {
    const character = source[position]!;
    if (character === '\n') {
      newLine();
      continue;
    }
    if (
      (character === "'" || character === '"' || character === '`') &&
      source[position - 1] !== '\\'
    ) {
      insertQuote(character);
      continue;
    }
    if (insertTag(character)) continue;
    const closing = !quote && pairs.get(character);
    if (closing) {
      insert(character + closing);
      cursor--;
      position++;
      emit(80, 'pair');
      emit(390 + (burst % 2) * 90, 'pause');
      burst++;
      continue;
    }
    if (!quote && /^[}\])]/u.test(character) && buffer[cursor] === character) {
      cursor++;
      position++;
      emit(180, 'move');
      continue;
    }
    const token = /^(?:[A-Za-z_$][\w$]*|[\p{L}\p{N}]+)/u.exec(
      source.slice(position),
    )?.[0];
    if (token) {
      let offset = 0;
      while (offset < token.length) {
        const take = Math.min(
          widths[burst % widths.length]!,
          token.length - offset,
        );
        insert(token.slice(offset, offset + take));
        offset += take;
        position += take;
        emit(delays[burst % delays.length]!, 'type');
        burst++;
      }
      emit(100 + (burst % 3) * 40, 'pause');
      continue;
    }
    const spaces = /^[ \t]+/u.exec(source.slice(position))?.[0];
    const text = spaces ?? character;
    insert(text);
    position += text.length;
    emit(character === ';' ? 280 : 80, 'type');
  }
  return frames.map((frame) => ({ ...frame, delay: frame.delay / 1.2 }));
}
const logTyping = (text: string): TypingFrame[] => {
  let position = 0;
  return text.split('\n').map((line) => {
    position = Math.min(text.length, position + line.length + 1);
    return { position, delay: 350 };
  });
};
const editorChanges = (stage: WalkthroughStage) =>
  stage.parts?.filter(
    (part): part is Exclude<EditorPart, string> => typeof part !== 'string',
  ) ?? [];
const makeStage = (
  id: string,
  file: string,
  source: string,
  output: string,
  parts?: EditorPart[],
  readMs = 0,
): WalkthroughStage => {
  const changes =
    parts?.filter(
      (part): part is Exclude<EditorPart, string> => typeof part !== 'string',
    ) ?? [];
  const command = `$ vi ${file}`;
  return {
    id,
    file,
    source,
    output,
    parts,
    readMs,
    command,
    terminalPlan: logTyping(output),
    commandPlan: developerTyping(command, 'command'),
    editPlans: changes.map((change) => developerEditing(change.after)),
    keyPlans: changes.map((change) => developerTyping(change.keys, 'command')),
  };
};
export function getWalkthroughStages(
  snippets: ReturnType<typeof getIntegrationWalkthroughSnippets>,
): WalkthroughStage[] {
  return [
    makeStage(
      'page',
      snippets.page.file,
      snippets.page.code,
      '',
      snippets.page.parts,
      1800,
    ),
    makeStage(
      'render',
      'dev server',
      snippets.logs.markdown,
      snippets.logs.markdown,
    ),
    makeStage(
      'css',
      snippets.updatedStyles.file,
      snippets.updatedStyles.code,
      '',
      snippets.updatedStyles.parts,
      1000,
    ),
    makeStage('hmr', 'dev server', snippets.logs.hmr, snippets.logs.hmr),
    makeStage('updated', 'dev server', snippets.logs.hmr, snippets.logs.hmr),
  ];
}
const emptyPlan: TypingFrame[] = [];
const savePlan: TypingFrame[] = [
  { position: 0, delay: 550 },
  { position: 1, delay: 150 },
  { position: 2, delay: 180 },
  { position: 3, delay: 220 },
].map((frame) => ({ ...frame, delay: frame.delay / 1.2 }));
export function getPlaybackPlan(
  stage: WalkthroughStage,
  editor: EditorStep,
  edit: number,
): TypingFrame[] {
  switch (editor) {
    case 'command': {
      return stage.commandPlan;
    }
    case 'normal': {
      return stage.keyPlans[edit] ?? emptyPlan;
    }
    case 'insert': {
      return stage.editPlans[edit] ?? emptyPlan;
    }
    case 'save': {
      return savePlan;
    }
    case 'terminal': {
      return stage.terminalPlan;
    }
    default: {
      return emptyPlan;
    }
  }
}
export function getHoldDuration(
  stage: WalkthroughStage,
  editor: EditorStep,
): number {
  if (stage.id === 'updated') return 0;
  switch (editor) {
    case 'open': {
      return stage.readMs;
    }
    case 'normal': {
      return 650;
    }
    case 'save': {
      return 750;
    }
    case 'saved': {
      return 900;
    }
    case 'insert': {
      return 450;
    }
    default: {
      return 450;
    }
  }
}
export function initialWalkthroughState(): WalkthroughState {
  return {
    phase: 0,
    editor: 'command',
    edit: 0,
    frame: 0,
    playing: false,
    clock: 0,
    partial: 0,
    reverseAt: null,
    logTimestamps: {},
  };
}
function enterPhase(
  state: WalkthroughState,
  stages: WalkthroughStage[],
): WalkthroughState {
  const phase = Math.min(state.phase + 1, stages.length - 1);
  const stage = stages[phase]!;
  const editor = stage.parts ? 'command' : 'terminal';
  const last = phase === stages.length - 1;
  return {
    ...state,
    phase,
    editor,
    edit: 0,
    frame: last ? getPlaybackPlan(stage, editor, 0).length : 0,
    playing: true,
  };
}
function advanceWalkthrough(
  state: WalkthroughState,
  stages: WalkthroughStage[],
): WalkthroughState {
  const stage = stages[state.phase]!;
  let editor: EditorStep;
  let edit = state.edit;
  switch (state.editor) {
    case 'command': {
      editor = 'open';
      break;
    }
    case 'open': {
      editor = 'normal';
      break;
    }
    case 'normal': {
      editor = 'insert';
      break;
    }
    case 'insert': {
      if (edit < stage.editPlans.length - 1) {
        editor = 'normal';
        edit++;
      } else editor = 'save';
      break;
    }
    case 'save': {
      editor = 'saved';
      break;
    }
    default: {
      return enterPhase(state, stages);
    }
  }
  return { ...state, editor, edit, frame: 0 };
}
function tickWalkthrough(
  state: WalkthroughState,
  action: Extract<WalkthroughAction, { type: 'tick' }>,
): WalkthroughState {
  if (!state.playing) return state;
  if (state.phase === action.stages.length - 1) {
    const end = action.endAt ?? state.clock;
    const clock = Math.min(end, state.clock + (action.ms ?? end - state.clock));
    return { ...state, clock, playing: clock < end, partial: 0 };
  }
  const stage = action.stages[state.phase]!;
  const plan = getPlaybackPlan(stage, state.editor, state.edit);
  const delay =
    plan[state.frame]?.delay ?? getHoldDuration(stage, state.editor);
  const ms = Math.min(
    action.ms ?? delay - state.partial,
    delay - state.partial,
  );
  const clock = state.clock + ms;
  const partial = state.partial + ms;
  if (partial < delay) return { ...state, clock, partial };
  const next =
    state.frame < plan.length
      ? { ...state, frame: state.frame + 1 }
      : advanceWalkthrough(state, action.stages);
  return { ...next, clock, partial: 0 };
}
// Read wall time in the browser callback, outside the pure reducer. Stamp a
// log only when it becomes visible and retain it across later playback ticks.
function captureLogTimestamps(
  state: WalkthroughState,
  stages: WalkthroughStage[],
  now?: number,
): WalkthroughState {
  if (now === undefined) return state;
  let logTimestamps = state.logTimestamps;
  for (const [phase, stage] of stages.entries()) {
    if (
      !stage.parts &&
      stage.output &&
      stage.id !== 'updated' &&
      (phase < state.phase || (phase === state.phase && state.frame > 0)) &&
      logTimestamps[stage.id] === undefined
    )
      logTimestamps = { ...logTimestamps, [stage.id]: now };
  }
  return logTimestamps === state.logTimestamps
    ? state
    : { ...state, logTimestamps };
}
export function walkthroughReducer(
  state: WalkthroughState,
  action: WalkthroughAction,
): WalkthroughState {
  switch (action.type) {
    case 'tick': {
      const next =
        action.direction === 'left' && state.reverseAt === null
          ? { ...state, reverseAt: state.clock }
          : state;
      return captureLogTimestamps(
        tickWalkthrough(next, action),
        action.stages,
        action.now,
      );
    }
    case 'start': {
      return state.phase === action.stages.length - 1
        ? state
        : { ...state, playing: true };
    }
    case 'finish': {
      return captureLogTimestamps(
        {
          phase: action.stages.length - 1,
          editor: 'terminal',
          edit: 0,
          frame: action.stages.at(-1)!.terminalPlan.length,
          playing: false,
          clock: action.endAt ?? state.clock,
          partial: 0,
          reverseAt: state.reverseAt,
          logTimestamps: state.logTimestamps,
        },
        action.stages,
        action.now,
      );
    }
    default: {
      return state;
    }
  }
}
function getEditorFrame(
  stage: WalkthroughStage,
  state: WalkthroughState,
  reduced = false,
) {
  const active = stage.editPlans[state.edit];
  const index = reduced && active ? active.length - 1 : state.frame - 1;
  return (
    active?.[index] ??
    (active?.[0]?.action === 'open-line' ? active[0] : undefined)
  );
}
export function getEditorBuffer(
  stage: WalkthroughStage,
  state: WalkthroughState,
  reduced: boolean,
): string {
  const frame = getEditorFrame(stage, state, reduced);
  let edit = -1;
  return (
    stage.parts
      ?.map((part) => {
        if (typeof part === 'string') return part;
        edit++;
        if (state.editor === 'open' || state.editor === 'command')
          return part.before;
        if (
          state.editor === 'save' ||
          state.editor === 'saved' ||
          edit < state.edit
        )
          return part.after;
        if (edit > state.edit || state.editor === 'normal') return part.before;
        return frame?.buffer ?? '';
      })
      .join('') ?? stage.source
  );
}
export function getVisibleText(
  stage: WalkthroughStage,
  state: WalkthroughState,
  reduced: boolean,
): string {
  if (state.editor === 'command') {
    const position = reduced
      ? stage.command.length
      : (stage.commandPlan[state.frame - 1]?.position ?? 0);
    return stage.command.slice(0, position);
  }
  const position = reduced
    ? stage.output.length
    : (stage.terminalPlan[state.frame - 1]?.position ?? 0);
  return stage.output.slice(0, position);
}
// vi uses an alternate buffer; leaving it restores the accumulated shell
// transcript. Keep commands and recorded dev-server output exactly once.
export function getTerminalTranscript(
  stages: WalkthroughStage[],
  state: WalkthroughState,
  reduced: boolean,
): string {
  const saved = (stage: WalkthroughStage) => stage.command;
  const log = (stage: WalkthroughStage, text = stage.output) => {
    const timestamp = state.logTimestamps[stage.id];
    if (!text || timestamp === undefined) return text;
    return `${new Date(timestamp).toLocaleTimeString('en-US')} ${text}`;
  };
  const history = stages
    .slice(0, state.phase)
    .map((stage) => (stage.parts ? saved(stage) : log(stage)));
  const stage = stages[state.phase]!;
  if (stage.id !== 'updated')
    history.push(
      state.editor === 'saved'
        ? saved(stage)
        : stage.parts
          ? getVisibleText(stage, state, reduced)
          : log(stage, getVisibleText(stage, state, reduced)),
    );
  if (state.editor === 'saved' || stage.id === 'updated') history.push('$');
  return history.filter(Boolean).join('\n\n');
}

export function getActiveChange(stage: WalkthroughStage, edit: number) {
  return editorChanges(stage)[edit];
}
export function getEditorAction(
  stage: WalkthroughStage,
  state: WalkthroughState,
) {
  return state.editor === 'insert'
    ? getEditorFrame(stage, state)?.action
    : undefined;
}
export function getViMode(editor: EditorStep) {
  return editor === 'insert' ? '-- INSERT --' : 'NORMAL';
}
export function getViCommand(
  stage: WalkthroughStage,
  state: WalkthroughState,
  reduced: boolean,
): string {
  const text =
    state.editor === 'save'
      ? ':wq'
      : (getActiveChange(stage, state.edit)?.keys ?? '');
  const plan = getPlaybackPlan(stage, state.editor, state.edit);
  const length = reduced ? text.length : (plan[state.frame - 1]?.position ?? 0);
  return text.slice(0, length);
}

export function getEditorCursor(
  stage: WalkthroughStage,
  state: WalkthroughState,
  reduced: boolean,
) {
  if (state.editor === 'open' || state.editor === 'command')
    return { line: 1, column: 0 };
  const frame = getEditorFrame(stage, state, reduced);
  let edit = -1;
  let text = '';
  for (const part of stage.parts ?? []) {
    if (typeof part === 'string') {
      text += part;
      continue;
    }
    edit++;
    if (edit < state.edit) {
      text += part.after;
      continue;
    }
    if (edit === state.edit) {
      if (state.editor === 'insert')
        text += (frame?.buffer ?? '').slice(0, frame?.cursor ?? 0);
      else if (state.editor === 'save' || state.editor === 'saved')
        text += part.after;
      break;
    }
  }
  const lines = text.split('\n');
  const tail = [...(lines.at(-1) ?? '')];
  const characters =
    state.editor === 'save' || state.editor === 'saved'
      ? tail.slice(0, -1)
      : tail;
  const column = characters.reduce(
    (width, character) => width + (/[\u3400-\u9FFF]/.test(character) ? 2 : 1),
    0,
  );
  return { line: lines.length, column };
}
export interface WalkthroughClockEntry {
  elapsed: number;
  delay: number;
}
const stateKey = (state: WalkthroughState) =>
  `${state.phase}/${state.editor}/${state.edit}/${state.frame}/${state.playing}`;
export function getWalkthroughTimeline(stages: WalkthroughStage[]) {
  const entries = new Map<string, WalkthroughClockEntry>();
  let state = { ...initialWalkthroughState(), playing: true };
  let appearance = 0;
  let styleAt = 0;
  for (let index = 0; index < 10_000; index++) {
    const stage = stages[state.phase]!;
    if (stage.id === 'page' && state.editor === 'saved')
      appearance = state.clock;
    if (stage.id === 'hmr' && state.frame === 1) styleAt = state.clock;
    const delay =
      getPlaybackPlan(stage, state.editor, state.edit)[state.frame]?.delay ??
      getHoldDuration(stage, state.editor);
    entries.set(stateKey(state), { elapsed: state.clock, delay });
    if (!state.playing) break;
    state = walkthroughReducer(state, { type: 'tick', stages });
  }
  const motionDuration =
    Math.ceil(
      Math.max(12_000, (styleAt - appearance - jumpDuration) * 1.5) /
        runDuration,
    ) * runDuration;
  const arrival =
    appearance + getSunsetArrival(motionDuration, styleAt - appearance + 80);
  return {
    entries,
    appearance,
    styleAt,
    motionDuration,
    arrival,
    finishAt: arrival + thinkingDuration,
    duration: arrival + thinkingDuration,
    finalPhase: stages.length - 1,
  };
}
export function getPrototypeMotion(
  state: WalkthroughState,
  timeline: ReturnType<typeof getWalkthroughTimeline>,
  reduced = false,
) {
  const reverseAfter =
    state.reverseAt === null
      ? undefined
      : state.reverseAt - timeline.appearance;
  const arrival =
    timeline.appearance +
    getSunsetArrival(timeline.motionDuration, reverseAfter);
  const finishAt = arrival + thinkingDuration;
  const entry = timeline.entries.get(stateKey(state));
  const final = state.phase === timeline.finalPhase;
  const remaining = final
    ? finishAt - state.clock
    : (entry?.delay ?? 0) - state.partial;
  const elapsed = Math.max(0, state.clock - timeline.appearance);
  const character = getSunsetMotion(
    elapsed,
    timeline.motionDuration,
    reverseAfter,
  );
  return {
    ...character,
    ...(reduced
      ? { progress: 0, row: 8, column: 5, pose: 'thinking-rest' }
      : {}),
    visible:
      reduced ||
      final ||
      (state.clock >= timeline.appearance && timeline.appearance > 0),
    elapsed,
    finishAt,
    duration: state.playing ? Math.min(80, Math.max(0, remaining)) : 0,
  };
}
export function getPlaybackDuration(stages: WalkthroughStage[]) {
  const timeline = getWalkthroughTimeline(stages);
  return {
    durationMs: timeline.duration,
    appearanceMs: timeline.appearance,
    styleAtMs: timeline.styleAt,
    arrivalMs: timeline.arrival,
  };
}
