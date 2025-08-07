/**
 * @jest-environment jsdom
 */

import { DataProcessor } from './dataProcessor';

// Mock the DuckDB service
jest.mock('./duckdbService', () => ({
  duckdbService: {
    initialize: jest.fn(),
    loadData: jest.fn(),
    executeQuery: jest.fn(),
    cleanup: jest.fn()
  }
}));

// Mock the Trace model utilities
jest.mock('../models/Trace', () => ({
  convertDotKeysToNestedObject: jest.fn(obj => ({ columns: obj })),
  mergeStaticPropertiesAndData: jest.fn((props, data, name) => ({ 
    ...props, 
    ...data, 
    name 
  }))
}));

import { duckdbService } from './duckdbService';
import { convertDotKeysToNestedObject, mergeStaticPropertiesAndData } from '../models/Trace';

describe('DataProcessor', () => {
  let processor;

  beforeEach(() => {
    processor = new DataProcessor();
    jest.clearAllMocks();
  });

  // Removed processTraces tests - method moved to DataStore for better separation of concerns

  describe('processTrace', () => {
    it('should process trace without cohort configuration', async () => {
      const traceConfig = { name: 'test-trace', props: { type: 'bar' } };
      const rawData = { 'props.x': ['A', 'B'], 'props.y': [1, 2] };

      const result = await processor.processTrace(traceConfig, rawData);

      expect(result).toHaveLength(1);
      expect(duckdbService.loadData).toHaveBeenCalled();
      expect(mergeStaticPropertiesAndData).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        'values'
      );
    });

    it('should process trace with cohort configuration', async () => {
      const traceConfig = { 
        name: 'test-trace', 
        cohort_on: 'product', 
        props: { type: 'bar' } 
      };
      const rawData = { 'props.x': ['A', 'B'], 'props.y': [1, 2] };

      duckdbService.executeQuery.mockResolvedValueOnce([
        { cohort_value: 'Product A', 'props.x': 'A', 'props.y': 1 },
        { cohort_value: 'Product B', 'props.x': 'B', 'props.y': 2 }
      ]);

      const result = await processor.processTrace(traceConfig, rawData);

      expect(result).toHaveLength(2);
      expect(duckdbService.loadData).toHaveBeenCalled();
      expect(duckdbService.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT')
      );
    });

    it('should cleanup temporary table on completion', async () => {
      const traceConfig = { name: 'test-trace', props: { type: 'bar' } };
      const rawData = { 'props.x': ['A'], 'props.y': [1] };

      await processor.processTrace(traceConfig, rawData);

      expect(duckdbService.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('DROP TABLE IF EXISTS')
      );
    });

    it('should cleanup temporary table on error', async () => {
      const traceConfig = { name: 'test-trace', props: { type: 'bar' } };
      const rawData = { 'props.x': ['A'], 'props.y': [1] };

      duckdbService.loadData.mockRejectedValueOnce(new Error('Load failed'));

      await expect(processor.processTrace(traceConfig, rawData))
        .rejects.toThrow('Load failed');

      expect(duckdbService.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('DROP TABLE IF EXISTS')
      );
    });
  });

  describe('buildCohortQuery', () => {
    it('should build valid cohort query', () => {
      const query = processor.buildCohortQuery('test_table', 'product');
      
      expect(query).toContain('SELECT');
      expect(query).toContain('"product" as cohort_value');
      expect(query).toContain('FROM test_table');
      expect(query).toContain('WHERE "product" IS NOT NULL');
      expect(query).toContain('ORDER BY cohort_value');
    });

    it('should handle complex cohort expressions', () => {
      const query = processor.buildCohortQuery('test_table', '?{CASE WHEN x > 5 THEN "high" ELSE "low" END}');
      
      expect(query).toContain('CASE WHEN x > 5 THEN "high" ELSE "low" END as cohort_value');
    });
  });

  describe('groupResultsByCohort', () => {
    it('should group results by cohort value', () => {
      const results = [
        { cohort_value: 'A', 'props.x': 'X1', 'props.y': 1 },
        { cohort_value: 'A', 'props.x': 'X2', 'props.y': 2 },
        { cohort_value: 'B', 'props.x': 'X3', 'props.y': 3 }
      ];

      const grouped = processor.groupResultsByCohort(results);

      expect(grouped).toEqual({
        'A': {
          'props.x': ['X1', 'X2'],
          'props.y': [1, 2]
        },
        'B': {
          'props.x': ['X3'],
          'props.y': [3]
        }
      });
    });

    it('should handle empty results', () => {
      const grouped = processor.groupResultsByCohort([]);
      expect(grouped).toEqual({});
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

  describe('isValidTraceData', () => {
    it('should validate proper trace data structure', () => {
      const validData = {
        'columns.x': [['A', 'B'], ['C', 'D']],
        'columns.y': [[1, 2], [3, 4]]
      };

      expect(processor.isValidTraceData(validData)).toBe(true);
    });

    it('should reject invalid data structures', () => {
      expect(processor.isValidTraceData(null)).toBe(false);
      expect(processor.isValidTraceData({})).toBe(false);
      expect(processor.isValidTraceData('string')).toBe(false);
    });

    it('should reject mismatched array lengths', () => {
      const invalidData = {
        'columns.x': [['A', 'B']],  // 1 row
        'columns.y': [[1, 2], [3, 4]]  // 2 rows
      };

      expect(processor.isValidTraceData(invalidData)).toBe(false);
    });
  });

  describe('getCohortValues', () => {
    it('should return values for non-cohorted data', async () => {
      const data = { 'props.x': ['A', 'B'] };
      const result = await processor.getCohortValues(data, null);
      
      expect(result).toEqual(['values']);
    });

    it('should query and return unique cohort values', async () => {
      const data = { 'props.x': ['A', 'B'], product: ['X', 'Y'] };
      
      duckdbService.executeQuery.mockResolvedValueOnce([
        { cohort_value: 'X' },
        { cohort_value: 'Y' }
      ]);

      const result = await processor.getCohortValues(data, 'product');

      expect(duckdbService.initialize).toHaveBeenCalled();
      expect(duckdbService.loadData).toHaveBeenCalled();
      expect(duckdbService.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT DISTINCT')
      );
      expect(result).toEqual(['X', 'Y']);
    });

    it('should handle errors gracefully', async () => {
      const data = { 'props.x': ['A'] };
      
      duckdbService.executeQuery.mockRejectedValueOnce(new Error('Query failed'));

      const result = await processor.getCohortValues(data, 'product');
      
      expect(result).toEqual(['values']);
    });

    it('should cleanup temporary table', async () => {
      const data = { 'props.x': ['A'] };
      
      duckdbService.executeQuery.mockResolvedValueOnce([]);

      await processor.getCohortValues(data, 'product');

      expect(duckdbService.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('DROP TABLE IF EXISTS')
      );
    });
  });
});