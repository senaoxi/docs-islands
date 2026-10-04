import type { MarkdownRenderer } from 'vitepress';

export function configureArticleMarkdown(md: MarkdownRenderer): void {
  // Only Markdown-owned nodes receive these styles; island HTML keeps its owner.
  const markedRules = [
    'heading_open',
    'paragraph_open',
    'bullet_list_open',
    'ordered_list_open',
    'blockquote_open',
    'link_open',
    'code_inline',
    'table_open',
  ] as const;

  for (const name of markedRules) {
    const original = md.renderer.rules[name];
    md.renderer.rules[name] = (tokens, index, options, env, renderer) => {
      tokens[index].attrJoin('class', 'di-markdown');
      // VitePress 1.6 hardcodes table_open and drops token attributes. Render
      // that token normally; keyboard focus belongs to its overflow wrapper.
      const rendered =
        name === 'table_open' || !original
          ? renderer.renderToken(tokens, index, options)
          : original(tokens, index, options, env, renderer);
      return name === 'table_open'
        ? `<div class="di-table-region">${rendered}`
        : rendered;
    };
  }

  const closeTable = md.renderer.rules.table_close;
  md.renderer.rules.table_close = (tokens, index, options, env, renderer) => {
    const rendered = closeTable
      ? closeTable(tokens, index, options, env, renderer)
      : renderer.renderToken(tokens, index, options);
    return `${rendered}</div>\n`;
  };

  const headerCell = md.renderer.rules.th_open;
  md.renderer.rules.th_open = (tokens, index, options, env, renderer) => {
    tokens[index].attrSet('scope', 'col');
    return headerCell
      ? headerCell(tokens, index, options, env, renderer)
      : renderer.renderToken(tokens, index, options);
  };
}
