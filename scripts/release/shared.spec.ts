import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createReleasePlanFromVersionSelection } from './changelog';
import {
  compareVersions,
  isValidVersion,
  type ResolvedReleasePackageConfig,
  selectPreviousGitTag,
  sortTagsByVersion,
} from './shared';

function releaseConfig(version: string): ResolvedReleasePackageConfig {
  return {
    key: 'limina',
    packageName: 'limina',
    tagPrefix: 'limina',
    relativeDir: 'packages/limina',
    publishRelativeDir: 'packages/limina/dist',
    changelogRelativePath: 'CHANGELOG.md',
    changelogPaths: [],
    previewChecks: [],
    packageDir: '.',
    publishDir: '.',
    changelogPath: 'CHANGELOG.md',
    manifestPath: 'package.json',
    manifest: { name: 'limina', version },
  };
}

function plan(from: string, to: string) {
  return createReleasePlanFromVersionSelection(releaseConfig(from), {
    mode: 'custom',
    version: to,
  });
}

describe('release version precedence', () => {
  it('compares numeric prerelease identifiers numerically at every depth', () => {
    for (const [before, after] of [
      ['1.0.0-beta.9', '1.0.0-beta.10'],
      ['1.0.0-2', '1.0.0-10'],
      ['1.0.0-beta.1.9', '1.0.0-beta.1.10'],
    ]) {
      assert.ok(compareVersions(before!, after!) < 0);
      assert.ok(compareVersions(after!, before!) > 0);
    }
  });
  it('respects identifier kind, lexical order, prefix and stable precedence', () => {
    const versions = [
      '1.0.0-1',
      '1.0.0-alpha',
      '1.0.0-alpha.1',
      '1.0.0-alpha.beta',
      '1.0.0-beta',
      '1.0.0-beta.2',
      '1.0.0-beta.11',
      '1.0.0-rc.1',
      '1.0.0',
    ];
    for (let index = 1; index < versions.length; index++)
      assert.ok(compareVersions(versions[index - 1]!, versions[index]!) < 0);
    assert.equal(compareVersions('1.0.0-beta.10', '1.0.0-beta.10'), 0);
  });
  it('accepts numeric prerelease upgrades and rejects downgrades and equality', () => {
    assert.equal(
      plan('1.0.0-beta.9', '1.0.0-beta.10').newVersion,
      '1.0.0-beta.10',
    );
    assert.equal(plan('1.0.0-beta.10', '1.0.0').gitTag, 'limina/v1.0.0');
    assert.throws(
      () => plan('1.0.0-beta.10', '1.0.0-beta.2'),
      /must be greater/u,
    );
    assert.throws(
      () => plan('1.0.0-beta.10', '1.0.0-beta.10'),
      /must be greater/u,
    );
    assert.throws(() => plan('1.0.1', '1.0.0'), /must be greater/u);
  });
  it('selects the newest package tag and retains the legacy fallback', () => {
    const tags = ['limina/v1.0.0-beta.9', 'limina/v1.0.0-beta.10'];
    assert.equal(
      selectPreviousGitTag({ tagPrefix: 'limina', legacyTagPrefix: 'v' }, [
        ...tags,
        'other/v9.0.0',
        'v2.0.0',
      ]),
      tags[1],
    );
    assert.deepEqual(sortTagsByVersion(tags.toReversed()), [tags[1], tags[0]]);
    assert.equal(
      selectPreviousGitTag({ tagPrefix: 'limina', legacyTagPrefix: 'v' }, [
        'v1.0.0-2',
        'v1.0.0-10',
      ]),
      'v1.0.0-10',
    );
  });
  it('retains the existing input format and tag construction', () => {
    assert.equal(isValidVersion('v1.0.0'), false);
    assert.equal(isValidVersion('1.0.0+metadata'), false);
    assert.throws(
      () => compareVersions('v1.0.0', '1.0.0'),
      /Invalid version format/u,
    );
    assert.equal(plan('1.0.0', '1.0.1').gitTag, 'limina/v1.0.1');
  });
});
