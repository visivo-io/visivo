import {
  chartDataFromInsightData,
  processInputRefsInProps,
  extractInputDependenciesFromProps,
} from './Insight';

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

  describe('split_key functionality', () => {
    it('creates multiple traces when split_key is present', () => {
      const insightWithSplit = {
        'Split Insight': {
          data: [
            { x_val: 1, y_val: 10, category: 'High' },
            { x_val: 2, y_val: 20, category: 'High' },
            { x_val: 3, y_val: 5, category: 'Low' },
            { x_val: 4, y_val: 8, category: 'Low' },
          ],
          props_mapping: {
            'props.x': 'x_val',
            'props.y': 'y_val',
          },
          split_key: 'category',
          type: 'scatter',
        },
      };
      const result = chartDataFromInsightData(insightWithSplit);

      // Should create 2 traces (one for High, one for Low)
      expect(result.length).toBe(2);

      const highTrace = result.find(r => r.name === 'High');
      const lowTrace = result.find(r => r.name === 'Low');

      expect(highTrace).toBeDefined();
      expect(lowTrace).toBeDefined();

      // Verify data is grouped correctly
      expect(highTrace.x).toEqual([1, 2]);
      expect(highTrace.y).toEqual([10, 20]);
      expect(lowTrace.x).toEqual([3, 4]);
      expect(lowTrace.y).toEqual([5, 8]);
    });

    it('sets sourceInsight property for split traces', () => {
      const insightWithSplit = {
        'My Split Insight': {
          data: [
            { x_val: 1, y_val: 10, group: 'A' },
            { x_val: 2, y_val: 20, group: 'B' },
          ],
          props_mapping: {
            'props.x': 'x_val',
            'props.y': 'y_val',
          },
          split_key: 'group',
          type: 'bar',
        },
      };
      const result = chartDataFromInsightData(insightWithSplit);

      expect(result.length).toBe(2);
      // All split traces should have sourceInsight set to the original insight name
      result.forEach(trace => {
        expect(trace.sourceInsight).toBe('My Split Insight');
      });
    });

    it('sets legendgroup to split value', () => {
      const insightWithSplit = {
        'Legend Insight': {
          data: [
            { x_val: 1, y_val: 10, status: 'Active' },
            { x_val: 2, y_val: 20, status: 'Inactive' },
          ],
          props_mapping: {
            'props.x': 'x_val',
            'props.y': 'y_val',
          },
          split_key: 'status',
          type: 'scatter',
        },
      };
      const result = chartDataFromInsightData(insightWithSplit);

      const activeTrace = result.find(r => r.legendgroup === 'Active');
      const inactiveTrace = result.find(r => r.legendgroup === 'Inactive');

      expect(activeTrace).toBeDefined();
      expect(inactiveTrace).toBeDefined();
    });

    it('does not set sourceInsight for non-split traces', () => {
      const insightWithoutSplit = {
        'Regular Insight': {
          data: [
            { x_val: 1, y_val: 10 },
            { x_val: 2, y_val: 20 },
          ],
          props_mapping: {
            'props.x': 'x_val',
            'props.y': 'y_val',
          },
          type: 'scatter',
        },
      };
      const result = chartDataFromInsightData(insightWithoutSplit);

      expect(result.length).toBe(1);
      expect(result[0].sourceInsight).toBeUndefined();
      expect(result[0].name).toBe('Regular Insight');
    });

    it('handles null split values gracefully', () => {
      const insightWithNullSplit = {
        'Null Split Insight': {
          data: [
            { x_val: 1, y_val: 10, group: 'A' },
            { x_val: 2, y_val: 20, group: null },
          ],
          props_mapping: {
            'props.x': 'x_val',
            'props.y': 'y_val',
          },
          split_key: 'group',
          type: 'scatter',
        },
      };
      const result = chartDataFromInsightData(insightWithNullSplit);

      expect(result.length).toBe(2);
      const nullTrace = result.find(r => r.name === 'null');
      expect(nullTrace).toBeDefined();
    });
  });

  /* eslint-disable no-template-curly-in-string */
  describe('input refs in static_props', () => {
    it('processes input refs in static_props', () => {
      const insightWithInputRefs = {
        'Input Ref Insight': {
          data: [
            { x_val: 1, y_val: 10 },
            { x_val: 2, y_val: 20 },
          ],
          props_mapping: {
            'props.x': 'x_val',
            'props.y': 'y_val',
          },
          static_props: {
            mode: '${show_markers.value}',
          },
          type: 'scatter',
        },
      };

      const inputs = {
        show_markers: { value: 'markers+lines' },
      };

      const result = chartDataFromInsightData(insightWithInputRefs, inputs);

      expect(result.length).toBe(1);
      expect(result[0].mode).toBe('markers+lines');
    });

    it('handles missing inputs gracefully', () => {
      const insightWithInputRefs = {
        'Missing Input Insight': {
          data: [{ x_val: 1, y_val: 10 }],
          props_mapping: {
            'props.x': 'x_val',
            'props.y': 'y_val',
          },
          static_props: {
            mode: '${missing_input.value}',
          },
          type: 'scatter',
        },
      };

      // No inputs provided
      const result = chartDataFromInsightData(insightWithInputRefs, {});

      expect(result.length).toBe(1);
      // Should keep original value when input not available
      expect(result[0].mode).toBe('${missing_input.value}');
    });

    it('handles nested input refs in static_props', () => {
      const insightWithNestedInputRefs = {
        'Nested Input Ref Insight': {
          data: [{ x_val: 1, y_val: 10 }],
          props_mapping: {
            'props.x': 'x_val',
            'props.y': 'y_val',
          },
          static_props: {
            marker: {
              size: '${marker_size.value}',
              color: 'red',
            },
          },
          type: 'scatter',
        },
      };

      const inputs = {
        marker_size: { value: 12 },
      };

      const result = chartDataFromInsightData(insightWithNestedInputRefs, inputs);

      expect(result.length).toBe(1);
      expect(result[0].marker.size).toBe(12);
      expect(result[0].marker.color).toBe('red');
    });
  });
  /* eslint-enable no-template-curly-in-string */
});

/* eslint-disable no-template-curly-in-string */
describe('processInputRefsInProps', () => {
  it('returns props unchanged when no inputs provided', () => {
    const props = { mode: '${input.value}' };
    expect(processInputRefsInProps(props, {})).toEqual({ mode: '${input.value}' });
  });

  it('returns props unchanged when props is null', () => {
    expect(processInputRefsInProps(null, { input: { value: 'test' } })).toBeNull();
  });

  it('replaces single input ref with actual value', () => {
    const props = { mode: '${show_markers.value}' };
    const inputs = { show_markers: { value: 'markers' } };
    expect(processInputRefsInProps(props, inputs)).toEqual({ mode: 'markers' });
  });

  it('replaces numeric input ref with number type', () => {
    const props = { size: '${marker_size.value}' };
    const inputs = { marker_size: { value: 10 } };
    const result = processInputRefsInProps(props, inputs);
    expect(result.size).toBe(10);
    expect(typeof result.size).toBe('number');
  });

  it('handles nested objects', () => {
    const props = {
      marker: {
        size: '${size_input.value}',
        color: 'blue',
      },
    };
    const inputs = { size_input: { value: 8 } };
    const result = processInputRefsInProps(props, inputs);
    expect(result.marker.size).toBe(8);
    expect(result.marker.color).toBe('blue');
  });

  it('handles arrays', () => {
    const props = {
      colors: ['red', '${color_input.value}', 'blue'],
    };
    const inputs = { color_input: { value: 'green' } };
    const result = processInputRefsInProps(props, inputs);
    expect(result.colors).toEqual(['red', 'green', 'blue']);
  });

  it('handles multiple accessors', () => {
    const props = {
      min: '${range.min}',
      max: '${range.max}',
    };
    const inputs = { range: { min: 0, max: 100 } };
    const result = processInputRefsInProps(props, inputs);
    expect(result.min).toBe(0);
    expect(result.max).toBe(100);
  });
});

describe('extractInputDependenciesFromProps', () => {
  it('returns empty array for null props', () => {
    expect(extractInputDependenciesFromProps(null)).toEqual([]);
  });

  it('returns empty array for props without input refs', () => {
    const props = { mode: 'markers', color: 'red' };
    expect(extractInputDependenciesFromProps(props)).toEqual([]);
  });

  it('extracts single input name', () => {
    const props = { mode: '${show_markers.value}' };
    expect(extractInputDependenciesFromProps(props)).toEqual(['show_markers']);
  });

  it('extracts multiple unique input names', () => {
    const props = {
      min: '${range.min}',
      max: '${range.max}',
      mode: '${display.value}',
    };
    const result = extractInputDependenciesFromProps(props);
    expect(result).toContain('range');
    expect(result).toContain('display');
    expect(result.length).toBe(2); // 'range' appears twice but should be deduplicated
  });

  it('extracts from nested objects', () => {
    const props = {
      marker: {
        size: '${size_input.value}',
      },
    };
    expect(extractInputDependenciesFromProps(props)).toEqual(['size_input']);
  });

  it('extracts from arrays', () => {
    const props = {
      values: ['static', '${dynamic.value}'],
    };
    expect(extractInputDependenciesFromProps(props)).toEqual(['dynamic']);
  });
});
/* eslint-enable no-template-curly-in-string */
