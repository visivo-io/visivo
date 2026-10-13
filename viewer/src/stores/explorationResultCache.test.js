// Session result cache: key discrimination, invalidation, and LRU bounds.
import {
  explorationResultCacheKey,
  getCachedExplorationResult,
  putCachedExplorationResult,
  invalidateExplorationResults,
  invalidateResultsForSource,
  explorationResultCacheStats,
  _resetExplorationResultCacheForTests,
  _setExplorationResultCacheBoundsForTests,
} from './explorationResultCache';

const SCOPE = {
  explorationId: 'exp-a',
  modelName: 'orders',
  sourceName: 'warehouse',
  sql: 'SELECT 1',
};

const resultOf = (label, rows = 1, cols = 1) => ({
  label,
  columns: Array.from({ length: cols }, (_, i) => `c${i}`),
  rows: Array.from({ length: rows }, (_, i) => ({ i })),
  row_count: rows,
});

beforeEach(() => {
  _resetExplorationResultCacheForTests();
});

describe('the key', () => {
  it('returns a hit for the scope that produced the entry', () => {
    putCachedExplorationResult(SCOPE, resultOf('first'));
    expect(getCachedExplorationResult(SCOPE)?.label).toBe('first');
  });

  it('MISSES after the query is edited', () => {
    putCachedExplorationResult(SCOPE, resultOf('first'));
    expect(getCachedExplorationResult({ ...SCOPE, sql: 'SELECT 2' })).toBeNull();
    expect(getCachedExplorationResult(SCOPE)?.label).toBe('first');
  });

  it('MISSES on a whitespace-only edit inside the query', () => {
    putCachedExplorationResult(SCOPE, resultOf('first'));
    expect(getCachedExplorationResult({ ...SCOPE, sql: 'SELECT  1' })).toBeNull();
  });

  it('ignores leading/trailing whitespace, matching what SQLEditor sends', () => {
    // handleRun executes queryText.trim(), so the stored key is trimmed; the tab buffer is not.
    putCachedExplorationResult(SCOPE, resultOf('first'));
    expect(getCachedExplorationResult({ ...SCOPE, sql: '  SELECT 1\n' })?.label).toBe('first');
  });

  it('MISSES after the chip is renamed', () => {
    putCachedExplorationResult(SCOPE, resultOf('first'));
    expect(getCachedExplorationResult({ ...SCOPE, modelName: 'orders_2' })).toBeNull();
  });

  it('MISSES after the source is changed', () => {
    putCachedExplorationResult(SCOPE, resultOf('first'));
    expect(getCachedExplorationResult({ ...SCOPE, sourceName: 'other_db' })).toBeNull();
  });

  it('never serves one exploration the rows of another', () => {
    putCachedExplorationResult(SCOPE, resultOf('A rows'));
    putCachedExplorationResult({ ...SCOPE, explorationId: 'exp-b' }, resultOf('B rows'));

    expect(getCachedExplorationResult(SCOPE)?.label).toBe('A rows');
    expect(getCachedExplorationResult({ ...SCOPE, explorationId: 'exp-b' })?.label).toBe('B rows');
  });

  it('cannot be forged by a name containing the separator', () => {
    // The key is JSON-serialised, not string-joined.
    const forged = { ...SCOPE, explorationId: 'exp', modelName: 'a", "b' };
    const honest = { ...SCOPE, explorationId: 'exp', modelName: 'a', sourceName: 'b' };
    expect(explorationResultCacheKey(forged)).not.toBe(explorationResultCacheKey(honest));
  });

  it('is null — caching off — when the scope is incomplete', () => {
    expect(explorationResultCacheKey({ ...SCOPE, explorationId: null })).toBeNull();
    expect(explorationResultCacheKey({ ...SCOPE, modelName: null })).toBeNull();
    expect(explorationResultCacheKey({ ...SCOPE, sourceName: null })).toBeNull();
    expect(explorationResultCacheKey({ ...SCOPE, sql: '   ' })).toBeNull();
    expect(explorationResultCacheKey()).toBeNull();
  });

  it('stores nothing for an incomplete scope, and reads nothing back', () => {
    expect(putCachedExplorationResult({ ...SCOPE, explorationId: null }, resultOf('x'))).toBe(false);
    expect(explorationResultCacheStats().entries).toBe(0);
    expect(getCachedExplorationResult({ ...SCOPE, explorationId: null })).toBeNull();
  });

  it('stores nothing for a missing result', () => {
    expect(putCachedExplorationResult(SCOPE, null)).toBe(false);
    expect(explorationResultCacheStats().entries).toBe(0);
  });
});

describe('re-running', () => {
  it('replaces the entry for the same query', () => {
    putCachedExplorationResult(SCOPE, resultOf('stale'));
    putCachedExplorationResult(SCOPE, resultOf('fresh'));

    expect(getCachedExplorationResult(SCOPE)?.label).toBe('fresh');
    expect(explorationResultCacheStats().entries).toBe(1);
  });

  it('retires the chip’s PREVIOUS query, so reverting the text is a miss', () => {
    putCachedExplorationResult(SCOPE, resultOf('Q1 rows'));
    putCachedExplorationResult({ ...SCOPE, sql: 'SELECT 2' }, resultOf('Q2 rows'));

    expect(getCachedExplorationResult(SCOPE)).toBeNull();
    expect(getCachedExplorationResult({ ...SCOPE, sql: 'SELECT 2' })?.label).toBe('Q2 rows');
    expect(explorationResultCacheStats().entries).toBe(1);
  });

  it('retires only THAT chip’s results, not its neighbours’', () => {
    putCachedExplorationResult(SCOPE, resultOf('orders rows'));
    putCachedExplorationResult({ ...SCOPE, modelName: 'users' }, resultOf('users rows'));
    putCachedExplorationResult({ ...SCOPE, sql: 'SELECT 2' }, resultOf('orders rerun'));

    expect(getCachedExplorationResult({ ...SCOPE, modelName: 'users' })?.label).toBe('users rows');
  });
});

describe('invalidation', () => {
  it('drops one chip’s result and leaves the rest of the exploration alone', () => {
    putCachedExplorationResult(SCOPE, resultOf('orders rows'));
    putCachedExplorationResult({ ...SCOPE, modelName: 'users' }, resultOf('users rows'));

    expect(invalidateExplorationResults('exp-a', 'orders')).toBe(1);
    expect(getCachedExplorationResult(SCOPE)).toBeNull();
    expect(getCachedExplorationResult({ ...SCOPE, modelName: 'users' })?.label).toBe('users rows');
  });

  it('drops a whole exploration when no chip is named', () => {
    putCachedExplorationResult(SCOPE, resultOf('orders rows'));
    putCachedExplorationResult({ ...SCOPE, modelName: 'users' }, resultOf('users rows'));
    putCachedExplorationResult({ ...SCOPE, explorationId: 'exp-b' }, resultOf('B rows'));

    expect(invalidateExplorationResults('exp-a')).toBe(2);
    expect(explorationResultCacheStats().entries).toBe(1);
    expect(getCachedExplorationResult({ ...SCOPE, explorationId: 'exp-b' })?.label).toBe('B rows');
  });

  it('is a no-op without an exploration id', () => {
    putCachedExplorationResult(SCOPE, resultOf('orders rows'));
    expect(invalidateExplorationResults(null)).toBe(0);
    expect(invalidateExplorationResults(undefined, 'orders')).toBe(0);
    expect(explorationResultCacheStats().entries).toBe(1);
  });

  it('gives the freed budget back', () => {
    putCachedExplorationResult(SCOPE, resultOf('big', 100, 4));
    expect(explorationResultCacheStats().cells).toBe(400);
    invalidateExplorationResults('exp-a');
    expect(explorationResultCacheStats().cells).toBe(0);
  });
});

describe('a source whose definition changes', () => {
  it('drops every result it produced, across explorations', () => {
    putCachedExplorationResult(SCOPE, resultOf('from warehouse'));
    putCachedExplorationResult(
      { ...SCOPE, explorationId: 'exp-b', modelName: 'other' },
      resultOf('also from warehouse')
    );
    putCachedExplorationResult(
      { ...SCOPE, modelName: 'untouched', sourceName: 'other_db' },
      resultOf('from other_db')
    );

    expect(invalidateResultsForSource('warehouse')).toBe(2);

    expect(getCachedExplorationResult(SCOPE)).toBeNull();
    expect(
      getCachedExplorationResult({ ...SCOPE, explorationId: 'exp-b', modelName: 'other' })
    ).toBeNull();
    expect(
      getCachedExplorationResult({ ...SCOPE, modelName: 'untouched', sourceName: 'other_db' })?.label
    ).toBe('from other_db');
  });

  it('gives the freed budget back', () => {
    putCachedExplorationResult(SCOPE, resultOf('rows', 10, 3));
    expect(explorationResultCacheStats().cells).toBe(30);
    invalidateResultsForSource('warehouse');
    expect(explorationResultCacheStats().cells).toBe(0);
  });

  it('is a no-op without a source name', () => {
    putCachedExplorationResult(SCOPE, resultOf('rows'));
    expect(invalidateResultsForSource(undefined)).toBe(0);
    expect(invalidateResultsForSource('')).toBe(0);
    expect(getCachedExplorationResult(SCOPE)?.label).toBe('rows');
  });
});

describe('bounds', () => {
  it('evicts the least recently used entry at the shipped entry cap', () => {
    const { maxEntries } = explorationResultCacheStats();
    for (let i = 0; i < maxEntries; i += 1) {
      putCachedExplorationResult({ ...SCOPE, modelName: `chip_${i}` }, resultOf(`rows ${i}`));
    }
    expect(explorationResultCacheStats().entries).toBe(maxEntries);

    putCachedExplorationResult({ ...SCOPE, modelName: 'chip_last' }, resultOf('last'));

    expect(explorationResultCacheStats().entries).toBe(maxEntries);
    expect(getCachedExplorationResult({ ...SCOPE, modelName: 'chip_0' })).toBeNull();
    expect(getCachedExplorationResult({ ...SCOPE, modelName: 'chip_1' })?.label).toBe('rows 1');
    expect(getCachedExplorationResult({ ...SCOPE, modelName: 'chip_last' })?.label).toBe('last');
  });

  it('counts a READ as a use, so the tab you keep returning to survives', () => {
    _setExplorationResultCacheBoundsForTests({ maxEntries: 2 });
    putCachedExplorationResult({ ...SCOPE, modelName: 'a' }, resultOf('a'));
    putCachedExplorationResult({ ...SCOPE, modelName: 'b' }, resultOf('b'));

    // Reading 'a' refreshes its recency.
    expect(getCachedExplorationResult({ ...SCOPE, modelName: 'a' })?.label).toBe('a');

    putCachedExplorationResult({ ...SCOPE, modelName: 'c' }, resultOf('c'));

    expect(getCachedExplorationResult({ ...SCOPE, modelName: 'a' })?.label).toBe('a');
    expect(getCachedExplorationResult({ ...SCOPE, modelName: 'b' })).toBeNull();
  });

  it('evicts on the cell budget as well as the entry count', () => {
    _setExplorationResultCacheBoundsForTests({ maxCells: 100 });
    putCachedExplorationResult({ ...SCOPE, modelName: 'a' }, resultOf('a', 20, 3)); // 60
    putCachedExplorationResult({ ...SCOPE, modelName: 'b' }, resultOf('b', 10, 3)); // 30 -> 90
    expect(explorationResultCacheStats().entries).toBe(2);

    putCachedExplorationResult({ ...SCOPE, modelName: 'c' }, resultOf('c', 10, 3)); // 30 -> 120

    expect(explorationResultCacheStats().cells).toBeLessThanOrEqual(100);
    expect(getCachedExplorationResult({ ...SCOPE, modelName: 'a' })).toBeNull();
    expect(getCachedExplorationResult({ ...SCOPE, modelName: 'b' })?.label).toBe('b');
    expect(getCachedExplorationResult({ ...SCOPE, modelName: 'c' })?.label).toBe('c');
  });

  it('refuses a single result too big for the whole budget rather than emptying itself', () => {
    _setExplorationResultCacheBoundsForTests({ maxCells: 100 });
    putCachedExplorationResult({ ...SCOPE, modelName: 'small' }, resultOf('small', 5, 2));

    expect(putCachedExplorationResult({ ...SCOPE, modelName: 'huge' }, resultOf('huge', 500, 3))).toBe(
      false
    );

    expect(getCachedExplorationResult({ ...SCOPE, modelName: 'huge' })).toBeNull();
    expect(getCachedExplorationResult({ ...SCOPE, modelName: 'small' })?.label).toBe('small');
  });

  it('charges at least one cell per row for a result with no declared columns', () => {
    putCachedExplorationResult(SCOPE, { rows: [{ a: 1 }, { a: 2 }], columns: [] });
    expect(explorationResultCacheStats().cells).toBe(2);
  });

  it('keeps the budget honest when an entry is replaced', () => {
    putCachedExplorationResult(SCOPE, resultOf('big', 50, 2)); // 100
    putCachedExplorationResult(SCOPE, resultOf('small', 2, 2)); // 4
    expect(explorationResultCacheStats().cells).toBe(4);
  });

  describe('at the SHIPPED cell budget', () => {
    // A holey new Array(n) has length n without allocating elements, which keeps these cheap.
    const sized = (label, cells) => ({
      label,
      columns: ['c0'],
      rows: new Array(cells),
      row_count: cells,
    });

    it('accepts a result that exactly fills it', () => {
      const { maxCells } = explorationResultCacheStats();
      expect(putCachedExplorationResult(SCOPE, sized('exact', maxCells))).toBe(true);
      expect(explorationResultCacheStats().cells).toBe(maxCells);
    });

    it('refuses one cell more, rather than emptying itself for it', () => {
      const { maxCells } = explorationResultCacheStats();
      putCachedExplorationResult({ ...SCOPE, modelName: 'live' }, resultOf('live'));

      expect(
        putCachedExplorationResult({ ...SCOPE, modelName: 'huge' }, sized('huge', maxCells + 1))
      ).toBe(false);

      expect(getCachedExplorationResult({ ...SCOPE, modelName: 'huge' })).toBeNull();
      expect(getCachedExplorationResult({ ...SCOPE, modelName: 'live' })?.label).toBe('live');
    });

    it('evicts on the shipped budget, not just the injected one', () => {
      const { maxCells } = explorationResultCacheStats();
      putCachedExplorationResult({ ...SCOPE, modelName: 'a' }, sized('a', maxCells - 10));
      putCachedExplorationResult({ ...SCOPE, modelName: 'b' }, sized('b', 20));

      expect(explorationResultCacheStats().cells).toBeLessThanOrEqual(maxCells);
      expect(getCachedExplorationResult({ ...SCOPE, modelName: 'a' })).toBeNull();
      expect(getCachedExplorationResult({ ...SCOPE, modelName: 'b' })?.label).toBe('b');
    });
  });

  it('evicts a renamed chip’s orphaned entry ahead of a live one', () => {
    _setExplorationResultCacheBoundsForTests({ maxEntries: 2 });

    putCachedExplorationResult({ ...SCOPE, modelName: 'orders' }, resultOf('live'));
    putCachedExplorationResult({ ...SCOPE, modelName: 'query_1' }, resultOf('orphan'));
    expect(getCachedExplorationResult({ ...SCOPE, modelName: 'orders' })?.label).toBe('live');
    putCachedExplorationResult({ ...SCOPE, modelName: 'revenue' }, resultOf('newest'));

    // 'query_1' was inserted after 'orders' but never read, so it is the least recently used.
    expect(getCachedExplorationResult({ ...SCOPE, modelName: 'query_1' })).toBeNull();
    expect(getCachedExplorationResult({ ...SCOPE, modelName: 'orders' })?.label).toBe('live');
    expect(getCachedExplorationResult({ ...SCOPE, modelName: 'revenue' })?.label).toBe('newest');
  });
});
