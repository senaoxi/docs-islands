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
      'graph/access-denied-import-dependency',
      'graph/access-denied-reference',
      'graph/condition-domain-mismatch',
      'graph/condition-domain-reference-mismatch',
      'graph/config-invalid-condition-domain',
      'graph/config-invalid-condition-domain-entry',
      'graph/config-invalid-rule',
      'graph/config-invalid-workspace-export',
      'graph/import-target-unmapped',
      'graph/reference-cycle-mutual',
      'graph/workspace-import-missing-type-entry',
      'graph/workspace-import-outside-graph',
      'graph/workspace-import-unresolved',
      'proof/coverage-missing',
      'proof/coverage-valid',
      'workspace/output-cycle-mutual',
      'workspace/output-cycle-self',
      'workspace/output-root-canonical-alias',
      'workspace/output-root-repository',
      'workspace/package-identity-conflict',
      'workspace/region-overlap',
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
