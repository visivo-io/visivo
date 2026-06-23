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
    expect(getDefNameForType('csvScriptModel')).toBe('CsvScriptModel');
    expect(getDefNameForType('CSVSCRIPTMODEL')).toBe('CsvScriptModel');
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
