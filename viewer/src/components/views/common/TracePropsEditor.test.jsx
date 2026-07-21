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
  // TypeSelector reads CHART_TYPES; provide a tiny registry. `mystery_type`
  // has no committed schema (the mocked getSchema below falls through to
  // `null` for anything that isn't scatter/bar) — used to exercise the
  // `newSchema || {}` defensive fallback in handleTypeChange. `layout` is
  // included too since TypeSelector itself filters it out (a Plotly LAYOUT
  // container, not a selectable trace type) — kept for parity with the real
  // registry shape.
  CHART_TYPES: [
    { value: 'scatter', label: 'Scatter / Line' },
    { value: 'bar', label: 'Bar' },
    { value: 'layout', label: 'Layout' },
    { value: 'mystery_type', label: 'Mystery Type' },
  ],
}));

// Field Finder (VIS-1021) is unit-tested separately; here we only assert the
// editor OPENS it (via ⌘K or the Find-fields button), so stub the palette +
// the index build.
jest.mock('./fieldFinder/FieldFinderPalette', () => ({
  __esModule: true,
  default: ({ onClose, onEditScalar, onRevealCompound }) => (
    <div data-testid="field-finder-palette-stub">
      <button type="button" onClick={onClose}>
        close-palette
      </button>
      <button type="button" onClick={() => onEditScalar('mode', 'markers')}>
        simulate-edit-scalar
      </button>
      <button type="button" onClick={() => onRevealCompound('line.dash')}>
        simulate-reveal-compound
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

// A `mockImplementationOnce` queued by one test but never actually consumed
// (e.g. its component only calls the mock a different number of times than
// expected) silently leaks into whichever LATER test happens to call the
// mock next — `jest.clearAllMocks()` clears call history, not the queue.
// Snapshotting + restoring the real default implementations file-wide after
// EVERY test makes each `mockImplementationOnce` strictly test-local.
afterEach(() => {
  // The field-group collapse store is a module-level Zustand singleton —
  // without resetting it file-wide, a test that toggles a group collapsed
  // under a given `ownerName` (e.g. 'my_insight.key') leaks that persisted
  // state into every LATER test using the same ownerName.
  resetCollapse();
  const { validateProps } = jest.requireMock('../../../schemas/plotlyValidator');
  const { getSchema } = jest.requireMock('../../../schemas/schemas');
  const { loadCatalog, loadTraceGroups } = jest.requireMock('../../../schemas/traceCatalogLoader');
  validateProps.mockImplementation(async (type, props) => {
    if (props && props.mode && !['lines', 'markers'].includes(props.mode)) {
      return {
        valid: false,
        errors: [{ path: 'mode', message: 'must be equal to one of the allowed values' }],
      };
    }
    return { valid: true, errors: [] };
  });
  getSchema.mockImplementation(async type => {
    if (type === 'scatter') return SCATTER_SCHEMA;
    if (type === 'bar') return BAR_SCHEMA;
    return null;
  });
  loadCatalog.mockImplementation(async type => {
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
  });
  loadTraceGroups.mockImplementation(async () => ({}));
});

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

describe('effect cleanup races (`cancelled` guards)', () => {
  test('unmounting before the schema promise RESOLVES never updates state on the unmounted component', async () => {
    const { getSchema } = jest.requireMock('../../../schemas/schemas');
    let resolveSchema;
    getSchema.mockImplementationOnce(() => new Promise(r => (resolveSchema = r)));
    const { unmount } = render(
      <TracePropsEditor ownerName="my_insight" props={scatterProps} onChange={() => {}} />
    );
    unmount();
    // Resolving after unmount must not throw / warn ("state update on an
    // unmounted component") — the `cancelled` guard is what prevents it.
    await act(async () => resolveSchema(SCATTER_SCHEMA));
  });

  test('unmounting before the schema promise REJECTS never updates state on the unmounted component', async () => {
    const { getSchema } = jest.requireMock('../../../schemas/schemas');
    let rejectSchema;
    getSchema.mockImplementationOnce(() => new Promise((_, rej) => (rejectSchema = rej)));
    const { unmount } = render(
      <TracePropsEditor ownerName="my_insight" props={scatterProps} onChange={() => {}} />
    );
    unmount();
    await act(async () => {
      rejectSchema(new Error('too late, already unmounted'));
      // Let the rejection's .catch() microtask run before the test ends.
      await Promise.resolve().then(() => Promise.resolve());
    });
  });

  test('unmounting before validateProps RESOLVES never updates state on the unmounted component', async () => {
    const { validateProps } = jest.requireMock('../../../schemas/plotlyValidator');
    let resolveValidate;
    validateProps.mockImplementationOnce(() => new Promise(r => (resolveValidate = r)));
    const { unmount } = render(
      <TracePropsEditor ownerName="my_insight" props={scatterProps} onChange={() => {}} />
    );
    unmount();
    await act(async () => resolveValidate({ valid: true, errors: [] }));
  });

  test('unmounting before validateProps REJECTS never updates state on the unmounted component', async () => {
    const { validateProps } = jest.requireMock('../../../schemas/plotlyValidator');
    let rejectValidate;
    validateProps.mockImplementationOnce(() => new Promise((_, rej) => (rejectValidate = rej)));
    const { unmount } = render(
      <TracePropsEditor ownerName="my_insight" props={scatterProps} onChange={() => {}} />
    );
    unmount();
    await act(async () => {
      rejectValidate(new Error('too late, already unmounted'));
      await Promise.resolve().then(() => Promise.resolve());
    });
  });
});

describe('empty/absent type + traceProps (defensive fallbacks)', () => {
  test('with no type at all, the schema-load effect short-circuits: no loading spinner, no error, no crash', async () => {
    render(<TracePropsEditor ownerName="my_insight" props={{}} onChange={() => {}} />);
    await screen.findByTestId('trace-props-editor');
    expect(screen.queryByTestId('trace-props-loading')).not.toBeInTheDocument();
    expect(screen.queryByTestId('field-group-essentials')).not.toBeInTheDocument();
  });

  test('a completely absent `props` (null) is tolerated end to end, including opening the Field Finder', async () => {
    render(<TracePropsEditor ownerName="my_insight" props={null} onChange={() => {}} />);
    await screen.findByTestId('trace-props-editor');
    fireEvent.click(screen.getByTestId('trace-props-field-finder'));
    expect(screen.getByTestId('field-finder-palette-stub')).toBeInTheDocument();
  });
});

describe('schema/catalog/groups load edge cases', () => {
  test('getSchema resolving to a falsy value (not rejecting) surfaces the same "Failed to load" message', async () => {
    const { getSchema } = jest.requireMock('../../../schemas/schemas');
    getSchema.mockImplementationOnce(() => Promise.resolve(null));
    render(<TracePropsEditor ownerName="my_insight" props={scatterProps} onChange={() => {}} />);
    expect(await screen.findByText('Failed to load schema for scatter')).toBeInTheDocument();
  });

  test('loadCatalog resolving a non-array falls back to an empty catalog (no crash)', async () => {
    const { loadCatalog } = jest.requireMock('../../../schemas/traceCatalogLoader');
    loadCatalog.mockImplementationOnce(() => Promise.resolve('not-an-array'));
    render(<TracePropsEditor ownerName="my_insight" props={scatterProps} onChange={() => {}} />);
    // With no usable catalog, buildTraceGroupSpec has no tier metadata to
    // group by, so every field (including x/y) falls into the generic
    // "Other" catch-all group instead of Essentials/Key fields — but it
    // still renders, with no crash. "Other" is collapsed by default, so
    // expand it before asserting a field row is actually mounted.
    const otherHeader = await screen.findByTestId('field-group-header-other');
    fireEvent.click(otherHeader);
    const moreButton = screen.queryByTestId('field-group-more-other');
    if (moreButton) fireEvent.click(moreButton);
    expect(screen.getByTestId('prop-x')).toBeInTheDocument();
  });

  test('loadTraceGroups resolving a non-object falls back to an empty groups map (no crash)', async () => {
    const { loadTraceGroups } = jest.requireMock('../../../schemas/traceCatalogLoader');
    loadTraceGroups.mockImplementationOnce(() => Promise.resolve('not-an-object'));
    render(<TracePropsEditor ownerName="my_insight" props={scatterProps} onChange={() => {}} />);
    await screen.findByTestId('field-group-essentials');
  });
});

describe('AJV validation edge cases', () => {
  test('a rejected validateProps call is treated as non-blocking (valid=true, no field errors), and logs a warning', async () => {
    const { validateProps } = jest.requireMock('../../../schemas/plotlyValidator');
    validateProps.mockImplementationOnce(() => Promise.reject(new Error('schema compile error')));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      render(<TracePropsEditor ownerName="my_insight" props={scatterProps} onChange={() => {}} />);
      await screen.findByTestId('field-group-essentials');
      await waitFor(() => expect(warnSpy).toHaveBeenCalled());
      expect(screen.queryByTestId('trace-props-invalid-indicator')).not.toBeInTheDocument();
    } finally {
      warnSpy.mockRestore();
    }
  });

  test('only the FIRST error per dot-path is kept, and root-level (empty-path) errors never populate the field error map', async () => {
    const { validateProps } = jest.requireMock('../../../schemas/plotlyValidator');
    validateProps.mockImplementationOnce(() =>
      Promise.resolve({
        valid: false,
        errors: [
          { path: 'mode', message: 'first message wins' },
          { path: 'mode', message: 'second message must be dropped' },
          { path: '', message: 'root-level, never shown as a per-field error' },
        ],
      })
    );
    render(
      <TracePropsEditor
        ownerName="my_insight"
        props={{ ...scatterProps, mode: 'lines' }}
        onChange={() => {}}
      />
    );
    const err = await screen.findByTestId('property-error-mode');
    expect(err).toHaveTextContent('first message wins');
    expect(err).not.toHaveTextContent('second message must be dropped');
    // The overall invalid indicator still reflects `valid: false` regardless.
    expect(screen.getByTestId('trace-props-invalid-indicator')).toBeInTheDocument();
  });

  test('an invalid result with NO `errors` array at all is tolerated (defensive `|| []`)', async () => {
    const { validateProps } = jest.requireMock('../../../schemas/plotlyValidator');
    validateProps.mockImplementationOnce(() => Promise.resolve({ valid: false }));
    render(
      <TracePropsEditor ownerName="my_insight" props={scatterProps} onChange={() => {}} />
    );
    await screen.findByTestId('field-group-essentials');
    expect(await screen.findByTestId('trace-props-invalid-indicator')).toBeInTheDocument();
  });
});

describe('handleFieldsChange / handleTypeChange guard branches', () => {
  test('editing a field with NO onChange handler is a silent no-op (never throws)', async () => {
    render(<TracePropsEditor ownerName="my_insight" props={scatterProps} />);
    await screen.findByTestId('field-group-essentials');
    expect(() => {
      fireEvent.change(screen.getByTestId('input-x'), { target: { value: '[9,9,9]' } });
    }).not.toThrow();
  });

  test('editing a field with onChange PRESENT writes the full next props through, with `type` re-attached', async () => {
    const onChange = jest.fn();
    render(
      <TracePropsEditor ownerName="my_insight" props={scatterProps} onChange={onChange} />
    );
    await screen.findByTestId('field-group-essentials');
    fireEvent.change(screen.getByTestId('input-x'), { target: { value: '[9,9,9]' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ x: '[9,9,9]', type: 'scatter' })
    );
  });

  test('reselecting the CURRENT type is a no-op (newType === type short-circuits)', async () => {
    const onChange = jest.fn();
    render(<TracePropsEditor ownerName="my_insight" props={scatterProps} onChange={onChange} />);
    await screen.findByTestId('field-group-essentials');
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const scatterOption = await screen.findAllByText('Scatter / Line');
    // Selecting the already-active option (react-select's own selected value,
    // not the menu option) — click the menu's rendered option explicitly.
    fireEvent.click(scatterOption[scatterOption.length - 1]);
    await new Promise(r => setTimeout(r, 0));
    expect(onChange).not.toHaveBeenCalled();
  });

  test('switching type with NO onChange handler is a silent no-op (never throws)', async () => {
    render(<TracePropsEditor ownerName="my_insight" props={scatterProps} />);
    await screen.findByTestId('field-group-essentials');
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const barOption = await screen.findByText('Bar');
    expect(() => fireEvent.click(barOption)).not.toThrow();
  });
});

describe('typeChangeWarning (T4 / pills-buildrail #2)', () => {
  test('switching type drops incompatible fields and shows a dismissible warning naming them (plural)', async () => {
    const onChange = jest.fn();
    // mode + line are both set and both unsupported on bar -> two drops -> plural copy.
    const propsWithModeAndLine = { ...scatterProps, mode: 'lines', line: { dash: 'dot' } };
    const { rerender } = render(
      <TracePropsEditor ownerName="my_insight" props={propsWithModeAndLine} onChange={onChange} />
    );
    await screen.findByTestId('field-group-essentials');

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.click(await screen.findByText('Bar'));
    await waitFor(() => expect(onChange).toHaveBeenCalled());

    // Re-render with the switched props (mirrors the real controlled-component
    // round trip a parent store would perform).
    const nextProps = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    rerender(
      <TracePropsEditor ownerName="my_insight" props={nextProps} onChange={onChange} />
    );

    const warning = await screen.findByTestId('trace-props-type-change-warning');
    expect(warning).toHaveTextContent('bar');
    expect(warning).toHaveTextContent('these fields');
    expect(warning).toHaveTextContent('Mode');

    fireEvent.click(screen.getByTestId('trace-props-type-change-warning-dismiss'));
    expect(screen.queryByTestId('trace-props-type-change-warning')).not.toBeInTheDocument();
  });

  test('a SINGLE dropped field uses the singular copy ("this field")', async () => {
    const onChange = jest.fn();
    // Only `mode` is set (no `line`) so exactly one field drops on scatter -> bar.
    render(
      <TracePropsEditor
        ownerName="my_insight"
        props={{ type: 'scatter', x: [1], y: [2], mode: 'lines' }}
        onChange={onChange}
      />
    );
    await screen.findByTestId('field-group-essentials');

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.click(await screen.findByText('Bar'));
    await waitFor(() => expect(onChange).toHaveBeenCalled());

    expect(await screen.findByText(/this field/)).toBeInTheDocument();
  });
});

describe('ownerName omitted', () => {
  test('the TypeSelector renders with no scoped data-testid when ownerName is omitted', async () => {
    render(<TracePropsEditor props={scatterProps} onChange={() => {}} />);
    await screen.findByTestId('field-group-essentials');
    expect(document.querySelector('[data-testid^="type-selector-"]')).not.toBeInTheDocument();
    // The selector itself still renders and works.
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });
});

describe('externalErrors (Explore 2.0 Phase 3b advisory validation)', () => {
  test('an externalErrors-only path surfaces the advisory message', async () => {
    render(
      <TracePropsEditor
        ownerName="my_insight"
        props={scatterProps}
        onChange={() => {}}
        externalErrors={{ x: 'Reference to orders_q not found' }}
      />
    );
    const err = await screen.findByTestId('property-error-x');
    expect(err).toHaveTextContent('Reference to orders_q not found');
  });

  test('a real AJV error wins over an advisory externalErrors entry on the SAME path', async () => {
    render(
      <TracePropsEditor
        ownerName="my_insight"
        props={{ type: 'scatter', x: [1], y: [2], mode: 'bogus' }}
        onChange={() => {}}
        externalErrors={{ mode: 'advisory: this ref looks dangling' }}
      />
    );
    const err = await screen.findByTestId('property-error-mode');
    // AJV's real invalidity message wins, per the merge order `{...external, ...ajv}`.
    expect(err).toHaveTextContent(/allowed values/i);
    expect(err).not.toHaveTextContent('advisory: this ref looks dangling');
  });
});

describe('⌘K modifier variants (mac vs non-mac, key casing)', () => {
  test('uppercase "K" also opens the palette', async () => {
    render(<TracePropsEditor ownerName="my_insight" props={scatterProps} onChange={() => {}} />);
    await screen.findByTestId('field-group-essentials');
    fireEvent.keyDown(document.body, { key: 'K', ctrlKey: true, metaKey: true });
    expect(screen.getByTestId('field-finder-palette-stub')).toBeInTheDocument();
  });

  test('ctrlKey alone (no metaKey) still opens the palette on a non-mac platform', async () => {
    render(<TracePropsEditor ownerName="my_insight" props={scatterProps} onChange={() => {}} />);
    await screen.findByTestId('field-group-essentials');
    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true });
    expect(screen.getByTestId('field-finder-palette-stub')).toBeInTheDocument();
  });

  test('on a mac platform, metaKey (not ctrlKey) is what opens the palette', async () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(window.navigator, 'platform');
    Object.defineProperty(window.navigator, 'platform', { value: 'MacIntel', configurable: true });
    try {
      render(<TracePropsEditor ownerName="my_insight" props={scatterProps} onChange={() => {}} />);
      await screen.findByTestId('field-group-essentials');
      // ctrlKey alone must NOT open it on mac (mod = e.metaKey there).
      fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true });
      expect(screen.queryByTestId('field-finder-palette-stub')).not.toBeInTheDocument();
      fireEvent.keyDown(document.body, { key: 'k', metaKey: true });
      expect(screen.getByTestId('field-finder-palette-stub')).toBeInTheDocument();
    } finally {
      if (originalPlatform) {
        Object.defineProperty(window.navigator, 'platform', originalPlatform);
      }
    }
  });
});

describe('Field Finder palette callbacks (handleFieldFinderEdit / handleReveal)', () => {
  test('a scalar edit from the palette writes the value through onChange with `type` re-attached', async () => {
    const onChange = jest.fn();
    render(
      <TracePropsEditor ownerName="my_insight" props={scatterProps} onChange={onChange} />
    );
    await screen.findByTestId('field-group-essentials');
    fireEvent.click(screen.getByTestId('trace-props-field-finder'));
    fireEvent.click(screen.getByText('simulate-edit-scalar'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'markers', type: 'scatter' })
    );
  });

  test('a compound-result reveal sets the reveal path, forwarded to FieldGroupList', async () => {
    render(
      <TracePropsEditor ownerName="my_insight" props={scatterProps} onChange={() => {}} />
    );
    await screen.findByTestId('field-group-essentials');
    fireEvent.click(screen.getByTestId('trace-props-field-finder'));
    fireEvent.click(screen.getByText('simulate-reveal-compound'));
    // The "Key fields" group owns `line.dash` and force-expands to reveal it.
    await screen.findByTestId('field-group-header-key');
    expect(screen.getByTestId('field-group-header-key')).toHaveAttribute('aria-expanded', 'true');
  });

  test('a scalar edit from the palette with NO onChange handler is a silent no-op', async () => {
    render(<TracePropsEditor ownerName="my_insight" props={scatterProps} />);
    await screen.findByTestId('field-group-essentials');
    fireEvent.click(screen.getByTestId('trace-props-field-finder'));
    expect(() => {
      fireEvent.click(screen.getByText('simulate-edit-scalar'));
    }).not.toThrow();
  });

  test('revealing a SECOND path before the first reveal timer fires clears the stale timer (no stale reset)', async () => {
    jest.useFakeTimers();
    try {
      render(<TracePropsEditor ownerName="my_insight" props={scatterProps} onChange={() => {}} />);
      await screen.findByTestId('field-group-essentials');
      fireEvent.click(screen.getByTestId('trace-props-field-finder'));
      fireEvent.click(screen.getByText('simulate-reveal-compound'));
      // Reveal again before the 1600ms timer would have cleared the first one.
      fireEvent.click(screen.getByTestId('trace-props-field-finder'));
      fireEvent.click(screen.getByText('simulate-reveal-compound'));
      // No crash from a stale/duplicate timer; the group is still revealed.
      expect(screen.getByTestId('field-group-header-key')).toHaveAttribute('aria-expanded', 'true');
      act(() => {
        jest.advanceTimersByTime(1600);
      });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('handleTypeChange: newSchema resolving falsy (unknown type in CHART_TYPES)', () => {
  test('switching to a type with no committed schema falls back to an empty newSchema (no crash, everything drops)', async () => {
    const onChange = jest.fn();
    render(
      <TracePropsEditor
        ownerName="my_insight"
        props={{ ...scatterProps, mode: 'lines' }}
        onChange={onChange}
      />
    );
    await screen.findByTestId('field-group-essentials');

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    // getSchema('mystery_type') resolves null in this file's mock -> the
    // `newSchema || {}` defensive fallback in handleTypeChange.
    fireEvent.click(await screen.findByText('Mystery Type'));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const nextProps = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(nextProps).toEqual({ type: 'mystery_type' });
  });
});
