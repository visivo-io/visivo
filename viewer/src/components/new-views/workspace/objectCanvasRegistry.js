import React from 'react';

/**
 * objectCanvasRegistry — the extensible descriptor registry behind every
 * per-object Workspace canvas (VIS-1001, supersedes the flat `previewRegistry`).
 *
 * One descriptor per object `type`:
 *   {
 *     Component,        // React.lazy ref — the canvas BODY (code-split)
 *     availability,     // 'always' | 'serve' (serve → dist shows "unavailable")
 *     availabilityKey,  // url key checked via isAvailable() when availability==='serve'
 *     defaultLens,      // key into `lenses` the pane opens on
 *     lenses,           // ORDERED [{ key, label, kind:'readonly'|'editable' }]
 *     emptyHint,        // shown in the frame's not-found / empty state
 *   }
 *
 * Metadata (icon / color / singular label) is NEVER stored here — descriptors
 * resolve it from objectTypeConfigs.js via getTypeColors / getTypeIcon /
 * getTypeByValue. The universal `lineage` lens is appended by ObjectCanvasFrame,
 * not declared here. Bodies are LAZY so Monaco / React-Flow / DuckDB-WASM /
 * Plotly never load until their canvas is opened (the frame shows its loading
 * state during chunk fetch).
 */

const ChartPreview = React.lazy(() => import('./ChartPreview'));
const TablePreview = React.lazy(() => import('./TablePreview'));
const MarkdownPreview = React.lazy(() => import('./MarkdownPreview'));
const MarkdownEditorCanvas = React.lazy(() => import('./MarkdownEditorCanvas'));
const InputPreview = React.lazy(() => import('./InputPreview'));
const InsightPreview = React.lazy(() => import('./InsightPreview'));
// SourceErd is the Source canvas body — a React-Flow ERD of the source's tables
// (VIS-1005). It is `serve`-gated on `sourcesMetadata` because it relies on the
// server-only introspection feed; on the dist build the frame shows its
// "unavailable" state instead of muting the Canvas lens to Lineage.
const SourceErd = React.lazy(() => import('./source/SourceErd'));
// ModelPreview is the Model canvas body; csvScriptModel + localMergeModel share
// it (VIS-1001 fixes the latent bug where those distinct type strings fell to
// lineage because the registry only keyed 'model').
const ModelCanvas = React.lazy(() => import('./ModelPreview'));
// RelationErdCanvas is the Relation canvas body (VIS-1006): a React-Flow ERD
// builder where dragging column→column authors a relation. It's editable (it
// writes relations via the relation store) and serve-only (it needs the live
// project's models + relations from the CLI server).
const RelationErdCanvas = React.lazy(() => import('./relations/RelationErdCanvas'));

const READONLY_PREVIEW = (label = 'Canvas') => ({ key: 'preview', label, kind: 'readonly' });

const MODEL_DESCRIPTOR = {
  Component: ModelCanvas,
  availability: 'serve',
  availabilityKey: 'modelQueryJobs',
  defaultLens: 'preview',
  lenses: [READONLY_PREVIEW()],
  emptyHint: 'No model selected.',
};

export const OBJECT_CANVAS_REGISTRY = {
  chart: {
    Component: ChartPreview,
    availability: 'always',
    defaultLens: 'preview',
    lenses: [READONLY_PREVIEW()],
    emptyHint: 'No chart selected.',
  },
  table: {
    Component: TablePreview,
    availability: 'always',
    defaultLens: 'preview',
    // VIS-1008 adds { key:'build', label:'Build', kind:'editable' } here.
    lenses: [READONLY_PREVIEW()],
    emptyHint: 'No table selected.',
  },
  markdown: {
    Component: MarkdownPreview,
    availability: 'always',
    defaultLens: 'preview',
    // VIS-1010: `preview` stays the read-only Canvas (MarkdownPreview); `edit`
    // is the bidirectional split editor (MarkdownEditorCanvas) that owns its own
    // draft + debounced save and reports dirtiness to the frame.
    lenses: [
      READONLY_PREVIEW(),
      { key: 'edit', label: 'Edit', kind: 'editable', Component: MarkdownEditorCanvas },
    ],
    emptyHint: 'No markdown selected.',
  },
  input: {
    Component: InputPreview,
    availability: 'always',
    defaultLens: 'preview',
    lenses: [READONLY_PREVIEW()],
    emptyHint: 'No input selected.',
  },
  insight: {
    Component: InsightPreview,
    availability: 'always',
    defaultLens: 'preview',
    lenses: [READONLY_PREVIEW()],
    emptyHint: 'No insight selected.',
  },
  // Source gets a real Canvas lens (the table ERD) instead of muting to lineage
  // (VIS-1005). It's CLI-only (`serve`) because the ERD reads the server's
  // introspection feed (`sourcesMetadata`).
  source: {
    Component: SourceErd,
    availability: 'serve',
    availabilityKey: 'sourcesMetadata',
    defaultLens: 'preview',
    lenses: [READONLY_PREVIEW()],
    emptyHint: 'No source selected.',
  },
  model: MODEL_DESCRIPTOR,
  csvScriptModel: MODEL_DESCRIPTOR,
  localMergeModel: MODEL_DESCRIPTOR,
  relation: {
    Component: RelationErdCanvas,
    availability: 'serve',
    availabilityKey: 'relationsList',
    defaultLens: 'preview',
    // The Canvas lens IS the ERD builder — authoring relations by dragging
    // column→column writes to the relation store, so it's editable.
    lenses: [{ key: 'preview', label: 'Canvas', kind: 'editable' }],
    emptyHint: 'No relation selected.',
  },
};

/** Resolve the descriptor for an object type, or null when none exists. */
export const getCanvasDescriptor = type => OBJECT_CANVAS_REGISTRY[type] || null;

/** Whether a given object type has a registered canvas. */
export const hasCanvas = type => Boolean(OBJECT_CANVAS_REGISTRY[type]);

export default OBJECT_CANVAS_REGISTRY;
