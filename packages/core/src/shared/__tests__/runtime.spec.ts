/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  GET_CLEAN_PATHNAME_RUNTIME,
  getCleanPathname,
  normalizeCleanPathname,
} from '../runtime';

describe('core shared runtime helpers', () => {
  const runtimeGlobals = globalThis as typeof globalThis & {
    __BASE__?: string;
    __CLEAN_URLS__?: boolean;
  };
  const originalLocation = globalThis.location;
  const originalBase = runtimeGlobals.__BASE__;
  const originalCleanUrls = runtimeGlobals.__CLEAN_URLS__;

  beforeEach(() => {
    Object.defineProperty(globalThis, 'location', {
      writable: true,
      value: {
        pathname: '/',
      },
    });

    Object.defineProperty(globalThis, '__BASE__', {
      configurable: true,
      writable: true,
      value: undefined,
    });

    Object.defineProperty(globalThis, '__CLEAN_URLS__', {
      configurable: true,
      writable: true,
      value: undefined,
    });
  });

  afterEach(() => {
    globalThis.location = originalLocation;
    Object.defineProperty(globalThis, '__BASE__', {
      configurable: true,
      writable: true,
      value: originalBase,
    });
    Object.defineProperty(globalThis, '__CLEAN_URLS__', {
      configurable: true,
      writable: true,
      value: originalCleanUrls,
    });
  });

  it('normalizes pathnames with base stripping and clean urls', () => {
    expect(
      normalizeCleanPathname('/docs/guide/test.html', {
        base: '/docs/',
        cleanUrls: true,
      }),
    ).toBe('/guide/test');
  });

  it('uses injected values in the runtime helper', () => {
    globalThis.location.pathname = '/docs/guide/test.html';

    expect(GET_CLEAN_PATHNAME_RUNTIME('/docs/', true)).toBe('/guide/test');
  });

  it('falls back to define-time globals when injected values are omitted', () => {
    runtimeGlobals.__BASE__ = '/docs/';
    runtimeGlobals.__CLEAN_URLS__ = true;
    globalThis.location.pathname = '/docs/guide/test.html';

    expect(getCleanPathname()).toBe('/guide/test');
  });

  it('keeps malformed encoded pathnames from throwing', () => {
    globalThis.location.pathname = '/guide/%E0%A4%A';

    expect(() => getCleanPathname()).not.toThrow();
  });
});
