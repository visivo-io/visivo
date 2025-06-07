import generatePivotQuery  from './generatePivotQuery';
import  sanitizeColumnName  from './sanitizeColumnName';
import  createSanitizedValueSql  from './createSanitizedValueSql';

// Mock dependencies
jest.mock('./sanitizeColumnName');
jest.mock('./createSanitizedValueSql');

describe('generatePivotQuery', () => {
  // Helper to create mock database connection
  const createMockConnection = (overrides = {}) => {
    const defaultDistinctResult = {
      toArray: jest.fn().mockResolvedValue([
        { region: 'North' },
        { region: 'South' },
        { region: null }
      ])
    };

    const defaultPivotResult = {
      toArray: jest.fn().mockResolvedValue([
        { category: 'A', region_North: 100, region_South: 200, region_NULL: 50 },
        { category: 'B', region_North: 150, region_South: 250, region_NULL: 75 }
      ]),
      schema: {
        fields: [
          { name: 'category' },
          { name: 'region_North' },
          { name: 'region_South' },
          { name: 'region_NULL' }
        ]
      }
    };

    return {
      query: jest.fn()
        .mockResolvedValueOnce(overrides.distinctResult || defaultDistinctResult)
        .mockResolvedValueOnce(overrides.pivotResult || defaultPivotResult)
    };
  };

  const setupMocks = () => {
    jest.clearAllMocks();
    sanitizeColumnName.mockImplementation((name) => String(name).replace(/[^a-zA-Z0-9_]/g, '_'));
    createSanitizedValueSql.mockReturnValue('"sales"');
  };

  beforeEach(setupMocks);

  describe('basic functionality', () => {
    it('should generate pivot query with simple data', async () => {
      const conn = createMockConnection();
      
      const result = await generatePivotQuery({
        conn,
        safeRowFields: ['category'],
        safeColFields: ['region'],
        safeValField: 'sales',
        aggregateFunc: 'SUM'
      });

      // Verify distinct query was called
      expect(conn.query).toHaveBeenCalledWith('SELECT DISTINCT "region" FROM table_data');
      
      // Verify pivot SQL was generated and executed
      expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('SELECT "category"'));
      expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('CASE WHEN'));
      expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('GROUP BY "category"'));
      
      // Verify result structure
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('columns');
      expect(Array.isArray(result.data)).toBe(true);
      expect(Array.isArray(result.columns)).toBe(true);
    });

    it('should handle multiple row fields', async () => {
      const conn = createMockConnection();
      
      await generatePivotQuery({
        conn,
        safeRowFields: ['category', 'subcategory'],
        safeColFields: ['region'],
        safeValField: 'sales',
        aggregateFunc: 'SUM'
      });

      const pivotSql = conn.query.mock.calls[1][0];
      expect(pivotSql).toContain('"category", "subcategory"');
      expect(pivotSql).toContain('GROUP BY "category", "subcategory"');
      expect(pivotSql).toContain('ORDER BY "category", "subcategory"');
    });

    it('should handle multiple column fields', async () => {
      const distinctResult = {
        toArray: jest.fn().mockResolvedValue([
          { region: 'North', year: 2023 },
          { region: 'South', year: 2023 },
          { region: 'North', year: 2024 }
        ])
      };

      const conn = createMockConnection({ distinctResult });
      
      await generatePivotQuery({
        conn,
        safeRowFields: ['category'],
        safeColFields: ['region', 'year'],
        safeValField: 'sales',
        aggregateFunc: 'SUM'
      });

      expect(conn.query).toHaveBeenCalledWith('SELECT DISTINCT "region", "year" FROM table_data');
      
      const pivotSql = conn.query.mock.calls[1][0];
      expect(pivotSql).toContain('region_North_year_2023');
      expect(pivotSql).toContain('region_South_year_2023');
      expect(pivotSql).toContain('region_North_year_2024');
    });
  });

  describe('aggregate functions', () => {
    it('should handle SUM aggregate function', async () => {
      const conn = createMockConnection();
      
      await generatePivotQuery({
        conn,
        safeRowFields: ['category'],
        safeColFields: ['region'],
        safeValField: 'sales',
        aggregateFunc: 'SUM'
      });

      const pivotSql = conn.query.mock.calls[1][0];
      expect(pivotSql).toContain('ROUND(SUM(CASE WHEN');
      expect(pivotSql).toContain('), 2)');
    });

    it('should handle COUNT aggregate function', async () => {
      const conn = createMockConnection();
      
      await generatePivotQuery({
        conn,
        safeRowFields: ['category'],
        safeColFields: ['region'],
        safeValField: 'sales',
        aggregateFunc: 'COUNT'
      });

      const pivotSql = conn.query.mock.calls[1][0];
      expect(pivotSql).toContain('COUNT(CASE WHEN');
      expect(pivotSql).not.toContain('ROUND(');
    });

    it('should handle AVG aggregate function', async () => {
      const conn = createMockConnection();
      
      await generatePivotQuery({
        conn,
        safeRowFields: ['category'],
        safeColFields: ['region'],
        safeValField: 'sales',
        aggregateFunc: 'AVG'
      });

      const pivotSql = conn.query.mock.calls[1][0];
      expect(pivotSql).toContain('ROUND(AVG(CASE WHEN');
      expect(pivotSql).toContain('), 2)');
    });
  });

  describe('data type handling', () => {
    it('should handle null values in distinct results', async () => {
      const distinctResult = {
        toArray: jest.fn().mockResolvedValue([
          { region: 'North' },
          { region: null },
          { region: 'South' }
        ])
      };

      const conn = createMockConnection({ distinctResult });
      
      await generatePivotQuery({
        conn,
        safeRowFields: ['category'],
        safeColFields: ['region'],
        safeValField: 'sales',
        aggregateFunc: 'SUM'
      });

      const pivotSql = conn.query.mock.calls[1][0];
      expect(pivotSql).toContain('"region" IS NULL');
      expect(pivotSql).toContain('region_NULL');
    });

    it('should handle numeric values in conditions', async () => {
      const distinctResult = {
        toArray: jest.fn().mockResolvedValue([
          { year: 2023 },
          { year: 2024 }
        ])
      };

      const conn = createMockConnection({ distinctResult });
      
      await generatePivotQuery({
        conn,
        safeRowFields: ['category'],
        safeColFields: ['year'],
        safeValField: 'sales',
        aggregateFunc: 'SUM'
      });

      const pivotSql = conn.query.mock.calls[1][0];
      expect(pivotSql).toContain('"year" = 2023');
      expect(pivotSql).toContain('"year" = 2024');
    });

    it('should handle string values with proper escaping', async () => {
      const distinctResult = {
        toArray: jest.fn().mockResolvedValue([
          { region: "North's Region" },
          { region: "South's Region" }
        ])
      };

      const conn = createMockConnection({ distinctResult });
      
      await generatePivotQuery({
        conn,
        safeRowFields: ['category'],
        safeColFields: ['region'],
        safeValField: 'sales',
        aggregateFunc: 'SUM'
      });

      const pivotSql = conn.query.mock.calls[1][0];
      expect(pivotSql).toContain("'North''s Region'");
      expect(pivotSql).toContain("'South''s Region'");
    });

    it('should convert bigint values to numbers', async () => {
      const pivotResult = {
        toArray: jest.fn().mockResolvedValue([
          { category: 'A', region_North: BigInt(12345), region_South: BigInt(67890) }
        ]),
        schema: {
          fields: [
            { name: 'category' },
            { name: 'region_North' },
            { name: 'region_South' }
          ]
        }
      };

      const conn = createMockConnection({ pivotResult });
      
      const result = await generatePivotQuery({
        conn,
        safeRowFields: ['category'],
        safeColFields: ['region'],
        safeValField: 'sales',
        aggregateFunc: 'SUM'
      });

      expect(result.data[0].region_North).toBe(12345);
      expect(result.data[0].region_South).toBe(67890);
      expect(typeof result.data[0].region_North).toBe('number');
    });

    it('should convert numeric strings to numbers', async () => {
      const pivotResult = {
        toArray: jest.fn().mockResolvedValue([
          { category: 'A', region_North: '123.45', region_South: '678.90' }
        ]),
        schema: {
          fields: [
            { name: 'category' },
            { name: 'region_North' },
            { name: 'region_South' }
          ]
        }
      };

      const conn = createMockConnection({ pivotResult });
      
      const result = await generatePivotQuery({
        conn,
        safeRowFields: ['category'],
        safeColFields: ['region'],
        safeValField: 'sales',
        aggregateFunc: 'SUM'
      });

      expect(result.data[0].region_North).toBe(123.45);
      expect(result.data[0].region_South).toBe(678.90);
      expect(typeof result.data[0].region_North).toBe('number');
    });

    it('should preserve non-numeric strings', async () => {
      const pivotResult = {
        toArray: jest.fn().mockResolvedValue([
          { category: 'Product A', description: 'Not a number' }
        ]),
        schema: {
          fields: [
            { name: 'category' },
            { name: 'description' }
          ]
        }
      };

      const conn = createMockConnection({ pivotResult });
      
      const result = await generatePivotQuery({
        conn,
        safeRowFields: ['category'],
        safeColFields: ['region'],
        safeValField: 'sales',
        aggregateFunc: 'SUM'
      });

      expect(result.data[0].category).toBe('Product A');
      expect(result.data[0].description).toBe('Not a number');
      expect(typeof result.data[0].category).toBe('string');
    });
  });

  describe('column generation', () => {
    it('should generate columns with sanitized names', async () => {
      const pivotResult = {
        toArray: jest.fn().mockResolvedValue([]),
        schema: {
          fields: [
            { name: 'category name' },
            { name: 'region-north' },
            { name: 'year.2023' }
          ]
        }
      };

      const conn = createMockConnection({ pivotResult });
      
      const result = await generatePivotQuery({
        conn,
        safeRowFields: ['category'],
        safeColFields: ['region'],
        safeValField: 'sales',
        aggregateFunc: 'SUM'
      });

      expect(sanitizeColumnName).toHaveBeenCalledWith('category name');
      expect(sanitizeColumnName).toHaveBeenCalledWith('region-north');
      expect(sanitizeColumnName).toHaveBeenCalledWith('year.2023');

      expect(result.columns).toEqual([
        { id: 'category_name', header: 'category name', accessorKey: 'category_name' },
        { id: 'region_north', header: 'region-north', accessorKey: 'region_north' },
        { id: 'year_2023', header: 'year.2023', accessorKey: 'year_2023' }
      ]);
    });

    it('should preserve original field names in headers', async () => {
      const pivotResult = {
        toArray: jest.fn().mockResolvedValue([]),
        schema: {
          fields: [
            { name: 'Product Category' },
            { name: 'Sales-Region' }
          ]
        }
      };

      const conn = createMockConnection({ pivotResult });
      
      const result = await generatePivotQuery({
        conn,
        safeRowFields: ['category'],
        safeColFields: ['region'],
        safeValField: 'sales',
        aggregateFunc: 'SUM'
      });

      expect(result.columns[0].header).toBe('Product Category');
      expect(result.columns[1].header).toBe('Sales-Region');
    });
  });

  describe('helper function integration', () => {
    it('should use createSanitizedValueSql for value field', async () => {
      const conn = createMockConnection();
      
      await generatePivotQuery({
        conn,
        safeRowFields: ['category'],
        safeColFields: ['region'],
        safeValField: 'sales.amount',
        aggregateFunc: 'SUM'
      });

      expect(createSanitizedValueSql).toHaveBeenCalledWith('sales.amount');
    });

    it('should use sanitizeColumnName for label generation', async () => {
      const distinctResult = {
        toArray: jest.fn().mockResolvedValue([
          { region: 'North-East' },
          { region: 'South West' }
        ])
      };

      const conn = createMockConnection({ distinctResult });
      
      await generatePivotQuery({
        conn,
        safeRowFields: ['category'],
        safeColFields: ['region'],
        safeValField: 'sales',
        aggregateFunc: 'SUM'
      });

      expect(sanitizeColumnName).toHaveBeenCalledWith('region');
      expect(sanitizeColumnName).toHaveBeenCalledWith('North-East');
      expect(sanitizeColumnName).toHaveBeenCalledWith('South West');
    });
  });

  describe('edge cases', () => {
    it('should handle empty distinct results', async () => {
      const distinctResult = {
        toArray: jest.fn().mockResolvedValue([])
      };

      const pivotResult = {
        toArray: jest.fn().mockResolvedValue([]),
        schema: { fields: [] }
      };

      const conn = createMockConnection({ distinctResult, pivotResult });
      
      const result = await generatePivotQuery({
        conn,
        safeRowFields: ['category'],
        safeColFields: ['region'],
        safeValField: 'sales',
        aggregateFunc: 'SUM'
      });

      expect(result.data).toEqual([]);
      expect(result.columns).toEqual([]);
    });

    it('should handle label cleanup (remove leading/trailing underscores)', async () => {
      sanitizeColumnName.mockImplementation((name) => {
        if (name === null || name === undefined) return 'NULL';
        return String(name).replace(/[^a-zA-Z0-9_]/g, '_');
      });

      const distinctResult = {
        toArray: jest.fn().mockResolvedValue([
          { region: '_test_' },
          { region: '__another__' }
        ])
      };

      const conn = createMockConnection({ distinctResult });
      
      await generatePivotQuery({
        conn,
        safeRowFields: ['category'],
        safeColFields: ['region'],
        safeValField: 'sales',
        aggregateFunc: 'SUM'
      });

      const pivotSql = conn.query.mock.calls[1][0];
      // The function should clean up leading/trailing underscores
      expect(pivotSql).not.toContain('AS "_');
      expect(pivotSql).not.toContain('_"');
    });

    it('should handle duplicate combinations by grouping conditions', async () => {
      const distinctResult = {
        toArray: jest.fn().mockResolvedValue([
          { region: 'North', status: 'Active' },
          { region: 'North', status: 'Active' }, // Duplicate
          { region: 'South', status: 'Active' }
        ])
      };

      const conn = createMockConnection({ distinctResult });
      
      await generatePivotQuery({
        conn,
        safeRowFields: ['category'],
        safeColFields: ['region', 'status'],
        safeValField: 'sales',
        aggregateFunc: 'SUM'
      });

      const pivotSql = conn.query.mock.calls[1][0];
      // Should handle duplicates without creating invalid SQL
      expect(pivotSql).toContain('region_North_status_Active');
      expect(pivotSql).toContain('region_South_status_Active');
    });
  });

  describe('error handling', () => {
    it('should propagate connection errors for distinct query', async () => {
      const conn = {
        query: jest.fn().mockRejectedValue(new Error('Connection failed'))
      };

      await expect(generatePivotQuery({
        conn,
        safeRowFields: ['category'],
        safeColFields: ['region'],
        safeValField: 'sales',
        aggregateFunc: 'SUM'
      })).rejects.toThrow('Connection failed');
    });

    it('should propagate connection errors for pivot query', async () => {
      const conn = {
        query: jest.fn()
          .mockResolvedValueOnce({ toArray: jest.fn().mockResolvedValue([{ region: 'North' }]) })
          .mockRejectedValue(new Error('Pivot query failed'))
      };

      await expect(generatePivotQuery({
        conn,
        safeRowFields: ['category'],
        safeColFields: ['region'],
        safeValField: 'sales',
        aggregateFunc: 'SUM'
      })).rejects.toThrow('Pivot query failed');
    });
  });
});