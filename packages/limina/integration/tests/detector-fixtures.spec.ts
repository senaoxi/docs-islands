/// <reference types="vite/client" />

import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { discoverDetectorFixtures } from '../helpers/detector-fixture-discovery';
import { runDetectorFixture } from '../helpers/detector-fixture-runner';

const detectorRoot = fileURLToPath(
  new URL('../../fixtures/detectors/', import.meta.url),
);
const caseModules = new Map(
  Object.entries(
    import.meta.glob('../../fixtures/detectors/**/case.mts', {
      eager: true,
    }),
  ).map(([specifier, caseModule]) => [
    fileURLToPath(new URL(specifier, import.meta.url)),
    caseModule,
  ]),
);
const detectorFixtures = await discoverDetectorFixtures({
  caseModules,
  detectorRoot,
});

describe('declarative detector fixtures', () => {
  it('discovers the checked-in fixtures in portable order', () => {
    expect(detectorFixtures.map((fixture) => fixture.id)).toEqual([
      'proof/coverage-missing',
      'proof/coverage-valid',
    ]);
  });

  for (const fixture of detectorFixtures) {
    it(fixture.id, async () => {
      const result = await runDetectorFixture(fixture);

      expect(result.fixtureId).toBe(fixture.id);
      expect(result.preserved || result.cleaned).toBe(true);
    });
  }
});
