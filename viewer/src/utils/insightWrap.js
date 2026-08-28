import { generateUniqueName } from './uniqueName';

/**
 * insightWrap — the ONE naming + config recipe for auto-wrapping an insight in
 * a chart (decision 27 Aug: dashboard items never take a bare insight — the
 * Chart wrapper is the composition boundary, and the Item schema stays
 * untouched).
 *
 * Three surfaces mint wrapper charts and they must never drift:
 *   - Library "Wrap in Chart…" (#632, Library.jsx),
 *   - dropping an insight on the canvas (#637, WorkspaceDndContext.jsx),
 *   - picking an insight from the ReferencePicker (click-to-pick: the canvas
 *     empty slot + the right rail's "Choose…").
 *
 * The name is the hyphenated cascade `<insight>-chart` (#615) with `-2`
 * disambiguation (#620) — `separator: '-'` is forced so a collision on an
 * underscored insight name still suffixes in the house style the base
 * `<insight>-chart` already committed to.
 */

/**
 * Mint the unique wrapper-chart name for `insightName`.
 *
 * @param {string} insightName - the wrapped insight's name.
 * @param {Array|Set|Object} existingChartNames - chart names already in use.
 * @returns {string} `<insight>-chart`, suffixed `-2`, `-3`, … on collision.
 */
export const mintWrapperChartName = (insightName, existingChartNames) =>
  generateUniqueName(`${insightName}-chart`, existingChartNames, { separator: '-' });

/**
 * The wrapper chart's config: a chart whose only content is the insight.
 * Matches Library "Wrap in Chart…" (#632) byte-for-byte.
 *
 * @param {string} insightName - the wrapped insight's name.
 * @returns {{insights: string[]}}
 */
export const buildWrapperChartConfig = insightName => ({
  insights: [`ref(${insightName})`],
});
