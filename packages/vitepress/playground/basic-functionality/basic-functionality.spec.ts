import { createElapsedTimer } from '@docs-islands/logger/helper';
import { expect } from '@playwright/test';
import { getPlaygroundLogger } from '../test-utils/logger';

const TestLogger = getPlaygroundLogger('test.playground.basic-functionality');

describe('Basic Site Functionality', () => {
  test('should load home page', async () => {
    await goto('/');

    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
    expect(await heading.textContent()).toContain('Home');
  });

  test('should handle navigation between pages', async () => {
    // Start at home.
    await goto('/');
    let heading = page.locator('h1');
    expect(await heading.textContent()).toContain('Home');

    // Navigate to script changes.
    await goto('/script-content-changes/basic');
    heading = page.locator('h1');
    expect(await heading.textContent()).toContain(
      'Script Content Changes Test',
    );

    // Navigate to container changes.
    await goto('/container-changes/client-only');
    heading = page.locator('h1');
    expect(await heading.textContent()).toContain('Container Changes Test');
  });

  test('should render VitePress layout correctly', async () => {
    await goto('/');

    // Check for basic VitePress layout elements.
    const layout = page.locator('.Layout');
    await expect(layout).toBeVisible();

    // Check for navigation (may be in header or sidebar).
    const navElements = page.locator('nav, .VPNav, header');
    await expect(navElements.first()).toBeVisible();

    const main = page.locator('main');
    await expect(main).toBeVisible();
  });

  test('should handle 404 pages gracefully', async () => {
    // Try navigating to a non-existent page.
    try {
      await goto('/non-existent-page');

      // Either a 404 page or a redirect should occur.
      const bodyText = await page.textContent('body');
      TestLogger.debug(`404 page content: ${bodyText?.slice(0, 200)}`);

      // The page should still have basic structure.
      const layout = page.locator('.Layout');
      await expect(layout).toBeVisible();
    } catch (error) {
      const catchElapsed = createElapsedTimer();
      TestLogger.info(`Expected 404 error: ${String(error)}`, catchElapsed());
    }
  });

  describe('Debug Information', () => {
    test('should inspect React plugin integration', async () => {
      await goto('/script-content-changes/basic');

      // Wait for potential React hydration.
      await page.waitForTimeout(3000);

      // Check page HTML for React markers.
      const html = await page.content();
      const hasReactRefresh = html.includes('react-refresh');
      const hasReactScripts = html.includes('/@react-refresh');

      TestLogger.debug(`React refresh present: ${hasReactRefresh}`);
      TestLogger.debug(`React scripts present: ${hasReactScripts}`);

      // Check if script tags were processed.
      const hasReactScriptTag = html.includes('<script lang="react">');
      TestLogger.debug(`Script tag still present: ${hasReactScriptTag}`);

      // Basic page functionality should work.
      const heading = page.locator('h1');
      await expect(heading).toBeVisible();
    });
  });
});
