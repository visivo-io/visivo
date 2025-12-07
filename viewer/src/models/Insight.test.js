import { chartDataFromInsightData } from './Insight';

const sampleInsightsData = {
  'Expense Breakdown Table Insight': {
    data: [
      {
        expense: 'Selling General & Admin Expenses',
        year: 'Sep 2023',
        amount: '24,932.00',
        row: 45,
        category: 'Selling General & Admin Expenses',
        x_data: null,
        y_data: null,
        measure: null,
        text: null,
      },
      {
        expense: 'R&D Expenses',
        year: 'Sep 2023',
        amount: '29,915.00',
        row: 46,
        category: 'R&D Expenses',
        x_data: null,
        y_data: null,
        measure: null,
        text: null,
      },
    ],
    props_mapping: {
      'props.type': 'type_col',
      'props.measure': 'measure',
      'props.x': 'x_data',
      'props.y': 'y_data',
      'props.text': 'text',
    },
  },
  'Revenue vs Expense Bar Insight': {
    data: [
      {
        category: 'Revenues',
        y_data: 383285,
        year: 'Sep 2023',
        type_col: 'bar',
        marker_color: '#4a90e2',
      },
      {
        category: 'Total Revenues',
        y_data: 383285,
        year: 'Sep 2023',
        type_col: 'bar',
        marker_color: '#4a90e2',
      },
    ],
    props_mapping: {
      'props.type': 'type_col',
      'props.x': 'category',
      'props.y': 'y_data',
      'props.marker.color': 'marker_color',
    },
  },
};

describe('chartDataFromInsightData', () => {
  it('returns [] when insightsData is null', () => {
    expect(chartDataFromInsightData(null)).toEqual([]);
  });

  it('sets trace type from static type field', () => {
    const insightWithStaticType = {
      'Static Type Insight': {
        data: [
          { x_val: 1, y_val: 10 },
          { x_val: 2, y_val: 20 },
        ],
        props_mapping: {
          'props.x': 'x_val',
          'props.y': 'y_val',
        },
        type: 'bar', // Static type from insight definition
      },
    };
    const result = chartDataFromInsightData(insightWithStaticType);
    expect(result.length).toBe(1);
    expect(result[0].type).toBe('bar');
    expect(result[0].x).toEqual([1, 2]);
    expect(result[0].y).toEqual([10, 20]);
  });

  it('skips insights without data or props_mapping', () => {
    const data = {
      invalid: {
        data: [{ foo: 1 }],
        // Missing props_mapping
      },
    };
    expect(chartDataFromInsightData(data)).toEqual([]);
  });

  it('maps data columns to props using props_mapping', () => {
    const result = chartDataFromInsightData(sampleInsightsData);
    const expenseTrace = result.find(r => r.name === 'Expense Breakdown Table Insight');
    expect(expenseTrace).toBeDefined();
    expect(expenseTrace.x).toEqual([null, null]); // x_data values
    expect(expenseTrace.y).toEqual([null, null]); // y_data values
    expect(expenseTrace.measure).toEqual([null, null]); // measure values
  });

  it('maps text column data', () => {
    const result = chartDataFromInsightData(sampleInsightsData);
    const expenseTrace = result.find(r => r.name === 'Expense Breakdown Table Insight');
    expect(expenseTrace.text).toEqual([null, null]); // text values
  });

  it('handles bar chart columns correctly', () => {
    const result = chartDataFromInsightData(sampleInsightsData);
    const barTrace = result.find(r => r.name === 'Revenue vs Expense Bar Insight');
    expect(barTrace.type).toEqual(['bar', 'bar']); // type is now an array
    expect(barTrace.x).toEqual(['Revenues', 'Total Revenues']);
    expect(barTrace.y).toEqual([383285, 383285]);
    expect(barTrace.marker.color).toEqual(['#4a90e2', '#4a90e2']); // color is now an array
  });

  it('sets insight name correctly', () => {
    const result = chartDataFromInsightData(sampleInsightsData);
    const names = result.map(r => r.name);
    expect(names).toContain('Expense Breakdown Table Insight');
    expect(names).toContain('Revenue vs Expense Bar Insight');
  });
});
