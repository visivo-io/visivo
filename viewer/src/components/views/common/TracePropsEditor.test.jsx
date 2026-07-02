/**
 * TracePropsEditor tests (VIS-1020)
 *
 * The controlled, schema-driven, AJV-validated editor for an Insight's Plotly
 * props. Async loaders (schema / catalog / groups) and the AJV validator are
 * mocked so the test is deterministic; the real buildTraceGroupSpec +
 * FieldGroupList + FieldGroup render path is exercised (PropertyRow is mocked to
 * a simple input so we can assert per-field inline errors).
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import TracePropsEditor from './TracePropsEditor';
import useFieldGroupCollapseStore from '../workspace/fieldGroupCollapseStore';

// ── Mocks ───────────────────────────────────────────────────────────────────

// PropertyRow → a simple input + inline error region (mirrors the real error UI).
jest.mock('../common/SchemaEditor/PropertyRow', () => ({
  __esModule: true,
  PropertyRow: ({ path, value, onChange, error }) => (
    <div data-testid={`prop-${path}`}>
      <input
        data-testid={`input-${path}`}
        value={value == null ? '' : String(value)}
        onChange={e => onChange(e.target.value)}
      />
      {error && <p data-testid={`property-error-${path}`}>{error}</p>}
    </div>
  ),
}));

// schemaUtils get/set used by FieldGroup — keep the real simple impls.
jest.mock('../common/SchemaEditor/utils/schemaUtils', () => ({
  getValueAtPath: (obj, path) =>
    path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj),
  setValueAtPath: (obj, path, val) => {
    const next = { ...(obj || {}) };
    const parts = path.split('.');
    let cursor = next;
    for (let i = 0; i < parts.length - 1; i++) {
      cursor[parts[i]] = { ...(cursor[parts[i]] || {}) };
      cursor = cursor[parts[i]];
    }
    cursor[parts[parts.length - 1]] = val;
    return next;
  },
}));

// Minimal per-type schemas: scatter has x/y/mode/line.dash; bar has x/y/orientation.
const SCATTER_SCHEMA = {
  type: 'object',
  properties: {
    type: { const: 'scatter' },
    x: { type: 'array' },
    y: { type: 'array' },
    mode: { type: 'string', enum: ['lines', 'markers'] },
    line: { type: 'object', properties: { dash: { type: 'string' } } },
  },
};
const BAR_SCHEMA = {
  type: 'object',
  properties: {
    type: { const: 'bar' },
    x: { type: 'array' },
    y: { type: 'array' },
    orientation: { type: 'string', enum: ['v', 'h'] },
  },
};

jest.mock('../../../schemas/schemas', () => ({
  __esModule: true,
  getSchema: jest.fn(async type => {
    if (type === 'scatter') return SCATTER_SCHEMA;
    if (type === 'bar') return BAR_SCHEMA;
    return null;
  }),
  // TypeSelector reads CHART_TYPES; provide a tiny registry.
  CHART_TYPES: [
    { value: 'scatter', label: 'Scatter / Line' },
    { value: 'bar', label: 'Bar' },
    { value: 'layout', label: 'Layout' },
  ],
}));

jest.mock('../../../schemas/traceCatalogLoader', () => ({
  __esModule: true,
  loadCatalog: jest.fn(async type => {
    if (type === 'scatter') {
      return [
        { path: 'x', label: 'X Axis', tier: 'A' },
        { path: 'y', label: 'Y Axis', tier: 'A' },
        { path: 'mode', label: 'Display Mode', tier: 'B' },
      ];
    }
    if (type === 'bar') {
      return [
        { path: 'x', label: 'X Axis', tier: 'A' },
        { path: 'y', label: 'Y Axis', tier: 'A' },
      ];
    }
    return [];
  }),
  loadTraceGroups: jest.fn(async () => ({})),
}));

// AJV validator: report an error on `mode` when its value is an invalid enum.
jest.mock('../../../schemas/plotlyValidator', () => ({
  __esModule: true,
  validateProps: jest.fn(async (type, props) => {
    if (props && props.mode && !['lines', 'markers'].includes(props.mode)) {
      return {
        valid: false,
        errors: [{ path: 'mode', message: 'must be equal to one of the allowed values' }],
      };
    }
    return { valid: true, errors: [] };
  }),
}));

const scatterProps = { type: 'scatter', x: [1, 2, 3], y: [4, 5, 6] };

const resetCollapse = () =>
  act(() => useFieldGroupCollapseStore.setState({ collapsed: {} }));

describe('TracePropsEditor', () => {
  beforeEach(() => {
    resetCollapse();
    jest.clearAllMocks();
  });

  test('renders TypeSelector(scatter), Essentials, "Key fields (scatter)" and the ⌘K affordance', async () => {
    render(
      <TracePropsEditor ownerName="my_insight" props={scatterProps} onChange={() => {}} />
    );

    // TypeSelector bound to scatter (react-select renders the selected label
    // inside the type-selector container).
    const typeSelector = await screen.findByTestId('type-selector');
    expect(typeSelector).toHaveTextContent('Scatter / Line');

    // Grouped fields appear once async loaders resolve.
    await screen.findByTestId('field-group-essentials');
    expect(screen.getByTestId('field-group-header-essentials')).toBeInTheDocument();
    // Tier-B "mode" lands under "Key fields (scatter)".
    expect(screen.getByText('Key fields (scatter)')).toBeInTheDocument();

    // The ⌘K field-finder affordance.
    const finder = screen.getByTestId('trace-props-field-finder');
    expect(finder).toHaveTextContent('Find fields…');
    expect(finder).toHaveTextContent('⌘K');
  });

  test('field-finder affordance calls onOpenFieldFinder', async () => {
    const onOpenFieldFinder = jest.fn();
    render(
      <TracePropsEditor
        ownerName="my_insight"
        props={scatterProps}
        onChange={() => {}}
        onOpenFieldFinder={onOpenFieldFinder}
      />
    );
    fireEvent.click(await screen.findByTestId('trace-props-field-finder'));
    expect(onOpenFieldFinder).toHaveBeenCalledTimes(1);
  });

  test('changing type to "bar" calls onChange with preserved x/y and type:"bar"', async () => {
    const onChange = jest.fn();
    render(
      <TracePropsEditor ownerName="my_insight" props={scatterProps} onChange={onChange} />
    );
    await screen.findByTestId('field-group-essentials');

    // Drive the react-select combobox via keyboard to open the menu, then pick Bar.
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    // Pick the "Bar" option.
    const barOption = await screen.findByText('Bar');
    fireEvent.click(barOption);

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const nextProps = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(nextProps.type).toBe('bar');
    // x/y are valid in the bar schema → carried forward.
    expect(nextProps.x).toEqual([1, 2, 3]);
    expect(nextProps.y).toEqual([4, 5, 6]);
  });

  test('an invalid enum value surfaces an inline error and the overall invalid indicator', async () => {
    render(
      <TracePropsEditor
        ownerName="my_insight"
        props={{ type: 'scatter', x: [1], y: [2], mode: 'bogus' }}
        onChange={() => {}}
      />
    );

    // Inline per-field error next to the offending dot-path.
    expect(await screen.findByTestId('property-error-mode')).toHaveTextContent(
      /allowed values/i
    );
    // Overall invalid indicator.
    expect(screen.getByTestId('trace-props-invalid-indicator')).toBeInTheDocument();
  });

  test('shows the loading state until an uncached schema resolves', async () => {
    const { getSchema } = jest.requireMock('../../../schemas/schemas');
    let resolveSchema;
    getSchema.mockImplementationOnce(() => new Promise(r => (resolveSchema = r)));

    render(
      <TracePropsEditor ownerName="my_insight" props={scatterProps} onChange={() => {}} />
    );
    expect(await screen.findByTestId('trace-props-loading')).toBeInTheDocument();

    await act(async () => resolveSchema(SCATTER_SCHEMA));
    await screen.findByTestId('field-group-essentials');
    expect(screen.queryByTestId('trace-props-loading')).not.toBeInTheDocument();
  });

  test('a schema load failure surfaces the inline error instead of the fields', async () => {
    const { getSchema } = jest.requireMock('../../../schemas/schemas');
    getSchema.mockImplementationOnce(() => Promise.reject(new Error('network down')));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(
        <TracePropsEditor ownerName="my_insight" props={scatterProps} onChange={() => {}} />
      );
      expect(await screen.findByText('Failed to load schema for scatter')).toBeInTheDocument();
      expect(screen.queryByTestId('field-group-essentials')).not.toBeInTheDocument();
    } finally {
      errSpy.mockRestore();
    }
  });

  test('collapse persists per {ownerName}.{groupId}', async () => {
    render(
      <TracePropsEditor ownerName="my_insight" props={scatterProps} onChange={() => {}} />
    );
    // The "Key fields" group is collapsible; toggle it and assert the key prefix.
    const keyHeader = await screen.findByTestId('field-group-header-key');
    fireEvent.click(keyHeader);
    const state = useFieldGroupCollapseStore.getState().collapsed;
    expect(state['my_insight.key']).toBe(true);
  });
});
