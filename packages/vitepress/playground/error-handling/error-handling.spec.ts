import { loadEnv } from '@docs-islands/utils/env';
import { expect } from '@playwright/test';
import { getPlaygroundLogger } from '../test-utils/logger';
import {
  debugElementState,
  waitForElementRobust,
} from '../test-utils/platform-helpers';

const TestLogger = getPlaygroundLogger('test.playground.error-handling');
const { test: TEST } = loadEnv();

const waitForMarkdownImportFailure = async (pathname: string) => {
  const markdownModulePath = `${pathname}.md`;
  await page.waitForResponse((candidate) => {
    const url = new URL(candidate.url());

    return (
      url.pathname.endsWith(markdownModulePath) &&
      url.searchParams.has('import') &&
      candidate.status() >= 500
    );
  });
};

async function expectDevPageFailure(pathname: string) {
  const failureResponse = waitForMarkdownImportFailure(pathname);
  const response = await page.goto(`http://localhost:${TEST.port}${pathname}`);

  expect(response).toBeTruthy();
  await failureResponse;
}

describe('Error Handling and Edge Cases', () => {
  beforeEach(() => {
    allowBrowserRuntimeFailures();
  });

  describe('Import Resolution Errors', () => {
    test('Should handle missing components gracefully', async () => {
      await goto('/error-handling/missing-component');

      // The page should still load even if there are component issues.
      const heading = page.locator('h1');
      await expect(heading).toBeVisible();
      expect(await heading.textContent()).toContain('Missing Component');

      // Check the console for errors.
      const consoleLogs: string[] = [];
      page.on('console', (msg) => {
        consoleLogs.push(msg.text());
      });

      await page.waitForTimeout(1000);

      TestLogger.debug('Console messages for missing component:');
      for (const [i, log] of consoleLogs.entries()) {
        TestLogger.debug(`${i}: ${log}`);
      }

      // Basic functionality should still work.
      const content = page.locator('.vp-doc');
      await expect(content).toBeVisible();
    });

    test('Should surface missing imports as a dev page failure', async () => {
      await expectDevPageFailure('/error-handling/invalid-syntax');
    });
  });

  describe('Script Processing Guardrails', () => {
    test('Should surface multiple react scripts as a dev page failure', async () => {
      await expectDevPageFailure('/error-handling/multiple-react-scripts');
    });
  });

  describe('Attribute Escaping', () => {
    test('Should preserve special characters in component tag attributes', async () => {
      await goto('/error-handling/escaped-props');

      const heading = page.locator('h1');
      await expect(heading).toBeVisible();
      expect(await heading.textContent()).toContain('Escaped Props');

      const renderContainer = page.locator('[uniqueid="escape-attr-e2e"]');
      await expect(renderContainer).toBeVisible();
      await expect(renderContainer).toHaveAttribute(
        'title',
        'He said "hello" & goodbye',
      );
      await expect(renderContainer).toHaveAttribute('data-note', "it's fine");

      const renderedComponent = page.locator(
        '[data-unique-id="escape-attr-e2e"]',
      );
      await expect(renderedComponent).toBeVisible();
    });
  });

  describe('Component Name Mismatches', () => {
    test('Should cause the page to crash', async () => {
      await goto('/error-handling/component-name-mismatch');

      const heading = page.locator('h1');
      await expect(heading).toBeVisible();
      expect(await heading.textContent()).toContain('Component Name Mismatch');

      // The page should still render Markdown content.
      const content = page.locator('.vp-doc');
      await expect(content).toBeVisible();
    });
  });

  describe('Invalid Render Directives', () => {
    test('Should match the default rendering strategy (ssr:only)', async () => {
      await goto('/error-handling/invalid-directive');

      const heading = page.locator('h1');
      await expect(heading).toBeVisible();
      expect(await heading.textContent()).toContain('Invalid Render Directive');

      // The page should still be functional.
      const content = page.locator('.vp-doc');
      await expect(content).toBeVisible();

      // Debug element states before testing (CI only)
      await debugElementState(
        page,
        '[uniqueid="invalid-directive"]',
        'InvalidDirective',
      );
      await debugElementState(
        page,
        '[uniqueid="client-invalid"]',
        'ClientInvalid',
      );

      await waitForElementRobust(page, '[uniqueid="invalid-directive"]', {
        checkAttribute: '__render_directive__',
        expectedAttributeValue: 'ssr:only',
        checkVisibility: true,
      });

      await waitForElementRobust(page, '[uniqueid="client-invalid"]', {
        checkAttribute: '__render_directive__',
        expectedAttributeValue: 'ssr:only',
        checkVisibility: true,
      });
    });
  });

  describe('Performance and Load Testing', () => {
    test('should load pages within a reasonable time', async () => {
      const startTime = Date.now();

      await goto('/error-handling/missing-component');

      // Wait for the page to fully load.
      await page.waitForLoadState('networkidle');

      const loadTime = Date.now() - startTime;

      TestLogger.debug(`Page load time: ${loadTime}ms`);

      // The page should load within 10 seconds even with errors.
      expect(loadTime).toBeLessThan(10_000);

      // Content should be visible.
      const heading = page.locator('h1');
      await expect(heading).toBeVisible();
    });

    test('should handle rapid navigation between recoverable edge-case pages', async () => {
      await goto('/error-handling/missing-component');
      await goto('/error-handling/component-name-mismatch');
      await goto('/error-handling/invalid-directive');

      // The final page should render correctly.
      const heading = page.locator('h1');
      await expect(heading).toBeVisible();
      expect(await heading.textContent()).toContain('Invalid Render Directive');
    });
  });
});
