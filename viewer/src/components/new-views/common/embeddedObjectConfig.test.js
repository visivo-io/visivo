import {
  EMBEDDED_OBJECT_CONFIGS,
  getEmbeddedConfig,
  canHaveEmbedded,
  getEmbeddedTypesForParent,
  createEmbeddedEditHandler,
} from './embeddedObjectConfig';

describe('embeddedObjectConfig', () => {
  describe('getEmbeddedConfig', () => {
    it('returns config for model with embedded source', () => {
      const config = getEmbeddedConfig('model', 'source');
      expect(config).toBeDefined();
      expect(config.parentTypes).toContain('model');
      expect(config.embeddedType).toBe('source');
    });

    it('returns config for chart with embedded insight', () => {
      const config = getEmbeddedConfig('chart', 'insight');
      expect(config).toBeDefined();
      expect(config.parentTypes).toContain('chart');
      expect(config.embeddedType).toBe('insight');
      expect(config.isArray).toBe(true);
    });

    it('returns config for table with embedded insight', () => {
      const config = getEmbeddedConfig('table', 'insight');
      expect(config).toBeDefined();
      expect(config.parentTypes).toContain('table');
      expect(config.embeddedType).toBe('insight');
      expect(config.isArray).toBe(true);
    });

    it('returns null for invalid combinations', () => {
      expect(getEmbeddedConfig('source', 'model')).toBeNull();
      expect(getEmbeddedConfig('chart', 'source')).toBeNull();
      expect(getEmbeddedConfig('dimension', 'metric')).toBeNull();
    });
  });

  describe('canHaveEmbedded', () => {
    it('returns true for valid parent-embedded combinations', () => {
      expect(canHaveEmbedded('model', 'source')).toBe(true);
      expect(canHaveEmbedded('chart', 'insight')).toBe(true);
      expect(canHaveEmbedded('table', 'insight')).toBe(true);
    });

    it('returns false for invalid combinations', () => {
      expect(canHaveEmbedded('source', 'model')).toBe(false);
      expect(canHaveEmbedded('chart', 'source')).toBe(false);
      expect(canHaveEmbedded('model', 'insight')).toBe(false);
    });
  });

  describe('getEmbeddedTypesForParent', () => {
    it('returns embedded types for model', () => {
      const types = getEmbeddedTypesForParent('model');
      expect(types).toEqual(['source']);
    });

    it('returns embedded types for chart', () => {
      const types = getEmbeddedTypesForParent('chart');
      expect(types).toEqual(['insight']);
    });

    it('returns embedded types for table', () => {
      const types = getEmbeddedTypesForParent('table');
      expect(types).toEqual(['insight']);
    });

    it('returns empty array for types with no embedded objects', () => {
      expect(getEmbeddedTypesForParent('source')).toEqual([]);
      expect(getEmbeddedTypesForParent('dimension')).toEqual([]);
      expect(getEmbeddedTypesForParent('metric')).toEqual([]);
    });
  });

  describe('createEmbeddedEditHandler', () => {
    let clearEdit, pushEdit;

    beforeEach(() => {
      clearEdit = jest.fn();
      pushEdit = jest.fn();
    });

    describe('for single embedded objects (model with source)', () => {
      it('creates handler for model with embedded source', () => {
        const parentData = {
          model: { name: 'test_model' },
          source: { type: 'duckdb', config: { database: ':memory:' } },
        };

        const handler = createEmbeddedEditHandler(clearEdit, pushEdit, 'model', parentData, 'source');
        expect(handler).toBeDefined();
        expect(typeof handler).toBe('function');

        // Execute the handler
        handler();

        expect(clearEdit).toHaveBeenCalled();
        expect(pushEdit).toHaveBeenCalledTimes(2);

        // Check first push (parent)
        expect(pushEdit.mock.calls[0][0]).toBe('model');
        expect(pushEdit.mock.calls[0][1]).toBe(parentData.model);

        // Check second push (embedded)
        expect(pushEdit.mock.calls[1][0]).toBe('source');
        expect(pushEdit.mock.calls[1][1].name).toBe('(embedded in test_model)');
        expect(pushEdit.mock.calls[1][1].config).toBe(parentData.source);
        expect(pushEdit.mock.calls[1][1]._embedded).toEqual({
          parentType: 'model',
          parentName: 'test_model',
          path: 'source',
        });

        // Check applyToParent function
        const applyToParent = pushEdit.mock.calls[1][2].applyToParent;
        const result = applyToParent({ name: 'model1' }, { type: 'postgres' });
        expect(result).toEqual({ name: 'model1', source: { type: 'postgres' } });
      });

      it('returns undefined for invalid combinations', () => {
        const parentData = { source: { name: 'test_source' } };
        const handler = createEmbeddedEditHandler(clearEdit, pushEdit, 'source', parentData, 'model');
        expect(handler).toBeUndefined();
      });
    });

    describe('for array embedded objects (chart/table with insights)', () => {
      it('creates handler for chart with embedded insights', () => {
        const parentData = {
          chart: {
            name: 'test_chart',
            insights: [
              { name: 'insight1', config: { query: 'SELECT 1' } },
              { name: 'insight2', config: { query: 'SELECT 2' } },
            ],
          },
        };

        const handler = createEmbeddedEditHandler(clearEdit, pushEdit, 'chart', parentData, 'insight');
        expect(handler).toBeDefined();
        expect(typeof handler).toBe('function');

        // Execute the handler for the second insight
        const insightConfig = parentData.chart.insights[1];
        handler(insightConfig, 1);

        expect(clearEdit).toHaveBeenCalled();
        expect(pushEdit).toHaveBeenCalledTimes(2);

        // Check first push (parent)
        expect(pushEdit.mock.calls[0][0]).toBe('chart');
        expect(pushEdit.mock.calls[0][1]).toBe(parentData.chart);

        // Check second push (embedded)
        expect(pushEdit.mock.calls[1][0]).toBe('insight');
        expect(pushEdit.mock.calls[1][1].name).toBe('(embedded insight 2 in test_chart)');
        expect(pushEdit.mock.calls[1][1].config).toBe(insightConfig);
        expect(pushEdit.mock.calls[1][1]._embedded).toEqual({
          parentType: 'chart',
          parentName: 'test_chart',
          path: 'insights[1]',
        });

        // Check applyToParent function
        const applyToParent = pushEdit.mock.calls[1][2].applyToParent;
        const parentConfig = { insights: ['old1', 'old2', 'old3'] };
        const result = applyToParent(parentConfig, 'new_insight');
        expect(result.insights[1]).toBe('new_insight');
      });

      it('creates handler for table with embedded insights', () => {
        const parentData = {
          table: {
            name: 'test_table',
            insights: [{ name: 'insight1', config: { query: 'SELECT 1' } }],
          },
        };

        const handler = createEmbeddedEditHandler(clearEdit, pushEdit, 'table', parentData, 'insight');
        expect(handler).toBeDefined();

        // Execute the handler
        const insightConfig = parentData.table.insights[0];
        handler(insightConfig, 0);

        expect(pushEdit.mock.calls[1][1].name).toBe('(embedded insight 1 in test_table)');
        expect(pushEdit.mock.calls[1][1]._embedded.parentType).toBe('table');
      });
    });
  });

  describe('EMBEDDED_OBJECT_CONFIGS structure', () => {
    it('each config has required fields', () => {
      EMBEDDED_OBJECT_CONFIGS.forEach(config => {
        expect(config).toHaveProperty('parentTypes');
        expect(config).toHaveProperty('embeddedType');
        expect(config).toHaveProperty('pathGetter');
        expect(config).toHaveProperty('configGetter');
        expect(config).toHaveProperty('applyToParent');
        expect(config).toHaveProperty('nameFormatter');
        expect(Array.isArray(config.parentTypes)).toBe(true);
        expect(typeof config.embeddedType).toBe('string');
        expect(typeof config.pathGetter).toBe('function');
        expect(typeof config.configGetter).toBe('function');
        expect(typeof config.applyToParent).toBe('function');
        expect(typeof config.nameFormatter).toBe('function');
      });
    });
  });
});