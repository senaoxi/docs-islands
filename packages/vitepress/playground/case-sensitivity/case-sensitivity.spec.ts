import { expect } from '@playwright/test';

describe('Case Sensitivity', () => {
  describe('PascalCase Component Matching', () => {
    test('Should render component when tag name exactly matches imported PascalCase name', async () => {
      await goto('/case-sensitivity/correct-pascal-case');

      const heading = page.locator('h1');
      await expect(heading).toBeVisible();
      expect(await heading.textContent()).toContain(
        'Case Sensitivity - Correct PascalCase',
      );

      // The component should render successfully with the exact PascalCase match.
      const component = page.locator('[data-testid="hello-world"]');
      await expect(component).toBeVisible();
    });

    test('Should NOT render component when tag name is all-uppercase', async () => {
      await goto('/case-sensitivity/wrong-case-variants');

      const heading = page.locator('h1');
      await expect(heading).toBeVisible();
      expect(await heading.textContent()).toContain(
        'Case Sensitivity - Wrong Case Variants',
      );

      // HELLOWORLD does not match HelloWorld — no React component should render.
      const component = page.locator('[data-testid="hello-world"]');
      await expect(component).toHaveCount(0);

      // The raw tag text should remain in the page as-is (not transformed).
      const content = page.locator('.vp-doc');
      await expect(content).toBeVisible();
    });
  });

  describe('Attribute Case Preservation', () => {
    test('Should render component with camelCase attributes correctly', async () => {
      await goto('/case-sensitivity/camel-case-attrs');

      // The component should render successfully, proving camelCase attributes
      // were correctly parsed and passed through the build pipeline.
      const component = page.locator('[data-testid="hello-world"]');
      await expect(component).toBeVisible();

      // Verify the wrapper div has the custom attributes.
      // HTML DOM lowercases attribute names, but the values must be preserved.
      const wrapper = page.locator('[customprop="camel-test"]');
      await expect(wrapper).toBeVisible();
      await expect(page.locator('[datavalue="preserved"]')).toBeVisible();
    });
  });

  describe('Multiple Component Distinction', () => {
    test('Should correctly distinguish and render two PascalCase components', async () => {
      await goto('/case-sensitivity/multiple-components');

      const heading = page.locator('h1');
      await expect(heading).toBeVisible();

      // Both components should render with their respective identifiers.
      const helloWorld = page.locator(
        '[data-testid="hello-world"][data-unique-id="multi-hello-world"]',
      );
      await expect(helloWorld).toBeVisible();

      const hello = page.locator(
        '[data-testid="hello"][data-unique-id="multi-hello"]',
      );
      await expect(hello).toBeVisible();
    });
  });
});
