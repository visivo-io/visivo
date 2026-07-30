import { translateExpressions } from '../../../api/expressions';
import * as pillGrammar from '../common/pillGrammar';
import { findMatchingExpressionSlots } from '../common/pillFieldSwap';
import { serializeQueryString } from '../../../utils/queryString';
import { emitWorkspaceEvent } from './telemetry';

/**
 * saveAsMetricFlow — Explore 2.0 Phase 4 (06-pill-aggregation-grammar.md §4
 * "Save as metric…" + §8 match-and-replace dedup).
 *
 * Pulled out of any component so the whole flow — collision check, server-
 * side aggregate-ness validation, born-bound `saveMetric`, slot swap, dedup
 * scan — is independently testable without mounting `PillMenu`/
 * `InsightBuildSection`. `InsightBuildSection` is the only current caller
 * (wires the name prompt + the resulting `dedupOffer` to
 * `FieldSwapOfferBanner`).
 */

/** Suggested name per 06 §4: `<query>_<col>_<agg>`, sanitized to a valid
 * Metric name (`Metric.validate_sql_identifier`: letters/digits/underscore,
 * not leading with a digit). */
export const suggestMetricName = pillState => {
  const raw = `${pillState.ref}_${pillState.column}_${pillState.agg}`;
  const sanitized = raw.replace(/[^a-zA-Z0-9_]/g, '_');
  return /^[a-zA-Z_]/.test(sanitized) ? sanitized : `m_${sanitized}`;
};

/**
 * @param {object} params
 * @param {object} params.pillState - the `kind: 'aggregate'` pill state
 *   being promoted (`{ref, column, agg}`).
 * @param {string} params.name - the user-chosen metric name.
 * @param {string} params.insightName - the insight this slot belongs to.
 * @param {string} params.path - the prop dot-path (`PropertyRow`'s `path`).
 * @param {string} [params.sourceDialect] - the model's source dialect, for
 *   the server-side parse/aggregate-ness check.
 * @param {() => object} params.getState - `useStore.getState` (or a test
 *   double with the same shape).
 * @returns {Promise<{success: boolean, error?: string, dedupOffer?: object|null}>}
 */
export const saveAsMetric = async ({
  pillState,
  name,
  insightName,
  path,
  sourceDialect,
  getState,
}) => {
  const trimmed = (name || '').trim();
  if (!trimmed) return { success: false, error: 'A metric name is required.' };

  const state = getState();
  // Metric names are project-global (metric.py:57's open namespacing TODO) —
  // hard-block on collision, per 06 §4.
  const collision = (state.metrics || []).some(m => m.name === trimmed);
  if (collision) {
    return {
      success: false,
      error: `A metric named "${trimmed}" already exists — choose another name.`,
    };
  }

  // Model-scoped expression form (Metric.expression docstring: "direct SQL
  // aggregates, e.g. 'SUM(amount)'" — NOT the ref-wrapped pill form).
  const expression = `${pillState.agg}(${pillState.column})`;

  // Server-side aggregate-ness check (06 §4: "required — Metric has no
  // Pydantic validator for it; a non-aggregate metric fails only at GROUP BY
  // build time"). Reuses the existing /api/expressions/translate/ endpoint's
  // `detected_type` (has_aggregate_function-derived) rather than a new
  // endpoint. Fails OPEN on an unreachable endpoint (dist/cloud) — mirrors
  // expressionPreflight's fail-open convention; this is a UX pre-flight, not
  // the sole guard (though it's currently the ONLY aggregate-ness guard at
  // all, per the metric.py TODO — the backend save itself doesn't check).
  try {
    const { translations, errors } = await translateExpressions(
      [{ name: trimmed, expression, type: '' }],
      sourceDialect
    );
    if (errors?.length > 0) {
      return { success: false, error: errors[0].error || 'That expression is not valid SQL.' };
    }
    const detectedType = translations?.[0]?.detected_type;
    if (detectedType && detectedType !== 'metric') {
      return {
        success: false,
        error:
          'This expression is not an aggregate — wrap it in SUM/AVG/etc, or save it as a dimension instead.',
      };
    }
  } catch (err) {
    console.error('saveAsMetric: aggregate-ness check unreachable — proceeding (fail-open)', err);
  }

  const saveMetric = state.saveMetric;
  if (typeof saveMetric !== 'function') {
    return { success: false, error: 'Save action unavailable.' };
  }
  // Born BOUND to its parent model (closes B12 for this flow, 06 §4).
  const saveResult = await saveMetric(trimmed, { expression, parentModel: pillState.ref });
  if (saveResult && saveResult.success === false) {
    return { success: false, error: saveResult.error || 'Failed to save the metric.' };
  }

  // Slot swap — this pill now references the durable metric, never silently.
  getState().setInsightProp?.(
    insightName,
    path,
    serializeQueryString({ body: pillGrammar.serialize({ kind: 'metricRef', ref: trimmed }) })
  );

  // Match-and-replace dedup (06 §8, Lightdash-adopted): offer, never apply silently.
  const matches = findMatchingExpressionSlots(
    {
      promotedRef: pillState.ref,
      promotedColumn: pillState.column,
      promotedAgg: pillState.agg,
      promotedName: trimmed,
      promotedType: 'metric',
    },
    getState().explorerInsightStates || {},
    { excludeInsightName: insightName, excludeLocation: 'prop', excludeKey: path }
  );

  // VIS-1072 — flywheel telemetry.
  emitWorkspaceEvent('save_as_metric_used', { name: trimmed, dedupOfferSlots: matches.length });

  return {
    success: true,
    dedupOffer:
      matches.length > 0 ? { promotedType: 'metric', promotedName: trimmed, slots: matches } : null,
  };
};
