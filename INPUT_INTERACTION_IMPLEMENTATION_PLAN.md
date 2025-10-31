# Input Interaction Implementation Plan

## Executive Summary

This plan addresses the incomplete implementation of input-driven interactions (split, filter, sort) in Visivo's insight system. While the backend correctly generates SQL with input placeholders, the frontend's placeholder replacement is broken, and split/sort client-side logic is missing.

---

## Current State Analysis

### What's Working ✅

**Backend (Python):**
- ✅ Input models (Dropdown with static/query-based options)
- ✅ Placeholder generation: `'visivo-input-placeholder-string' /* replace(..., Input(name)) */`
- ✅ Interaction sanitization: `${ref(input)}` → placeholders in SQL
- ✅ InsightQueryBuilder correctly injects filter/split/sort into queries
- ✅ Comprehensive test coverage for all backend components
- ✅ Query validation with SQLGlot before serialization

**Frontend (JavaScript):**
- ✅ Dropdown component fully functional (search, multi-select, keyboard nav)
- ✅ Query-based options via DuckDB execution
- ✅ Input state management via Zustand store
- ✅ Insight re-execution on input change
- ✅ DuckDB WASM query execution

### Critical Issues ❌

#### 1. **Placeholder Replacement Regex Broken**
**File**: `viewer/src/duckdb/queries.js:148-151`

**Problem**: The regex expects placeholder and comment on the same line, but SQLGlot's pretty-printing splits them across multiple lines for complex expressions.

**Example from integration logs:**
```sql
CASE
  WHEN "table"."y" >= 'visivo-input-placeholder-string'
  THEN 'High Y Values'
  ELSE 'Low Y Values'
END AS "alias", /* replace('visivo-input-placeholder-string', Input(split_threshold)) */
```

The comment appears after `END AS "alias"`, not immediately after the placeholder string.

**Current broken regex:**
```javascript
const placeholderPattern = new RegExp(
  "'visivo-input-placeholder-string'\\s*\\/\\*\\s*replace\\('visivo-input-placeholder-string',\\s*Input\\(([^)]+)\\)\\s*\\)\\s*(?:AS\\s+\"[^\"]+\")?\\s*\\*\\/",
  'g'
);
```

**Impact**: All dynamic insights fail with "Could not convert string 'visivo-input-placeholder-string' to INT64/DOUBLE" errors.

---

#### 2. **Split Interaction: No Multi-Trace Generation**
**File**: `viewer/src/hooks/useInsightsData.js`

**Problem**: Frontend doesn't detect split columns or group data to create multiple Plotly traces.

**Current behavior**: Query executes and returns all rows with split column, but only one trace is created.

**Expected behavior**:
- Detect split column from `props_mapping.split`
- Group rows by split value
- Create one trace per unique split value
- Pass array of traces to chart renderer

**Example**: `split-input-test-insight` should create 2 traces ("High Y Values", "Low Y Values") but currently creates 1.

---

#### 3. **Sort Order Verification Missing**
**Gap**: No tests verify that non-dynamic insights preserve ORDER BY when writing to parquet.

**Concern**: DuckDB might apply implicit sorting when reading parquet files, breaking user-specified sort order.

**Required tests**:
- Verify parquet row order matches ORDER BY clause
- Verify DuckDB reads parquet in same order
- Verify dynamic insights apply ORDER BY in post_query

---

#### 4. **Input Not Found in Store**
**Log evidence**: `Input 'min_avg_y' not found in inputs store, leaving placeholder`

**Problem**: Inputs aren't being initialized with default values during project load.

**Root cause**: Missing or incomplete input initialization in `useProject.js` or equivalent.

---

## Implementation Plan

### Phase 1: Fix Placeholder Replacement (CRITICAL - Blocks Everything)

**Priority**: HIGHEST - Nothing works without this

**Files to Modify:**
- `viewer/src/duckdb/queries.js` - Rewrite `prepPostQuery()` function
- `viewer/src/duckdb/__tests__/queries.test.js` - NEW comprehensive unit tests

**Approach:**

Replace single-regex approach with a **two-pass strategy**:

1. **Pass 1**: Find all comments matching `/* replace('visivo-input-placeholder-string', Input(name)) */`
2. **Pass 2**: For each comment, find the nearest preceding `'visivo-input-placeholder-string'` and replace it

**Algorithm:**
```javascript
export const prepPostQuery = (insight, inputs) => {
  let query = insight.query;

  // Pass 1: Find all comments with input references
  const commentPattern = /\/\*\s*replace\('visivo-input-placeholder-string',\s*Input\(([^)]+)\)\s*\)\s*\*\//g;
  const placeholders = [];

  let match;
  while ((match = commentPattern.exec(query)) !== null) {
    placeholders.push({
      inputName: match[1].trim(),
      commentIndex: match.index,
      comment: match[0]
    });
  }

  // Pass 2: Replace placeholders in reverse order (to preserve indices)
  for (const { inputName, commentIndex, comment } of placeholders.reverse()) {
    // Find last placeholder before this comment
    const beforeComment = query.substring(0, commentIndex);
    const lastIndex = beforeComment.lastIndexOf("'visivo-input-placeholder-string'");

    if (lastIndex >= 0) {
      const inputValue = inputs[inputName];

      if (inputValue === undefined) {
        console.warn(`Input '${inputName}' not found in inputs store`);
        continue;
      }

      // Format value based on type
      const replacement = formatInputValue(inputValue);

      // Replace placeholder and remove comment
      query =
        query.substring(0, lastIndex) +
        replacement +
        query.substring(lastIndex + "'visivo-input-placeholder-string'".length, commentIndex) +
        query.substring(commentIndex + comment.length);
    }
  }

  return query;
};

function formatInputValue(value) {
  if (Array.isArray(value)) {
    if (value.length === 0) return '(NULL)';
    return `(${value.map(v => typeof v === 'string' ? `'${v}'` : v).join(', ')})`;
  } else if (typeof value === 'string') {
    return `'${value}'`;
  } else {
    return String(value);
  }
}
```

**Edge Cases to Handle:**
- Multiple placeholders for same input (replace all)
- Placeholders in different SQL contexts (CASE, WHERE, HAVING, ORDER BY)
- Nested CASE statements
- Comments separated by many lines from placeholder
- Array values for IN clauses vs scalar values for comparisons

**Unit Tests Required:**

Create `viewer/src/duckdb/__tests__/queries.test.js`:

```javascript
describe('prepPostQuery', () => {
  describe('Simple scalar replacements', () => {
    test('replaces single string input in WHERE clause', () => {
      const insight = {
        query: "SELECT * FROM table WHERE category = 'visivo-input-placeholder-string' /* replace('visivo-input-placeholder-string', Input(category)) */"
      };
      const inputs = { category: 'electronics' };
      const result = prepPostQuery(insight, inputs);
      expect(result).toContain("category = 'electronics'");
      expect(result).not.toContain('visivo-input-placeholder-string');
      expect(result).not.toContain('/* replace');
    });

    test('replaces single numeric input in comparison', () => {
      const insight = {
        query: "SELECT * FROM table WHERE value > 'visivo-input-placeholder-string' /* replace('visivo-input-placeholder-string', Input(threshold)) */"
      };
      const inputs = { threshold: 100 };
      const result = prepPostQuery(insight, inputs);
      expect(result).toContain('value > 100');
    });

    test('replaces input in ORDER BY clause', () => {
      const insight = {
        query: "SELECT * FROM table ORDER BY col 'visivo-input-placeholder-string' /* replace('visivo-input-placeholder-string', Input(direction)) */"
      };
      const inputs = { direction: 'DESC' };
      const result = prepPostQuery(insight, inputs);
      expect(result).toContain('ORDER BY col DESC');
    });
  });

  describe('Array input replacements', () => {
    test('replaces array input for IN clause', () => {
      const insight = {
        query: "SELECT * FROM table WHERE category IN 'visivo-input-placeholder-string' /* replace('visivo-input-placeholder-string', Input(categories)) */"
      };
      const inputs = { categories: ['electronics', 'books', 'toys'] };
      const result = prepPostQuery(insight, inputs);
      expect(result).toContain("category IN ('electronics', 'books', 'toys')");
    });

    test('replaces empty array with NULL', () => {
      const insight = {
        query: "SELECT * FROM table WHERE category IN 'visivo-input-placeholder-string' /* replace('visivo-input-placeholder-string', Input(categories)) */"
      };
      const inputs = { categories: [] };
      const result = prepPostQuery(insight, inputs);
      expect(result).toContain('category IN (NULL)');
    });
  });

  describe('Complex SQL structures', () => {
    test('replaces placeholder in CASE statement on different line than comment', () => {
      const insight = {
        query: `SELECT
  CASE
    WHEN y >= 'visivo-input-placeholder-string'
    THEN 'High'
    ELSE 'Low'
  END AS category /* replace('visivo-input-placeholder-string', Input(threshold)) */
FROM table`
      };
      const inputs = { threshold: 5 };
      const result = prepPostQuery(insight, inputs);
      expect(result).toContain("WHEN y >= 5");
      expect(result).not.toContain('visivo-input-placeholder-string');
    });

    test('replaces multiple placeholders for same input', () => {
      const insight = {
        query: `SELECT
  CASE WHEN x >= 'visivo-input-placeholder-string' THEN 'High' ELSE 'Low' END AS split, /* replace('visivo-input-placeholder-string', Input(threshold)) */
  CASE WHEN y >= 'visivo-input-placeholder-string' THEN '#111' ELSE '#222' END AS color /* replace('visivo-input-placeholder-string', Input(threshold)) */
FROM table`
      };
      const inputs = { threshold: 10 };
      const result = prepPostQuery(insight, inputs);
      expect(result).toContain('x >= 10');
      expect(result).toContain('y >= 10');
      expect(result.match(/10/g).length).toBe(2);
    });

    test('replaces placeholders for different inputs', () => {
      const insight = {
        query: `SELECT * FROM table
WHERE x > 'visivo-input-placeholder-string' /* replace('visivo-input-placeholder-string', Input(min_x)) */
AND category = 'visivo-input-placeholder-string' /* replace('visivo-input-placeholder-string', Input(cat)) */`
      };
      const inputs = { min_x: 5, cat: 'books' };
      const result = prepPostQuery(insight, inputs);
      expect(result).toContain('x > 5');
      expect(result).toContain("category = 'books'");
    });
  });

  describe('Error handling', () => {
    test('warns and leaves placeholder when input not found', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const insight = {
        query: "SELECT * FROM table WHERE x > 'visivo-input-placeholder-string' /* replace('visivo-input-placeholder-string', Input(missing)) */"
      };
      const inputs = {};
      const result = prepPostQuery(insight, inputs);
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("'missing' not found"));
      expect(result).toContain('visivo-input-placeholder-string');
      consoleWarnSpy.mockRestore();
    });

    test('handles undefined inputs object gracefully', () => {
      const insight = {
        query: "SELECT * FROM table WHERE x > 'visivo-input-placeholder-string' /* replace('visivo-input-placeholder-string', Input(threshold)) */"
      };
      expect(() => prepPostQuery(insight, undefined)).not.toThrow();
    });
  });

  describe('Integration test cases from logs', () => {
    test('split-input-test-insight CASE statement', () => {
      const insight = {
        query: `SELECT
  CASE
    WHEN "mb40e4eab5a9c6923e39661deec84f9a6"."y" >= 'visivo-input-placeholder-string'
    THEN 'High Y Values'
    ELSE 'Low Y Values'
  END AS "mb2157f0d8ab3906a", /* replace('visivo-input-placeholder-string', Input(split_threshold) ) */
  "mb40e4eab5a9c6923e39661deec84f9a6"."x" AS "ma3ffd641163784cb"
FROM "mb40e4eab5a9c6923e39661deec84f9a6"`
      };
      const inputs = { split_threshold: 5 };
      const result = prepPostQuery(insight, inputs);
      expect(result).toContain('"y" >= 5');
      expect(result).not.toContain('visivo-input-placeholder-string');
    });

    test('filter-aggregate-input-test-insight HAVING clause', () => {
      const insight = {
        query: `SELECT
  CASE WHEN x <= 3 THEN 'Group A' ELSE 'Group B' END AS "group",
  AVG(y) AS "avg_y"
FROM table
GROUP BY CASE WHEN x <= 3 THEN 'Group A' ELSE 'Group B' END
HAVING AVG(y) > 'visivo-input-placeholder-string' /* replace('visivo-input-placeholder-string', Input(min_avg_y) ) */`
      };
      const inputs = { min_avg_y: 5 };
      const result = prepPostQuery(insight, inputs);
      expect(result).toContain('AVG(y) > 5');
    });
  });
});
```

**Success Criteria:**
- ✅ All unit tests pass (20+ test cases)
- ✅ No DuckDB conversion errors in integration tests
- ✅ All 5 input-driven test insights execute successfully

---

### Phase 2: Input Initialization

**Priority**: HIGH - Required for Phase 1 to work

**Files to Modify:**
- `viewer/src/hooks/useProject.js` (or wherever project is loaded)
- `viewer/src/stores/insightStore.js` (verify initialization)

**Approach:**

Ensure inputs are loaded with default values during initial project load:

```javascript
// In useProject.js or equivalent
useEffect(() => {
  if (project?.inputs) {
    project.inputs.forEach(input => {
      setDefaultInputValue(input.name, input.default);
    });
  }
}, [project]);
```

**Unit Tests Required:**

Create `viewer/src/hooks/__tests__/useProject.test.js`:

```javascript
describe('useProject input initialization', () => {
  test('sets default values for all inputs on project load', () => {
    const mockProject = {
      inputs: [
        { name: 'split_threshold', default: '5' },
        { name: 'min_x_value', default: '2' },
        { name: 'min_avg_y', default: '5' },
        { name: 'sort_direction', default: 'ASC' }
      ]
    };

    const { result } = renderHook(() => useProject());

    act(() => {
      // Simulate project load
      result.current.loadProject(mockProject);
    });

    const store = useStore.getState();
    expect(store.inputs.split_threshold).toBe('5');
    expect(store.inputs.min_x_value).toBe('2');
    expect(store.inputs.min_avg_y).toBe('5');
    expect(store.inputs.sort_direction).toBe('ASC');
  });

  test('handles inputs with array defaults', () => {
    const mockProject = {
      inputs: [
        { name: 'categories', default: ['books', 'electronics'], multi: true }
      ]
    };

    const { result } = renderHook(() => useProject());

    act(() => {
      result.current.loadProject(mockProject);
    });

    const store = useStore.getState();
    expect(store.inputs.categories).toEqual(['books', 'electronics']);
  });
});
```

**Success Criteria:**
- ✅ All inputs have default values immediately after project load
- ✅ No "Input not found" warnings in console
- ✅ Unit tests verify input initialization for various input types

---

### Phase 3: Split Interaction - Multi-Trace Generation

**Priority**: MEDIUM - Depends on Phase 1 & 2

**Files to Modify:**
- `viewer/src/hooks/useInsightsData.js` - Add split detection and processing
- `viewer/src/utils/splitTraces.js` - NEW file for split logic
- `viewer/src/utils/__tests__/splitTraces.test.js` - NEW unit tests

**Approach:**

After executing post_query, check if `props_mapping` contains a "split" key. If yes, group results by split column and create multiple traces.

**Implementation:**

Create `viewer/src/utils/splitTraces.js`:
```javascript
/**
 * Splits query results into multiple traces based on split column
 *
 * @param {Array} rows - Query result rows
 * @param {string} splitColumn - Column name to split on
 * @returns {Array<{name: string, data: Array}>} - Array of trace objects
 */
export function splitByColumn(rows, splitColumn) {
  if (!splitColumn || !rows || rows.length === 0) {
    return [{ name: 'default', data: rows }];
  }

  const groups = {};

  rows.forEach(row => {
    const splitValue = row[splitColumn];
    const key = splitValue === null || splitValue === undefined ? 'NULL' : String(splitValue);

    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(row);
  });

  return Object.entries(groups).map(([splitValue, data]) => ({
    name: splitValue,
    data: data
  }));
}
```

Modify `viewer/src/hooks/useInsightsData.js`:
```javascript
import { splitByColumn } from '../utils/splitTraces';

const processInsight = async (db, insight, inputs) => {
  // ... existing code to load files and execute query ...

  const rows = queryResultToRows(result);
  const propsMapping = insight.props_mapping || {};

  // Check for split column
  let traces;
  if (propsMapping.split) {
    const splitColumnAlias = propsMapping.split;
    traces = splitByColumn(rows, splitColumnAlias);
  } else {
    traces = [{ name: insight.name, data: rows }];
  }

  return {
    [insightName]: traces.map(trace => ({
      name: trace.name,
      data: trace.data,
      props_mapping: propsMapping,
      files: insight.files,
      query: insight.query
    }))
  };
};
```

**Unit Tests Required:**

Create `viewer/src/utils/__tests__/splitTraces.test.js`:

```javascript
describe('splitByColumn', () => {
  test('splits rows into groups by split column', () => {
    const rows = [
      { x: 1, y: 2, category: 'A' },
      { x: 3, y: 4, category: 'B' },
      { x: 5, y: 6, category: 'A' },
      { x: 7, y: 8, category: 'B' }
    ];

    const result = splitByColumn(rows, 'category');

    expect(result).toHaveLength(2);
    expect(result.find(t => t.name === 'A').data).toHaveLength(2);
    expect(result.find(t => t.name === 'B').data).toHaveLength(2);
  });

  test('handles single group (all same value)', () => {
    const rows = [
      { x: 1, y: 2, category: 'A' },
      { x: 3, y: 4, category: 'A' }
    ];

    const result = splitByColumn(rows, 'category');

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('A');
    expect(result[0].data).toHaveLength(2);
  });

  test('handles NULL values in split column', () => {
    const rows = [
      { x: 1, y: 2, category: null },
      { x: 3, y: 4, category: 'A' },
      { x: 5, y: 6, category: null }
    ];

    const result = splitByColumn(rows, 'category');

    expect(result).toHaveLength(2);
    expect(result.find(t => t.name === 'NULL')).toBeDefined();
    expect(result.find(t => t.name === 'NULL').data).toHaveLength(2);
  });

  test('returns single default trace when no split column provided', () => {
    const rows = [{ x: 1, y: 2 }];
    const result = splitByColumn(rows, null);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('default');
  });

  test('handles empty rows array', () => {
    const result = splitByColumn([], 'category');
    expect(result).toHaveLength(1);
    expect(result[0].data).toEqual([]);
  });

  test('handles numeric split values', () => {
    const rows = [
      { x: 1, y: 2, status: 0 },
      { x: 3, y: 4, status: 1 },
      { x: 5, y: 6, status: 0 }
    ];

    const result = splitByColumn(rows, 'status');

    expect(result).toHaveLength(2);
    expect(result.find(t => t.name === '0')).toBeDefined();
    expect(result.find(t => t.name === '1')).toBeDefined();
  });
});
```

**Integration Tests:**

Add to existing integration test suite:

```javascript
describe('Split interaction integration', () => {
  test('split-input-test-insight creates two traces', async () => {
    const db = await initDuckDB();
    const project = await loadProject();
    const insights = await processInsights(db, project);

    const splitInsight = insights['split-input-test-insight'];

    expect(splitInsight).toHaveLength(2);
    expect(splitInsight.map(t => t.name).sort()).toEqual(['High Y Values', 'Low Y Values']);
  });

  test('fibonacci-split-insight creates two traces', async () => {
    const db = await initDuckDB();
    const project = await loadProject();
    const insights = await processInsights(db, project);

    const splitInsight = insights['fibonacci-split-insight'];

    expect(splitInsight).toHaveLength(2);
    expect(splitInsight.map(t => t.name).sort()).toEqual(['Abnormal Fib', 'Normal Fibonacci']);
  });
});
```

**Success Criteria:**
- ✅ All unit tests pass (8+ test cases)
- ✅ `split-input-test-insight` creates 2 traces with correct data
- ✅ Non-split insights still work (return array of 1 trace)
- ✅ Chart rendering handles multiple traces correctly

---

### Phase 4: Sort Order Verification and Testing

**Priority**: MEDIUM - Quality assurance for sort behavior

**Files to Create:**
- `tests/query/test_sort_order_preservation.py` - NEW Python tests

**Approach:**

Write comprehensive tests to verify:
1. Non-dynamic insights preserve ORDER BY when writing parquet
2. DuckDB doesn't reorder data when reading parquet
3. Dynamic insights include ORDER BY in post_query

**Unit Tests Required:**

Create `tests/query/test_sort_order_preservation.py`:

```python
import pytest
import duckdb
from visivo.testing.test_utils import InsightFactory, ProjectFactory, ModelFactory, InputFactory
from visivo.jobs.run_insight_job import run_insight_job
from pathlib import Path
import pandas as pd


class TestSortOrderPreservation:
    """Test that ORDER BY is correctly applied and preserved"""

    def test_non_dynamic_insight_preserves_order_in_parquet(self, tmp_path):
        """Verify parquet file rows match ORDER BY clause for non-dynamic insights"""
        # Create insight with sort interaction (no inputs, so non-dynamic)
        model = ModelFactory(
            name="test_model",
            sql="SELECT * FROM (VALUES (3, 30), (1, 10), (2, 20)) AS t(x, y)"
        )
        insight = InsightFactory(
            name="sorted_insight",
            props={"x": "?{x}", "y": "?{y}"},
            interactions=[{"sort": "?{x ASC}"}]
        )

        # Run insight job to generate parquet
        run_insight_job(insight, output_dir=tmp_path)

        # Read parquet file
        parquet_path = tmp_path / f"{insight.name_hash()}.parquet"
        df = pd.read_parquet(parquet_path)

        # Verify rows are in correct order
        assert list(df['x']) == [1, 2, 3], "Parquet rows should match ORDER BY x ASC"

    def test_duckdb_preserves_parquet_row_order(self, tmp_path):
        """Verify DuckDB reads parquet in same order it was written"""
        # Create test data with specific order
        df = pd.DataFrame({'x': [5, 3, 1, 4, 2], 'y': [50, 30, 10, 40, 20]})
        parquet_path = tmp_path / "test.parquet"
        df.to_parquet(parquet_path, index=False)

        # Read with DuckDB
        conn = duckdb.connect()
        result = conn.execute(f"SELECT * FROM '{parquet_path}'").fetchdf()

        # Verify order is preserved
        assert list(result['x']) == [5, 3, 1, 4, 2], "DuckDB should preserve parquet row order"

    def test_dynamic_insight_includes_order_by_in_post_query(self, tmp_path):
        """Verify dynamic insights have ORDER BY in post_query"""
        # Create dynamic insight (has input reference in sort)
        input_obj = InputFactory(name="sort_col", default="x")
        model = ModelFactory(
            name="test_model",
            sql="SELECT * FROM (VALUES (3, 30), (1, 10), (2, 20)) AS t(x, y)"
        )
        insight = InsightFactory(
            name="dynamic_sorted_insight",
            props={"x": "?{x}", "y": "?{y}"},
            interactions=[{"sort": "?{${ref(sort_col)} DESC}"}]
        )

        # Build insight query
        from visivo.query.insight.insight_query_builder import InsightQueryBuilder
        builder = InsightQueryBuilder(insight, dag, tmp_path)
        builder.resolve()
        query_info = builder.build()

        # Verify post_query contains ORDER BY
        assert query_info.post_query is not None
        assert "ORDER BY" in query_info.post_query.upper()
        assert query_info.is_dynamic is True

    def test_sort_with_multiple_columns(self, tmp_path):
        """Test ORDER BY with multiple columns"""
        model = ModelFactory(
            name="test_model",
            sql="SELECT * FROM (VALUES (1, 'B'), (1, 'A'), (2, 'B'), (2, 'A')) AS t(x, y)"
        )
        insight = InsightFactory(
            name="multi_sort_insight",
            props={"x": "?{x}", "y": "?{y}"},
            interactions=[{"sort": "?{x ASC, y DESC}"}]
        )

        run_insight_job(insight, output_dir=tmp_path)

        parquet_path = tmp_path / f"{insight.name_hash()}.parquet"
        df = pd.read_parquet(parquet_path)

        # Verify multi-column sort
        expected_x = [1, 1, 2, 2]
        expected_y = ['B', 'A', 'B', 'A']  # DESC within each x group
        assert list(df['x']) == expected_x
        assert list(df['y']) == expected_y

    def test_sort_desc_order(self, tmp_path):
        """Test ORDER BY DESC"""
        model = ModelFactory(
            name="test_model",
            sql="SELECT * FROM (VALUES (1, 10), (2, 20), (3, 30)) AS t(x, y)"
        )
        insight = InsightFactory(
            name="desc_sorted_insight",
            props={"x": "?{x}", "y": "?{y}"},
            interactions=[{"sort": "?{x DESC}"}]
        )

        run_insight_job(insight, output_dir=tmp_path)

        parquet_path = tmp_path / f"{insight.name_hash()}.parquet"
        df = pd.read_parquet(parquet_path)

        assert list(df['x']) == [3, 2, 1], "Should be sorted descending"

    def test_sort_with_input_placeholder_preserves_order(self, tmp_path):
        """Test that dynamic sort with input placeholder maintains correct structure"""
        input_obj = InputFactory(name="direction", default="ASC")
        model = ModelFactory(
            name="test_model",
            sql="SELECT * FROM (VALUES (3, 30), (1, 10), (2, 20)) AS t(x, y)"
        )
        insight = InsightFactory(
            name="input_sorted_insight",
            props={"x": "?{x}", "y": "?{y}"},
            interactions=[{"sort": "?{x ${ref(direction)}}"}]
        )

        from visivo.query.insight.insight_query_builder import InsightQueryBuilder
        builder = InsightQueryBuilder(insight, dag, tmp_path)
        builder.resolve()
        query_info = builder.build()

        # Post query should have placeholder for direction
        assert "'visivo-input-placeholder-string'" in query_info.post_query
        assert "Input(direction)" in query_info.post_query
        assert "ORDER BY" in query_info.post_query.upper()
```

**Success Criteria:**
- ✅ All unit tests pass (7+ test cases)
- ✅ Parquet files preserve ORDER BY clause row order
- ✅ DuckDB reads parquet in same order
- ✅ Dynamic insights include ORDER BY with placeholders

---

### Phase 5: Comprehensive Frontend Testing

**Priority**: HIGH - Ensure quality and prevent regressions

**Files to Create:**
- `viewer/src/duckdb/__tests__/queries.test.js` - (Already created in Phase 1)
- `viewer/src/utils/__tests__/splitTraces.test.js` - (Already created in Phase 3)
- `viewer/src/hooks/__tests__/useInsightsData.test.js` - NEW comprehensive tests
- `viewer/src/components/items/inputs/__tests__/Dropdown.test.jsx` - NEW component tests

**Approach:**

Ensure comprehensive test coverage for all frontend components involved in input interactions.

**Unit Tests Required:**

Create `viewer/src/hooks/__tests__/useInsightsData.test.js`:

```javascript
import { renderHook, act } from '@testing-library/react-hooks';
import { useInsightsData } from '../useInsightsData';
import * as queries from '../../duckdb/queries';

// Mock DuckDB and other dependencies
jest.mock('../../duckdb/queries');
jest.mock('../../duckdb/duckdb');

describe('useInsightsData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('processes non-split insight into single trace', async () => {
    const mockInsight = {
      name: 'test_insight',
      query: 'SELECT * FROM table',
      files: [],
      props_mapping: { 'props.x': 'x_col', 'props.y': 'y_col' }
    };

    queries.runDuckDBQuery.mockResolvedValue({
      getChild: () => ({ toArray: () => [1, 2, 3] })
    });

    const { result } = renderHook(() => useInsightsData());

    await act(async () => {
      await result.current.processInsight(mockDB, mockInsight, {});
    });

    const insights = result.current.insights;
    expect(insights['test_insight']).toHaveLength(1);
    expect(insights['test_insight'][0].data).toBeDefined();
  });

  test('processes split insight into multiple traces', async () => {
    const mockInsight = {
      name: 'split_insight',
      query: 'SELECT x, y, category FROM table',
      files: [],
      props_mapping: {
        'props.x': 'x_col',
        'props.y': 'y_col',
        'split': 'category_col'
      }
    };

    // Mock query result with split column
    queries.runDuckDBQuery.mockResolvedValue({
      toArray: () => [
        { x_col: 1, y_col: 10, category_col: 'A' },
        { x_col: 2, y_col: 20, category_col: 'B' },
        { x_col: 3, y_col: 30, category_col: 'A' }
      ]
    });

    const { result } = renderHook(() => useInsightsData());

    await act(async () => {
      await result.current.processInsight(mockDB, mockInsight, {});
    });

    const insights = result.current.insights;
    expect(insights['split_insight']).toHaveLength(2);
    expect(insights['split_insight'].map(t => t.name).sort()).toEqual(['A', 'B']);
  });

  test('re-executes insight when input changes', async () => {
    const mockInsight = {
      name: 'dynamic_insight',
      query: "SELECT * FROM table WHERE x > 'visivo-input-placeholder-string' /* replace('visivo-input-placeholder-string', Input(threshold)) */",
      files: [],
      props_mapping: { 'props.x': 'x_col', 'props.y': 'y_col' }
    };

    queries.prepPostQuery.mockImplementation((insight, inputs) => {
      if (inputs.threshold === 5) {
        return 'SELECT * FROM table WHERE x > 5';
      } else {
        return 'SELECT * FROM table WHERE x > 10';
      }
    });

    const { result } = renderHook(() => useInsightsData());

    // Initial execution with threshold = 5
    await act(async () => {
      await result.current.processInsight(mockDB, mockInsight, { threshold: 5 });
    });

    expect(queries.prepPostQuery).toHaveBeenCalledWith(mockInsight, { threshold: 5 });

    // Change input to threshold = 10
    await act(async () => {
      await result.current.updateInputAndRerun('threshold', 10);
    });

    expect(queries.prepPostQuery).toHaveBeenCalledWith(mockInsight, { threshold: 10 });
  });
});
```

Create `viewer/src/components/items/inputs/__tests__/Dropdown.test.jsx`:

```javascript
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Dropdown from '../Dropdown';
import useStore from '../../../stores/store';

jest.mock('../../../stores/store');

describe('Dropdown component', () => {
  beforeEach(() => {
    useStore.mockReturnValue({
      setInputValue: jest.fn(),
      setDefaultInputValue: jest.fn()
    });
  });

  test('renders dropdown with static options', () => {
    const options = ['Option 1', 'Option 2', 'Option 3'];
    render(
      <Dropdown
        label="Test Dropdown"
        options={options}
        name="test_input"
        defaultValue="Option 1"
      />
    );

    expect(screen.getByText('Test Dropdown')).toBeInTheDocument();
  });

  test('calls setDefaultInputValue on mount with default value', () => {
    const setDefaultInputValue = jest.fn();
    useStore.mockReturnValue({
      setInputValue: jest.fn(),
      setDefaultInputValue
    });

    render(
      <Dropdown
        label="Test"
        options={['A', 'B']}
        name="test_input"
        defaultValue="A"
      />
    );

    expect(setDefaultInputValue).toHaveBeenCalledWith('test_input', 'A');
  });

  test('calls setInputValue when option is selected', async () => {
    const setInputValue = jest.fn();
    useStore.mockReturnValue({
      setInputValue,
      setDefaultInputValue: jest.fn()
    });

    render(
      <Dropdown
        label="Test"
        options={['A', 'B', 'C']}
        name="test_input"
        defaultValue="A"
      />
    );

    // Open dropdown and select option
    const dropdown = screen.getByRole('button');
    fireEvent.click(dropdown);

    await waitFor(() => {
      const optionB = screen.getByText('B');
      fireEvent.click(optionB);
    });

    expect(setInputValue).toHaveBeenCalledWith('test_input', 'B');
  });

  test('handles multi-select', async () => {
    const setInputValue = jest.fn();
    useStore.mockReturnValue({
      setInputValue,
      setDefaultInputValue: jest.fn()
    });

    render(
      <Dropdown
        label="Test Multi"
        options={['A', 'B', 'C']}
        name="test_input"
        isMulti={true}
        defaultValue={['A']}
      />
    );

    // Select multiple options
    const dropdown = screen.getByRole('button');
    fireEvent.click(dropdown);

    await waitFor(() => {
      const optionB = screen.getByText('B');
      fireEvent.click(optionB);
    });

    expect(setInputValue).toHaveBeenCalledWith('test_input', expect.arrayContaining(['A', 'B']));
  });

  test('executes query for dynamic options', async () => {
    const mockDB = {}; // Mock DuckDB instance
    const queryOptions = '?{ SELECT DISTINCT category FROM products }';

    // Mock DuckDB query execution
    const runDuckDBQuery = jest.fn().mockResolvedValue({
      toArray: () => [{ category: 'Electronics' }, { category: 'Books' }]
    });

    render(
      <Dropdown
        label="Categories"
        options={queryOptions}
        name="category_input"
        isQuery={true}
      />
    );

    // Wait for query to execute and options to populate
    await waitFor(() => {
      expect(screen.getByText('Electronics')).toBeInTheDocument();
      expect(screen.getByText('Books')).toBeInTheDocument();
    });
  });
});
```

**Success Criteria:**
- ✅ All frontend unit tests pass (30+ test cases across all files)
- ✅ Test coverage >80% for modified files
- ✅ No regressions in existing functionality

---

## Overall Success Criteria

### Functional Requirements
1. ✅ **Placeholder Replacement**: All 5 input-driven test insights execute without DuckDB errors
2. ✅ **Split Interaction**: `split-input-test-insight` creates 2 traces ("High Y Values", "Low Y Values")
3. ✅ **Filter (Non-Aggregate)**: `filter-nonaggregate-input-test-insight` shows only rows where x > input value
4. ✅ **Filter (Aggregate)**: `filter-aggregate-input-test-insight` applies HAVING filter correctly
5. ✅ **Sort**: `sort-input-test-insight` orders data by input direction (ASC/DESC)
6. ✅ **Combined**: `combined-interactions-test-insight` handles split + filter + sort together
7. ✅ **Dynamic Updates**: Changing input values triggers insight re-execution and chart updates

### Quality Requirements (NEW - Unit Testing Focus)
8. ✅ **Backend Tests**: All existing Python tests pass (already at ~100% coverage)
9. ✅ **Frontend Unit Tests**:
   - `prepPostQuery()`: 20+ test cases covering all edge cases
   - `splitByColumn()`: 8+ test cases
   - `useInsightsData()`: 5+ test cases
   - `Dropdown`: 6+ test cases
   - **Total**: 40+ new frontend unit tests
10. ✅ **Sort Preservation Tests**: 7+ Python tests verify ORDER BY behavior
11. ✅ **Test Coverage**: Frontend files >80% coverage
12. ✅ **No Console Errors**: No warnings about missing inputs or undefined values

### Integration Requirements
13. ✅ Integration test with all 5 input types runs successfully
14. ✅ Manual QA: All test charts render correctly in browser
15. ✅ Performance: No noticeable lag when changing inputs (<500ms response)

---

## Testing Strategy

### Unit Tests (Primary Focus)
- **Backend**: Already comprehensive, add sort preservation tests
- **Frontend**: Heavy focus on new unit tests for:
  - `prepPostQuery()` with 20+ edge cases
  - `splitByColumn()` logic
  - `useInsightsData()` hook
  - `Dropdown` component

### Integration Tests (Secondary)
- Run existing integration test suite
- Verify all 5 input-driven insights work end-to-end
- Test input changes trigger correct behavior

### Manual QA (Final Validation)
- Visual verification of charts
- Input interaction responsiveness
- Error handling (invalid inputs, missing data)

**Testing Priority**: Unit tests >> Integration tests >> Manual QA

This ensures we catch issues early and aren't overly reliant on slow integration tests.

---

## Risks and Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Regex replacement misses edge cases | HIGH | MEDIUM | Comprehensive unit tests with 20+ scenarios |
| Split logic breaks single-trace charts | MEDIUM | LOW | Return array even for non-split (array of 1) |
| Performance degradation with large datasets | MEDIUM | MEDIUM | Profile and optimize if needed; lazy loading |
| Input initialization race condition | HIGH | LOW | Ensure inputs loaded before insights processed |
| DuckDB reorders parquet data | HIGH | LOW | Unit tests verify order preservation |

---

## Implementation Timeline

### Estimated Effort

| Phase | Tasks | Estimated Time | Dependencies |
|-------|-------|----------------|--------------|
| **Phase 1** | Fix prepPostQuery + 20 unit tests | 3-4 hours | None |
| **Phase 2** | Input initialization + unit tests | 1 hour | None |
| **Phase 3** | Split logic + 8 unit tests | 2-3 hours | Phase 1, 2 |
| **Phase 4** | Sort preservation + 7 Python tests | 2 hours | None (parallel) |
| **Phase 5** | Frontend component tests | 2-3 hours | Phase 1-3 |
| **Integration & QA** | Run all tests, manual verification | 1-2 hours | All phases |

**Total Estimated Time**: 11-15 hours

### Development Order

1. **Phase 2** (Input init) - 1 hour - Sets foundation
2. **Phase 1** (Regex fix) - 4 hours - Unblocks everything
3. **Phase 4** (Sort tests) - 2 hours - Independent, can run parallel
4. **Phase 3** (Split logic) - 3 hours - Depends on Phase 1 & 2
5. **Phase 5** (Component tests) - 3 hours - Comprehensive coverage
6. **Integration & QA** - 2 hours - Final verification

---

## Definition of Done

- [ ] All unit tests pass (Backend: existing + 7 new, Frontend: 40+ new)
- [ ] All integration tests pass
- [ ] Test coverage >80% for modified frontend files
- [ ] All 5 input-driven test insights render correctly
- [ ] Split interaction creates multiple traces
- [ ] Input changes trigger chart updates
- [ ] No console errors or warnings
- [ ] Code review approved
- [ ] Documentation updated (if needed)
- [ ] Manual QA sign-off

---

## Appendix: Key Files Reference

### Backend (Python)
- `visivo/models/inputs/input.py` - Base Input model
- `visivo/models/inputs/types/dropdown.py` - Dropdown implementation with placeholder generation
- `visivo/models/interaction.py` - InsightInteraction model with sanitization
- `visivo/query/insight/insight_query_builder.py` - Query building with filter/split/sort
- `tests/query/test_sort_order_preservation.py` - NEW: Sort tests

### Frontend (JavaScript)
- `viewer/src/duckdb/queries.js` - prepPostQuery function (FIX REQUIRED)
- `viewer/src/hooks/useInsightsData.js` - Insight processing and execution
- `viewer/src/utils/splitTraces.js` - NEW: Split logic
- `viewer/src/components/items/inputs/Dropdown.jsx` - Dropdown component
- `viewer/src/stores/insightStore.js` - Input state management

### Tests (NEW)
- `viewer/src/duckdb/__tests__/queries.test.js` - prepPostQuery unit tests (20+)
- `viewer/src/utils/__tests__/splitTraces.test.js` - Split logic tests (8+)
- `viewer/src/hooks/__tests__/useInsightsData.test.js` - Hook tests (5+)
- `viewer/src/components/items/inputs/__tests__/Dropdown.test.jsx` - Component tests (6+)
- `tests/query/test_sort_order_preservation.py` - Sort preservation tests (7+)

---

## Notes

- This plan prioritizes **unit tests over integration tests** to catch issues early
- All phases include specific test requirements with expected test counts
- Sort behavior is verified through dedicated backend tests
- Frontend testing covers all critical paths and edge cases
- The two-pass regex approach is more robust than single-regex matching
