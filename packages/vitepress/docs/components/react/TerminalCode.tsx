import { type ReactNode, useMemo } from 'react';

// Only the fixed demo buffers are highlighted, including partially typed input.
// Render token text through React so code never becomes executable markup.
const patterns = {
  markdown:
    /(?<comment><!--.*?-->|\/\/[^\n]*)|(?<string>"(?:\\.|[^\n"\\])*(?:"|$)|'(?:\\.|[^\n'\\])*(?:'|$))|(?<tag><\/?[\w.-]+)|(?<property>[\w:-]+(?=[\t ]*=)|^[\w-]+(?=:))|(?<keyword>^---$|\b(?:import|from|export|default|const|let|function|return|true|false)\b)|(?<tagName>\b[A-Z][\w$]*(?=\s+from\b))|(?<punctuation>\/?>|[();=[\]{}])/gmsu,
  css: /(?<comment>\/\*.*?(?:\*\/|$))|(?<string>"(?:\\.|[^\n"\\])*(?:"|$)|'(?:\\.|[^\n'\\])*(?:'|$))|(?<property>[\w-]+(?=[\t ]*:))|(?<tag>\.[\w-]+|\b[\w-]+(?=\())|(?<number>\b\d+(?:\.\d+)?(?:%|px|rem|em|ms|s)?)|(?<punctuation>[(),:;{}])/gsu,
  shell:
    /(?<keyword>^\$|\bvi\b|:wq)|(?<string>"[^\n"]*(?:"|$))|(?<tag>@docs-islands\/vitepress\[[^\n\]]*\]|\[[^\n\]]*\])|(?<property>(?:\/?(?:[\w.-]+\/)+)?[\w.-]+\.(?:md|css|tsx|ts)\b)/gmu,
};

export default function TerminalCode({
  source,
  language,
}: {
  source: string;
  language: keyof typeof patterns;
}) {
  const tokens = useMemo(() => {
    const result: ReactNode[] = [];
    let position = 0;
    for (const match of source.matchAll(patterns[language])) {
      result.push(source.slice(position, match.index));
      const kind = Object.entries(match.groups ?? {}).find(
        ([, value]) => value !== undefined,
      )?.[0];
      result.push(
        <span key={match.index} className={`demo-token-${kind}`}>
          {match[0]}
        </span>,
      );
      position = match.index + match[0].length;
    }
    result.push(source.slice(position));
    return result;
  }, [source, language]);
  return <code>{tokens}</code>;
}
