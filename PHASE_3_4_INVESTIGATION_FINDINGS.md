# Phase 3 & 4 Investigation Findings

**Date:** November 3, 2025
**Issue:** Frontend errors showing input injection not working in integration test

## Root Cause Analysis

### Problem 1: Phase 2 Incomplete Implementation ❌

**Issue:** `InsightQueryBuilder` never calls the new `field_values_with_js_template_literals()` method.

**Evidence:**
- `visivo/query/insight/insight_query_builder.py` has NO references to `field_values_with_js_template_literals`
- Generated insight JSON still uses OLD placeholder format: `{'_0': "table"."column"}`
- Should use NEW format: `${input_name}`

**Files checked:**
```bash
# Method exists but unused:
visivo/models/interaction.py - HAS field_values_with_js_template_literals()
visivo/query/insight/insight_query_builder.py - DOES NOT call it
```

**Example from `target/insights/m75adfaaa498b7e29a223b573d5784e57.json`:**
```sql
WHERE "mb40e4eab5a9c6923e39661deec84f9a6"."x" > {'_0': "mb40e4eab5a9c6923e39661deec84f9a6"."min_x_value"}
```

Should be:
```sql
WHERE "mb40e4eab5a9c6923e39661deec84f9a6"."x" > ${min_x_value}
```

### Problem 2: Frontend Console Errors

**Console error:**
```
Binder Error: Table "mb40e4eab5a9c6923e39661deec84f9a6" does not have a column named "min_x_value"
```

**Why it happens:**
1. Backend generates: `{'_0': "table"."min_x_value"}` (old format)
2. Frontend `prepPostQuery()` expects: `${min_x_value}` (new format)
3. Old format passes through unchanged
4. DuckDB tries to parse `{'_0': ...}` as PostgreSQL record literal
5. Fails because column doesn't exist

### Problem 3: Integration Test Won't Run

**Issue:** `test-projects/integration/` has Pydantic validation errors preventing `visivo run`

**Errors:**
- Models have `metrics` and `dimensions` as nested fields - schema changed
- Charts have `insights` field - not properly configured
- Project won't parse, so Phase 3 validation never runs

**Status:** Stale `target/` directory from previous successful run (before Phase 2 implementation)

## Input Values Status ✅

The input parquet files are **correct** (static string values):

```
target/inputs/ma9b73fa7122eee0ae23a8228538c2176.parquet:
├─ "3"
├─ "5"
└─ "7"

target/inputs/maac4bfe09b57088c4d4c6fe909f44c19.parquet:
├─ "0"
├─ "2"
├─ "4"
└─ "6"
```

Input configuration in YAML is also correct:
```yaml
inputs:
  - name: split_threshold
    type: dropdown
    default: "5"
    options: ["3", "5", "7"]
```

## What's Missing

1. **`InsightQueryBuilder` integration** - Must call `field_values_with_js_template_literals()` for interactions
2. **Integration test YAML fixes** - Update schema to current Pydantic models
3. **Fresh build** - Run `visivo run` after fixing #1 to generate correct query format

## Impact

- ✅ Phase 3 unit tests: Pass (18/18)
- ✅ Phase 4 unit tests: Pass (24/24)
- ❌ Integration: Broken due to Phase 2 incomplete implementation
- ❌ Frontend runtime: Fails because backend generates wrong format

## Next Steps

1. Fix `InsightQueryBuilder` to use `field_values_with_js_template_literals()`
2. Update integration test YAML schema
3. Run fresh build to generate correct query format
4. Verify frontend receives `${input_name}` format
5. Test end-to-end flow
