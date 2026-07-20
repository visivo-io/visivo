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

// Field Finder (VIS-1021) is unit-tested separately; here we only assert the
// editor OPENS it (via ⌘K or the Find-fields button), so stub the palette +
// the index build.
jest.mock('./fieldFinder/FieldFinderPalette', () => ({
  __esModule: true,
  default: ({ onClose }) => (
    <div data-testid="field-finder-palette-stub">
      <button type="button" onClick={onClose}>
        close-palette
      </button>
    </div>
  ),
}));
jest.mock('./fieldFinder/fieldFinderIndex', () => ({
  __esModule: true,
  buildFieldIndex: jest.fn(() => []),
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
    // inside the type-selector container). T4: scoped to `ownerName` so a
    // Build rail stacking several insight sections has one selector per
    // insight rather than a single ambiguous `type-selector`.
    const typeSelector = await screen.findByTestId('type-selector-my_insight');
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

  // Integration-gate regression (Explore 2.0 Phase 3b): a BRAND NEW insight
  // has empty props, so x/y are neither JSON-schema `required` nor `present`
  // — buildTraceGroupSpec's own `expanded` flag alone would hide them behind
  // "+N more" (this broke `exploration-build-rail.spec.mjs`'s drop-target
  // tests AND regressed the pre-existing `exploration-dnd-pull-in.spec.mjs`
  // prop-slot-drop story once InsightCRUDSection's `initiallyExpanded`
  // override was retired). x/y must render up-front with NO fields hidden.
  test('semantically-required fields (x/y) render up-front on a BRAND NEW insight with empty props — no "+N more" needed', async () => {
    render(
      <TracePropsEditor ownerName="my_insight" props={{ type: 'scatter' }} onChange={() => {}} />
    );

    await screen.findByTestId('field-group-essentials');
    expect(screen.getByTestId('prop-x')).toBeInTheDocument();
    expect(screen.getByTestId('prop-y')).toBeInTheDocument();
    // Nothing left to reveal in Essentials — x/y were the only two fields.
    expect(screen.queryByTestId('field-group-more-essentials')).not.toBeInTheDocument();
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
    // A host that owns the opener also owns the palette — the built-in one stays closed.
    expect(screen.queryByTestId('field-finder-palette-stub')).not.toBeInTheDocument();
  });

  test('with no host opener, the Find-fields button opens the built-in palette', async () => {
    render(<TracePropsEditor ownerName="my_insight" props={scatterProps} onChange={() => {}} />);
    await screen.findByTestId('field-group-essentials');
    expect(screen.queryByTestId('field-finder-palette-stub')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('trace-props-field-finder'));
    expect(screen.getByTestId('field-finder-palette-stub')).toBeInTheDocument();
    // And it closes on the palette's onClose.
    fireEvent.click(screen.getByRole('button', { name: 'close-palette' }));
    expect(screen.queryByTestId('field-finder-palette-stub')).not.toBeInTheDocument();
  });

  test('⌘K / Ctrl+K opens the built-in palette (skipped while a host owns the opener)', async () => {
    render(<TracePropsEditor ownerName="my_insight" props={scatterProps} onChange={() => {}} />);
    await screen.findByTestId('field-group-essentials');
    // Set both modifiers so the assertion is platform-agnostic (the handler
    // reads metaKey on macOS, ctrlKey elsewhere); dispatch on body so it
    // bubbles to the window-level listener.
    fireEvent.keyDown(document.body, { key: 'k', metaKey: true, ctrlKey: true });
    expect(screen.getByTestId('field-finder-palette-stub')).toBeInTheDocument();
  });

  test('⌘K does NOT open the palette while typing in an input', async () => {
    render(<TracePropsEditor ownerName="my_insight" props={scatterProps} onChange={() => {}} />);
    await screen.findByTestId('field-group-essentials');
    // Simulate the keydown target being an editable element.
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: 'k', metaKey: true });
    expect(screen.queryByTestId('field-finder-palette-stub')).not.toBeInTheDocument();
    document.body.removeChild(input);
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

describe('onValidityChange (VIS-993 gate wiring)', () => {
  test('reports invalid with the per-field error map, then valid after the fix', async () => {
    const onValidityChange = jest.fn();
    const { rerender } = render(
      <TracePropsEditor
        ownerName="my_insight"
        props={{ type: 'scatter', x: [1], y: [2], mode: 'bogus' }}
        onChange={() => {}}
        onValidityChange={onValidityChange}
      />
    );
    await waitFor(() =>
      expect(onValidityChange).toHaveBeenLastCalledWith(
        false,
        expect.objectContaining({ mode: expect.any(String) })
      )
    );

    rerender(
      <TracePropsEditor
        ownerName="my_insight"
        props={{ type: 'scatter', x: [1], y: [2], mode: 'lines' }}
        onChange={() => {}}
        onValidityChange={onValidityChange}
      />
    );
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(true, {}));
  });
});
