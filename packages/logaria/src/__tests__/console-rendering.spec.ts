import { describe, expect, it } from 'vitest';
import { BROWSER_STYLES } from '../constants/console';
import {
  createConsoleMessageSegments,
  formatBrowserMessageSegments,
  formatNodeMessageSegments,
} from '../core/console';

const fakeColors = {
  blueBright: (message: string): string =>
    `<blueBright>${message}</blueBright>`,
  bold: (message: string): string => `<bold>${message}</bold>`,
  cyan: (message: string): string => `<cyan>${message}</cyan>`,
  dim: (message: string): string => `<dim>${message}</dim>`,
  gray: (message: string): string => `<gray>${message}</gray>`,
  green: (message: string): string => `<green>${message}</green>`,
  red: (message: string): string => `<red>${message}</red>`,
  yellow: (message: string): string => `<yellow>${message}</yellow>`,
};

describe('console message rendering', () => {
  it('keeps single-line errors fully red', () => {
    expect(
      formatNodeMessageSegments(
        createConsoleMessageSegments('error', 'build failed'),
        fakeColors,
      ),
    ).toBe('<red>build failed</red>');
  });

  it('uses semantic colors for multi-line error reports', () => {
    const message = [
      'Source files are not covered by typecheck proof:',
      '  - packages/pkg/src/internal.ts',
      '  reason: every file must be covered.',
      '  suggested fixes: add a checker entry.',
      '  package manifest: packages/pkg/package.json',
      '  files: packages/pkg/src/internal.ts',
      '  limina check --verbose',
      '│ package manifest: packages/pkg/package.json │',
      '│   limina check --verbose                  │',
    ].join('\n');
    const output = formatNodeMessageSegments(
      createConsoleMessageSegments('error', message),
      fakeColors,
    );

    expect(output).toBe(
      [
        '<bold><red>Source files are not covered by typecheck proof:</red></bold>',
        '<gray>  - </gray><blueBright>packages/pkg/src/internal.ts</blueBright>',
        '<gray>  </gray><yellow>reason:</yellow><gray> every file must be covered.</gray>',
        '<gray>  </gray><green>suggested fixes:</green><gray> add a checker entry.</gray>',
        '<gray>  </gray><cyan>package manifest:</cyan><gray> </gray><blueBright>packages/pkg/package.json</blueBright>',
        '<gray>  </gray><cyan>files:</cyan><gray> </gray><blueBright>packages/pkg/src/internal.ts</blueBright>',
        '<gray>  </gray><cyan>limina check --verbose</cyan>',
        '<gray>│ </gray><cyan>package manifest:</cyan><gray> </gray><blueBright>packages/pkg/package.json</blueBright><gray> │</gray>',
        '<gray>│   </gray><cyan>limina check --verbose</cyan><gray>                  │</gray>',
      ].join('\n'),
    );
    expect(output).not.toContain('<red>  reason:');
    expect(output).not.toContain('<red>  - packages/pkg/src/internal.ts');
  });

  it('uses source-check-style semantic colors for shared check detail labels', () => {
    const message = [
      'Package check failed:',
      '  details: package output is invalid.',
      '  items: packages/pkg/dist/index.js',
      '  dependencies: @example/shared',
      '  imports: @example/shared',
      '  targets: .limina/tsconfig/checkers/typescript/tsconfig.build.json',
    ].join('\n');
    const output = formatNodeMessageSegments(
      createConsoleMessageSegments('error', message),
      fakeColors,
    );

    expect(output).toBe(
      [
        '<bold><red>Package check failed:</red></bold>',
        '<gray>  </gray><cyan>details:</cyan><gray> package output is invalid.</gray>',
        '<gray>  </gray><cyan>items:</cyan><gray> </gray><blueBright>packages/pkg/dist/index.js</blueBright>',
        '<gray>  </gray><cyan>dependencies:</cyan><gray> </gray><blueBright>@example/shared</blueBright>',
        '<gray>  </gray><cyan>imports:</cyan><gray> </gray><blueBright>@example/shared</blueBright>',
        '<gray>  </gray><cyan>targets:</cyan><gray> </gray><blueBright>.limina/tsconfig/checkers/typescript/tsconfig.build.json</blueBright>',
      ].join('\n'),
    );
  });

  it('keeps summary error boxes red and colors following detail boxes semantically', () => {
    const message = [
      '┌ Source check summary ──────────────────────────────┐',
      '│ Found 55 unused source modules in 2 packages.       │',
      '│ Found 1 unused workspace package dependency.        │',
      '└─────────────────────────────────────────────────────┘',
      '',
      '┌─────────────────────────────────────────────────────┐',
      '│ rule: LIMINA_SOURCE_UNUSED_MODULE                   │',
      '└─────────────────────────────────────────────────────┘',
    ].join('\n');
    const output = formatNodeMessageSegments(
      createConsoleMessageSegments('error', message),
      fakeColors,
    );

    expect(output).toBe(
      [
        '<red>┌ Source check summary ──────────────────────────────┐</red>',
        '<red>│ Found 55 unused source modules in 2 packages.       │</red>',
        '<red>│ Found 1 unused workspace package dependency.        │</red>',
        '<red>└─────────────────────────────────────────────────────┘</red>',
        '',
        '<gray>┌─────────────────────────────────────────────────────┐</gray>',
        '<gray>│ </gray><cyan>rule:</cyan><gray> </gray><blueBright>LIMINA_SOURCE_UNUSED_MODULE</blueBright><gray>                   │</gray>',
        '<gray>└─────────────────────────────────────────────────────┘</gray>',
      ].join('\n'),
    );
  });

  it('colors summary-first check report detail fields after the summary box', () => {
    const message = [
      '┌ Graph check summary ───────────────────────────────┐',
      '│ Found 1 check issue.                                │',
      '│ Top rules: LIMINA_GRAPH_CHECK_FAILED (1)            │',
      '└─────────────────────────────────────────────────────┘',
      '',
      '┌─────────────────────────────────────────────────────┐',
      '│ Graph check failed  1 issue                         │',
      '│ rule: LIMINA_GRAPH_CHECK_FAILED                     │',
      '│ reason: Graph check failed.                         │',
      '│ suggested fix: limina graph check                   │',
      '│ details: packages/pkg/tsconfig.json                 │',
      '└─────────────────────────────────────────────────────┘',
    ].join('\n');
    const output = formatNodeMessageSegments(
      createConsoleMessageSegments('error', message),
      fakeColors,
    );

    expect(output).toContain(
      '<red>┌ Graph check summary ───────────────────────────────┐</red>',
    );
    expect(output).toContain('<cyan>rule:</cyan>');
    expect(output).toContain(
      '<blueBright>LIMINA_GRAPH_CHECK_FAILED</blueBright>',
    );
    expect(output).toContain('<yellow>reason:</yellow>');
    expect(output).toContain('<green>suggested fix:</green>');
    expect(output).toContain('<cyan>details:</cyan>');
    expect(output).toContain(
      '<blueBright>packages/pkg/tsconfig.json</blueBright>',
    );
    expect(output).not.toContain('<red>│ reason:');
    expect(output).not.toContain('<red>│ suggested fix:');
    expect(output).not.toContain('<red>│ details:');
  });

  it('falls back to plain text without color support', () => {
    const message = [
      'Package check failed:',
      '  package: @example/app',
      '  reason: package output is invalid.',
      '  fix: rebuild the package.',
    ].join('\n');

    expect(
      formatNodeMessageSegments(
        createConsoleMessageSegments('error', message),
        null,
      ),
    ).toBe(message);
  });

  it('renders browser console segments with semantic styles', () => {
    const message = [
      'Package check failed:',
      '  package: @example/app',
      '  reason: package output is invalid.',
      '  fix: rebuild the package.',
    ].join('\n');
    const { styles, texts } = formatBrowserMessageSegments(
      createConsoleMessageSegments('error', message),
    );

    expect(texts).toEqual([
      '%cPackage check failed:',
      '%c\n',
      '%c  ',
      '%cpackage:',
      '%c ',
      '%c@example/app',
      '%c\n',
      '%c  ',
      '%creason:',
      '%c package output is invalid.',
      '%c\n',
      '%c  ',
      '%cfix:',
      '%c rebuild the package.',
    ]);
    expect(styles).toEqual([
      BROWSER_STYLES.error,
      BROWSER_STYLES.default,
      BROWSER_STYLES.body,
      BROWSER_STYLES.location,
      BROWSER_STYLES.body,
      BROWSER_STYLES.path,
      BROWSER_STYLES.default,
      BROWSER_STYLES.body,
      BROWSER_STYLES.reason,
      BROWSER_STYLES.body,
      BROWSER_STYLES.default,
      BROWSER_STYLES.body,
      BROWSER_STYLES.fix,
      BROWSER_STYLES.body,
    ]);
  });
});
