import * as prompts from '@clack/prompts';

function isInteractiveTerminal(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

function isAccepted(result: boolean | symbol): result is true {
  if (prompts.isCancel(result)) return false;
  return result;
}

export async function confirmDirtyWorkspace(message: string): Promise<boolean> {
  if (!isInteractiveTerminal()) {
    throw new Error(
      [
        'limina migration found changes in a Git working tree but cannot request confirmation in a non-interactive environment.',
        'Keep every involved Git working tree clean, then rerun npx limina migration.',
      ].join('\n'),
    );
  }

  const result = await prompts.confirm({
    initialValue: false,
    message,
  });
  return isAccepted(result);
}
