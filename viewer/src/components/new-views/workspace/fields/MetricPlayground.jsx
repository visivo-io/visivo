import React, { useEffect, useMemo, useState } from 'react';
import { PiFunnel } from 'react-icons/pi';
import useStore from '../../../../stores/store';
import { formatRefExpression } from '../../../../utils/refString';
import { getTypeColors } from '../../common/objectTypeConfigs';
import ExplorerInsightPreview from '../../common/InsightPreview';
import { useFieldParentModel } from './useFieldParentModel';
import Select from '../../../common/Select';

/**
 * MetricPlayground — the Field Lens body for a `metric` (VIS-1009).
 *
 * A one-metric studio: a mini result (a small chart of the metric) backed by a
 * SYNTHETIC single-metric insight, plus two always-defaulted controls that lean
 * on the existing Insights split / time-grain machinery:
 *
 *   - split-by — choose a parent-model dimension to break the metric into series
 *     (rendered as an insight `split` interaction); defaults to the first
 *     available dimension so a chart renders immediately.
 *   - time-grain — when the split field is a date/time dimension, bucket it with
 *     `date_trunc(<grain>, …)` so the metric trends over time.
 *
 * The synthetic insight is handed to the SAME `common/InsightPreview` the
 * Explorer / right-rail editor use (it builds a synthetic chart + input widgets
 * and drives data through the preview-run pipeline), so a metric previews
 * exactly like a saved insight. Read-only; editing lives in the right rail.
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

const MetricPlayground = ({ activeObject, projectId, record: providedRecord }) => {
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

  const { parentModelName, status: parentStatus } = useFieldParentModel(fieldRecord);

  // Sibling dimensions of the same parent model are the split candidates.
  const splitCandidates = useMemo(() => {
    if (!parentModelName || !Array.isArray(dimensions)) return [];
    return dimensions
      .filter(d => (d.parentModel || d.config?.model) === parentModelName)
      .map(d => ({ name: d.name, isDate: DATE_HINT.test(d.name) }));
  }, [dimensions, parentModelName]);

  const [splitField, setSplitField] = useState('');
  const [grain, setGrain] = useState('month');

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

  // Build the synthetic single-metric insight. y is the named metric ref; x is
  // the chosen split dimension (date-bucketed by the grain when applicable).
  const insightConfig = useMemo(() => {
    if (!parentModelName || !name) return null;
    const metricRef = formatRefExpression(parentModelName, name);

    if (!splitField) {
      // No dimension to split on — a single aggregate value (bar with a constant x).
      return {
        name: `__metric_preview__${name}`,
        props: {
          type: 'bar',
          x: `?{ '${name}' }`,
          y: `?{ ${metricRef} }`,
        },
        interactions: [],
      };
    }

    const dimRef = formatRefExpression(parentModelName, splitField);
    // The split candidate is heuristically date-like (DATE_HINT on its name), but
    // the underlying column may be a VARCHAR (e.g. `formatted_date` =
    // strftime(date,'%Y-%m-%d')). date_trunc only accepts a date/timestamp, so we
    // CAST the expression to TIMESTAMP first — DuckDB parses ISO-ish date strings
    // and the cast is a no-op for genuine DATE/TIMESTAMP columns, so the grain
    // works on either a string-date or a real date/time dimension.
    const xExpr = showGrain
      ? `date_trunc('${grain}', CAST(${dimRef} AS TIMESTAMP))`
      : dimRef;
    return {
      name: `__metric_preview__${name}`,
      props: {
        type: 'bar',
        x: `?{ ${xExpr} }`,
        y: `?{ ${metricRef} }`,
      },
      interactions: [{ split: `?{ ${dimRef} }` }],
    };
  }, [parentModelName, name, splitField, showGrain, grain]);

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
      {/* Header: metric chip + expression */}
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

      {/* Mini result */}
      <div data-testid="metric-playground-result" className="flex flex-1 min-h-0 flex-col">
        {insightConfig ? (
          <ExplorerInsightPreview insightConfig={insightConfig} projectId={projectId} />
        ) : (
          <FieldCallout
            testId="metric-playground-idle"
            title="Resolving metric…"
            body="Binding this metric to its parent model."
          />
        )}
      </div>
    </div>
  );
};

export default MetricPlayground;
