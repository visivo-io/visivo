import {
  CHART_TYPE_ESSENTIALS,
  LAYOUT_ESSENTIALS,
  getEssentialsForChartType,
  getLayoutEssentials,
} from './chartTypeEssentials';

describe('chartTypeEssentials', () => {
  describe('CHART_TYPE_ESSENTIALS', () => {
    it('covers at least the 10 most common chart types', () => {
      const expectedTypes = [
        'scatter',
        'bar',
        'line',
        'pie',
        'area',
        'histogram',
        'box',
        'heatmap',
        'table',
        'indicator',
      ];
      for (const t of expectedTypes) {
        expect(CHART_TYPE_ESSENTIALS).toHaveProperty(t);
        expect(Array.isArray(CHART_TYPE_ESSENTIALS[t])).toBe(true);
        expect(CHART_TYPE_ESSENTIALS[t].length).toBeGreaterThan(0);
      }
    });

    it('keeps each chart type at a reasonable length (under 20 essentials)', () => {
      Object.entries(CHART_TYPE_ESSENTIALS).forEach(([type, paths]) => {
        expect(paths.length).toBeLessThanOrEqual(20);
        expect(paths.length).toBeGreaterThan(0);
        // Each path should be a non-empty string
        paths.forEach((p) => {
          expect(typeof p).toBe('string');
          expect(p.length).toBeGreaterThan(0);
          // The label is just for the assertion message; we don't read it.
          expect(p).not.toMatch(/\s/); // no whitespace in property paths
          // suppress unused-var lint
          void type;
        });
      });
    });
  });

  describe('getEssentialsForChartType', () => {
    it('returns the scatter shortlist for "scatter"', () => {
      const result = getEssentialsForChartType('scatter');
      expect(result).toEqual([
        'x',
        'y',
        'mode',
        'name',
        'marker.color',
        'marker.size',
        'line.color',
        'line.width',
      ]);
    });

    it('returns the bar shortlist for "bar"', () => {
      const result = getEssentialsForChartType('bar');
      expect(result).toContain('x');
      expect(result).toContain('y');
      expect(result).toContain('marker.color');
      expect(result).toContain('orientation');
    });

    it('returns the pie shortlist for "pie"', () => {
      const result = getEssentialsForChartType('pie');
      expect(result).toContain('labels');
      expect(result).toContain('values');
      expect(result).toContain('hole');
    });

    it('returns fallback ["x", "y", "name"] for an unknown chart type', () => {
      expect(getEssentialsForChartType('unknown_type')).toEqual(['x', 'y', 'name']);
    });

    it('returns fallback for null/undefined chart type', () => {
      expect(getEssentialsForChartType(undefined)).toEqual(['x', 'y', 'name']);
      expect(getEssentialsForChartType(null)).toEqual(['x', 'y', 'name']);
    });
  });

  describe('getLayoutEssentials', () => {
    it('returns the layout shortlist', () => {
      const result = getLayoutEssentials();
      expect(result).toEqual(LAYOUT_ESSENTIALS);
      expect(result).toContain('title.text');
      expect(result).toContain('xaxis.title.text');
      expect(result).toContain('yaxis.title.text');
      expect(result).toContain('showlegend');
      expect(result).toContain('paper_bgcolor');
      expect(result).toContain('plot_bgcolor');
    });

    it('keeps the layout shortlist at a reasonable size (under 20)', () => {
      expect(getLayoutEssentials().length).toBeLessThanOrEqual(20);
      expect(getLayoutEssentials().length).toBeGreaterThan(0);
    });
  });
});
