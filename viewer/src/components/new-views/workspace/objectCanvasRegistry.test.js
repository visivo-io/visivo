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

  test('the first lens of every registered type is the read-only "Canvas" preview', () => {
    types.forEach(type => {
      const first = OBJECT_CANVAS_REGISTRY[type].lenses[0];
      expect(first.key).toBe('preview');
      expect(first.label).toBe('Canvas');
      expect(first.kind).toBe('readonly');
    });
  });

  test('getCanvasDescriptor / hasCanvas', () => {
    expect(getCanvasDescriptor('chart')).toBe(OBJECT_CANVAS_REGISTRY.chart);
    expect(getCanvasDescriptor('mystery')).toBeNull();
    // `source` has no canvas yet (VIS-1005 registers it) → falls to lineage.
    expect(getCanvasDescriptor('source')).toBeNull();
    expect(hasCanvas('chart')).toBe(true);
    expect(hasCanvas('source')).toBe(false);
  });

  test('previewRegistry shim still resolves component + hasPreview', () => {
    // The shim returns the (lazy) Component for back-compat callers.
    expect(getPreviewComponent('chart')).toBe(OBJECT_CANVAS_REGISTRY.chart.Component);
    expect(getPreviewComponent('mystery')).toBeNull();
    expect(hasPreview('table')).toBe(true);
    expect(hasPreview('mystery')).toBe(false);
  });
});
