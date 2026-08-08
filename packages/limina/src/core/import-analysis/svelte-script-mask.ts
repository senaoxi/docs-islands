interface SveltePreprocessorCompiler {
  preprocess(
    source: string,
    preprocessor: {
      name: string;
      script(options: { content: string }): { code: string };
    },
    options: { filename?: string },
  ): Promise<{ code: string }>;
}

export async function maskSvelteScriptContents(options: {
  compiler: SveltePreprocessorCompiler;
  filePath: string;
  sourceText: string;
}): Promise<string> {
  const processed = await options.compiler.preprocess(
    options.sourceText,
    {
      name: 'limina-import-analysis',
      script: ({ content }) => ({
        code: content.replaceAll(/[^\r\n]/gu, ' '),
      }),
    },
    { filename: options.filePath },
  );
  if (processed.code.length !== options.sourceText.length) {
    throw new Error(
      'the compiler preprocessor changed component source offsets',
    );
  }
  return processed.code;
}
