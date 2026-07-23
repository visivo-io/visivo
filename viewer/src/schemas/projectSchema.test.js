/**
 * projectSchema loader tests (VIS-991)
 *
 * The bundled-schema JSON is mocked to a tiny fixture so the test exercises the
 * loader/registry contract (lazy import, caching, $defs re-attachment, type
 * mapping) without pulling the multi-MB real snapshot into the test bundle.
 */
import {
  getObjectSchema,
  getObjectSchemaSync,
  getDefNameForType,
  isObjectSchemaLoaded,
  preloadProjectSchema,
  resetProjectSchemaCache,
  OBJECT_TYPE_TO_DEF,
} from './projectSchema';

jest.mock('./visivo_project_schema.json', () => ({
  __esModule: true,
  default: {
    $defs: {
      Dimension: {
        type: 'object',
        required: ['expression'],
        properties: { expression: { type: 'string' } },
      },
      Metric: { type: 'object', properties: {} },
      'query-string': { type: 'string' },
    },
  },
}));

describe('getDefNameForType', () => {
  test('maps lowercase object types to PascalCase def names', () => {
    expect(getDefNameForType('dimension')).toBe('Dimension');
    expect(getDefNameForType('metric')).toBe('Metric');
    expect(getDefNameForType('relation')).toBe('Relation');
    expect(getDefNameForType('model')).toBe('Model');
  });

  test('is case-insensitive (camelCase / PascalCase / lowercase)', () => {
    expect(getDefNameForType('Model')).toBe('Model');
    expect(getDefNameForType('MODEL')).toBe('Model');
  });

  test('returns null for unknown / bad input', () => {
    expect(getDefNameForType('bogus')).toBeNull();
    expect(getDefNameForType('')).toBeNull();
    expect(getDefNameForType(undefined)).toBeNull();
  });

  test('maps every core object type', () => {
    ['dimension', 'metric', 'relation', 'model'].forEach(t =>
      expect(OBJECT_TYPE_TO_DEF[t]).toBeTruthy()
    );
  });
});

describe('getObjectSchema', () => {
  test('returns the $defs slice with the full $defs re-attached', async () => {
    const schema = await getObjectSchema('dimension');
    expect(schema).toBeTruthy();
    expect(schema.required).toEqual(['expression']);
    // Full $defs graph attached so resolveRef can resolve #/$defs/... refs.
    expect(schema.$defs).toBeTruthy();
    expect(schema.$defs['query-string']).toBeTruthy();
    expect(schema.$defs.Dimension).toBeTruthy();
  });

  test('returns null for an unmapped type', async () => {
    expect(await getObjectSchema('bogus')).toBeNull();
  });

  test('caches the assembled slice across calls', async () => {
    const a = await getObjectSchema('metric');
    const b = await getObjectSchema('metric');
    expect(a).toBe(b);
  });

  test('concurrent cold loads share a single in-flight import', async () => {
    resetProjectSchemaCache();
    const [a, b] = await Promise.all([getObjectSchema('dimension'), getObjectSchema('metric')]);
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(isObjectSchemaLoaded()).toBe(true);
  });
});

describe('preload / loaded flags / sync accessor', () => {
  test('preloadProjectSchema marks the schema loaded and enables the sync accessor', async () => {
    await preloadProjectSchema();
    expect(isObjectSchemaLoaded()).toBe(true);
    const sync = getObjectSchemaSync('dimension');
    expect(sync).toBeTruthy();
    expect(sync.$defs).toBeTruthy();
  });
});

// VIS-1025: the module-level caches carry no project identity, so a project
// switch (cloud draft flip, project change) must be able to drop them —
// resetProjectSchemaCache is the seam the store layer invokes on id change.
describe('resetProjectSchemaCache (VIS-1025)', () => {
  test('drops the root + per-type caches so the schema re-binds to the new project', async () => {
    await preloadProjectSchema();
    const before = await getObjectSchema('dimension');
    expect(isObjectSchemaLoaded()).toBe(true);
    expect(getObjectSchemaSync('dimension')).toBeTruthy();

    resetProjectSchemaCache();

    // Fully cold: nothing loaded, the sync accessor yields nothing.
    expect(isObjectSchemaLoaded()).toBe(false);
    expect(getObjectSchemaSync('dimension')).toBeNull();
    expect(getObjectSchemaSync('metric')).toBeNull();

    // Re-warming rebuilds a FRESH assembled slice (not the stale cached object).
    const after = await getObjectSchema('dimension');
    expect(after).toBeTruthy();
    expect(after).not.toBe(before);
    expect(after.required).toEqual(['expression']);
    expect(isObjectSchemaLoaded()).toBe(true);
  });

  test('reset is safe on already-cold caches', () => {
    resetProjectSchemaCache();
    expect(() => resetProjectSchemaCache()).not.toThrow();
    expect(isObjectSchemaLoaded()).toBe(false);
  });

  test('after a reset, getObjectSchemaSync re-assembles a fresh slice once the root is re-loaded', async () => {
    resetProjectSchemaCache();
    await preloadProjectSchema();

    // metric was never assembled in this cold state — the SYNC path builds it.
    const sync = getObjectSchemaSync('metric');
    expect(sync).toBeTruthy();
    expect(sync.$defs.Dimension).toBeTruthy();
    // …and caches it for the next sync read.
    expect(getObjectSchemaSync('metric')).toBe(sync);

    // A mapped type with no def in the graph returns null (sync + async agree).
    expect(getObjectSchemaSync('relation')).toBeNull();
    expect(await getObjectSchema('relation')).toBeNull();
  });
});

describe('fail-open on an unloadable schema bundle', () => {
  test('a failed import rejects the preload and getObjectSchema returns null (backend stays authoritative)', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.resetModules();
    jest.doMock('./visivo_project_schema.json', () => {
      throw new Error('bundle missing');
    });
    let fresh;
    jest.isolateModules(() => {
      fresh = require('./projectSchema');
    });

    await expect(fresh.preloadProjectSchema()).rejects.toThrow('bundle missing');
    expect(fresh.isObjectSchemaLoaded()).toBe(false);
    // getObjectSchema swallows the load failure and fails open with null.
    expect(await fresh.getObjectSchema('dimension')).toBeNull();
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
    jest.dontMock('./visivo_project_schema.json');
  });
});
