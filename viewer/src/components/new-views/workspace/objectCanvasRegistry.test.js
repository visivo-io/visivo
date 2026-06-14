/**
 * objectCanvasRegistry (VIS-1001) — descriptor shape + the previewRegistry shim.
 */
import {
  OBJECT_CANVAS_REGISTRY,
  getCanvasDescriptor,
  hasCanvas,
} from './objectCanvasRegistry';
import { getPreviewComponent, hasPreview } from './previewRegistry';

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
      // serve-gated on sourcesMetadata (they evaluate against a source/model).
      expect(d.availability).toBe('serve');
      expect(d.availabilityKey).toBe('sourcesMetadata');
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

  test('source has the CLI-only (serve) ERD canvas gated on sourcesMetadata (VIS-1005)', () => {
    const d = OBJECT_CANVAS_REGISTRY.source;
    expect(d.availability).toBe('serve');
    expect(d.availabilityKey).toBe('sourcesMetadata');
    expect(d.defaultLens).toBe('preview');
    expect(d.Component).toBeTruthy();
  });

  test('previewRegistry shim still resolves component + hasPreview', () => {
    // The shim returns the (lazy) Component for back-compat callers.
    expect(getPreviewComponent('chart')).toBe(OBJECT_CANVAS_REGISTRY.chart.Component);
    expect(getPreviewComponent('mystery')).toBeNull();
    expect(hasPreview('table')).toBe(true);
    expect(hasPreview('mystery')).toBe(false);
  });
});
