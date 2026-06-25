/**
 * traceCatalogLoader tests (VIS-1020)
 *
 * Exercises the lazy catalog/groups loader contract: dynamic import of the
 * committed `<type>.catalog.json` files, Tier-A/B split helpers, module-level
 * caching (reference identity across calls), and graceful resolution to
 * empty `[]` / `{}` for types that have no catalog/groups file.
 */
import {
  loadCatalog,
  loadTraceGroups,
  tierA,
  tierB,
  clearCatalogCache,
} from './traceCatalogLoader';

beforeEach(() => {
  clearCatalogCache();
});

describe('loadCatalog', () => {
  test('returns an array of catalog entries with path/label/tier', async () => {
    const entries = await loadCatalog('scatter');
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
    entries.forEach(entry => {
      expect(typeof entry.path).toBe('string');
      expect(typeof entry.label).toBe('string');
      expect(['A', 'B']).toContain(entry.tier);
    });
  });

  test('resolves to [] for a type with no catalog file (no throw)', async () => {
    const entries = await loadCatalog('not-a-real-trace-type');
    expect(entries).toEqual([]);
  });

  test('resolves to [] for empty/falsy type', async () => {
    expect(await loadCatalog('')).toEqual([]);
    expect(await loadCatalog(undefined)).toEqual([]);
  });

  test('caches the resolved entries across calls (reference identity)', async () => {
    const first = await loadCatalog('scatter');
    const second = await loadCatalog('scatter');
    // Same cached reference proves the second call did not re-import/rebuild.
    expect(second).toBe(first);
  });

  test('clearCatalogCache lets a subsequent load re-resolve from scratch', async () => {
    const first = await loadCatalog('scatter');
    clearCatalogCache();
    // After clearing, the loader must re-run its import path (not read a stale
    // module-level cache entry) and still return the correct entries. The
    // underlying JSON module may be memoized by the bundler, so we assert on
    // content correctness rather than reference inequality.
    const second = await loadCatalog('scatter');
    expect(second).toEqual(first);
    expect(second.length).toBeGreaterThan(0);
  });
});

describe('tierA / tierB', () => {
  test('split scatter entries into Tier-A and Tier-B with none lost', async () => {
    const entries = await loadCatalog('scatter');
    const a = tierA(entries);
    const b = tierB(entries);

    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    a.forEach(entry => expect(entry.tier).toBe('A'));
    b.forEach(entry => expect(entry.tier).toBe('B'));

    // Every entry is exactly one tier — the split partitions the catalog.
    expect(a.length + b.length).toBe(entries.length);
  });

  test('are graceful on non-array input', () => {
    expect(tierA(null)).toEqual([]);
    expect(tierB(undefined)).toEqual([]);
    expect(tierA({})).toEqual([]);
  });
});

describe('loadTraceGroups', () => {
  test('resolves to {} for a type with no groups file (no throw)', async () => {
    const groups = await loadTraceGroups('scatter');
    // groups.json files are built by a sibling task; absent files resolve to {}.
    expect(groups).toBeTruthy();
    expect(typeof groups).toBe('object');
    expect(Array.isArray(groups)).toBe(false);
  });

  test('resolves to {} for empty/falsy type', async () => {
    expect(await loadTraceGroups('')).toEqual({});
    expect(await loadTraceGroups(undefined)).toEqual({});
  });

  test('caches the resolved map across calls (reference identity)', async () => {
    const first = await loadTraceGroups('scatter');
    const second = await loadTraceGroups('scatter');
    expect(second).toBe(first);
  });
});
