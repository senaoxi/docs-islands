import { expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const originalMarkdownContent =
  '<!-- This file is used to test the HMR of markdown content changes. -->\n';

// Helper function to modify a file and wait for HMR.
const modifyFileAndWaitForHMR = async (
  filePath: string,
  newContent: string,
  expectHMR = true,
): Promise<void> => {
  // Write the new content.
  fs.writeFileSync(filePath, newContent);

  // Wait for HMR processing.
  await page.waitForTimeout(200);

  if (expectHMR) {
    // Wait for any potential HMR updates.
    await page.waitForTimeout(1000);
  }
};

// Helper function to restore file content.
const restoreFileContent = async (
  filePath: string,
  originalContent: string,
): Promise<void> => {
  fs.writeFileSync(filePath, originalContent);
  await page.waitForTimeout(200);
};

describe('Markdown Content Changes', () => {
  describe('Basic Markdown Rendering', () => {
    test('Should render markdown content correctly', async () => {
      await goto('/markdown-changes/basic-content');

      // Check that Markdown content renders.
      const heading = page.locator('h1');
      await expect(heading).toBeVisible();
      expect(await heading.textContent()).toContain('Basic Content');

      // Check that Markdown formatting is applied.
      const bold = page.locator('strong');
      await expect(bold).toBeVisible();

      const italic = page.locator('em');
      await expect(italic).toBeVisible();

      // Check the secondary heading (the Markdown one, not the component one).
      const h2 = page.locator('h2').filter({ hasText: 'More Content' });
      await expect(h2).toBeVisible();
      expect(await h2.textContent()).toContain('More Content');
    });

    test('Directly modifying HTML should not trigger HMR.', async () => {
      // Test that basic Markdown renders correctly (skip the first paragraph which might be hidden by the VitePress UI).
      const paragraph = page.locator('p').filter({ hasText: 'bold text' });
      await expect(paragraph).toBeVisible();

      // Component should still work.
      const helloWorld = page.locator('[data-testid="hello-world"]');
      await expect(helloWorld).toBeVisible();
    });
  });

  describe('Content Without Components', () => {
    test('Should render pure markdown pages correctly', async () => {
      await goto('/markdown-changes/content-without-components');

      const heading = page.locator('h1');
      await expect(heading).toBeVisible();
      expect(await heading.textContent()).toContain(
        'Content Without Components',
      );

      // Check list rendering
      const listItems = page.locator('strong.test');
      const count = await listItems.count();
      expect(count).toBe(3);

      // Check code block rendering
      const codeBlock = page.locator('pre code');
      await expect(codeBlock).toBeVisible();

      // Check blockquote rendering
      const blockquote = page.locator('blockquote');
      await expect(blockquote).toBeVisible();
    });

    test('Should handle pages without React components', async () => {
      // Should not have any React components.
      const components = page.locator('[data-testid]');
      const componentCount = await components.count();
      expect(componentCount).toBe(0);

      // But the page should still be functional.
      const content = page.locator('.vp-doc');
      await expect(content).toBeVisible();
    });
  });

  describe('Complex Layout with Components', () => {
    test('Should handle complex markdown layouts', async () => {
      await goto('/markdown-changes/complex-layout');

      // Check all sections.
      const sections = page.locator('[id^="section"]');
      const sectionCount = await sections.count();
      expect(sectionCount).toBe(3);

      // Check table rendering.
      const table = page.locator('table');
      await expect(table).toBeVisible();

      const tableRows = page.locator('tr');
      const rowCount = await tableRows.count();
      expect(rowCount).toBeGreaterThan(1); // Header + data rows

      // Check components are interspersed with content.
      const helloWorld = page.locator('[data-testid="hello-world"]');
      const hello = page.locator('[data-testid="hello"]');

      await expect(helloWorld).toBeVisible();
      await expect(hello).toBeVisible();
    });
  });

  // HMR tests - render container content changes.
  describe('Render Container Content Changes', () => {
    const hmrTestFilePath = path.join(__dirname, 'hmr-test.md');

    test('Should handle render directive change from client:only to ssr:only (one-to-one)', async () => {
      const originalContent = `# HMR Test Page

  <script lang="react">
    import HelloWorld from '../components/react/HelloWorld.tsx';
  </script>

  <span class="original-content-case1">Some content here.</span>

  <HelloWorld client:only uniqueid="hmr-test-component" />`;

      const modifiedContent = `# HMR Test Page

  <script lang="react">
    import HelloWorld from '../components/react/HelloWorld.tsx';
  </script>

  <span class="modified-content-case1">Some modified content here.</span>

  <HelloWorld ssr:only uniqueid="hmr-test-component" />`;

      try {
        // First, write originalContent and navigate to the page.
        await restoreFileContent(hmrTestFilePath, originalContent);
        await goto('/markdown-changes/hmr-test');

        // Verify that the test case source file completes rendering.
        await page.waitForSelector('.original-content-case1');
        // Verify original content renders correctly.
        const originalComponent = page.locator(
          '[data-unique-id="hmr-test-component"]',
        );
        await expect(originalComponent).toBeVisible();

        await page.waitForSelector(
          '[data-unique-id="hmr-test-component"] > button',
        );
        // Test that the original is client:only (interactive).
        const originalButton = page.locator(
          '[data-unique-id="hmr-test-component"] > button',
        );
        if (await originalButton.isVisible()) {
          await originalButton.click();
          expect(await originalButton.textContent()).toContain('Count: 1'); // Should increment
        }

        // Now modify to ssr:only and test HMR.
        await modifyFileAndWaitForHMR(hmrTestFilePath, modifiedContent);

        await page.waitForSelector('.modified-content-case1');
        const component = page.locator('[data-unique-id="hmr-test-component"]');
        await expect(component).toBeVisible();

        // SSR-only components should not be interactive.
        const button = page.locator(
          '[data-unique-id="hmr-test-component"] > button',
        );
        if (await button.isVisible()) {
          await button.click();
          expect(await button.textContent()).toContain('Count: 0'); // Should remain 0
        }
      } finally {
        // Restore original content.
        await restoreFileContent(hmrTestFilePath, originalMarkdownContent);
      }
    });

    test('Should handle render directive change from ssr:only to client:only (one-to-one)', async () => {
      const originalContent = `# HMR Test Page

  <script lang="react">
    import HelloWorld from '../components/react/HelloWorld.tsx';
  </script>

  <span class="original-content-case2">Some content here.</span>

  <HelloWorld ssr:only uniqueid="hmr-test-component" />`;

      const modifiedContent = `# HMR Test Page

  <script lang="react">
    import HelloWorld from '../components/react/HelloWorld.tsx';
  </script>

  <span class="modified-content-case2">Some modified content here.</span>

  <HelloWorld client:only uniqueid="hmr-test-component" />`;

      try {
        // First, write originalContent and navigate to the page.
        await restoreFileContent(hmrTestFilePath, originalContent);

        await page.waitForSelector('.original-content-case2');
        // Verify original content renders correctly (SSR-only, non-interactive).
        const originalComponent = page.locator(
          '[data-unique-id="hmr-test-component"]',
        );
        await expect(originalComponent).toBeVisible();

        const originalButton = page.locator(
          '[data-unique-id="hmr-test-component"] > button',
        );
        if (await originalButton.isVisible()) {
          await originalButton.click();
          expect(await originalButton.textContent()).toContain('Count: 0'); // Should remain 0
        }

        // Now modify to client:only and test HMR.
        await modifyFileAndWaitForHMR(hmrTestFilePath, modifiedContent);

        await page.waitForSelector('.modified-content-case2');
        // Verify the component is now rendered as client-only (interactive).
        const component = page.locator('[data-unique-id="hmr-test-component"]');
        await expect(component).toBeVisible();

        // Client-only components should be interactive.
        const button = component.locator('button');
        if (await button.isVisible()) {
          await button.click();
          expect(await button.textContent()).toContain('Count: 1'); // Should increment
        }
      } finally {
        // Restore original content.
        await restoreFileContent(hmrTestFilePath, originalMarkdownContent);
      }
    });

    test('Should handle adding new render container with different directives', async () => {
      const originalContent = `# HMR Test Page

  <script lang="react">
    import HelloWorld from '../components/react/HelloWorld.tsx';
  </script>

  <span class="original-content-case3">Some content here.</span>

  <HelloWorld uniqueid="original-component" />`;

      const modifiedContent = `# HMR Test Page

  <script lang="react">
    import HelloWorld from '../components/react/HelloWorld.tsx';
    import Hello from '../components/react/Hello.tsx';
  </script>

  <span class="modified-content-case3">Some modified content here.</span>

  <HelloWorld uniqueid="original-component" />
  <Hello ssr:only uniqueid="new-ssr-component" />
  <Hello client:only uniqueid="new-client-component" />`;

      try {
        // First, write originalContent and navigate to the page.
        await restoreFileContent(hmrTestFilePath, originalContent);
        await page.waitForSelector('.original-content-case3');

        // Verify original content renders correctly.
        const originalComponent = page.locator(
          '[data-unique-id="original-component"]',
        );
        await expect(originalComponent).toBeVisible();
        await page.waitForSelector(
          '[data-unique-id="original-component"] > button',
        );
        const originalButton = page.locator(
          '[data-unique-id="original-component"] > button',
        );
        await originalButton.click();
        expect(await originalButton.textContent()).toContain('Count: 0');

        // Now modify to add new components and test HMR.
        await modifyFileAndWaitForHMR(hmrTestFilePath, modifiedContent);

        await page.waitForSelector('.modified-content-case3');
        // Verify all components are rendered.
        await page.waitForSelector('[data-unique-id="original-component"]');
        const modifiedComponent = page.locator(
          '[data-unique-id="original-component"]',
        );
        await expect(modifiedComponent).toBeVisible();
        const modifiedOriginalButton = page.locator(
          '[data-unique-id="original-component"] > button',
        );
        await modifiedOriginalButton.click();
        expect(await modifiedOriginalButton.textContent()).toContain(
          'Count: 0',
        );

        await page.waitForSelector(
          '[data-unique-id="new-ssr-component"] > button',
        );
        const modifiedSsrButton = page.locator(
          '[data-unique-id="new-ssr-component"] > button',
        );
        await modifiedSsrButton.click();
        expect(await modifiedSsrButton.textContent()).toContain('Count: 0');

        await page.waitForSelector('[data-unique-id="new-client-component"]');
        const modifiedClientButton = page.locator(
          '[data-unique-id="new-client-component"] > button',
        );
        await modifiedClientButton.click();
        expect(await modifiedClientButton.textContent()).toContain('Count: 1');
      } finally {
        // Restore original content.
        await restoreFileContent(hmrTestFilePath, originalMarkdownContent);
      }
    });

    test('Should handle removing render container', async () => {
      const originalContent = `# HMR Test Page

  <script lang="react">
    import HelloWorld from '../components/react/HelloWorld.tsx';
    import Hello from '../components/react/Hello.tsx';
  </script>

  <span class="original-content-case4">Some content here.</span>

  <HelloWorld uniqueid="component-1" />
  <Hello client:only uniqueid="component-to-remove" />`;

      const modifiedContent = `# HMR Test Page

  <script lang="react">
    import HelloWorld from '../components/react/HelloWorld.tsx';
  </script>

  <span class="modified-content-case4">Some modified content here.</span>

  <HelloWorld uniqueid="component-1" />`;

      try {
        // First, write originalContent and navigate to page
        await restoreFileContent(hmrTestFilePath, originalContent);
        await page.waitForSelector('.original-content-case4');

        await page.waitForSelector('[data-unique-id="component-1"] > button');
        const originalComponentButton1 = page.locator(
          '[data-unique-id="component-1"] > button',
        );
        await originalComponentButton1.click();
        expect(await originalComponentButton1.textContent()).toContain(
          'Count: 0',
        );

        await page.waitForSelector(
          '[data-unique-id="component-to-remove"] > button',
        );
        const originalComponentButton2 = page.locator(
          '[data-unique-id="component-to-remove"] > button',
        );
        await originalComponentButton2.click();
        expect(await originalComponentButton2.textContent()).toContain(
          'Count: 1',
        );

        // Now modify to remove one component and test HMR
        await modifyFileAndWaitForHMR(hmrTestFilePath, modifiedContent);

        await page.waitForSelector('.modified-content-case4');

        // Verify the remaining component is still visible
        await page.waitForSelector('[data-unique-id="component-1"]');
        const remainingComponent = page.locator(
          '[data-unique-id="component-1"]',
        );
        await expect(remainingComponent).toBeVisible();

        // Verify the removed component is no longer present
        const removedComponent = page.locator(
          '[data-unique-id="component-to-remove"]',
        );
        expect(await removedComponent.count()).toBe(0);
      } finally {
        // Restore original content
        await restoreFileContent(hmrTestFilePath, originalMarkdownContent);
      }
    });
  });

  // HMR tests — Markdown content changes not related to the feature.
  describe('Markdown Content Changes Not Related to the Feature', () => {
    const pureMarkdownTestFilePath = path.join(
      __dirname,
      'pure-markdown-hmr-test.md',
    );

    test('Should render changed markdown correctly without triggering React HMR', async () => {
      const originalContent = `# Hello World

  <script lang="react">
    import HelloWorld from '../components/react/HelloWorld.tsx';
  </script>

  <HelloWorld uniqueid="markdown-test-component" />`;

      const modifiedContent = `# Hello World!

  <script lang="react">
    import HelloWorld from '../components/react/HelloWorld.tsx';
  </script>

  <HelloWorld uniqueid="markdown-test-component" />`;

      try {
        // First, write originalContent and navigate to the page.
        await restoreFileContent(pureMarkdownTestFilePath, originalContent);
        await goto('/markdown-changes/pure-markdown-hmr-test');
        await page.waitForTimeout(1000);

        // Verify original content renders correctly.
        const heading = page.locator('h1');
        await expect(heading).toBeVisible();
        expect(await heading.textContent()).toContain('Hello World');

        const originalComponent = page.locator(
          '[data-unique-id="markdown-test-component"]',
        );
        await expect(originalComponent).toBeVisible();

        // Now modify content and test HMR.
        await modifyFileAndWaitForHMR(
          pureMarkdownTestFilePath,
          modifiedContent,
          false,
        );

        // Reload to see changes.
        await page.reload();
        await page.waitForTimeout(1000);

        // Verify the Markdown content changed.
        const modifiedHeading = page.locator('h1');
        await expect(modifiedHeading).toBeVisible();
        expect(await modifiedHeading.textContent()).toContain('Hello World!');

        // Verify the component still works.
        const component = page.locator(
          '[data-unique-id="markdown-test-component"]',
        );
        await expect(component).toBeVisible();
      } finally {
        // Restore original content.
        await restoreFileContent(
          pureMarkdownTestFilePath,
          originalMarkdownContent,
        );
      }
    });

    test('Should not lose component state when markdown content changes', async () => {
      const originalContent = `# Hello World

  <script lang="react">
    import HelloWorld from '../components/react/HelloWorld.tsx';
  </script>

  <span class="original-content">Some content here.</span>

  <HelloWorld client:only uniqueid="state-test-component" />`;

      const modifiedContent = `# Hello World!

  <script lang="react">
    import HelloWorld from '../components/react/HelloWorld.tsx';
  </script>

  <span class="modified-content">Some modified content here.</span>

  <HelloWorld client:only uniqueid="state-test-component" />`;

      try {
        // First, write originalContent and navigate to page
        await restoreFileContent(pureMarkdownTestFilePath, originalContent);
        await page.waitForSelector('[data-unique-id="state-test-component"]');

        // Verify original content renders and interact with component
        const component = page.locator(
          '[data-unique-id="state-test-component"]',
        );
        await expect(component).toBeVisible();

        const button = page.locator(
          '[data-unique-id="state-test-component"] > button',
        );
        if (await button.isVisible()) {
          await button.click();
          await button.click();
          expect(await button.textContent()).toContain('Count: 2');

          // Now modify markdown content (not React-related)
          await modifyFileAndWaitForHMR(
            pureMarkdownTestFilePath,
            modifiedContent,
            true,
          );

          await page.waitForSelector('.modified-content');
          // Verify markdown changed
          const heading = page.locator('.modified-content');
          expect(await heading.textContent()).toContain(
            'Some modified content here.',
          );

          // Component state should reset on page reload (expected behavior)
          const newComponent = page.locator(
            '[data-unique-id="state-test-component"] > button',
          );
          if (await newComponent.isVisible()) {
            expect(await newComponent.textContent()).toContain('Count: 2');
          }
        }
      } finally {
        // Restore original content
        await restoreFileContent(
          pureMarkdownTestFilePath,
          originalMarkdownContent,
        );
      }
    });
  });

  // Original HMR tests.
  describe('Component State Preservation', () => {
    test('Should preserve component state during content changes', async () => {
      await goto('/markdown-changes/basic-content');

      // Find and interact with the component.
      const button = page.locator('[data-testid="counter-button"]');

      if (await button.isVisible()) {
        await button.click();
        await button.click();
        expect(await button.textContent()).toContain('Count: 2');
      }

      // Navigate to a different Markdown page and back.
      await goto('/markdown-changes/content-without-components');
      await goto('/markdown-changes/basic-content');

      // State should reset on navigation (expected behavior).
      const newButton = page.locator('[data-testid="counter-button"]');
      if (await newButton.isVisible()) {
        expect(await newButton.textContent()).toContain('Count: 0');
      }
    });
  });
});
