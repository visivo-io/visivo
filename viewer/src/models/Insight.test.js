import {
  chartDataFromInsightData,
  processInputRefsInProps,
  extractInputDependenciesFromProps,
  applySliceExpression,
  mapQueryResultsToProps,
  tableDataFromQueryResults,
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
  let warnSpy, debugSpy;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    debugSpy = jest.spyOn(console, 'debug').mockImplementation();
  });

  afterEach(() => {
    warnSpy.mockRestore();
    debugSpy.mockRestore();
  });

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

  // VIS-1003 / §8.3: union detection across props + interactions + LAYOUT.
  it('extracts an input referenced only from a layout position (axis range)', () => {
    const config = {
      props: { type: 'scatter' },
      layout: { xaxis: { range: ['${start_date.value}', '${end_date.value}'] } },
    };
    const result = extractInputDependenciesFromProps(config);
    expect(result).toContain('start_date');
    expect(result).toContain('end_date');
    expect(result.length).toBe(2);
  });

  it('extracts an input from a layout title via ${ref(input).accessor}', () => {
    const config = {
      props: { type: 'bar' },
      layout: { title: { text: 'Sales for ${ref(region).value}' } },
    };
    expect(extractInputDependenciesFromProps(config)).toEqual(['region']);
  });

  it('unions input deps across props, interactions, AND layout', () => {
    const config = {
      props: { mode: '${show_markers.value}' },
      interactions: [{ filter: 'x > ${min_value.value}' }],
      layout: { yaxis: { range: [0, '${y_max.value}'] } },
    };
    const result = extractInputDependenciesFromProps(config);
    expect(result).toContain('show_markers');
    expect(result).toContain('min_value');
    expect(result).toContain('y_max');
    expect(result.length).toBe(3);
  });

  it('treats a config with only a layout key as a structured config (not bare props)', () => {
    const config = { layout: { xaxis: { range: ['${lo.value}', '${hi.value}'] } } };
    const result = extractInputDependenciesFromProps(config);
    expect(result).toContain('lo');
    expect(result).toContain('hi');
  });
});
/* eslint-enable no-template-curly-in-string */

// ---------------------------------------------------------------------------
// applySliceExpression — JS port of the schema-level ?{...}[N|a:b] grammar.
// ---------------------------------------------------------------------------

describe('applySliceExpression', () => {
  describe('single index', () => {
    it('returns the element at a positive index', () => {
      expect(applySliceExpression([10, 20, 30], '[0]')).toBe(10);
      expect(applySliceExpression([10, 20, 30], '[2]')).toBe(30);
    });

    it('handles negative indexes', () => {
      expect(applySliceExpression([10, 20, 30], '[-1]')).toBe(30);
      expect(applySliceExpression([10, 20, 30], '[-2]')).toBe(20);
    });

    it('returns null for out-of-bounds indexes', () => {
      expect(applySliceExpression([10, 20, 30], '[99]')).toBeNull();
      expect(applySliceExpression([10, 20, 30], '[-99]')).toBeNull();
    });
  });

  describe('slice forms', () => {
    it('handles [a:b]', () => {
      expect(applySliceExpression([0, 1, 2, 3, 4], '[1:4]')).toEqual([1, 2, 3]);
    });

    it('handles open-start [:b]', () => {
      expect(applySliceExpression([0, 1, 2, 3], '[:2]')).toEqual([0, 1]);
    });

    it('handles open-end [a:]', () => {
      expect(applySliceExpression([0, 1, 2, 3], '[2:]')).toEqual([2, 3]);
    });

    it('handles negative bounds [-3:-1]', () => {
      expect(applySliceExpression([0, 1, 2, 3, 4], '[-3:-1]')).toEqual([2, 3]);
    });

    it('handles strided slice [::2]', () => {
      expect(applySliceExpression([0, 1, 2, 3, 4], '[::2]')).toEqual([0, 2, 4]);
    });
  });

  describe('multi-index forms', () => {
    it('picks specified indices', () => {
      expect(applySliceExpression(['a', 'b', 'c', 'd'], '[0,2]')).toEqual(['a', 'c']);
    });

    it('handles negative indices in multi-index', () => {
      expect(applySliceExpression(['a', 'b', 'c'], '[0,-1]')).toEqual(['a', 'c']);
    });
  });

  describe('edge cases', () => {
    it('returns the array unchanged when no slice given', () => {
      expect(applySliceExpression([1, 2, 3], null)).toEqual([1, 2, 3]);
      expect(applySliceExpression([1, 2, 3], '')).toEqual([1, 2, 3]);
    });

    it('returns the value unchanged when not an array', () => {
      expect(applySliceExpression(42, '[0]')).toBe(42);
      expect(applySliceExpression('hello', '[0]')).toBe('hello');
    });
  });
});

// ---------------------------------------------------------------------------
// chartDataFromInsightData — slice support via insight.props_slices
// ---------------------------------------------------------------------------

describe('chartDataFromInsightData with props_slices', () => {
  it('applies a [0] slice to unwrap a scalar from a 1-row indicator query', () => {
    const insights = {
      ndr: {
        type: 'indicator',
        data: [{ v: 0.4325 }],
        props_mapping: { 'props.value': 'v' },
        props_slices: { 'props.value': '[0]' },
      },
    };
    const traces = chartDataFromInsightData(insights);
    expect(traces.length).toBe(1);
    expect(traces[0].value).toBe(0.4325);
    expect(Array.isArray(traces[0].value)).toBe(false);
  });

  it('applies a slice to a sub-array on a bar.x prop', () => {
    const insights = {
      first_three: {
        type: 'bar',
        data: [{ x: 1 }, { x: 2 }, { x: 3 }, { x: 4 }, { x: 5 }],
        props_mapping: { 'props.x': 'x' },
        props_slices: { 'props.x': '[1:4]' },
      },
    };
    const traces = chartDataFromInsightData(insights);
    expect(traces[0].x).toEqual([2, 3, 4]);
  });

  it('leaves non-sliced props unchanged', () => {
    const insights = {
      mix: {
        type: 'bar',
        data: [{ x: 1, y: 10 }, { x: 2, y: 20 }],
        props_mapping: { 'props.x': 'x', 'props.y': 'y' },
        props_slices: { 'props.y': '[0]' },
      },
    };
    const traces = chartDataFromInsightData(insights);
    expect(traces[0].x).toEqual([1, 2]);
    expect(traces[0].y).toBe(10);
  });

  it('is a no-op when props_slices is undefined', () => {
    const insights = {
      a: {
        type: 'bar',
        data: [{ x: 1 }, { x: 2 }],
        props_mapping: { 'props.x': 'x' },
      },
    };
    const traces = chartDataFromInsightData(insights);
    expect(traces[0].x).toEqual([1, 2]);
  });

  it('skips a slice whose target path does not exist in the bound props (no throw)', () => {
    const insights = {
      a: {
        type: 'bar',
        data: [{ x: 1 }, { x: 2 }],
        props_mapping: { 'props.x': 'x' },
        props_slices: { 'props.marker.size': '[0]' },
      },
    };
    const traces = chartDataFromInsightData(insights);
    expect(traces[0].x).toEqual([1, 2]);
    expect(traces[0].marker).toBeUndefined();
  });

  it('skips empty slice expressions', () => {
    const insights = {
      a: {
        type: 'bar',
        data: [{ x: 1 }, { x: 2 }],
        props_mapping: { 'props.x': 'x' },
        props_slices: { 'props.x': '' },
      },
    };
    const traces = chartDataFromInsightData(insights);
    expect(traces[0].x).toEqual([1, 2]);
  });

  it('applies a slice to a NESTED prop path (props.marker.size)', () => {
    const insights = {
      a: {
        type: 'bar',
        data: [{ x: 1, s: 10 }, { x: 2, s: 20 }],
        props_mapping: { 'props.x': 'x', 'props.marker.size': 's' },
        props_slices: { 'props.marker.size': '[0]' },
      },
    };
    const traces = chartDataFromInsightData(insights);
    expect(traces[0].marker.size).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// chartDataFromInsightData — skip guards and static-prop merging
// ---------------------------------------------------------------------------

describe('chartDataFromInsightData — guards and static-prop merge', () => {
  it('skips null insight entries', () => {
    expect(chartDataFromInsightData({ ghost: null })).toEqual([]);
  });

  it('skips insights with empty data arrays', () => {
    const insights = { empty: { data: [], props_mapping: { 'props.x': 'x' } } };
    expect(chartDataFromInsightData(insights)).toEqual([]);
  });

  it('skips insights with an empty props_mapping', () => {
    const insights = { unmapped: { data: [{ x: 1 }], props_mapping: {} } };
    expect(chartDataFromInsightData(insights)).toEqual([]);
  });

  it('deep-merges nested static props under dynamic props (dynamic wins on conflict)', () => {
    const insights = {
      styled: {
        type: 'bar',
        data: [{ x: 1, c: 'red' }, { x: 2, c: 'blue' }],
        props_mapping: { 'props.x': 'x', 'props.marker.color': 'c' },
        static_props: {
          marker: { color: 'green', line: { width: 2 } },
          opacity: 0.5,
        },
      },
    };
    const traces = chartDataFromInsightData(insights);

    // Dynamic marker.color (from the query) beats the static value...
    expect(traces[0].marker.color).toEqual(['red', 'blue']);
    // ...while non-conflicting static keys are merged in, nested and flat.
    expect(traces[0].marker.line.width).toBe(2);
    expect(traces[0].opacity).toBe(0.5);
  });

  it('copies static array props directly', () => {
    const insights = {
      arr: {
        type: 'bar',
        data: [{ x: 1 }],
        props_mapping: { 'props.x': 'x' },
        static_props: { text: ['a', 'b'] },
      },
    };
    const traces = chartDataFromInsightData(insights);
    expect(traces[0].text).toEqual(['a', 'b']);
  });

  it('leaves traces unchanged when static_props is not an object', () => {
    const insights = {
      weird: {
        type: 'bar',
        data: [{ x: 1 }],
        props_mapping: { 'props.x': 'x' },
        static_props: 'not-an-object',
      },
    };
    const traces = chartDataFromInsightData(insights);
    expect(traces[0].x).toEqual([1]);
  });

  it('merges static props into every split trace', () => {
    const insights = {
      split: {
        type: 'scatter',
        data: [
          { x: 1, grp: 'A' },
          { x: 2, grp: 'B' },
        ],
        props_mapping: { 'props.x': 'x' },
        split_key: 'grp',
        static_props: { mode: 'lines+markers' },
      },
    };
    const traces = chartDataFromInsightData(insights);
    expect(traces).toHaveLength(2);
    traces.forEach(trace => expect(trace.mode).toBe('lines+markers'));
  });

  it('applies props_slices per split group', () => {
    const insights = {
      split: {
        type: 'bar',
        data: [
          { x: 1, grp: 'A' },
          { x: 2, grp: 'A' },
          { x: 9, grp: 'B' },
        ],
        props_mapping: { 'props.x': 'x' },
        props_slices: { 'props.x': '[0]' },
        split_key: 'grp',
      },
    };
    const traces = chartDataFromInsightData(insights);
    const a = traces.find(t => t.name === 'A');
    const b = traces.find(t => t.name === 'B');
    expect(a.x).toBe(1);
    expect(b.x).toBe(9);
  });
});

// ---------------------------------------------------------------------------
// processInputRefsInProps — embedded templates and type coercion
// ---------------------------------------------------------------------------

/* eslint-disable no-template-curly-in-string */
describe('processInputRefsInProps — embedded templates', () => {
  it('replaces refs embedded inside a longer string', () => {
    const props = { title: 'Sales for ${region.value} only' };
    const inputs = { region: { value: 'EMEA' } };
    expect(processInputRefsInProps(props, inputs)).toEqual({ title: 'Sales for EMEA only' });
  });

  it('coerces a fully-numeric embedded result to a number', () => {
    const props = { size: '1${digit.value}' };
    const inputs = { digit: { value: 2 } };
    const result = processInputRefsInProps(props, inputs);
    expect(result.size).toBe(12);
  });

  it('keeps unresolved embedded refs verbatim', () => {
    const props = { title: 'Sales for ${missing.value} only' };
    const inputs = { other: { value: 'x' } };
    expect(processInputRefsInProps(props, inputs)).toEqual({
      title: 'Sales for ${missing.value} only',
    });
  });

  it('replaces multiple embedded refs in one string', () => {
    const props = { title: '${start.value} to ${end.value}' };
    const inputs = { start: { value: 'Jan' }, end: { value: 'Mar' } };
    expect(processInputRefsInProps(props, inputs)).toEqual({ title: 'Jan to Mar' });
  });

  it('leaves ${...} strings that are not input refs untouched', () => {
    const props = { expr: '${not an input ref}' };
    const inputs = { a: { value: 1 } };
    expect(processInputRefsInProps(props, inputs)).toEqual({ expr: '${not an input ref}' });
  });

  it('keeps the exact-match ref when the accessor is missing on the input', () => {
    const props = { mode: '${sel.value}' };
    const inputs = { sel: { values: ['a'] } };
    expect(processInputRefsInProps(props, inputs)).toEqual({ mode: '${sel.value}' });
  });
});

describe('extractInputDependenciesFromProps — interactions and dedupe', () => {
  it('extracts inputs referenced only from interactions', () => {
    const config = {
      props: { type: 'scatter' },
      interactions: [{ filter: 'x > ${min_value.value}' }, null],
    };
    expect(extractInputDependenciesFromProps(config)).toEqual(['min_value']);
  });

  it('does not double-count a name matched by the ref() pattern', () => {
    const config = { props: { title: '${ref(region).value}' } };
    expect(extractInputDependenciesFromProps(config)).toEqual(['region']);
  });

  it('dedupes a name referenced via BOTH ref() and simple forms in one string', () => {
    const config = { props: { title: '${ref(region).value} vs ${region.label}' } };
    expect(extractInputDependenciesFromProps(config)).toEqual(['region']);
  });
});
/* eslint-enable no-template-curly-in-string */

// ---------------------------------------------------------------------------
// mapQueryResultsToProps — direct edge cases
// ---------------------------------------------------------------------------

describe('mapQueryResultsToProps', () => {
  it('returns {} for empty or missing results', () => {
    expect(mapQueryResultsToProps([], { 'props.x': 'x' })).toEqual({});
    expect(mapQueryResultsToProps(null, { 'props.x': 'x' })).toEqual({});
  });

  it('returns {} for an empty or missing props_mapping', () => {
    expect(mapQueryResultsToProps([{ x: 1 }], {})).toEqual({});
    expect(mapQueryResultsToProps([{ x: 1 }], null)).toEqual({});
  });

  it('converts BigInt values to strings', () => {
    const results = [{ n: 9007199254740993n }];
    expect(mapQueryResultsToProps(results, { 'props.y': 'n' })).toEqual({
      y: ['9007199254740993'],
    });
  });

  it('skips mapping entries whose column is absent from the results', () => {
    const results = [{ x: 1 }];
    expect(mapQueryResultsToProps(results, { 'props.x': 'x', 'props.y': 'missing_col' })).toEqual({
      x: [1],
    });
  });

  it('builds nested structures from array-indexed paths', () => {
    const results = [{ lo: 0, hi: 100 }];
    const props = mapQueryResultsToProps(results, {
      'props.gauge.axis.range[0]': 'lo',
      'props.gauge.axis.range[1]': 'hi',
    });
    expect(props.gauge.axis.range[0]).toEqual([0]);
    expect(props.gauge.axis.range[1]).toEqual([100]);
  });

  it('accepts paths without the props. prefix', () => {
    expect(mapQueryResultsToProps([{ a: 1 }], { x: 'a' })).toEqual({ x: [1] });
  });
});

// ---------------------------------------------------------------------------
// applySliceExpression — remaining grammar corners
// ---------------------------------------------------------------------------

describe('applySliceExpression — additional corners', () => {
  it('handles a negative-step slice [3:0:-1]', () => {
    expect(applySliceExpression([0, 1, 2, 3, 4], '[3:0:-1]')).toEqual([3, 2, 1]);
  });

  it('returns [] for a reversed slice that never iterates', () => {
    expect(applySliceExpression([0, 1, 2], '[::-1]')).toEqual([]);
  });

  it('returns the array unchanged for a non-numeric index', () => {
    expect(applySliceExpression([1, 2, 3], '[abc]')).toEqual([1, 2, 3]);
  });

  it('returns the array unchanged for empty brackets', () => {
    expect(applySliceExpression([1, 2, 3], '[]')).toEqual([1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// tableDataFromQueryResults
// ---------------------------------------------------------------------------

describe('tableDataFromQueryResults', () => {
  it('returns empty headers/rows for empty or missing results', () => {
    expect(tableDataFromQueryResults([])).toEqual({ headers: [], rows: [] });
    expect(tableDataFromQueryResults(null)).toEqual({ headers: [], rows: [] });
  });

  it('derives headers from the first row and rows in header order', () => {
    const results = [
      { region: 'EMEA', revenue: 100 },
      { region: 'APAC', revenue: 200 },
    ];
    expect(tableDataFromQueryResults(results)).toEqual({
      headers: ['region', 'revenue'],
      rows: [
        ['EMEA', 100],
        ['APAC', 200],
      ],
    });
  });

  it('converts BigInt cells to strings', () => {
    const results = [{ id: 1n, name: 'a' }];
    expect(tableDataFromQueryResults(results)).toEqual({
      headers: ['id', 'name'],
      rows: [['1', 'a']],
    });
  });
});
