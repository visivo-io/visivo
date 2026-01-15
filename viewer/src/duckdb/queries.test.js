/* eslint-disable no-template-curly-in-string */
import * as queries from './queries';
import { insertDuckDBFile, runDuckDBQuery, prepPostQuery } from './queries';

jest.mock('@duckdb/duckdb-wasm', () => {
  return {
    DuckDBDataProtocol: {
      BROWSER_FILEREADER: 'BROWSER_FILEREADER',
    },
    AsyncDuckDB: jest.fn(),
  };
});

// Fake connection object
const mockConn = {
  query: jest.fn().mockResolvedValue('mock-result'),
  close: jest.fn().mockResolvedValue(undefined),
  insertCSVFromPath: jest.fn().mockResolvedValue(undefined),
};

// Fake DB object
const makeMockDB = () => ({
  connect: jest.fn().mockResolvedValue(mockConn),
  registerFileHandle: jest.fn().mockResolvedValue(undefined),
  registerFileText: jest.fn().mockResolvedValue(undefined),
  dropFile: jest.fn().mockResolvedValue(undefined),
});

let db;
beforeEach(() => {
  db = makeMockDB();
  jest.spyOn(queries, 'runDuckDBQuery');
});

describe('DuckDB Query Functions', () => {
  it('executes query with persistent connection (no close)', async () => {
    const result = await runDuckDBQuery(db, 'SELECT 1');

    expect(db.connect).toHaveBeenCalled();
    expect(mockConn.query).toHaveBeenCalledWith('SELECT 1');
    // Connection is NOT closed - we use persistent connections for performance
    expect(mockConn.close).not.toHaveBeenCalled();
    expect(result).toBe('mock-result');
  });

  it('handles json files', async () => {
    const file = new File([JSON.stringify({ x: 1 })], 'data.json', {
      type: 'application/json',
    });
    file.text = jest.fn().mockResolvedValue(JSON.stringify({ x: 1 }));

    await insertDuckDBFile(db, file, 'json_table');

    expect(db.registerFileText).toHaveBeenCalled();
    expect(mockConn.query).toHaveBeenCalledWith(expect.stringContaining('read_json_auto'));
    expect(db.dropFile).toHaveBeenCalled();
  });

  it('ignores unsupported extensions', async () => {
    const file = new File(['dummy'], 'notes.txt');
    await insertDuckDBFile(db, file, 'txt_table');

    // No handlers should be called for unsupported extensions
    expect(db.registerFileText).not.toHaveBeenCalled();
    expect(db.registerFileHandle).not.toHaveBeenCalled();
  });
});

describe('prepPostQuery - Template Literal Injection', () => {
  let debugSpy;

  beforeEach(() => {
    debugSpy = jest.spyOn(console, 'debug').mockImplementation();
  });

  afterEach(() => {
    debugSpy.mockRestore();
  });

  describe('Simple value injection', () => {
    it('injects string value with quotes as-is', () => {
      const insight = { query: 'SELECT * FROM table WHERE category = ${category}' };
      const inputs = { category: "'electronics'" }; // Value includes quotes
      const result = prepPostQuery(insight, inputs);
      expect(result).toBe("SELECT * FROM table WHERE category = 'electronics'");
    });

    it('injects numeric value without quotes', () => {
      const insight = { query: 'SELECT * FROM table WHERE id = ${id}' };
      const inputs = { id: '123' };
      const result = prepPostQuery(insight, inputs);
      expect(result).toBe('SELECT * FROM table WHERE id = 123');
    });

    it('injects float value with decimal', () => {
      const insight = { query: 'SELECT * FROM table WHERE price > ${price}' };
      const inputs = { price: '99.99' };
      const result = prepPostQuery(insight, inputs);
      expect(result).toBe('SELECT * FROM table WHERE price > 99.99');
    });

    it('injects multiple inputs in same query', () => {
      const insight = {
        query: 'SELECT * FROM table WHERE category = ${category} AND price > ${minPrice}',
      };
      const inputs = { category: "'electronics'", minPrice: '50' };
      const result = prepPostQuery(insight, inputs);
      expect(result).toBe("SELECT * FROM table WHERE category = 'electronics' AND price > 50");
    });

    it('injects date string with quotes', () => {
      const insight = { query: 'SELECT * FROM table WHERE date >= ${startDate}' };
      const inputs = { startDate: "'2024-01-01'" };
      const result = prepPostQuery(insight, inputs);
      expect(result).toBe("SELECT * FROM table WHERE date >= '2024-01-01'");
    });
  });

  describe('SQL structure preservation', () => {
    it('handles CASE statement with input', () => {
      const insight = {
        query: "SELECT CASE WHEN status = ${status} THEN 'active' ELSE 'inactive' END",
      };
      const inputs = { status: "'open'" };
      const result = prepPostQuery(insight, inputs);
      expect(result).toBe("SELECT CASE WHEN status = 'open' THEN 'active' ELSE 'inactive' END");
    });

    it('handles multiple inputs across complex query', () => {
      const insight = {
        query: `
          SELECT * FROM orders
          WHERE status = \${status}
          AND created_at >= \${startDate}
          AND total > \${minAmount}
        `,
      };
      const inputs = {
        status: "'shipped'",
        startDate: "'2024-01-01'",
        minAmount: '100',
      };
      const result = prepPostQuery(insight, inputs);
      expect(result).toContain("status = 'shipped'");
      expect(result).toContain("created_at >= '2024-01-01'");
      expect(result).toContain('total > 100');
    });

    it('handles input in HAVING clause', () => {
      const insight = {
        query:
          'SELECT category, COUNT(*) FROM table GROUP BY category HAVING COUNT(*) > ${minCount}',
      };
      const inputs = { minCount: '10' };
      const result = prepPostQuery(insight, inputs);
      expect(result).toBe(
        'SELECT category, COUNT(*) FROM table GROUP BY category HAVING COUNT(*) > 10'
      );
    });

    it('handles input in subquery', () => {
      const insight = {
        query: 'SELECT * FROM (SELECT * FROM table WHERE status = ${status}) subquery',
      };
      const inputs = { status: "'active'" };
      const result = prepPostQuery(insight, inputs);
      expect(result).toBe("SELECT * FROM (SELECT * FROM table WHERE status = 'active') subquery");
    });
  });

  describe('Edge cases and validation', () => {
    it('returns empty string when query is missing', () => {
      const insight = {};
      const inputs = { category: "'electronics'" };
      const result = prepPostQuery(insight, inputs);
      expect(result).toBe('');
    });

    it('handles empty inputs object', () => {
      const insight = { query: 'SELECT * FROM table' };
      const inputs = {};
      const result = prepPostQuery(insight, inputs);
      expect(result).toBe('SELECT * FROM table');
    });

    it('throws error when referenced input is missing', () => {
      const insight = { query: 'SELECT * FROM table WHERE category = ${category}' };
      const inputs = {}; // Missing 'category'
      expect(() => prepPostQuery(insight, inputs)).toThrow('Query preparation failed');
    });

    it('handles special characters in string values', () => {
      const insight = { query: 'SELECT * FROM table WHERE name = ${name}' };
      const inputs = { name: "'O''Brien'" }; // SQL-escaped apostrophe
      const result = prepPostQuery(insight, inputs);
      expect(result).toBe("SELECT * FROM table WHERE name = 'O''Brien'");
    });

    it('preserves SQL keywords in query', () => {
      const insight = {
        query: 'SELECT DISTINCT category FROM table WHERE status = ${status} ORDER BY category',
      };
      const inputs = { status: "'active'" };
      const result = prepPostQuery(insight, inputs);
      expect(result).toContain('SELECT DISTINCT');
      expect(result).toContain('ORDER BY');
    });
  });

  describe('Real-world scenarios', () => {
    it('handles split CASE statement with multiple inputs', () => {
      const insight = {
        query: `
          SELECT
            CASE
              WHEN amount > \${highThreshold} THEN 'high'
              WHEN amount > \${lowThreshold} THEN 'medium'
              ELSE 'low'
            END as tier
          FROM transactions
        `,
      };
      const inputs = { highThreshold: '1000', lowThreshold: '100' };
      const result = prepPostQuery(insight, inputs);
      expect(result).toContain('amount > 1000');
      expect(result).toContain('amount > 100');
    });

    it('handles IN clause with single input placeholder', () => {
      const insight = { query: 'SELECT * FROM table WHERE status = ${status}' };
      const inputs = { status: "'active'" };
      const result = prepPostQuery(insight, inputs);
      expect(result).toBe("SELECT * FROM table WHERE status = 'active'");
    });

    it('handles boolean comparison', () => {
      const insight = { query: 'SELECT * FROM table WHERE is_active = ${isActive}' };
      const inputs = { isActive: 'true' };
      const result = prepPostQuery(insight, inputs);
      expect(result).toBe('SELECT * FROM table WHERE is_active = true');
    });

    it('handles null value', () => {
      const insight = { query: 'SELECT * FROM table WHERE metadata = ${metadata}' };
      const inputs = { metadata: 'NULL' };
      const result = prepPostQuery(insight, inputs);
      expect(result).toBe('SELECT * FROM table WHERE metadata = NULL');
    });
  });

  describe('Accessor object support', () => {
    it('handles single-select accessor with .value', () => {
      const insight = { query: 'SELECT * FROM table WHERE region = ${region.value}' };
      const inputs = { region: { value: "'East'" } };
      const result = prepPostQuery(insight, inputs);
      expect(result).toBe("SELECT * FROM table WHERE region = 'East'");
    });

    it('handles multi-select accessor with .values', () => {
      const insight = { query: 'SELECT * FROM table WHERE category IN (${categories.values})' };
      const inputs = { categories: { values: "'electronics','clothing'" } };
      const result = prepPostQuery(insight, inputs);
      expect(result).toBe("SELECT * FROM table WHERE category IN ('electronics','clothing')");
    });

    it('handles multi-select accessor with .min and .max', () => {
      const insight = {
        query: 'SELECT * FROM table WHERE price BETWEEN ${price.min} AND ${price.max}',
      };
      const inputs = { price: { min: 100, max: 500, values: "'100','500'" } };
      const result = prepPostQuery(insight, inputs);
      expect(result).toBe('SELECT * FROM table WHERE price BETWEEN 100 AND 500');
    });

    it('handles multi-select accessor with .first and .last', () => {
      const insight = {
        query: "SELECT * FROM table WHERE date >= '${dates.first}' AND date <= '${dates.last}'",
      };
      const inputs = {
        dates: { first: '2024-01-01', last: '2024-12-31', values: "'2024-01-01','2024-12-31'" },
      };
      const result = prepPostQuery(insight, inputs);
      expect(result).toBe(
        "SELECT * FROM table WHERE date >= '2024-01-01' AND date <= '2024-12-31'"
      );
    });

    it('handles null accessor values as SQL NULL keyword (not string)', () => {
      const insight = {
        query: 'SELECT * FROM table WHERE date BETWEEN ${dateRange.min} AND ${dateRange.max}',
      };
      // Null min/max from empty selection or non-numeric values
      const inputs = { dateRange: { values: null, min: null, max: null, first: null, last: null } };
      const result = prepPostQuery(insight, inputs);
      // null values should become SQL NULL keyword (not string 'NULL')
      expect(result).toBe('SELECT * FROM table WHERE date BETWEEN NULL AND NULL');
    });

    it('handles mixed null and non-null accessor values', () => {
      const insight = {
        query: 'SELECT * FROM table WHERE price >= ${price.min} AND category IN (${price.values})',
      };
      // min is computed, values is null (empty selection scenario)
      const inputs = { price: { values: null, min: 100, max: null, first: 100, last: null } };
      const result = prepPostQuery(insight, inputs);
      expect(result).toBe('SELECT * FROM table WHERE price >= 100 AND category IN (NULL)');
    });

    it('handles accessor with escaped single quotes in .values', () => {
      const insight = { query: 'SELECT * FROM table WHERE name IN (${names.values})' };
      // Values with escaped single quotes (O'Reilly -> 'O''Reilly')
      const inputs = { names: { values: "'O''Reilly','ACME'" } };
      const result = prepPostQuery(insight, inputs);
      expect(result).toBe("SELECT * FROM table WHERE name IN ('O''Reilly','ACME')");
    });
  });

  describe('Input value formatting from backend', () => {
    it('handles date formatted as quoted string from input query', () => {
      const insight = { query: 'SELECT * FROM orders WHERE date >= ${orderDate}' };
      // Backend input query returns: SELECT '2024-01-01' as option
      const inputs = { orderDate: "'2024-01-01'" };
      const result = prepPostQuery(insight, inputs);
      expect(result).toBe("SELECT * FROM orders WHERE date >= '2024-01-01'");
    });

    it('handles category string from input query', () => {
      const insight = { query: 'SELECT * FROM products WHERE category = ${category}' };
      // Backend input query returns: SELECT 'electronics' as option
      const inputs = { category: "'electronics'" };
      const result = prepPostQuery(insight, inputs);
      expect(result).toBe("SELECT * FROM products WHERE category = 'electronics'");
    });

    it('handles numeric ID from input query', () => {
      const insight = { query: 'SELECT * FROM users WHERE user_id = ${userId}' };
      // Backend input query returns: SELECT 12345 as option
      const inputs = { userId: '12345' };
      const result = prepPostQuery(insight, inputs);
      expect(result).toBe('SELECT * FROM users WHERE user_id = 12345');
    });
  });
});
