import { writeFile } from 'node:fs/promises';
import { expect, test } from './consumer.fixtures';
import {
  CONSUMER_SMOKE_ROUTE,
  createSmokeArtifactPath,
  formatUnknownError,
  renderConsumerFailureDetails,
  watchPageRuntime,
} from './helpers';

test('consumer fixture renders and hydrates a React island', async ({
  annotate,
  consumerServer,
  page,
  task,
}) => {
  const runtime = watchPageRuntime(page);
  const tracing = page.context().tracing;
  let traceStopped = false;

  await tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });

  try {
    await page.goto(`http://127.0.0.1:${consumerServer.port}/`, {
      waitUntil: 'domcontentloaded',
    });

    const smokeLink = page.getByRole('link', {
      name: 'Open consumer smoke page',
    });
    await smokeLink.waitFor({
      state: 'visible',
      timeout: 15_000,
    });
    await Promise.all([
      page.waitForURL((url) => {
        return (
          url.pathname === CONSUMER_SMOKE_ROUTE ||
          url.pathname === `${CONSUMER_SMOKE_ROUTE}.html`
        );
      }),
      smokeLink.click(),
    ]);

    const button = page.locator('[data-testid="counter-button"]');
    const component = page.locator('[data-testid="hello-world"]');

    await component.waitFor({
      state: 'visible',
      timeout: 15_000,
    });
    await button.waitFor({
      state: 'visible',
      timeout: 15_000,
    });
    await button.click();
    await expect
      .poll(async () => await button.textContent(), {
        timeout: 15_000,
      })
      .toContain('Count: 1');
    runtime.assertClean();
  } catch (error) {
    const details = await renderConsumerFailureDetails(page, runtime);
    const diagnosticFailures: string[] = [];
    const smokeAttachments: {
      contentType: string;
      name: string;
      path: string;
    }[] = [];

    const debugPath = await createSmokeArtifactPath(
      `consumer-${Date.now()}.debug.txt`,
    );
    await writeFile(debugPath, details, 'utf8')
      .then(async () => {
        await annotate('consumer-debug-details', {
          contentType: 'text/plain',
          path: debugPath,
        });
        smokeAttachments.push({
          contentType: 'text/plain',
          name: 'consumer-debug-details',
          path: debugPath,
        });
      })
      .catch((debugError: unknown) => {
        diagnosticFailures.push(
          `debug capture failed: ${formatUnknownError(debugError)}`,
        );
      });

    const screenshotPath = await createSmokeArtifactPath(
      `consumer-${Date.now()}.screenshot.png`,
    );
    await page
      .screenshot({
        fullPage: true,
        path: screenshotPath,
      })
      .then(async () => {
        await annotate('consumer-screenshot', {
          contentType: 'image/png',
          path: screenshotPath,
        });
        smokeAttachments.push({
          contentType: 'image/png',
          name: 'consumer-screenshot',
          path: screenshotPath,
        });
      })
      .catch((screenshotError: unknown) => {
        diagnosticFailures.push(
          `screenshot capture failed: ${formatUnknownError(screenshotError)}`,
        );
      });

    const tracePath = await createSmokeArtifactPath(
      `consumer-${Date.now()}.trace.zip`,
    );
    await tracing
      .stop({
        path: tracePath,
      })
      .then(async () => {
        traceStopped = true;
        await annotate('consumer-trace', {
          contentType: 'application/zip',
          path: tracePath,
        });
        smokeAttachments.push({
          contentType: 'application/zip',
          name: 'consumer-trace',
          path: tracePath,
        });
      })
      .catch((traceError: unknown) => {
        diagnosticFailures.push(
          `trace capture failed: ${formatUnknownError(traceError)}`,
        );
      });

    Object.assign(task.meta, {
      smokeAttachments,
    });

    throw new Error(
      [
        formatUnknownError(error),
        details,
        diagnosticFailures.length > 0
          ? `diagnostic failures:\n${diagnosticFailures.join('\n')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n')
        .trim(),
    );
  } finally {
    if (!traceStopped) {
      await tracing.stop().catch(() => null);
    }
    runtime.detach();
  }
});
