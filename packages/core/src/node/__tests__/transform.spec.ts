/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { RENDER_STRATEGY_CONSTANTS } from '../../shared/constants/render-strategy';
import transformComponentTags, { travelImports } from '../transform';

const attrNames = {
  renderId: RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase(),
  renderDirective: RENDER_STRATEGY_CONSTANTS.renderDirective.toLowerCase(),
  renderComponent: RENDER_STRATEGY_CONSTANTS.renderComponent.toLowerCase(),
  renderWithSpaSync: RENDER_STRATEGY_CONSTANTS.renderWithSpaSync.toLowerCase(),
};

describe('transformComponentTags', () => {
  it('transforms self-closing component tags into render containers', () => {
    const code = `# Title\n\n<HelloWorld />\n`;
    const { code: out, renderIdToRenderDirectiveMap } = transformComponentTags(
      code,
      ['HelloWorld'],
      '/docs/index.md',
      attrNames,
    );

    expect(out).toMatch(/<div.*__render_component__="HelloWorld"/s);
    expect(out).toContain(`${attrNames.renderDirective}="ssr:only"`);
    expect(out).toContain(`${attrNames.renderWithSpaSync}="true"`);
    expect(renderIdToRenderDirectiveMap.size).toBe(1);
  });

  it('keeps client:only from enabling spa sync render', () => {
    const { code: out } = transformComponentTags(
      `<HelloWorld client:only spa:sr />`,
      ['HelloWorld'],
      '/docs/guide.md',
      attrNames,
    );

    expect(out).toContain(`${attrNames.renderDirective}="client:only"`);
    expect(out).toContain(`${attrNames.renderWithSpaSync}="false"`);
  });

  it('preserves user attributes while excluding strategy directives', () => {
    const { code: out } = transformComponentTags(
      `<HelloWorld client:load title="Hi" data-id="x" />`,
      ['HelloWorld'],
      '/docs/props.md',
      attrNames,
    );

    expect(out).toMatch(/title="Hi"/);
    expect(out).toMatch(/data-id="x"/);
    expect(out).toContain(attrNames.renderId);
  });

  it('does not transform non self-closing tags', () => {
    const { code: out, renderIdToRenderDirectiveMap } = transformComponentTags(
      `<HelloWorld></HelloWorld>`,
      ['HelloWorld'],
      '/docs/fail.md',
      attrNames,
    );

    expect(out).toContain('<HelloWorld></HelloWorld>');
    expect(renderIdToRenderDirectiveMap.size).toBe(0);
  });
});

describe('travelImports', () => {
  it('extracts named import specifiers', () => {
    expect(
      travelImports(`import { Hero as Banner, Card } from './components';`),
    ).toEqual([
      { importedName: 'Hero', localName: 'Banner' },
      { importedName: 'Card', localName: 'Card' },
    ]);
  });

  it('extracts default and namespace specifiers', () => {
    expect(
      travelImports(`import DefaultExport, * as Toolkit from './components';`),
    ).toEqual([
      { importedName: 'default', localName: 'DefaultExport' },
      { importedName: '*', localName: 'Toolkit' },
    ]);
  });
});
