import { sourceConfigFor, sourceNameFor } from './UploadFile';

describe('sourceNameFor', () => {
  test.each([
    ['Sales_Q3.csv', 'sales_q3'],
    ['sales-2.csv', 'sales_2'],
    ['2024 orders.tsv', 'file_2024_orders'],
    ['__.csv', 'file'],
    ['no_extension', 'no_extension'],
  ])('%s becomes %s', (filename, expected) => {
    expect(sourceNameFor(filename)).toBe(expected);
  });

  test('a taken name gets the next free number', () => {
    expect(sourceNameFor('sales.csv', ['sales', 'sales_2'])).toBe('sales_3');
  });
});

describe('sourceConfigFor', () => {
  const formats = [
    { format: 'csv', extensions: ['.csv', '.tsv'], source_type: 'csv' },
    { format: 'xlsx', extensions: ['.xlsx'], source_type: 'xls' },
    { format: 'duckdb', extensions: ['.duckdb'], source_type: 'duckdb' },
    { format: 'sqlite', extensions: ['.sqlite', '.sqlite3'], source_type: 'sqlite' },
  ];

  test('a CSV file becomes a csv source on its path, with tidy column names', () => {
    expect(sourceConfigFor({ path: 'files/sales.csv', format: 'csv' }, formats, 'sales')).toEqual({
      name: 'sales',
      type: 'csv',
      file: 'files/sales.csv',
      normalize_names: true,
    });
  });

  test('a TSV file reads with a tab delimiter', () => {
    expect(sourceConfigFor({ path: 'files/rates.tsv', format: 'csv' }, formats, 'rates')).toEqual({
      name: 'rates',
      type: 'csv',
      file: 'files/rates.tsv',
      delimiter: '\t',
      normalize_names: true,
    });
  });

  test('an Excel file becomes an xls source on its path, with tidy column names', () => {
    expect(sourceConfigFor({ path: 'files/plan.xlsx', format: 'xlsx' }, formats, 'plan')).toEqual({
      name: 'plan',
      type: 'xls',
      file: 'files/plan.xlsx',
      normalize_names: true,
    });
  });

  test.each([
    ['files/shop.duckdb', 'duckdb'],
    ['files/shop.sqlite', 'sqlite'],
  ])('a database file %s becomes a %s source on its database path', (path, format) => {
    expect(sourceConfigFor({ path, format }, formats, 'shop')).toEqual({
      name: 'shop',
      type: format,
      database: path,
    });
  });
});
