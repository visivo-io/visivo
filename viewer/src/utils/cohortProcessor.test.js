/**
 * @jest-environment jsdom
 */

import { CohortProcessor } from './cohortProcessor';

// Mock the DuckDB service
jest.mock('../services/duckdbService', () => ({
  duckdbService: {
    createCohorts: jest.fn()
  }
}));

import { duckdbService } from '../services/duckdbService';

describe('CohortProcessor', () => {
  let processor;

  beforeEach(() => {
    processor = new CohortProcessor();
    jest.clearAllMocks();
  });

  describe('processTraceData', () => {
    it('should return values structure when no cohort configuration', async () => {
      const traceData = {
        'columns.x_data': [['Jan', 'Feb']],
        'columns.y_data': [[100, 150]]
      };
      const traceConfig = {};

      const result = await processor.processTraceData(traceData, traceConfig);

      expect(result).toEqual({
        values: traceData
      });
      expect(duckdbService.createCohorts).not.toHaveBeenCalled();
    });

    it('should process cohorts when cohort_on is specified', async () => {
      const traceData = {
        'columns.x_data': [['Jan', 'Feb'], ['Mar', 'Apr']],
        'columns.y_data': [[100, 150], [200, 250]]
      };
      const traceConfig = {
        cohort_on: 'product'
      };

      const mockCohortedData = {
        'Product A': {
          'columns.x_data': [['Jan', 'Feb']],
          'columns.y_data': [[100, 150]]
        },
        'Product B': {
          'columns.x_data': [['Mar', 'Apr']],
          'columns.y_data': [[200, 250]]
        }
      };

      duckdbService.createCohorts.mockResolvedValueOnce(mockCohortedData);

      const result = await processor.processTraceData(traceData, traceConfig);

      expect(duckdbService.createCohorts).toHaveBeenCalledWith(traceData, '"product"');
      expect(result).toEqual(mockCohortedData);
    });

    it('should handle errors gracefully and return fallback', async () => {
      const traceData = {
        'columns.x_data': [['Jan', 'Feb']]
      };
      const traceConfig = {
        cohort_on: 'invalid_column'
      };

      duckdbService.createCohorts.mockRejectedValueOnce(new Error('DuckDB error'));

      const result = await processor.processTraceData(traceData, traceConfig);

      expect(result).toEqual({
        values: traceData
      });
    });
  });

  describe('parseCohortExpression', () => {
    it('should parse query syntax', () => {
      const result = processor.parseCohortExpression('?{product_name}');
      expect(result).toBe('product_name');
    });

    it('should parse column syntax', () => {
      const result = processor.parseCohortExpression('column(product)');
      expect(result).toBe('"product"');
    });

    it('should handle quoted strings', () => {
      const result = processor.parseCohortExpression("'literal_value'");
      expect(result).toBe("'literal_value'");
    });

    it('should add quotes to plain column names', () => {
      const result = processor.parseCohortExpression('product_name');
      expect(result).toBe('"product_name"');
    });

    it('should throw error for invalid expressions', () => {
      expect(() => processor.parseCohortExpression(null))
        .toThrow('Invalid cohort_on expression');
      
      expect(() => processor.parseCohortExpression(''))
        .toThrow('Invalid cohort_on expression');
    });
  });

  describe('groupByCohort', () => {
    it('should call DuckDB service with parsed expression', async () => {
      const data = {
        'columns.x_data': [['A', 'B']],
        'columns.y_data': [[1, 2]]
      };

      const mockResult = {
        'Group1': {
          'columns.x_data': [['A', 'B']],
          'columns.y_data': [[1, 2]]
        }
      };

      duckdbService.createCohorts.mockResolvedValueOnce(mockResult);

      const result = await processor.groupByCohort(data, 'column(group)');

      expect(duckdbService.createCohorts).toHaveBeenCalledWith(data, '"group"');
      expect(result).toEqual(mockResult);
    });

    it('should handle DuckDB errors', async () => {
      const data = { 'col': ['val'] };
      
      duckdbService.createCohorts.mockRejectedValueOnce(new Error('DB error'));

      await expect(processor.groupByCohort(data, 'invalid'))
        .rejects.toThrow('Cohort processing failed: DB error');
    });
  });

  describe('extractCohortValues', () => {
    it('should extract unique values from array column', () => {
      const data = {
        'product': ['A', 'B', 'A', 'C']
      };

      const result = processor.extractCohortValues(data, 'product');
      expect(result).toEqual(['A', 'B', 'C']);
    });

    it('should handle single value column', () => {
      const data = {
        'product': 'SingleProduct'
      };

      const result = processor.extractCohortValues(data, 'product');
      expect(result).toEqual(['SingleProduct']);
    });

    it('should filter out null values', () => {
      const data = {
        'product': ['A', null, 'B', undefined, 'C']
      };

      const result = processor.extractCohortValues(data, 'product');
      expect(result).toEqual(['A', 'B', 'C']);
    });

    it('should return empty array for missing column', () => {
      const data = {
        'other_col': ['A', 'B']
      };

      const result = processor.extractCohortValues(data, 'missing_col');
      expect(result).toEqual([]);
    });
  });

  describe('isValidTraceData', () => {
    it('should validate proper trace data structure', () => {
      const validData = {
        'columns.x': [['A', 'B'], ['C', 'D']],
        'columns.y': [[1, 2], [3, 4]]
      };

      expect(processor.isValidTraceData(validData)).toBe(true);
    });

    it('should validate single-row data', () => {
      const validData = {
        'columns.x': ['A', 'B'],
        'columns.y': [1, 2]
      };

      expect(processor.isValidTraceData(validData)).toBe(true);
    });

    it('should reject mismatched array lengths', () => {
      const invalidData = {
        'columns.x': [['A', 'B'], ['C', 'D']],  // 2 rows
        'columns.y': [[1, 2]]                   // 1 row
      };

      expect(processor.isValidTraceData(invalidData)).toBe(false);
    });

    it('should reject non-object data', () => {
      expect(processor.isValidTraceData(null)).toBe(false);
      expect(processor.isValidTraceData('string')).toBe(false);
      expect(processor.isValidTraceData([])).toBe(false);
    });

    it('should reject empty data', () => {
      expect(processor.isValidTraceData({})).toBe(false);
    });
  });

  describe('previewCohorts', () => {
    it('should provide preview without cohort', async () => {
      const data = {
        'columns.x': [['A', 'B']],
        'columns.y': [[1, 2]]
      };

      const result = await processor.previewCohorts(data, null);

      expect(result).toEqual({
        cohortCount: 1,
        cohorts: ['values'],
        sampleData: { values: data }
      });
    });

    it('should provide preview with cohort processing', async () => {
      const data = {
        'columns.x': [['A', 'B'], ['C', 'D']],
        'columns.y': [[1, 2], [3, 4]]
      };

      const mockCohortedData = {
        'Group1': {
          'columns.x': [['A', 'B']],
          'columns.y': [[1, 2]]
        },
        'Group2': {
          'columns.x': [['C', 'D']],
          'columns.y': [[3, 4]]
        }
      };

      duckdbService.createCohorts.mockResolvedValueOnce(mockCohortedData);

      const result = await processor.previewCohorts(data, 'group_col');

      expect(result).toEqual({
        cohortCount: 2,
        cohorts: ['Group1', 'Group2'],
        sampleData: mockCohortedData
      });
    });

    it('should handle preview errors gracefully', async () => {
      const data = { 'col': ['val'] };
      
      duckdbService.createCohorts.mockRejectedValueOnce(new Error('Preview error'));

      const result = await processor.previewCohorts(data, 'invalid');

      expect(result).toEqual({
        cohortCount: 1,
        cohorts: ['values'],
        sampleData: { values: data },
        error: 'Preview error'
      });
    });
  });

  describe('transformToChartFormat', () => {
    it('should return data as-is for chart compatibility', () => {
      const cohortedData = {
        'Group1': {
          'columns.x': [['A', 'B']],
          'columns.y': [[1, 2]]
        },
        'Group2': {
          'columns.x': [['C', 'D']],
          'columns.y': [[3, 4]]
        }
      };

      const result = processor.transformToChartFormat(cohortedData);

      expect(result).toEqual(cohortedData);
    });
  });
});