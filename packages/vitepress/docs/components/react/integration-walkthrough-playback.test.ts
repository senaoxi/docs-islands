import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getIntegrationWalkthroughSnippets } from './integration-walkthrough-content';
import {
  getEditorBuffer,
  getEditorCursor,
  getPrototypeMotion,
  getViCommand,
  getViMode,
  getWalkthroughStages,
  getWalkthroughTimeline,
  initialWalkthroughState,
  walkthroughReducer,
  type WalkthroughStage,
  type WalkthroughState,
} from './integration-walkthrough-playback';
import { getIntegrationSnippets } from './integration-walkthrough-source';

const normalState = (frame: number): WalkthroughState => ({
  ...initialWalkthroughState(),
  editor: 'normal',
  playing: true,
  frame,
});
function stateAt(stage: WalkthroughStage, command: string, edit = 0) {
  const index = stage.keyPlans[edit]!.findLastIndex(
    (frame) => frame.command === command,
  );
  assert.notEqual(index, -1, `Missing navigation command: ${command}`);
  return { ...normalState(index + 1), edit };
}

for (const locale of ['en', 'zh'] as const) {
  const stages = getWalkthroughStages(
    getIntegrationWalkthroughSnippets(locale),
  );
  const page = stages[0]!;
  const css = stages[2]!;
  const query = '/IntegrationWalkthrough spa:sync-render client:load';

  test(`${locale}: completed buffers match the actual homepage and stylesheet`, () => {
    const snippets = getIntegrationWalkthroughSnippets(locale);
    assert.equal(
      snippets.page.code,
      readFileSync(
        new URL(`../../${locale}/index.md`, import.meta.url),
        'utf8',
      ),
    );
    assert.equal(
      snippets.updatedStyles.code,
      readFileSync(
        new URL('IslandPrototype.module.css', import.meta.url),
        'utf8',
      ),
    );
  });

  test(`${locale}: pending searches keep the buffer intact and the cursor at its origin`, () => {
    for (const stage of [page, css]) {
      const before = getEditorBuffer(stage, normalState(0), false);
      const plan = stage.keyPlans[0]!;
      for (let frame = 0; frame <= plan.length; frame++) {
        const state = normalState(frame);
        const command = getViCommand(stage, state, false);
        if (command.includes('↵')) break;
        assert.deepEqual(getEditorCursor(stage, state, false), {
          line: 1,
          column: 0,
        });
        assert.equal(getEditorBuffer(stage, state, false), before);
        assert.equal(getViMode(stage, state), frame ? 'SEARCH' : 'NORMAL');
      }
    }
  });

  test(`${locale}: Enter, f>, and 2h move only when each command is complete`, () => {
    for (const [keys, column] of [
      [`${query} ↵`, 5],
      [`${query} ↵ f`, 5],
      [`${query} ↵ f>`, 69],
      [`${query} ↵ f> 2`, 69],
      [`${query} ↵ f> 2h`, 67],
    ] as const) {
      const state = stateAt(page, keys);
      assert.deepEqual(getEditorCursor(page, state, false), {
        line: 20,
        column,
      });
      assert.equal(getViMode(page, state), 'NORMAL');
    }
    const beforeInsert = stateAt(page, `${query} ↵ f> 2h`);
    const insert = walkthroughReducer(beforeInsert, {
      type: 'tick',
      stages,
    });
    assert.equal(insert.editor, 'insert');
    assert.equal(insert.frame, 0);
    assert.equal(getViMode(page, insert), '-- INSERT --');
    assert.deepEqual(getEditorCursor(page, insert, false), {
      line: 20,
      column: 67,
    });
  });

  test(`${locale}: cgn leaves the match untouched until n enters Insert mode`, () => {
    for (const keys of ['/right ↵', '/right ↵ c', '/right ↵ cg']) {
      const state = { ...stateAt(css, keys), phase: 2 };
      assert.match(getEditorBuffer(css, state, false), /direction: right;/);
      assert.equal(getViMode(css, state), 'NORMAL');
    }
    const pending = { ...stateAt(css, '/right ↵ cg'), phase: 2 };
    const insert = walkthroughReducer(pending, { type: 'tick', stages });
    assert.equal(insert.editor, 'insert');
    assert.match(getEditorBuffer(css, insert, false), /direction: ;/);
    assert.deepEqual(
      getEditorCursor(css, insert, false),
      getEditorCursor(css, pending, false),
    );
  });

  test(`${locale}: short clock slices and pauses cannot commit Enter early`, () => {
    const state = stateAt(page, query);
    const delay = page.keyPlans[0]![state.frame]!.delay;
    const partial = walkthroughReducer(state, {
      type: 'tick',
      stages,
      ms: delay - 1,
    });
    assert.equal(partial.frame, state.frame);
    assert.equal(getViMode(page, partial), 'SEARCH');
    assert.deepEqual(getEditorCursor(page, partial, false), {
      line: 1,
      column: 0,
    });
    const paused = { ...partial, playing: false };
    assert.equal(
      walkthroughReducer(paused, { type: 'tick', stages, ms: 10_000 }),
      paused,
    );
    const committed = walkthroughReducer(partial, {
      type: 'tick',
      stages,
      ms: 1,
    });
    assert.equal(getViMode(page, committed), 'NORMAL');
    assert.deepEqual(getEditorCursor(page, committed, false), {
      line: 20,
      column: 5,
    });
  });

  test(`${locale}: complete playback retains the final buffers and finishes`, () => {
    const timeline = getWalkthroughTimeline(stages);
    let state = walkthroughReducer(initialWalkthroughState(), {
      type: 'start',
      stages,
    });
    let ticks = 0;
    const saved = new Set<string>();
    while (state.playing && ticks++ < 20_000) {
      const stage = stages[state.phase]!;
      if (state.editor === 'save') {
        assert.equal(getEditorBuffer(stage, state, false), stage.source);
        assert.equal(
          getViMode(stage, state),
          state.frame >= 2 ? 'COMMAND' : 'NORMAL',
        );
        saved.add(stage.id);
      }
      const motion = getPrototypeMotion(state, timeline);
      state = walkthroughReducer(state, {
        type: 'tick',
        stages,
        ms: motion.duration,
        endAt: motion.finishAt,
        direction:
          stage.id === 'updated' || (stage.id === 'hmr' && state.frame > 0)
            ? 'left'
            : 'right',
      });
    }
    assert.ok(ticks < 20_000);
    assert.deepEqual([...saved], ['page', 'css']);
    assert.equal(state.phase, stages.length - 1);
    assert.equal(getPrototypeMotion(state, timeline).progress, 0);
  });

  test(`${locale}: setup reference navigation preserves pending counts and previous edits`, () => {
    const references = getIntegrationSnippets(locale);
    for (const snippet of [
      references.config,
      references.theme,
      references.component,
      references.markdown,
      references.updatedComponent,
    ]) {
      const referenceStages = getWalkthroughStages({
        ...getIntegrationWalkthroughSnippets(locale),
        page: snippet,
      });
      const stage = referenceStages[0]!;
      for (const [edit, plan] of stage.keyPlans.entries()) {
        const before = { ...normalState(0), edit };
        const pending = plan[0]!;
        if (/^\d+$/u.test(pending.command))
          assert.deepEqual(
            getEditorCursor(stage, { ...before, frame: 1 }, false),
            getEditorCursor(stage, before, false),
          );
        const ready = { ...before, frame: plan.length - 1 };
        const insert = walkthroughReducer(ready, {
          type: 'tick',
          stages: referenceStages,
        });
        assert.equal(insert.editor, 'insert');
        assert.equal(getViMode(stage, insert), '-- INSERT --');
      }
    }
    const config = getWalkthroughStages({
      ...getIntegrationWalkthroughSnippets(locale),
      page: references.config,
    })[0]!;
    const origin = { ...normalState(0), edit: 1 };
    assert.deepEqual(getEditorCursor(config, origin, false), {
      line: 4,
      column: 0,
    });
    assert.match(
      getEditorBuffer(config, origin, false),
      /import \{ react \} from '@docs-islands\/vitepress\/adapters\/react';/u,
    );
    assert.notDeepEqual(
      getEditorCursor(config, stateAt(config, 'G', 1), false),
      getEditorCursor(config, origin, false),
    );
  });

  test(`${locale}: ct< preserves the heading until its character completes the change`, () => {
    const reference = getIntegrationSnippets(locale);
    const referenceStages = getWalkthroughStages({
      ...getIntegrationWalkthroughSnippets(locale),
      page: reference.updatedComponent,
    });
    const stage = referenceStages[0]!;
    for (const command of ['8G f> l c', '8G f> l ct']) {
      const pending = stateAt(stage, command);
      assert.ok(
        getEditorBuffer(stage, pending, false).includes(reference.title),
      );
      assert.deepEqual(getEditorCursor(stage, pending, false), {
        line: 8,
        column: 10,
      });
      assert.equal(getViMode(stage, pending), 'NORMAL');
    }
    const insert = walkthroughReducer(stateAt(stage, '8G f> l ct'), {
      type: 'tick',
      stages: referenceStages,
    });
    assert.equal(insert.editor, 'insert');
    assert.match(getEditorBuffer(stage, insert, false), /<h2><\/h2>/u);
  });
}

test('invalid navigation fails instead of jumping to the declared edit boundary', () => {
  for (const navigation of [
    [{ type: 'search', pattern: '__NO_MATCH__' }, { type: 'insert' }],
    [
      {
        type: 'search',
        pattern: 'IntegrationWalkthrough spa:sync-render client:load',
      },
      { type: 'find', character: '!' },
      { type: 'insert' },
    ],
    [
      {
        type: 'search',
        pattern: 'IntegrationWalkthrough spa:sync-render client:load',
      },
      { type: 'insert' },
    ],
  ] as const) {
    const snippets = getIntegrationWalkthroughSnippets('en');
    const change = snippets.page.parts.find(
      (part) => typeof part !== 'string',
    )!;
    change.navigation = [...navigation];
    assert.throws(() => getWalkthroughStages(snippets), /vi/);
  }
});
