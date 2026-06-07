import ChartPreview from './ChartPreview';
import TablePreview from './TablePreview';
import MarkdownPreview from './MarkdownPreview';
import InputPreview from './InputPreview';
import InsightPreview from './InsightPreview';
import ModelPreview from './ModelPreview';

/**
 * previewRegistry — the single shared seam for Track N per-object previews.
 *
 * MiddlePane's PerObjectPane (VIS-775) looks an object's `type` up here to
 * decide whether a custom Preview lens exists. The six Track N previews
 * (chart / table / markdown / input / insight / model) each reuse the
 * EXISTING renderer for their type, framed by the already-built MiddlePane /
 * SubBar preview chrome (the `[Preview | Lineage]` lens picker shipped by
 * Tracks D/E). They invent NO new visual design — they inherit it.
 *
 * Any type NOT in this map (source, dimension, metric, relation, unknown,
 * etc.) has no custom preview and falls back to the universal Lineage lens
 * via the existing PerObjectPane mechanism — the Preview lens reads muted /
 * "no preview available yet" and the pane parks on Lineage. N-7
 * (LineageFallbackPreview / VIS-803) is CANCELED; the fallback is the plain
 * Lineage lens, not a bespoke component.
 *
 * Each component receives `{ activeObject, projectId }` and is responsible for
 * resolving its own config from the store (the per-type collections keyed in
 * RightRailEditPanel's COLLECTION_KEY) and loading its data via the same hooks
 * the Dashboard renderer uses, so a saved object previews identically to how it
 * renders on a dashboard.
 */
export const PREVIEW_REGISTRY = {
  chart: ChartPreview,
  table: TablePreview,
  markdown: MarkdownPreview,
  input: InputPreview,
  insight: InsightPreview,
  model: ModelPreview,
};

/**
 * Resolve the preview component for an object type, or null when none exists
 * (caller falls back to the Lineage lens).
 */
export const getPreviewComponent = type => PREVIEW_REGISTRY[type] || null;

/**
 * Whether a given object type has a custom Preview lens. Drives the
 * PreviewLensPicker's `previewDisabled` muted state for fallback types.
 */
export const hasPreview = type => Boolean(PREVIEW_REGISTRY[type]);

export default PREVIEW_REGISTRY;
