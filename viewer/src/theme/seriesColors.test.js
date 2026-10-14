import { seriesColorway, seriesOrderOf } from './seriesColors';

const COLORWAY = ['teal', 'orange', 'plum', 'gold'];

const split = (...names) => names.map(name => ({ name, type: 'bar', sourceInsight: 'by-kind' }));
const traces = (...names) => names.map(name => ({ name, type: 'bar' }));

describe('dashboard series colours', () => {
  test('a series keeps one colour on charts that list it in different positions', () => {
    const first = split('Revenue', 'Cost');
    const second = split('Cost', 'Margin');
    const order = seriesOrderOf([first, second]);

    expect(seriesColorway(first, order, COLORWAY)).toEqual(['teal', 'orange']);
    expect(seriesColorway(second, order, COLORWAY)).toEqual(['orange', 'plum']);
  });

  test('multi-insight charts share colours by insight name', () => {
    const first = traces('revenue', 'cost');
    const second = traces('cost', 'margin');
    const order = seriesOrderOf([first, second]);

    expect(seriesColorway(second, order, COLORWAY)).toEqual(['orange', 'plum']);
  });

  test('a single unsplit series keeps the theme look and takes no colour from the others', () => {
    const lone = traces('revenue');
    const pair = traces('cost', 'margin');
    const order = seriesOrderOf([lone, pair]);

    expect(order).toEqual(['cost', 'margin']);
    expect(seriesColorway(lone, order, COLORWAY)).toBeUndefined();
  });

  test('a split chart left with one series still uses its dashboard colour', () => {
    const order = seriesOrderOf([split('Revenue', 'Cost'), split('Cost')]);

    expect(seriesColorway(split('Cost'), order, COLORWAY)).toEqual(['orange']);
  });

  test('wraps the theme colorway when the dashboard has more series than colours', () => {
    const many = traces('a', 'b', 'c', 'd', 'e');
    const order = seriesOrderOf([many]);

    expect(seriesColorway(traces('e', 'a'), order, COLORWAY)).toEqual(['teal', 'teal']);
  });

  test('label-coloured charts keep the theme colorway for their slices', () => {
    const pies = [
      { name: 'Cost', type: 'pie' },
      { name: 'Margin', type: 'pie' },
    ];
    const order = seriesOrderOf([split('Margin', 'Cost'), pies]);

    expect(order).toEqual(['Margin', 'Cost']);
    expect(seriesColorway(pies, order, COLORWAY)).toBeUndefined();
  });

  test('an explicitly hidden trace takes no colorway slot, as in Plotly', () => {
    const chart = [
      { name: 'Revenue', type: 'bar' },
      { name: 'Hidden', type: 'bar', visible: false },
      { name: 'Cost', type: 'bar' },
    ];
    const order = seriesOrderOf([chart]);

    expect(order).toEqual(['Revenue', 'Cost']);
    expect(seriesColorway(chart, order, COLORWAY)).toEqual(['teal', 'orange']);
  });

  test('leaves the chart alone when one of its series is not in the dashboard order', () => {
    expect(seriesColorway(traces('cost', 'other'), ['cost'], COLORWAY)).toBeUndefined();
    expect(seriesColorway(traces('cost', 'margin'), undefined, COLORWAY)).toBeUndefined();
    expect(seriesColorway(traces('cost', 'margin'), ['cost', 'margin'], undefined)).toBeUndefined();
  });
});
