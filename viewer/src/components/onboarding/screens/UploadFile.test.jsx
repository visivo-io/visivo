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
  const formats = [{ format: 'csv', extensions: ['.csv', '.tsv'], source_type: 'csv' }];

  test('a CSV file becomes a csv source on its path', () => {
    expect(sourceConfigFor({ path: 'files/sales.csv', format: 'csv' }, formats, 'sales')).toEqual({
      name: 'sales',
      type: 'csv',
      file: 'files/sales.csv',
    });
  });

  test('a TSV file reads with a tab delimiter', () => {
    expect(sourceConfigFor({ path: 'files/rates.tsv', format: 'csv' }, formats, 'rates')).toEqual({
      name: 'rates',
      type: 'csv',
      file: 'files/rates.tsv',
      delimiter: '\t',
    });
  });
});
