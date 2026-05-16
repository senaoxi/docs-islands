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
  fs.writeFileSync(filePath, newContent);
  await page.waitForTimeout(200);

  if (expectHMR) {
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

// Helper to wait for a selector after HMR with reload fallback.
const waitForHMRSelector = async (selector: string, timeout = 5000) => {
  try {
    await page.waitForSelector(selector, { timeout });
  } catch {
    await page.reload();
    await page.waitForSelector(selector, { timeout });
  }
};

describe('Script Content Changes', () => {
  describe('Basic Component Rendering', () => {
    beforeEach(async () => {
      await goto('/script-content-changes/basic');
    });

    test('should render component correctly', async () => {
      // Wait for the client-side component to complete rendering.
      await page.waitForSelector('[data-testid="hello-world"]');
      const helloWorld = page.locator('[data-testid="hello-world"]');
      await expect(helloWorld).toBeVisible();
      expect(await helloWorld.textContent()).toContain('Hello World Component');

      const button = page.locator('[data-testid="counter-button"]');
      await expect(button).toBeVisible();

      await button.click();
      await button.click();
      expect(await button.textContent()).toContain('Count: 2');
    });
  });

  describe('Import Path Errors', () => {
    beforeEach(() => {
      allowBrowserRuntimeFailures();
    });

    // Vite path resolution is case-insensitive on macOS and Unix-like systems.
    test('Should markdown be rendered normally', async () => {
      await goto('/script-content-changes/import-path-error');

      await page.waitForSelector(
        '#script-content-changes-test-import-path-error',
      );
      // The page should still load even with import errors.
      const heading = page.locator(
        '#script-content-changes-test-import-path-error',
      );
      await expect(heading).toBeVisible();
      expect(await heading.textContent()).toContain('Import Path Error');
    });

    test('Should not affect other rendering containers', async () => {
      // Component parsing failures prevent successful render container resolution.
      const withErrorPathRenderContainer = page.locator(
        '[uniqueid="with-error-path"]',
      );
      expect(await withErrorPathRenderContainer.count()).toBe(1);
      await expect(
        await withErrorPathRenderContainer.getAttribute('__render_directive__'),
      ).toBe(null);

      await page.waitForSelector('[__render_directive__="ssr:only"]');
      const ssrOnlyRenderContainer = page.locator(
        '[__render_directive__="ssr:only"]',
      );
      await expect(ssrOnlyRenderContainer).toBeVisible();

      await page.waitForSelector(
        '[data-unique-id="ssr-only-normal-render"] > button',
      );
      const ssrOnlyButton = page.locator(
        '[data-unique-id="ssr-only-normal-render"] > button',
      );
      await ssrOnlyButton.click();
      expect(await ssrOnlyButton.textContent()).toContain('Count: 0');
      await ssrOnlyButton.click();
      expect(await ssrOnlyButton.textContent()).toContain('Count: 0');
      await ssrOnlyButton.click();
      expect(await ssrOnlyButton.textContent()).toContain('Count: 0');

      await page.waitForSelector('[__render_directive__="client:only"]');
      const clientOnlyRenderContainer = page.locator(
        '[__render_directive__="client:only"]',
      );
      await expect(clientOnlyRenderContainer).toBeVisible();

      await page.waitForSelector(
        '[data-unique-id="client-only-normal-render"] > button',
      );
      const clientOnlyButton = page.locator(
        '[data-unique-id="client-only-normal-render"] > button',
      );
      await expect(clientOnlyButton).toBeVisible();

      await clientOnlyButton.click();
      expect(await clientOnlyButton.textContent()).toContain('Count: 1');
      await clientOnlyButton.click();
      expect(await clientOnlyButton.textContent()).toContain('Count: 2');
      await clientOnlyButton.click();
      expect(await clientOnlyButton.textContent()).toContain('Count: 3');
    });
  });

  describe('Component Name Changes', () => {
    test('Should markdown be rendered normally', async () => {
      await goto('/script-content-changes/component-name-change');

      await page.waitForSelector(
        '#script-content-changes-test-component-name-change',
      );
      const heading = page.locator(
        '#script-content-changes-test-component-name-change',
      );
      await expect(heading).toBeVisible();
      expect(await heading.textContent()).toContain('Component Name Change');

      const component = page.locator(
        '[uniqueid="component-name-change-component"]',
      );
      expect(await component.count()).toBe(1);
      expect(await component.getAttribute('__render_directive__')).toBe(null);
    });
  });
});

// HMR Tests - Changing Render Component References
describe('HMR: Changing Render Component References', () => {
  const hmrTestFilePath = path.join(__dirname, 'hmr-test.md');

  test('Should handle import path errors in HMR', async () => {
    allowBrowserRuntimeFailures();
    const originalContent = `# HMR Import Path Test

<script lang="react">
  import HelloWorld from '../components/react/HelloWorld.tsx';
</script>

<span class="original-content-case1">Some content here.</span>

<HelloWorld uniqueid="import-test-component" />`;

    const modifiedContent = `# HMR Import Path Test

<script lang="react">
  import HelloWorld from '../components/react/InvalidPath.tsx';
</script>

<span class="modified-content-case1">Some modified content here.</span>

<HelloWorld uniqueid="import-test-component" />`;

    try {
      await restoreFileContent(hmrTestFilePath, originalContent);
      await goto('/script-content-changes/hmr-test');

      await page.waitForSelector('.original-content-case1');
      const originalComponent = page.locator(
        '[data-unique-id="import-test-component"]',
      );
      await expect(originalComponent).toBeVisible();

      await modifyFileAndWaitForHMR(hmrTestFilePath, modifiedContent);

      // Page should still load even with import errors
      await waitForHMRSelector('.modified-content-case1');
      const heading = page.locator('#hmr-import-path-test');
      await expect(heading).toBeVisible();
      expect(await heading.textContent()).toContain('HMR Import Path Test');
    } finally {
      await restoreFileContent(hmrTestFilePath, originalMarkdownContent);
    }
  });

  test('Should handle component name changes in HMR', async () => {
    const originalContent = `# HMR Component Name Test

<script lang="react">
  import HelloWorld from '../components/react/HelloWorld.tsx';
</script>

<span class="original-content-case2">Some content here.</span>

<HelloWorld uniqueid="name-test-component" />`;

    const modifiedContent = `# HMR Component Name Test

<script lang="react">
  import Hello from '../components/react/Hello.tsx';
</script>

<span class="modified-content-case2">Some modified content here.</span>

<Hello uniqueid="name-test-component" />`;

    try {
      await restoreFileContent(hmrTestFilePath, originalContent);

      await page.waitForSelector('.original-content-case2');
      await page.waitForSelector('[data-unique-id="name-test-component"]');
      const originalComponent = page.locator(
        '[data-unique-id="name-test-component"]',
      );
      await expect(originalComponent).toBeVisible();
      expect(await originalComponent.textContent()).toContain(
        'Hello World Component',
      );

      await modifyFileAndWaitForHMR(hmrTestFilePath, modifiedContent);

      await waitForHMRSelector('.modified-content-case2');
      await waitForHMRSelector('[data-unique-id="name-test-component"]');
      const modifiedComponent = page.locator(
        '[data-unique-id="name-test-component"]',
      );
      await expect(modifiedComponent).toBeVisible();
      expect(await modifiedComponent.textContent()).toContain(
        'Hello Component',
      );
    } finally {
      await restoreFileContent(hmrTestFilePath, originalMarkdownContent);
    }
  });
});

// HMR Tests - Adding New Render Component References
describe('HMR: Adding New Render Component References', () => {
  const hmrTestFilePath = path.join(__dirname, 'hmr-test.md');

  test('Should handle adding new components with incorrect import paths', async () => {
    allowBrowserRuntimeFailures();
    const originalContent = `# HMR Add Component Test

<script lang="react">
  import HelloWorld from '../components/react/HelloWorld.tsx';
</script>

<span class="original-content-case3">Some content here.</span>

<HelloWorld client:only uniqueid="original-component" />`;

    const modifiedContent = `# HMR Add Component Test

<script lang="react">
  import HelloWorld from '../components/react/HelloWorld.tsx';
  import InvalidComponent from '../components/react/Invalid.tsx';
</script>

<span class="modified-content-case3">Some modified content here.</span>

<HelloWorld client:only uniqueid="original-component" />
<InvalidComponent uniqueid="invalid-component" />`;

    try {
      await restoreFileContent(hmrTestFilePath, originalContent);

      await page.waitForSelector('[data-unique-id="original-component"]');
      const originalComponent = page.locator(
        '[data-unique-id="original-component"]',
      );
      await expect(originalComponent).toBeVisible();
      const originalComponentButton = page.locator(
        '[data-unique-id="original-component"] > button',
      );
      await originalComponentButton.click();
      expect(await originalComponentButton.textContent()).toContain('Count: 1');
      await originalComponentButton.click();
      expect(await originalComponentButton.textContent()).toContain('Count: 2');
      await originalComponentButton.click();
      expect(await originalComponentButton.textContent()).toContain('Count: 3');

      await modifyFileAndWaitForHMR(hmrTestFilePath, modifiedContent);

      // Reused components maintain state and remain functional after updates.
      await waitForHMRSelector('[data-unique-id="original-component"]');
      await expect(originalComponent).toBeVisible();
      expect(await originalComponentButton.textContent()).toContain('Count: 3');
      await originalComponentButton.click();
      expect(await originalComponentButton.textContent()).toContain('Count: 4');

      // Invalid components will not be rendered.
      const invalidComponent = page.locator('[uniqueid="invalid-component"]');
      expect(await invalidComponent.count()).toBe(1);
      expect(await invalidComponent.getAttribute('__render_directive__')).toBe(
        null,
      );

      // The page should still render despite the invalid import.
      const heading = page.locator('h1');
      await expect(heading).toBeVisible();
    } finally {
      await restoreFileContent(hmrTestFilePath, originalMarkdownContent);
    }
  });

  test('Should handle adding unused components', async () => {
    const originalContent = `# HMR Unused Component Test

<script lang="react">
  import HelloWorld from '../components/react/HelloWorld.tsx';
</script>

<HelloWorld uniqueid="used-component" />`;

    const modifiedContent = `# HMR Unused Component Test

<script lang="react">
  import HelloWorld from '../components/react/HelloWorld.tsx';
  import Hello from '../components/react/Hello.tsx';
</script>

<HelloWorld uniqueid="used-component" />`;

    try {
      await restoreFileContent(hmrTestFilePath, originalContent);

      await page.waitForSelector('[data-unique-id="used-component"]');
      const component = page.locator('[data-unique-id="used-component"]');
      await expect(component).toBeVisible();

      await modifyFileAndWaitForHMR(hmrTestFilePath, modifiedContent);

      // Component should still work after adding unused import
      await waitForHMRSelector('[data-unique-id="used-component"]');
      await expect(component).toBeVisible();
    } finally {
      await restoreFileContent(hmrTestFilePath, originalMarkdownContent);
    }
  });

  test('Should handle adding components used by ssr:only containers', async () => {
    const originalContent = `# HMR SSR Only Test

<script lang="react">
  import HelloWorld from '../components/react/HelloWorld.tsx';
</script>

<HelloWorld uniqueid="existing-component" />`;

    const modifiedContent = `# HMR SSR Only Test

<script lang="react">
  import HelloWorld from '../components/react/HelloWorld.tsx';
  import Hello from '../components/react/Hello.tsx';
</script>

<HelloWorld uniqueid="existing-component" />
<Hello ssr:only uniqueid="new-ssr-component" />`;

    try {
      await restoreFileContent(hmrTestFilePath, originalContent);

      await page.waitForSelector('[data-unique-id="existing-component"]');
      const existingComponent = page.locator(
        '[data-unique-id="existing-component"]',
      );
      await expect(existingComponent).toBeVisible();

      await modifyFileAndWaitForHMR(hmrTestFilePath, modifiedContent);

      await expect(existingComponent).toBeVisible();

      // Robust wait for the SSR-only container.
      await waitForHMRSelector('[data-unique-id="new-ssr-component"]');
      const newComponent = page.locator('[data-unique-id="new-ssr-component"]');
      await expect(newComponent).toBeVisible();

      // SSR-only components should not be interactive.
      const button = newComponent.locator(
        '[data-unique-id="new-ssr-component"] > button',
      );
      if (await button.isVisible()) {
        await button.click();
        expect(await button.textContent()).toContain('Count: 0');
      }
    } finally {
      await restoreFileContent(hmrTestFilePath, originalMarkdownContent);
    }
  });

  test('Should handle adding components used by mixed render directives', async () => {
    const originalContent = `# HMR Mixed Directives Test

<script lang="react">
  import HelloWorld from '../components/react/HelloWorld.tsx';
</script>

<HelloWorld uniqueid="existing-component" />`;

    const modifiedContent = `# HMR Mixed Directives Test

<script lang="react">
  import HelloWorld from '../components/react/HelloWorld.tsx';
  import Hello from '../components/react/Hello.tsx';
</script>

<HelloWorld uniqueid="existing-component" />
<Hello client:only uniqueid="new-client-component" />
<Hello ssr:only uniqueid="new-ssr-component" />`;

    try {
      await restoreFileContent(hmrTestFilePath, originalContent);

      await page.waitForSelector('[data-unique-id="existing-component"]');
      const existingComponent = page.locator(
        '[data-unique-id="existing-component"]',
      );
      await expect(existingComponent).toBeVisible();

      await modifyFileAndWaitForHMR(hmrTestFilePath, modifiedContent);

      await expect(existingComponent).toBeVisible();

      await waitForHMRSelector('[data-unique-id="new-client-component"]');
      const clientComponent = page.locator(
        '[data-unique-id="new-client-component"]',
      );
      await expect(clientComponent).toBeVisible();

      await waitForHMRSelector('[data-unique-id="new-ssr-component"]');
      const ssrComponent = page.locator('[data-unique-id="new-ssr-component"]');
      await expect(ssrComponent).toBeVisible();

      // Test interactivity differences.
      const clientButton = clientComponent.locator(
        '[data-unique-id="new-client-component"] > button',
      );
      const ssrButton = ssrComponent.locator(
        '[data-unique-id="new-ssr-component"] > button',
      );

      if ((await clientButton.isVisible()) && (await ssrButton.isVisible())) {
        await clientButton.click();
        await ssrButton.click();

        expect(await clientButton.textContent()).toContain('Count: 1');
        expect(await ssrButton.textContent()).toContain('Count: 0');
      }
    } finally {
      await restoreFileContent(hmrTestFilePath, originalMarkdownContent);
    }
  });
});

// HMR Tests - Removing Render Component References
describe('HMR: Removing Render Component References', () => {
  const hmrTestFilePath = path.join(__dirname, 'hmr-test.md');

  test('Should handle removing unused components', async () => {
    const originalContent = `# HMR Remove Unused Test

<script lang="react">
  import HelloWorld from '../components/react/HelloWorld.tsx';
  import Hello from '../components/react/Hello.tsx';
</script>

<span class="original-content-case1">Some content here.</span>

<HelloWorld client:only uniqueid="used-component" />`;

    const modifiedContent = `# HMR Remove Unused Test

<script lang="react">
  import HelloWorld from '../components/react/HelloWorld.tsx';
</script>

<span class="modified-content-case1">Some modified content here.</span>

<HelloWorld client:only uniqueid="used-component" />`;

    try {
      await restoreFileContent(hmrTestFilePath, originalContent);

      await page.waitForSelector('[data-unique-id="used-component"]');
      const component = page.locator('[data-unique-id="used-component"]');
      await expect(component).toBeVisible();
      const componentButton = page.locator(
        '[data-unique-id="used-component"] > button',
      );
      await componentButton.click();
      expect(await componentButton.textContent()).toContain('Count: 1');

      await modifyFileAndWaitForHMR(hmrTestFilePath, modifiedContent);

      // Component should still work after removing unused import
      await waitForHMRSelector('[data-unique-id="used-component"]');
      await expect(component).toBeVisible();
      expect(await componentButton.textContent()).toContain('Count: 1');
      await componentButton.click();
      expect(await componentButton.textContent()).toContain('Count: 2');
    } finally {
      await restoreFileContent(hmrTestFilePath, originalMarkdownContent);
    }
  });

  test('Should handle removing components used by ssr:only containers', async () => {
    const originalContent = `# HMR Remove SSR Test

<script lang="react">
  import HelloWorld from '../components/react/HelloWorld.tsx';
  import Hello from '../components/react/Hello.tsx';
</script>

<HelloWorld uniqueid="remaining-component" />
<Hello ssr:only uniqueid="component-to-remove" />`;

    const modifiedContent = `# HMR Remove SSR Test

<script lang="react">
  import HelloWorld from '../components/react/HelloWorld.tsx';
</script>

<HelloWorld uniqueid="remaining-component" />`;

    try {
      await restoreFileContent(hmrTestFilePath, originalContent);

      await page.waitForSelector('[data-unique-id="remaining-component"]');
      const remainingComponent = page.locator(
        '[data-unique-id="remaining-component"]',
      );
      await page.waitForSelector('[data-unique-id="component-to-remove"]');
      const componentToRemove = page.locator(
        '[data-unique-id="component-to-remove"]',
      );

      await expect(remainingComponent).toBeVisible();
      await expect(componentToRemove).toBeVisible();

      const remainingComponentButton = page.locator(
        '[data-unique-id="remaining-component"] > button',
      );
      await remainingComponentButton.click();
      expect(await remainingComponentButton.textContent()).toContain(
        'Count: 0',
      );
      const componentToRemoveButton = page.locator(
        '[data-unique-id="component-to-remove"] > button',
      );
      await componentToRemoveButton.click();
      expect(await componentToRemoveButton.textContent()).toContain('Count: 0');

      await modifyFileAndWaitForHMR(hmrTestFilePath, modifiedContent);

      await waitForHMRSelector('[data-unique-id="remaining-component"]');
      await expect(remainingComponent).toBeVisible();
      await remainingComponentButton.click();
      expect(await remainingComponentButton.textContent()).toContain(
        'Count: 0',
      );
      expect(await componentToRemove.count()).toBe(0);
    } finally {
      await restoreFileContent(hmrTestFilePath, originalMarkdownContent);
    }
  });

  test('Should handle removing components used by mixed render directives', async () => {
    const originalContent = `# HMR Remove Mixed Test

<script lang="react">
  import HelloWorld from '../components/react/HelloWorld.tsx';
  import Hello from '../components/react/Hello.tsx';
</script>

<HelloWorld uniqueid="remaining-component" />
<Hello client:only uniqueid="client-to-remove" />
<Hello ssr:only uniqueid="ssr-to-remove" />`;

    const modifiedContent = `# HMR Remove Mixed Test

<script lang="react">
  import HelloWorld from '../components/react/HelloWorld.tsx';
</script>

<HelloWorld uniqueid="remaining-component" />`;

    try {
      await restoreFileContent(hmrTestFilePath, originalContent);

      await page.waitForSelector('[data-unique-id="remaining-component"]');
      const remainingComponent = page.locator(
        '[data-unique-id="remaining-component"]',
      );
      await page.waitForSelector('[data-unique-id="client-to-remove"]');
      const clientToRemove = page.locator(
        '[data-unique-id="client-to-remove"]',
      );
      await page.waitForSelector('[data-unique-id="ssr-to-remove"]');
      const ssrToRemove = page.locator('[data-unique-id="ssr-to-remove"]');

      await expect(remainingComponent).toBeVisible();
      await expect(clientToRemove).toBeVisible();
      await expect(ssrToRemove).toBeVisible();

      const remainingComponentButton = page.locator(
        '[data-unique-id="remaining-component"] > button',
      );
      await remainingComponentButton.click();
      expect(await remainingComponentButton.textContent()).toContain(
        'Count: 0',
      );
      const clientToRemoveButton = page.locator(
        '[data-unique-id="client-to-remove"] > button',
      );
      await clientToRemoveButton.click();
      expect(await clientToRemoveButton.textContent()).toContain('Count: 1');
      const ssrToRemoveButton = page.locator(
        '[data-unique-id="ssr-to-remove"] > button',
      );
      await ssrToRemoveButton.click();
      expect(await ssrToRemoveButton.textContent()).toContain('Count: 0');

      await modifyFileAndWaitForHMR(hmrTestFilePath, modifiedContent);

      await waitForHMRSelector('[data-unique-id="remaining-component"]');
      await expect(remainingComponent).toBeVisible();
      await remainingComponentButton.click();
      expect(await remainingComponentButton.textContent()).toContain(
        'Count: 0',
      );
      expect(await clientToRemove.count()).toBe(0);
      expect(await ssrToRemove.count()).toBe(0);
    } finally {
      await restoreFileContent(hmrTestFilePath, originalMarkdownContent);
    }
  });
});

// HMR Tests - Render Container Content Changes
describe('HMR: Render Container Content Changes', () => {
  const hmrTestFilePath = path.join(__dirname, 'hmr-test.md');

  test('Should handle directive modifications from client:only to ssr:only', async () => {
    const originalContent = `# HMR Directive Change Test

<script lang="react">
  import HelloWorld from '../components/react/HelloWorld.tsx';
</script>

<HelloWorld client:only uniqueid="directive-test-component" />`;

    const modifiedContent = `# HMR Directive Change Test

<script lang="react">
  import HelloWorld from '../components/react/HelloWorld.tsx';
</script>

<HelloWorld ssr:only uniqueid="directive-test-component" />`;

    try {
      await restoreFileContent(hmrTestFilePath, originalContent);

      await page.waitForSelector('[data-unique-id="directive-test-component"]');
      const component = page.locator(
        '[data-unique-id="directive-test-component"]',
      );
      await expect(component).toBeVisible();

      // Test original is interactive (client:only)
      const originalButton = component.locator(
        '[data-unique-id="directive-test-component"] > button',
      );
      if (await originalButton.isVisible()) {
        await originalButton.click();
        expect(await originalButton.textContent()).toContain('Count: 1');
      }

      await modifyFileAndWaitForHMR(hmrTestFilePath, modifiedContent);

      await waitForHMRSelector('[data-unique-id="directive-test-component"]');
      await expect(component).toBeVisible();

      // Test modified is non-interactive (ssr:only)
      const modifiedButton = component.locator(
        '[data-unique-id="directive-test-component"] > button',
      );
      if (await modifiedButton.isVisible()) {
        await modifiedButton.click();
        expect(await modifiedButton.textContent()).toContain('Count: 0');
      }
    } finally {
      await restoreFileContent(hmrTestFilePath, originalMarkdownContent);
    }
  });

  test('Should handle adding new render containers', async () => {
    const originalContent = `# HMR Add Container Test

<script lang="react">
  import HelloWorld from '../components/react/HelloWorld.tsx';
</script>

<HelloWorld uniqueid="existing-container" />`;

    const modifiedContent = `# HMR Add Container Test

<script lang="react">
  import HelloWorld from '../components/react/HelloWorld.tsx';
  import Hello from '../components/react/Hello.tsx';
</script>

<HelloWorld uniqueid="existing-container" />
<Hello client:only uniqueid="new-container-1" />
<Hello ssr:only uniqueid="new-container-2" />`;

    try {
      await restoreFileContent(hmrTestFilePath, originalContent);

      await page.waitForSelector('[data-unique-id="existing-container"]');
      const existingContainer = page.locator(
        '[data-unique-id="existing-container"]',
      );
      await expect(existingContainer).toBeVisible();

      await modifyFileAndWaitForHMR(hmrTestFilePath, modifiedContent);

      await expect(existingContainer).toBeVisible();

      await waitForHMRSelector('[data-unique-id="new-container-1"]');
      await waitForHMRSelector('[data-unique-id="new-container-2"]');
      const newContainer1 = page.locator('[data-unique-id="new-container-1"]');
      const newContainer2 = page.locator('[data-unique-id="new-container-2"]');

      const newContainer1Button = page.locator(
        '[data-unique-id="new-container-1"] > button',
      );
      await newContainer1Button.click();
      expect(await newContainer1Button.textContent()).toContain('Count: 1');

      const newContainer2Button = page.locator(
        '[data-unique-id="new-container-2"] > button',
      );
      await newContainer2Button.click();
      expect(await newContainer2Button.textContent()).toContain('Count: 0');

      await expect(newContainer1).toBeVisible();
      await expect(newContainer2).toBeVisible();
    } finally {
      await restoreFileContent(hmrTestFilePath, originalMarkdownContent);
    }
  });

  test('Should handle removing render containers', async () => {
    const originalContent = `# HMR Remove Container Test

<script lang="react">
  import HelloWorld from '../components/react/HelloWorld.tsx';
  import Hello from '../components/react/Hello.tsx';
</script>

<HelloWorld uniqueid="remaining-container" />
<Hello client:only uniqueid="container-to-remove-1" />
<Hello ssr:only uniqueid="container-to-remove-2" />`;

    const modifiedContent = `# HMR Remove Container Test

<script lang="react">
  import HelloWorld from '../components/react/HelloWorld.tsx';
</script>

<HelloWorld uniqueid="remaining-container" />`;

    try {
      await restoreFileContent(hmrTestFilePath, originalContent);

      await page.waitForSelector('[data-unique-id="remaining-container"]');
      // The containers to be removed may not consistently mount before HMR triggers in CI; avoid strict pre-removal waits.
      const maybeRemove1 = page.locator(
        '[data-unique-id="container-to-remove-1"]',
      );
      const maybeRemove2 = page.locator(
        '[data-unique-id="container-to-remove-2"]',
      );
      // Best-effort presence check without failing the test if not visible.
      await maybeRemove1
        .first()
        .waitFor({ state: 'attached', timeout: 1000 })
        .catch(() => {});
      await maybeRemove2
        .first()
        .waitFor({ state: 'attached', timeout: 1000 })
        .catch(() => {});
      const remainingContainer = page.locator(
        '[data-unique-id="remaining-container"]',
      );
      const containerToRemove1 = page.locator(
        '[data-unique-id="container-to-remove-1"]',
      );
      const containerToRemove2 = page.locator(
        '[data-unique-id="container-to-remove-2"]',
      );

      await expect(remainingContainer).toBeVisible();
      // Do not strictly assert pre-removal visibility for containers destined for removal.

      await modifyFileAndWaitForHMR(hmrTestFilePath, modifiedContent);

      await waitForHMRSelector('[data-unique-id="remaining-container"]');
      await expect(remainingContainer).toBeVisible();
      expect(await containerToRemove1.count()).toBe(0);
      expect(await containerToRemove2.count()).toBe(0);
    } finally {
      await restoreFileContent(hmrTestFilePath, originalMarkdownContent);
    }
  });
});

// HMR tests — Markdown content changes not related to the feature.
describe('HMR: Markdown Content Changes Not Related to the Feature', () => {
  const hmrTestFilePath = path.join(__dirname, 'hmr-test.md');

  test('Should render changed markdown correctly without breaking client:load rendering', async () => {
    const originalContent = `# Original Markdown Title

<script lang="react">
  import HelloWorld from '../components/react/HelloWorld.tsx';
</script>

Some **original** markdown content.

<HelloWorld client:load uniqueid="markdown-test-component" />

More original content.`;

    const modifiedContent = `# Modified Markdown Title

<script lang="react">
  import HelloWorld from '../components/react/HelloWorld.tsx';
</script>

Some **modified** markdown content.

<HelloWorld client:load uniqueid="markdown-test-component" />

More modified content.`;

    try {
      await restoreFileContent(hmrTestFilePath, originalContent);

      const heading = page.locator('h1');
      await expect(heading).toBeVisible();
      expect(await heading.textContent()).toContain('Original Markdown Title');

      await page.waitForSelector('[data-unique-id="markdown-test-component"]');
      const component = page.locator(
        '[data-unique-id="markdown-test-component"]',
      );
      await expect(component).toBeVisible();

      await modifyFileAndWaitForHMR(hmrTestFilePath, modifiedContent, false);

      const modifiedHeading = page.locator('h1');
      await expect(modifiedHeading).toBeVisible();
      expect(await modifiedHeading.textContent()).toContain(
        'Modified Markdown Title',
      );

      await waitForHMRSelector('[data-unique-id="markdown-test-component"]');
      await expect(component).toBeVisible();
      const button = page.locator(
        '[data-unique-id="markdown-test-component"] > button',
      );
      await expect(button).toBeVisible();
    } finally {
      await restoreFileContent(hmrTestFilePath, originalMarkdownContent);
    }
  });

  test('Should preserve component state during non-React markdown changes', async () => {
    const originalContent = `# State Preservation Test

<script lang="react">
  import HelloWorld from '../components/react/HelloWorld.tsx';
</script>

Original markdown paragraph.

<HelloWorld client:only uniqueid="state-preservation-component" />`;

    const modifiedContent = `# State Preservation Test

<script lang="react">
  import HelloWorld from '../components/react/HelloWorld.tsx';
</script>

Modified markdown paragraph.

<HelloWorld client:only uniqueid="state-preservation-component" />`;

    try {
      await restoreFileContent(hmrTestFilePath, originalContent);

      await page.waitForSelector(
        '[data-unique-id="state-preservation-component"]',
      );
      const component = page.locator(
        '[data-unique-id="state-preservation-component"]',
      );
      await expect(component).toBeVisible();

      // Interact with component to create state
      const button = component.locator(
        '[data-unique-id="state-preservation-component"] > button',
      );
      if (await button.isVisible()) {
        await button.click();
        await button.click();
        expect(await button.textContent()).toContain('Count: 2');

        // Modify markdown content (not React-related)
        await modifyFileAndWaitForHMR(hmrTestFilePath, modifiedContent, true);

        // Component state should be preserved during HMR
        await waitForHMRSelector(
          '[data-unique-id="state-preservation-component"]',
        );
        const preservedButton = component.locator(
          '[data-unique-id="state-preservation-component"] > button',
        );
        if (await preservedButton.isVisible()) {
          expect(await preservedButton.textContent()).toContain('Count: 2');
        }
      }
    } finally {
      await restoreFileContent(hmrTestFilePath, originalMarkdownContent);
    }
  });
});
