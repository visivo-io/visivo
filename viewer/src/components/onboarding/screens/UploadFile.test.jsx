import { sourceNameFor } from './UploadFile';

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
