/**
 * objectCanvasRegistry (VIS-1001) — descriptor shape, plus a lazy-load smoke
 * test: every registered canvas body must resolve its code-split chunk and
 * render (a broken import path would otherwise only fail the first time a
 * user opens that canvas).
 *
 * B8 (Explore 2.0 Phase 0): `previewRegistry.js`, the one-release
 * backward-compat shim over this registry, is deleted — it had no production
 * consumers left (only its own shim-regression test, below, which now asserts
 * directly against this registry instead).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import {
  OBJECT_CANVAS_REGISTRY,
  getCanvasDescriptor,
  hasCanvas,
} from './objectCanvasRegistry';

// Stub every heavy canvas body so React.lazy resolves instantly without pulling
// Monaco / React-Flow / DuckDB-WASM / Plotly into this suite. Each stub renders
// a marker naming its module. (jest.mock factories must be inline functions.)
const mockCanvasBody = label => ({
  __esModule: true,
  default: () =>
    // eslint-disable-next-line no-undef
    require('react').createElement('div', { 'data-testid': `canvas-body-${label}` }),
});
jest.mock('./ChartPreview', () => mockCanvasBody('chart'));
jest.mock('./TablePreview', () => mockCanvasBody('table'));
jest.mock('./MarkdownPreview', () => mockCanvasBody('markdown'));
jest.mock('./MarkdownEditorCanvas', () => mockCanvasBody('markdown-editor'));
jest.mock('./pivot/PivotPlayground', () => mockCanvasBody('pivot-playground'));
jest.mock('./InputPreview', () => mockCanvasBody('input'));
jest.mock('./InsightPreview', () => mockCanvasBody('insight'));
jest.mock('./source/SourceErd', () => mockCanvasBody('source-erd'));
jest.mock('./ModelPreview', () => mockCanvasBody('model'));
jest.mock('./relations/RelationErdCanvas', () => mockCanvasBody('relation-erd'));
jest.mock('./fields/DimensionInspector', () => mockCanvasBody('dimension-inspector'));
jest.mock('./fields/MetricPlayground', () => mockCanvasBody('metric-playground'));

describe('objectCanvasRegistry', () => {
  const types = Object.keys(OBJECT_CANVAS_REGISTRY);

  test('every descriptor is well-formed', () => {
    types.forEach(type => {
      const d = OBJECT_CANVAS_REGISTRY[type];
      expect(d.Component).toBeTruthy();
      expect(['always', 'serve']).toContain(d.availability);
      const keys = d.lenses.map(l => l.key);
      expect(keys).toContain(d.defaultLens);
      d.lenses.forEach(l => {
        expect(typeof l.key).toBe('string');
        expect(typeof l.label).toBe('string');
        expect(['readonly', 'editable']).toContain(l.kind);
      });
    });
  });

  test('the dashboard-render previews are always available', () => {
    ['chart', 'table', 'markdown', 'input', 'insight'].forEach(type => {
      expect(OBJECT_CANVAS_REGISTRY[type].availability).toBe('always');
    });
  });

  test('the model family is CLI-only (serve) and shares ONE Model canvas body', () => {
    ['model', 'csvScriptModel', 'localMergeModel'].forEach(type => {
      expect(OBJECT_CANVAS_REGISTRY[type].availability).toBe('serve');
      expect(OBJECT_CANVAS_REGISTRY[type].availabilityKey).toBe('modelQueryJobs');
    });
    // Latent-bug guard: csvScriptModel + localMergeModel resolve to the SAME
    // component as `model`, so they render the canvas instead of falling to
    // lineage (the old registry only keyed 'model').
    expect(OBJECT_CANVAS_REGISTRY.csvScriptModel.Component).toBe(
      OBJECT_CANVAS_REGISTRY.model.Component
    );
    expect(OBJECT_CANVAS_REGISTRY.localMergeModel.Component).toBe(
      OBJECT_CANVAS_REGISTRY.model.Component
    );
  });

  test('the first lens of every registered type is the "Canvas" preview', () => {
    types.forEach(type => {
      const first = OBJECT_CANVAS_REGISTRY[type].lenses[0];
      expect(first.key).toBe('preview');
      expect(first.label).toBe('Canvas');
    });
  });

  test('table exposes a second editable "build" lens with its own body (VIS-1008)', () => {
    const tbl = OBJECT_CANVAS_REGISTRY.table;
    expect(tbl.defaultLens).toBe('preview');
    expect(tbl.lenses).toHaveLength(2);
    // preview stays the read-only Canvas (asserted by the "first lens" test).
    const build = tbl.lenses.find(l => l.key === 'build');
    expect(build).toBeTruthy();
    expect(build.label).toBe('Build');
    expect(build.kind).toBe('editable');
    // The editable build lens carries its OWN lazy body (the pivot playground),
    // distinct from the read-only preview body.
    expect(build.Component).toBeTruthy();
    expect(build.Component).not.toBe(tbl.Component);
  });

  test('markdown exposes a second editable "edit" lens with its own body (VIS-1010)', () => {
    const md = OBJECT_CANVAS_REGISTRY.markdown;
    expect(md.defaultLens).toBe('preview');
    expect(md.lenses).toHaveLength(2);
    const edit = md.lenses.find(l => l.key === 'edit');
    expect(edit).toBeTruthy();
    expect(edit.label).toBe('Edit');
    expect(edit.kind).toBe('editable');
    // The editable lens carries its OWN lazy body (the split editor), distinct
    // from the read-only preview body.
    expect(edit.Component).toBeTruthy();
    expect(edit.Component).not.toBe(md.Component);
  });

  test("most canvas previews are read-only; relation's Canvas is the editable ERD builder", () => {
    types
      .filter(type => type !== 'relation')
      .forEach(type => {
        expect(OBJECT_CANVAS_REGISTRY[type].lenses[0].kind).toBe('readonly');
      });
    // VIS-1006: the Relation Canvas lens IS the ERD builder — dragging
    // column→column authors a relation, so its first lens is editable.
    expect(OBJECT_CANVAS_REGISTRY.relation.lenses[0].kind).toBe('editable');
  });

  test('relation is a serve-only canvas gated on the relations list endpoint (VIS-1006)', () => {
    const d = OBJECT_CANVAS_REGISTRY.relation;
    expect(d.availability).toBe('serve');
    expect(d.availabilityKey).toBe('relationsList');
    expect(d.defaultLens).toBe('preview');
    expect(d.Component).toBeTruthy();
  });

  test('dimension + metric have the CLI-only (serve) Field Lens canvas (VIS-1009)', () => {
    ['dimension', 'metric'].forEach(type => {
      const d = OBJECT_CANVAS_REGISTRY[type];
      expect(d).toBeTruthy();
      // serve-gated on the cached-schema feed (B11 — NOT the dead
      // `sourcesMetadata` live-introspect feed, which returns zero databases
      // for file sources like DuckDB).
      expect(d.availability).toBe('serve');
      expect(d.availabilityKey).toBe('sourceSchemaJobsList');
      expect(d.defaultLens).toBe('preview');
      // A single read-only Field Lens body (the "first lens" test asserts the
      // preview/Canvas/readonly shape).
      expect(d.lenses).toHaveLength(1);
      expect(d.Component).toBeTruthy();
      expect(typeof d.emptyHint).toBe('string');
    });
    // The two fields have DISTINCT bodies (DimensionInspector vs MetricPlayground).
    expect(OBJECT_CANVAS_REGISTRY.dimension.Component).not.toBe(
      OBJECT_CANVAS_REGISTRY.metric.Component
    );
  });

  test('getCanvasDescriptor / hasCanvas', () => {
    expect(getCanvasDescriptor('chart')).toBe(OBJECT_CANVAS_REGISTRY.chart);
    expect(getCanvasDescriptor('mystery')).toBeNull();
    // source (VIS-1005) + relation (VIS-1006) now resolve real descriptors.
    expect(getCanvasDescriptor('source')).toBe(OBJECT_CANVAS_REGISTRY.source);
    // relation (VIS-1006) + dimension/metric (VIS-1009) now resolve descriptors.
    expect(getCanvasDescriptor('relation')).toBe(OBJECT_CANVAS_REGISTRY.relation);
    expect(getCanvasDescriptor('dimension')).toBe(OBJECT_CANVAS_REGISTRY.dimension);
    expect(getCanvasDescriptor('metric')).toBe(OBJECT_CANVAS_REGISTRY.metric);
    expect(hasCanvas('chart')).toBe(true);
    expect(hasCanvas('source')).toBe(true);
    expect(hasCanvas('relation')).toBe(true);
    expect(hasCanvas('dimension')).toBe(true);
    expect(hasCanvas('metric')).toBe(true);
  });

  test('source has the CLI-only (serve) ERD canvas gated on the cached-schema feed (VIS-1005)', () => {
    const d = OBJECT_CANVAS_REGISTRY.source;
    expect(d.availability).toBe('serve');
    // The ERD reads the cached-schema feed (not the live introspect), so it is
    // gated on `sourceSchemaJobsList` to match (fix-source-introspection).
    expect(d.availabilityKey).toBe('sourceSchemaJobsList');
    expect(d.defaultLens).toBe('preview');
    expect(d.Component).toBeTruthy();
  });

  test('every lazy canvas body (default + editable lens) resolves and renders', async () => {
    const bodies = [
      ['chart', OBJECT_CANVAS_REGISTRY.chart.Component],
      ['table', OBJECT_CANVAS_REGISTRY.table.Component],
      ['markdown', OBJECT_CANVAS_REGISTRY.markdown.Component],
      ['input', OBJECT_CANVAS_REGISTRY.input.Component],
      ['insight', OBJECT_CANVAS_REGISTRY.insight.Component],
      ['source-erd', OBJECT_CANVAS_REGISTRY.source.Component],
      // model + csvScriptModel + localMergeModel share ONE body.
      ['model', OBJECT_CANVAS_REGISTRY.model.Component],
      ['relation-erd', OBJECT_CANVAS_REGISTRY.relation.Component],
      ['dimension-inspector', OBJECT_CANVAS_REGISTRY.dimension.Component],
      ['metric-playground', OBJECT_CANVAS_REGISTRY.metric.Component],
      // The second, editable lens bodies (VIS-1008 / VIS-1010).
      ['pivot-playground', OBJECT_CANVAS_REGISTRY.table.lenses.find(l => l.key === 'build').Component],
      ['markdown-editor', OBJECT_CANVAS_REGISTRY.markdown.lenses.find(l => l.key === 'edit').Component],
    ];

    for (const [label, Component] of bodies) {
      const { unmount } = render(
        React.createElement(
          React.Suspense,
          { fallback: React.createElement('div', { 'data-testid': 'canvas-fallback' }) },
          React.createElement(Component)
        )
      );
      // The chunk resolves and the body mounts — a broken import path (the
      // regression this guards) would leave the Suspense fallback forever.
      expect(await screen.findByTestId(`canvas-body-${label}`)).toBeInTheDocument();
      unmount();
    }
  });
});
