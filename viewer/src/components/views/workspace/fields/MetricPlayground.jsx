import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CircularProgress from '@mui/material/CircularProgress';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { PiFunnel } from 'react-icons/pi';
import useStore from '../../../../stores/store';
import { parseRefValue } from '../../../../utils/refString';
import { getTypeColors } from '../../common/objectTypeConfigs';
import { useDuckDB } from '../../../../contexts/DuckDBContext';
import { useModelQueryJob } from '../../../../hooks/useModelQueryJob';
import { getConnection } from '../../../../duckdb/duckdb';
import { runDuckDBQuery } from '../../../../duckdb/queries';
import { useFieldParentModel } from './useFieldParentModel';
import { runMetricPreview } from './metricPreview';
import Select from '../../../common/Select';

/**
 * MetricPlayground — the Field Lens body for a `metric` (VIS-1009 / VIS-1026).
 *
 * A one-metric studio: a mini result (a compact bar breakdown of the metric),
 * plus two always-defaulted controls:
 *
 *   - split-by — choose a parent-model dimension to break the metric into bars;
 *     defaults to the first available dimension.
 *   - time-grain — when the split field is a date/time dimension, bucket it with
 *     `date_trunc(<grain>, …)` so the metric trends over time.
 *
 * VIS-1026: the preview no longer routes a SYNTHETIC insight through the
 * insight-preview run pipeline (`tim-local-serve-run-on-save` deletes it).
 * Instead it uses the surviving model-query-job + DuckDB-WASM path that
 * DimensionInspector uses: run the parent model's SQL against its source, then
 * compute the metric's `GROUP BY` aggregate locally. Read-only; editing lives in
 * the right rail. On-demand (a Run button), matching the sibling dimension lens.
 */
const TIME_GRAINS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
];

const DATE_HINT = /date|time|day|month|year|quarter|week/i;

const FieldCallout = ({ testId, title, body }) => (
  <div
    data-testid={testId}
    className="flex flex-1 items-center justify-center bg-gray-50 p-8 text-center"
  >
    <div className="max-w-[360px]">
      <h3 className="text-[14px] font-semibold text-gray-800">{title}</h3>
      {body && <p className="mt-1.5 text-[13px] leading-relaxed text-gray-500">{body}</p>}
    </div>
  </div>
);

const MetricPlayground = ({ activeObject, record: providedRecord }) => {
  const name = activeObject?.name || null;
  const metrics = useStore(s => s.metrics);
  const fetchMetrics = useStore(s => s.fetchMetrics);
  const dimensions = useStore(s => s.dimensions);
  const fetchDimensions = useStore(s => s.fetchDimensions);

  useEffect(() => {
    if ((!metrics || metrics.length === 0) && typeof fetchMetrics === 'function') fetchMetrics();
    if ((!dimensions || dimensions.length === 0) && typeof fetchDimensions === 'function') {
      fetchDimensions();
    }
  }, [metrics, fetchMetrics, dimensions, fetchDimensions]);

  const fieldRecord = useMemo(
    () => (Array.isArray(metrics) ? metrics.find(m => m.name === name) || null : null),
    [metrics, name]
  );

  const expression = useMemo(() => {
    const cfg = fieldRecord?.config || providedRecord || null;
    return cfg?.expression || null;
  }, [fieldRecord, providedRecord]);

  const { parentModelName, modelConfig, sourceName, status: parentStatus } =
    useFieldParentModel(fieldRecord);
  const modelSql = modelConfig?.sql || null;

  // Sibling dimensions of the same parent model are the split candidates. A
  // dimension's model binding may be a raw `${ref(model)}` string — unwrap it
  // before comparing against the resolved bare model name. Each candidate
  // carries its RAW expression (falling back to the bare name as a column) so
  // the local DuckDB aggregate can group on real SQL, not a semantic `${ref}`.
  const splitCandidates = useMemo(() => {
    if (!parentModelName || !Array.isArray(dimensions)) return [];
    return dimensions
      .filter(d => parseRefValue(d.parentModel || d.config?.model) === parentModelName)
      .map(d => ({
        name: d.name,
        isDate: DATE_HINT.test(d.name),
        expression: d.config?.expression || `"${d.name}"`,
      }));
  }, [dimensions, parentModelName]);

  const [splitField, setSplitField] = useState('');
  const [grain, setGrain] = useState('month');

  // The frame reuses this body across sibling selections — drop a split field
  // that isn't one of THIS metric's candidates (e.g. it survived a switch onto
  // a metric with a different parent model) so it can re-default cleanly
  // instead of building a broken `${ref(newModel).old_field}` query.
  useEffect(() => {
    if (splitField && !splitCandidates.some(c => c.name === splitField)) {
      setSplitField('');
    }
  }, [splitCandidates, splitField]);

  // Always default the split to the first candidate so a chart renders without
  // the user touching the controls.
  useEffect(() => {
    if (!splitField && splitCandidates.length > 0) {
      setSplitField(splitCandidates[0].name);
    }
  }, [splitCandidates, splitField]);

  const activeCandidate = useMemo(
    () => splitCandidates.find(c => c.name === splitField) || null,
    [splitCandidates, splitField]
  );
  const showGrain = Boolean(activeCandidate?.isDate);

  // The local-aggregate spec: y is the metric's raw expression; x is the split
  // dimension's raw expression (date-bucketed by the grain — see the CAST note
  // in metricPreview.js: date_trunc needs a timestamp, and DuckDB parses ISO-ish
  // date strings so the cast covers both real dates and string-dates).
  const previewSpec = useMemo(() => {
    if (!expression) return null;
    return {
      metricExpr: expression,
      splitExpr: splitField && activeCandidate ? activeCandidate.expression : null,
      showGrain,
      grain,
    };
  }, [expression, splitField, activeCandidate, showGrain, grain]);

  // Preview run: the parent model runs server-side (real source), then the
  // metric aggregate is computed locally in DuckDB over its rows (VIS-1026).
  const db = useDuckDB();
  const {
    status: jobStatus,
    result,
    error,
    isRunning,
    executeQuery,
    reset,
  } = useModelQueryJob();
  const [hasRun, setHasRun] = useState(false);
  const [aggregating, setAggregating] = useState(false);
  const [rows, setRows] = useState(null);
  const [aggError, setAggError] = useState(null);
  const runForNameRef = useRef(null);
  // A per-Run token so the aggregate effect re-fires on each Run even when the
  // job's completed state doesn't change identity (the guard below still holds
  // it until the model run actually completes).
  const [runToken, setRunToken] = useState(0);
  // The last runToken already aggregated — makes the effect idempotent per run
  // so it can't loop if a memo dep (previewSpec) churns identity across renders.
  const aggregatedTokenRef = useRef(-1);
  const mountedRef = useRef(true);
  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const handleRun = useCallback(() => {
    if (!sourceName || !modelSql) return;
    runForNameRef.current = name;
    setHasRun(true);
    setRows(null);
    setAggError(null);
    setRunToken(t => t + 1);
    executeQuery(sourceName, modelSql).catch(() => {});
  }, [sourceName, modelSql, executeQuery, name]);

  // The frame reuses this body across sibling metric selections — reset the run
  // state when the metric changes so a stale aggregate never shows for the new
  // metric.
  const lastNameRef = useRef(name);
  useEffect(() => {
    if (lastNameRef.current === name) return;
    lastNameRef.current = name;
    runForNameRef.current = null;
    reset();
    setHasRun(false);
    setRows(null);
    setAggError(null);
    setAggregating(false);
  }, [name, reset]);

  // When the model run completes, compute the metric aggregate locally.
  useEffect(() => {
    const modelRows = result?.rows || result?.data || null;
    if (
      jobStatus !== 'completed' ||
      runForNameRef.current !== name ||
      !db ||
      !previewSpec ||
      !Array.isArray(modelRows) ||
      modelRows.length === 0 ||
      aggregatedTokenRef.current === runToken // already aggregated THIS run
    ) {
      return undefined;
    }
    aggregatedTokenRef.current = runToken;
    const thisToken = runToken;
    // Run-latest-wins: apply the result only if this is still the newest run
    // (a newer Run bumps aggregatedTokenRef) and the component is still mounted.
    // NOT tied to the effect's cleanup — a churny `previewSpec` identity would
    // otherwise cancel an in-flight aggregation on a no-op re-run.
    const isCurrent = () => mountedRef.current && aggregatedTokenRef.current === thisToken;
    (async () => {
      setAggregating(true);
      setAggError(null);
      try {
        const out = await runMetricPreview({
          db,
          getConnection,
          runQuery: runDuckDBQuery,
          modelRows,
          spec: previewSpec,
        });
        if (isCurrent()) setRows(out);
      } catch (err) {
        if (isCurrent()) setAggError(err.message || String(err));
      } finally {
        if (isCurrent()) setAggregating(false);
      }
    })();
    return undefined;
  }, [jobStatus, result, db, previewSpec, name, runToken]);

  const colors = getTypeColors('metric');

  if (parentStatus === 'no-parent') {
    return (
      <FieldCallout
        testId="metric-playground-no-parent"
        title="No parent model"
        body={`Metric "${name}" isn't bound to a model, so it can't be previewed here.`}
      />
    );
  }
  if (parentStatus === 'model-not-found') {
    return (
      <FieldCallout
        testId="metric-playground-no-parent"
        title="Parent model unavailable"
        body={`The model "${parentModelName}" that owns this metric couldn't be resolved.`}
      />
    );
  }

  return (
    <div
      data-testid="metric-playground"
      className="flex flex-1 min-h-0 flex-col overflow-hidden bg-white"
    >
      {/* Header: metric chip + expression + run */}
      <div className="border-b border-gray-200 px-4 py-3">
        <div className="mb-1 flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${colors.bg} ${colors.text}`}
          >
            <PiFunnel className="h-3 w-3" aria-hidden="true" />
            Metric
          </span>
          <span className="text-[12px] font-semibold text-gray-900">{name}</span>
          {parentModelName && (
            <span className="text-[11px] text-gray-400">
              · <span className="font-mono">{parentModelName}</span>
            </span>
          )}
          <button
            type="button"
            data-testid="metric-playground-run"
            onClick={handleRun}
            disabled={isRunning || aggregating || !sourceName || !modelSql}
            className="ml-auto inline-flex h-7 items-center gap-1 rounded-md bg-primary px-3 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRunning || aggregating ? (
              <CircularProgress size={12} style={{ color: 'white' }} />
            ) : (
              <PlayArrowIcon style={{ fontSize: 16 }} />
            )}
            Run
          </button>
        </div>
        <pre
          data-testid="metric-playground-expression"
          className="overflow-x-auto rounded-md bg-gray-900 px-3 py-2 font-mono text-[12px] leading-relaxed text-gray-100"
        >
          {expression || '(no expression)'}
        </pre>
      </div>

      {/* Controls: split-by + time-grain */}
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 px-4 py-2">
        <label className="flex items-center gap-1.5 text-[12px] text-gray-600">
          Split by
          <Select
            data-testid="metric-playground-split"
            size="sm"
            className="min-w-[140px]"
            value={splitField}
            options={[
              { value: '', label: '(none)' },
              ...splitCandidates.map(c => ({ value: c.name, label: c.name })),
            ]}
            onChange={v => setSplitField(v || '')}
          />
        </label>

        <label
          className={`flex items-center gap-1.5 text-[12px] ${showGrain ? 'text-gray-600' : 'text-gray-300'}`}
        >
          Time grain
          <Select
            data-testid="metric-playground-time-grain"
            size="sm"
            className="min-w-[140px]"
            value={grain}
            disabled={!showGrain}
            options={TIME_GRAINS}
            onChange={setGrain}
          />
        </label>
      </div>

      {/* Mini result (VIS-1026: local aggregate, on-demand) */}
      <div
        data-testid="metric-playground-result"
        className="flex flex-1 min-h-0 flex-col overflow-y-auto px-4 py-3"
      >
        {!previewSpec ? (
          <FieldCallout
            testId="metric-playground-idle"
            title="Resolving metric…"
            body="Binding this metric to its parent model."
          />
        ) : !hasRun ? (
          <FieldCallout
            testId="metric-playground-prompt"
            title="Preview this metric"
            body="Run to evaluate the metric against its parent model and see it broken down by the split dimension."
          />
        ) : isRunning ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <CircularProgress size={28} />
            <span className="text-sm text-gray-600">Running model…</span>
          </div>
        ) : error ? (
          <div
            data-testid="metric-playground-error"
            className="rounded bg-highlight-50 p-3 font-mono text-sm text-highlight-700"
          >
            {typeof error === 'string' ? error : error?.message || String(error)}
          </div>
        ) : aggError ? (
          <div
            data-testid="metric-playground-error"
            className="rounded bg-highlight-50 p-3 font-mono text-sm text-highlight-700"
          >
            {aggError}
          </div>
        ) : aggregating ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <CircularProgress size={28} />
            <span className="text-sm text-gray-600">Aggregating the metric…</span>
          </div>
        ) : rows && rows.length > 0 ? (
          <MetricResultBars rows={rows} accent={colors} splitField={splitField} />
        ) : rows ? (
          <FieldCallout
            testId="metric-playground-empty"
            title="No rows"
            body="The parent model returned no rows, so the metric has nothing to aggregate."
          />
        ) : null}
      </div>
    </div>
  );
};

/**
 * A compact CSS-bar breakdown of the metric result — a horizontal bar per group
 * sized to `y / max(y)`. Self-drawn (no Plotly): the metric lens is a quick
 * sanity-check, not a full chart surface.
 */
const MetricResultBars = ({ rows, accent, splitField }) => {
  const max = Math.max(...rows.map(r => Math.abs(Number(r.y) || 0)), 1);
  const fmtX = v => {
    if (v == null) return '(null)';
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return String(v);
  };
  const fmtY = v => {
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    return Math.abs(n) >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : `${n}`;
  };
  return (
    <div data-testid="metric-playground-bars" className="flex flex-col gap-1.5">
      {rows.map((r, i) => (
        <div key={`${fmtX(r.x)}-${i}`} className="flex items-center gap-2 text-[12px]">
          <span
            className="w-28 shrink-0 truncate text-right text-gray-600"
            title={fmtX(r.x)}
          >
            {splitField ? fmtX(r.x) : 'Total'}
          </span>
          <div className="relative h-4 flex-1 rounded bg-gray-100">
            <div
              className={`absolute inset-y-0 left-0 rounded ${accent.bg}`}
              style={{ width: `${Math.max((Math.abs(Number(r.y) || 0) / max) * 100, 2)}%` }}
            />
          </div>
          <span className="w-16 shrink-0 text-right font-mono text-gray-800">{fmtY(r.y)}</span>
        </div>
      ))}
    </div>
  );
};

export default MetricPlayground;
