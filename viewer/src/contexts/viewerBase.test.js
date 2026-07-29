import { setViewerBase, getViewerBase, viewerPath } from './viewerBase';

afterEach(() => setViewerBase(''));

describe('viewerBase', () => {
  test('defaults to a root mount, so Studio is unaffected', () => {
    expect(getViewerBase()).toBe('');
    expect(viewerPath('/workspace')).toBe('/workspace');
  });

  test('rebases root-absolute viewer paths under the mount', () => {
    setViewerBase('/acme/production/analytics');
    expect(viewerPath('/workspace')).toBe('/acme/production/analytics/workspace');
    expect(viewerPath('/explorer?create=model')).toBe(
      '/acme/production/analytics/explorer?create=model'
    );
  });

  test('is idempotent — an already-based path passes through', () => {
    // Matters because call sites get converted piecemeal: one that rebases a
    // value its caller already rebased must not double the prefix.
    setViewerBase('/acme/production/analytics');
    const once = viewerPath('/workspace');
    expect(viewerPath(once)).toBe(once);
  });

  test('a path that merely starts with the same characters is still rebased', () => {
    setViewerBase('/acme');
    expect(viewerPath('/acmex/workspace')).toBe('/acme/acmex/workspace');
  });

  test('leaves relative paths alone — the router resolves those', () => {
    setViewerBase('/acme/production/analytics');
    expect(viewerPath('workspace')).toBe('workspace');
    expect(viewerPath('../explorer')).toBe('../explorer');
  });

  test('leaves absolute URLs alone — they belong to someone else', () => {
    setViewerBase('/acme/production/analytics');
    expect(viewerPath('https://docs.visivo.io/')).toBe('https://docs.visivo.io/');
  });

  test('trims a trailing slash so either form of base works', () => {
    setViewerBase('/acme/');
    expect(viewerPath('/runs')).toBe('/acme/runs');
  });

  test('treats "/" as a root mount rather than doubling the slash', () => {
    setViewerBase('/');
    expect(viewerPath('/runs')).toBe('/runs');
  });

  test('a non-string base resets to root instead of corrupting every path', () => {
    setViewerBase(undefined);
    expect(viewerPath('/runs')).toBe('/runs');
  });

  test('passes non-string destinations through untouched', () => {
    setViewerBase('/acme');
    expect(viewerPath(-1)).toBe(-1);
    expect(viewerPath(null)).toBe(null);
  });
});
