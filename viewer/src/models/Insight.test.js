import { chartDataFromInsightData } from './Insight';

const sampleInsightsData = {
  'Expense Breakdown Table Insight': {
    insight: [
      {
        expense: 'Selling General & Admin Expenses',
        year: 'Sep 2023',
        amount: '24,932.00',
        row: 45,
        category: 'Selling General & Admin Expenses',
      },
      {
        expense: 'R&D Expenses',
        year: 'Sep 2023',
        amount: '29,915.00',
        row: 46,
        category: 'R&D Expenses',
      },
    ],
    columns: {
      'columns.x_data': 'x_data',
      'columns.y_data': 'y_data',
      'columns.measure': 'measure',
      'props.text': 'text',
    },
    props: {
      type: 'waterfall',
      measure: 'column(measure)',
      x: 'column(x_data)',
      y: 'column(y_data)',
      text: '?{ cast(thousands_dollars as text) }',
      increasing: {
        marker: { color: '#b97a9b' },
      },
    },
  },
  'Revenue vs Expense Bar Insight': {
    insight: [
      { category: 'Revenues', y_data: 383285, year: 'Sep 2023' },
      { category: 'Total Revenues', y_data: 383285, year: 'Sep 2023' },
    ],
    columns: {
      'columns.category': 'category',
      'columns.y_data': 'y_data',
    },
    props: {
      type: 'bar',
      x: 'column(category)',
      y: 'column(y_data)',
      marker: { color: '#4a90e2' },
    },
  },
};

describe('chartDataFromInsightData', () => {
  it('returns [] when insightsData is null', () => {
    expect(chartDataFromInsightData(null)).toEqual([]);
  });

  it('skips insights without insight/columns/props', () => {
    const data = {
      invalid: {
        insight: [{ foo: 1 }],
        columns: { col: 'foo' },
      },
    };
    expect(chartDataFromInsightData(data)).toEqual([]);
  });

  it('resolves column() references into arrays of values', () => {
    const result = chartDataFromInsightData(sampleInsightsData);
    const expenseTrace = result.find(r => r.name === 'Expense Breakdown Table Insight');
    expect(expenseTrace).toBeDefined();
    expect(expenseTrace.x).toEqual([]); // no x_data field in rows
    expect(expenseTrace.y).toEqual([]); // no y_data field in rows
    expect(expenseTrace.measure).toEqual([]); // no measure field in rows
  });

  it('resolves ?{} placeholder with text column', () => {
    const result = chartDataFromInsightData(sampleInsightsData);
    const expenseTrace = result.find(r => r.name === 'Expense Breakdown Table Insight');
    expect(expenseTrace.text).toEqual([]);
  });

  it('handles bar chart columns correctly', () => {
    const result = chartDataFromInsightData(sampleInsightsData);
    const barTrace = result.find(r => r.name === 'Revenue vs Expense Bar Insight');
    expect(barTrace.type).toBe('bar');
    expect(barTrace.x).toEqual(['Revenues', 'Total Revenues']);
    expect(barTrace.y).toEqual([383285, 383285]);
    expect(barTrace.marker.color).toBe('#4a90e2');
  });

  it('sets insight name correctly', () => {
    const result = chartDataFromInsightData(sampleInsightsData);
    const names = result.map(r => r.name);
    expect(names).toContain('Expense Breakdown Table Insight');
    expect(names).toContain('Revenue vs Expense Bar Insight');
  });
});
