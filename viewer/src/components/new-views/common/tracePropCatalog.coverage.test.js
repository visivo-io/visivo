import { tracePropCatalog } from './tracePropCatalog';
import { CHART_TYPES } from '../../../schemas/schemas';

const ALL_TYPES = CHART_TYPES.map(t => t.value);

describe('tracePropCatalog coverage', () => {
  test('all 51 trace types are present', () => {
    ALL_TYPES.forEach(type => {
      expect(tracePropCatalog).toHaveProperty(type, expect.any(Array));
    });
  });

  test('each type has at least one Tier-A entry', () => {
    ALL_TYPES.forEach(type => {
      const entries = tracePropCatalog[type] || [];
      const tierA = entries.filter(e => e.tier === 'A');
      expect(tierA.length).toBeGreaterThanOrEqual(1);
    });
  });

  test('each type has at least 2 Tier-B entries', () => {
    ALL_TYPES.forEach(type => {
      const entries = tracePropCatalog[type] || [];
      const tierB = entries.filter(e => e.tier === 'B');
      expect(tierB.length).toBeGreaterThanOrEqual(2);
    });
  });

  test('all entries have required fields', () => {
    ALL_TYPES.forEach(type => {
      (tracePropCatalog[type] || []).forEach(entry => {
        expect(entry).toHaveProperty('path');
        expect(entry).toHaveProperty('label');
        expect(entry).toHaveProperty('tier');
        expect(entry).toHaveProperty('description');
        expect(entry).toHaveProperty('keywords');
        expect(entry).toHaveProperty('enumValues');
        expect(entry).toHaveProperty('example');
        expect(['A', 'B']).toContain(entry.tier);
        expect(Array.isArray(entry.keywords)).toBe(true);
      });
    });
  });

  test('no duplicate paths within a type', () => {
    ALL_TYPES.forEach(type => {
      const paths = (tracePropCatalog[type] || []).map(e => e.path);
      const unique = new Set(paths);
      expect(unique.size).toBe(paths.length);
    });
  });
});
