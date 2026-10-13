import { useMemo, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFetchInputJobs } from '../contexts/QueryContext';
import { loadInsightParquetFiles, runDuckDBQuery } from '../duckdb/queries';
import { useDuckDB } from '../contexts/DuckDBContext';
import useStore from '../stores/store';
import { isDateExpression, isStepUnit, resolveDateRangeToOptions } from '../utils/dateExpressions';

/**
 * Extract options from DuckDB after loading parquet file
 * @param {import("@duckdb/duckdb-wasm").AsyncDuckDB} db - DuckDB instance
 * @param {string} nameHash - Table name (parquet file name_hash)
 * @returns {Promise<string[]>} Array of option values
 */
const extractOptionsFromDuckDB = async (db, nameHash) => {
  const query = `SELECT "option" FROM "${nameHash}"`;
  const result = await runDuckDBQuery(db, query, 3, 1000);
  const rows = result.toArray().map(row => row.toJSON());
  return rows.map(row => String(row.option));
};

/**
 * Extract query-based default values from DuckDB after loading the `defaults`
 * parquet file (written by run_input_job for `display.default.values: ?{...}`;
 * its single column is named `value`).
 * @param {import("@duckdb/duckdb-wasm").AsyncDuckDB} db - DuckDB instance
 * @param {string} nameHash - Table name (parquet file name_hash)
 * @returns {Promise<string[]>} Array of default values
 */
const extractDefaultsFromDuckDB = async (db, nameHash) => {
  const query = `SELECT "value" FROM "${nameHash}"`;
  const result = await runDuckDBQuery(db, query, 3, 1000);
  const rows = result.toArray().map(row => row.toJSON());
  return rows.map(row => String(row.value));
};

/**
 * True when a value is a finite number or a string that parses as one.
 * @param {*} v
 * @returns {boolean}
 */
const isNumericLike = v =>
  (typeof v === 'number' && Number.isFinite(v)) ||
  (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)));

/**
 * Expand the multi-select default literals documented on MultiSelectDefault:
 * `all` selects every option, `none` selects nothing. Anything else is returned
 * unchanged.
 * @param {*} value - Raw default (literal, list, or scalar)
 * @param {string[]} options - Loaded options
 * @returns {*} Expanded default
 */
export const expandDefaultLiteral = (value, options) => {
  if (value === 'all') return [...(options || [])];
  if (value === 'none') return [];
  return value;
};

/**
 * Generate range options (numeric or date-based)
 * @param {Object} range - Range configuration { start, end, step }
 * @param {string} displayType - Display type (e.g., 'date-range')
 * @returns {string[]} Array of generated options
 */
const generateRangeOptions = (range, displayType) => {
  const { start, end, step } = range;

  // Check if this is a date-based range
  const isDateRange =
    isDateExpression(start) ||
    isDateExpression(end) ||
    isStepUnit(step) ||
    displayType === 'date-range';

  if (isDateRange) {
    return resolveDateRangeToOptions(start, end, step);
  }

  // Numeric range generation
  const numStart = typeof start === 'number' ? start : parseFloat(start);
  const numEnd = typeof end === 'number' ? end : parseFloat(end);
  const numStep = typeof step === 'number' ? step : parseFloat(step);

  const options = [];
  if (!isNaN(numStart) && !isNaN(numEnd) && !isNaN(numStep) && numStep > 0) {
    for (let val = numStart; val <= numEnd; val += numStep) {
      options.push(String(val));
    }
    // Ensure end value is included if not on step boundary
    const lastVal = parseFloat(options[options.length - 1]);
    if (lastVal < numEnd) {
      options.push(String(numEnd));
    }
  }

  return options;
};

/**
 * Extract default value from input data
 * @param {Object} data - Input data object
 * @param {string[]} options - Generated/loaded options
 * @param {string[]|null} queriedDefaults - Values read from the `defaults` parquet
 *   (query-based multi-select default), or null when there is none
 * @returns {*} Default value
 */
const extractDefaultValue = (data, options, queriedDefaults = null) => {
  // Handle range-based defaults (start/end)
  if (data.structure === 'range' && data.display?.default) {
    const rangeDefault = data.display.default;
    if (rangeDefault.start !== undefined && rangeDefault.end !== undefined) {
      // Resolve date expressions in range defaults
      let startVal = isDateExpression(rangeDefault.start)
        ? resolveDateRangeToOptions(rangeDefault.start, rangeDefault.start, '1 day')[0]
        : rangeDefault.start;
      let endVal = isDateExpression(rangeDefault.end)
        ? resolveDateRangeToOptions(rangeDefault.end, rangeDefault.end, '1 day')[0]
        : rangeDefault.end;

      // Find all options within the default range. Numeric bounds compare as
      // numbers (so "100" <= "500" and "10" matches "10.0"); dates and other
      // strings compare lexicographically (ISO dates sort correctly).
      const numeric = isNumericLike(startVal) && isNumericLike(endVal);
      const lo = numeric ? Number(startVal) : String(startVal);
      const hi = numeric ? Number(endVal) : String(endVal);
      const defaultValue = options.filter(opt => {
        if (numeric && isNumericLike(opt)) {
          const n = Number(opt);
          return n >= lo && n <= hi;
        }
        return opt >= String(startVal) && opt <= String(endVal);
      });

      // If options in range, return them
      if (defaultValue.length > 0) {
        return defaultValue;
      }
      // Fall back to full range
      return options;
    }
  }

  // Query-based multi-select default: the run resolved it into a `defaults`
  // parquet and shipped display.default.values as null.
  if (Array.isArray(queriedDefaults)) {
    return queriedDefaults;
  }

  // New structure: display.default.value or display.default.values
  if (data.display?.default?.value !== undefined) {
    return data.display.default.value;
  }
  if (data.display?.default?.values !== undefined && data.display.default.values !== null) {
    return expandDefaultLiteral(data.display.default.values, options);
  }

  // Legacy structure: results.display.default.value or results.display.default.values
  if (data.results?.display?.default?.value !== undefined) {
    return data.results.display.default.value;
  }
  if (
    data.results?.display?.default?.values !== undefined &&
    data.results.display.default.values !== null
  ) {
    return expandDefaultLiteral(data.results.display.default.values, options);
  }

  // Static options fallback
  if (data.static_props?.options?.[0]) {
    return data.static_props.options[0];
  }

  // Fall back to first option
  return options[0];
};

/**
 * Load parquet files, extract options, and compute defaults for a single input
 * @param {import("@duckdb/duckdb-wasm").AsyncDuckDB} db - DuckDB instance
 * @param {Object} inputData - Input metadata from API
 * @returns {Promise<Object>} Processed input with options and default
 */
const loadExtractComputeInput = async (db, inputData) => {
  let options = [];
  let queriedDefaults = null;

  // Check for parquet-based structure
  if (inputData.files && Array.isArray(inputData.files)) {
    // Find options / defaults files in files array
    const optionsFile = inputData.files.find(f => f.key === 'options');
    const defaultsFile = inputData.files.find(f => f.key === 'defaults');

    if (defaultsFile && db) {
      await loadInsightParquetFiles(db, [defaultsFile]);
      queriedDefaults = await extractDefaultsFromDuckDB(db, defaultsFile.name_hash);
    }

    if (optionsFile && db) {
      // Load parquet file into DuckDB and extract options
      await loadInsightParquetFiles(db, [optionsFile]);
      options = await extractOptionsFromDuckDB(db, optionsFile.name_hash);
    } else if (inputData.static_props?.options) {
      // Static options from metadata
      options = inputData.static_props.options.map(String);
    } else if (inputData.static_props?.range) {
      // Range-based options from metadata
      options = generateRangeOptions(inputData.static_props.range, inputData.display?.type);
    }
  } else if (inputData.results) {
    // Legacy structure: results.options or results.range
    if (inputData.structure === 'options' && inputData.results.options) {
      options = inputData.results.options.map(String);
    } else if (inputData.structure === 'range' && inputData.results.range) {
      options = generateRangeOptions(inputData.results.range, inputData.results?.display?.type);
    }
  }

  // Extract default value
  const defaultValue = extractDefaultValue(inputData, options, queriedDefaults);
  const inputType = inputData.type || 'single-select';

  return {
    name: inputData.name,
    options,
    defaultValue,
    inputType,
    data: inputData,
  };
};

/**
 * Hook for centralized input loading
 *
 * Orchestrates the complete input loading pipeline:
 * 1. Fetch input metadata from API in a single batch
 * 2. Load required parquet files into DuckDB as tables
 * 3. Extract options and compute defaults
 * 4. Store results in Zustand store
 *
 * This hook should be called at the Dashboard level to prefetch
 * all visible inputs before individual Input components render.
 *
 * @param {string} projectId - Project ID
 * @param {string[]} inputNames - Array of input names to load
 * @returns {Object} Loading state
 */
export const useInputsData = (projectId, inputNames, { cacheKey = null } = {}) => {
  const db = useDuckDB();
  const fetchInputJobs = useFetchInputJobs();
  const setInputJobOptions = useStore(state => state.setInputJobOptions);
  const setDefaultInputJobValues = useStore(state => state.setDefaultInputJobValues);
  const setInputJobData = useStore(state => state.setInputJobData);
  const storeInputOptions = useStore(state => state.inputJobOptions);

  // Stable sorted array to prevent unnecessary re-fetches
  const stableInputNames = useMemo(() => {
    if (!inputNames?.length) return [];
    return [...new Set(inputNames)].sort(); // Dedupe and sort
  }, [inputNames]);

  // Check which inputs are already loaded to skip redundant processing. On a
  // run refresh (cacheKey/runDataVersion changed) reprocess ALL of them so the
  // rebuilt option data is picked up.
  const refreshing = Boolean(cacheKey);
  const unloadedInputNames = useMemo(() => {
    return stableInputNames.filter(name => !storeInputOptions[name]);
  }, [stableInputNames, storeInputOptions]);
  const namesToProcess = refreshing ? stableInputNames : unloadedInputNames;

  // Main query function
  const queryFn = useCallback(async () => {
    if (!db) {
      return { processed: [] };
    }

    if (!namesToProcess.length) {
      return { processed: [] }; // All inputs already loaded
    }

    // Step 1: Fetch input metadata from API (single batch call)
    const inputs = await fetchInputJobs(projectId, namesToProcess);

    if (!inputs?.length) {
      return { processed: [] };
    }

    // Step 2: Batch load all parquet files first (single DuckDB batch) — both
    // the `options` tables and any query-based `defaults` tables.
    const parquetFiles = inputs
      .filter(i => i.files?.length)
      .flatMap(i => i.files.filter(f => f.key === 'options' || f.key === 'defaults'));

    if (parquetFiles.length > 0) {
      await loadInsightParquetFiles(db, parquetFiles, refreshing);
    }

    // Step 3: Process each input (options are already in DuckDB tables)
    const results = await Promise.allSettled(
      inputs.map(input => loadExtractComputeInput(db, input))
    );

    // Step 4: Collect successful results
    const processed = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        processed.push(result.value);
      }
    });

    return { processed };
  }, [db, projectId, namesToProcess, fetchInputJobs, refreshing]);

  // React Query for data fetching
  const { data, isLoading, error } = useQuery({
    queryKey: ['inputs', projectId, namesToProcess.join(','), !!db, cacheKey],
    queryFn,
    enabled: !!projectId && namesToProcess.length > 0 && !!db,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
  });

  // Update store when data arrives (single batch update)
  useEffect(() => {
    if (data?.processed?.length > 0) {
      // Batch set all options
      data.processed.forEach(({ name, options, data: inputData }) => {
        setInputJobOptions(name, options);
        if (inputData) {
          setInputJobData(name, inputData);
        }
      });

      // Batch set all defaults in a single store update
      const inputDefaults = data.processed
        .filter(({ defaultValue }) => defaultValue !== undefined && defaultValue !== null)
        .map(({ name, defaultValue, inputType }) => ({
          name,
          value: defaultValue,
          type: inputType,
        }));

      if (inputDefaults.length > 0) {
        setDefaultInputJobValues(inputDefaults);
      }
    }
  }, [data, setInputJobOptions, setInputJobData, setDefaultInputJobValues]);

  return {
    isInputsLoading: isLoading,
    error,
  };
};
