import {
  type EditorPart,
  type getIntegrationSnippets,
  integrationHmrLog,
  integrationRenderLog,
} from './landing-demo-source';

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
export interface DemoStage {
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
export interface DemoState {
  phase: number;
  editor: EditorStep;
  edit: number;
  frame: number;
  playing: boolean;
  generation: number;
  interaction: boolean;
}
export type DemoAction =
  | { type: 'tick'; stages: DemoStage[] }
  | { type: 'start'; stages: DemoStage[] }
  | { type: 'next'; stages: DemoStage[] }
  | { type: 'pause'; interaction?: boolean }
  | { type: 'reduce'; frame: number }
  | { type: 'restart'; state: DemoState };

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
  return frames;
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
    else if (/^[}\])]/u.test(buffer.slice(cursor))) {
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
  return frames;
}
const logTyping = (text: string): TypingFrame[] => {
  let position = 0;
  return text.split('\n').map((line) => {
    position = Math.min(text.length, position + line.length + 1);
    return { position, delay: 350 };
  });
};
const editorChanges = (stage: DemoStage) =>
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
): DemoStage => {
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
export function getDemoStages(
  snippets: ReturnType<typeof getIntegrationSnippets>,
): DemoStage[] {
  return [
    makeStage('initial', 'index.md', '# Hello, world!', '# Hello, world!'),
    makeStage(
      'config',
      snippets.config.file,
      snippets.config.code,
      '',
      snippets.config.parts,
      2400,
    ),
    makeStage(
      'client',
      snippets.theme.file,
      snippets.theme.code,
      '',
      snippets.theme.parts,
      2100,
    ),
    makeStage(
      'component',
      snippets.component.file,
      snippets.component.code,
      '',
      snippets.component.parts,
      1000,
    ),
    makeStage(
      'markdown',
      snippets.markdown.file,
      snippets.markdown.code,
      '',
      snippets.markdown.parts,
      1800,
    ),
    makeStage('mount', 'console', integrationRenderLog, integrationRenderLog),
    makeStage('live', 'index.md', integrationRenderLog, integrationRenderLog),
    makeStage(
      'edit',
      snippets.updatedComponent.file,
      snippets.updatedComponent.code,
      '',
      snippets.updatedComponent.parts,
      2200,
    ),
    makeStage(
      'hmr',
      'console + dev events',
      integrationHmrLog,
      integrationHmrLog,
    ),
    makeStage(
      'updated',
      'console + dev events',
      integrationHmrLog,
      integrationHmrLog,
    ),
  ];
}
const emptyPlan: TypingFrame[] = [];
const savePlan: TypingFrame[] = [
  { position: 0, delay: 550 },
  { position: 1, delay: 150 },
  { position: 2, delay: 180 },
  { position: 3, delay: 220 },
];
export function getPlaybackPlan(
  stage: DemoStage,
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
export function getHoldDuration(stage: DemoStage, editor: EditorStep): number {
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
export function initialDemoState(
  stages: DemoStage[],
  generation = 0,
): DemoState {
  return {
    phase: 0,
    editor: 'terminal',
    edit: 0,
    frame: stages[0]!.terminalPlan.length,
    playing: false,
    generation,
    interaction: false,
  };
}
const enterPhase = (
  state: DemoState,
  stages: DemoStage[],
  animate: boolean,
): DemoState => {
  const phase = Math.min(state.phase + 1, stages.length - 1);
  const stage = stages[phase]!;
  const editor = stage.parts ? 'command' : 'terminal';
  const hold = phase === 6 || phase === 9;
  return {
    ...state,
    phase,
    editor,
    edit: 0,
    frame: animate && !hold ? 0 : getPlaybackPlan(stage, editor, 0).length,
    playing: animate && !hold,
    interaction: false,
  };
};
export function advanceDemo(
  state: DemoState,
  stages: DemoStage[],
  animate: boolean,
): DemoState {
  const stage = stages[state.phase]!;
  const plan = getPlaybackPlan(stage, state.editor, state.edit);
  if (!animate && state.frame < plan.length)
    return { ...state, frame: plan.length, playing: false };
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
      return enterPhase(state, stages, animate);
    }
  }
  return {
    ...state,
    editor,
    edit,
    frame: animate ? 0 : getPlaybackPlan(stage, editor, edit).length,
    playing: animate,
    interaction: false,
  };
}
export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case 'tick': {
      if (!state.playing) return state;
      const stage = action.stages[state.phase]!;
      const plan = getPlaybackPlan(stage, state.editor, state.edit);
      return state.frame < plan.length
        ? { ...state, frame: state.frame + 1 }
        : advanceDemo(state, action.stages, true);
    }
    case 'start': {
      return state.phase === 0 || state.phase === 6
        ? advanceDemo(state, action.stages, true)
        : { ...state, playing: true, interaction: false };
    }
    case 'next': {
      return advanceDemo(state, action.stages, false);
    }
    case 'pause': {
      return {
        ...state,
        playing: false,
        interaction: action.interaction ?? false,
      };
    }
    case 'reduce': {
      return { ...state, playing: false, frame: action.frame };
    }
    case 'restart': {
      return action.state;
    }
    default: {
      return state;
    }
  }
}
function getEditorFrame(stage: DemoStage, state: DemoState, reduced = false) {
  const active = stage.editPlans[state.edit];
  const index = reduced && active ? active.length - 1 : state.frame - 1;
  return (
    active?.[index] ??
    (active?.[0]?.action === 'open-line' ? active[0] : undefined)
  );
}
export function getEditorBuffer(
  stage: DemoStage,
  state: DemoState,
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
  stage: DemoStage,
  state: DemoState,
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
export function getActiveChange(stage: DemoStage, edit: number) {
  return editorChanges(stage)[edit];
}
export function getEditorAction(stage: DemoStage, state: DemoState) {
  return state.editor === 'insert'
    ? getEditorFrame(stage, state)?.action
    : undefined;
}
export function getViMode(editor: EditorStep) {
  return editor === 'insert' ? '-- INSERT --' : 'NORMAL';
}
export function getViCommand(
  stage: DemoStage,
  state: DemoState,
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
  stage: DemoStage,
  state: DemoState,
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
export function getPlaybackDuration(stages: DemoStage[]) {
  const phaseDurations = stages.map((stage) => {
    if (!stage.parts)
      return (
        stage.terminalPlan.reduce((sum, frame) => sum + frame.delay, 0) + 450
      );
    const commands = stage.commandPlan.reduce(
      (sum, frame) => sum + frame.delay,
      0,
    );
    const edits = stage.editPlans.reduce(
      (sum, plan, index) =>
        sum +
        plan.reduce((total, frame) => total + frame.delay, 0) +
        stage.keyPlans[index]!.reduce(
          (total, frame) => total + frame.delay,
          0,
        ) +
        650 +
        450,
      0,
    );
    return commands + 450 + stage.readMs + edits + 1100 + 750 + 900;
  });
  return {
    phaseDurations,
    toFirstInteractionMs: phaseDurations
      .slice(1, 6)
      .reduce((sum, time) => sum + time, 0),
    copyUpdateMs: phaseDurations
      .slice(7, 9)
      .reduce((sum, time) => sum + time, 0),
  };
}
