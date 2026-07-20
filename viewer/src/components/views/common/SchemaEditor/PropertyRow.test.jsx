/* eslint-disable no-template-curly-in-string -- test fixtures use literal Visivo `${ref(...)}` strings */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PropertyRow } from './PropertyRow';
import useStore from '../../../../stores/store';

// Mock the RefTextArea component
jest.mock('../RefTextArea', () => {
  return function MockRefTextArea({ value, onChange, helperText, disabled }) {
    return (
      <div data-testid="ref-text-area">
        <input
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          data-testid="ref-input"
        />
        {helperText && <span>{helperText}</span>}
      </div>
    );
  };
});

// Explore 2.0 Phase 3b (S5 §1): mock `useDroppable` (mirroring
// `PivotShelf.test.jsx`'s established pattern) purely to capture/invoke the
// droppable `data` payload — jsdom can't simulate a real dnd-kit pointer
// drag, and `isOver` is always false here (fine — none of these tests assert
// the drop-hover ring). Declared at module scope (not nested in a describe)
// so babel's jest.mock hoisting resolves the closure over `droppableData`
// unambiguously.
//
// T4 (pills-buildrail #4): `useDraggable` (the pill-as-drag-source wiring)
// is mocked the same way — capture the payload, no real pointer drag.
const droppableData = {};
const draggableData = {};
jest.mock('@dnd-kit/core', () => ({
  useDroppable: ({ id, data, disabled }) => {
    droppableData[id] = { data, disabled };
    return { setNodeRef: () => {}, isOver: false };
  },
  useDraggable: ({ id, data, disabled }) => {
    draggableData[id] = { data, disabled };
    return { attributes: {}, listeners: {}, setNodeRef: () => {}, isDragging: false };
  },
}));

describe('PropertyRow', () => {
  const defs = {
    color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
    'query-string': { type: 'string', pattern: '^\\?\\{.*\\}$' },
  };

  const defaultProps = {
    path: 'marker.color',
    value: undefined,
    onChange: jest.fn(),
    onRemove: jest.fn(),
    schema: { type: 'string' },
    defs,
    description: 'Set the marker color',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with property path', () => {
    render(<PropertyRow {...defaultProps} />);
    expect(screen.getByText('marker.color')).toBeInTheDocument();
  });

  it('renders remove button', () => {
    render(<PropertyRow {...defaultProps} />);
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument();
  });

  it('calls onRemove when remove button clicked', () => {
    const onRemove = jest.fn();
    render(<PropertyRow {...defaultProps} onRemove={onRemove} />);

    fireEvent.click(screen.getByRole('button', { name: /remove/i }));
    expect(onRemove).toHaveBeenCalled();
  });

  it('shows static field for non-query-string schema', () => {
    render(<PropertyRow {...defaultProps} />);

    // Should render a text field, not RefTextArea
    expect(screen.queryByTestId('ref-text-area')).not.toBeInTheDocument();
  });

  it('shows toggle buttons when query-string is supported', () => {
    const schema = {
      oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'string' }],
    };

    render(<PropertyRow {...defaultProps} schema={schema} />);

    expect(screen.getByRole('button', { name: /static/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /query/i })).toBeInTheDocument();
  });

  it('does not show toggle buttons when query-string not supported', () => {
    render(<PropertyRow {...defaultProps} />);

    expect(screen.queryByRole('button', { name: /static/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /query/i })).not.toBeInTheDocument();
  });

  it('shows RefTextArea when value is a query-string', () => {
    const schema = {
      oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'string' }],
    };

    render(<PropertyRow {...defaultProps} schema={schema} value="?{column_name}" />);

    expect(screen.getByTestId('ref-text-area')).toBeInTheDocument();
  });

  it('shows RefTextArea when in query mode with query() pattern', () => {
    const schema = {
      oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'string' }],
    };

    render(<PropertyRow {...defaultProps} schema={schema} value="query(SELECT x FROM t)" />);

    expect(screen.getByTestId('ref-text-area')).toBeInTheDocument();
  });

  it('shows RefTextArea when in query mode with column() pattern', () => {
    const schema = {
      oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'string' }],
    };

    render(<PropertyRow {...defaultProps} schema={schema} value="column(date)" />);

    expect(screen.getByTestId('ref-text-area')).toBeInTheDocument();
  });

  it('static mode is selected by default for non-query value', () => {
    const schema = {
      oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'string' }],
    };

    render(<PropertyRow {...defaultProps} schema={schema} value="hello" />);

    const staticButton = screen.getByRole('button', { name: /static/i });
    expect(staticButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('query mode is selected for query-string value', () => {
    const schema = {
      oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'string' }],
    };

    render(<PropertyRow {...defaultProps} schema={schema} value="?{column}" />);

    const queryButton = screen.getByRole('button', { name: /query/i });
    expect(queryButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('preserves value when switching modes', () => {
    const onChange = jest.fn();
    const schema = {
      oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'string' }],
    };

    render(<PropertyRow {...defaultProps} schema={schema} value="hello" onChange={onChange} />);

    // Click query mode - value should be preserved, not cleared
    fireEvent.click(screen.getByRole('button', { name: /query/i }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders description as helper text', () => {
    render(<PropertyRow {...defaultProps} />);
    expect(screen.getByText('Set the marker color')).toBeInTheDocument();
  });

  it('can be disabled', () => {
    const schema = {
      oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'string' }],
    };

    render(<PropertyRow {...defaultProps} schema={schema} disabled={true} />);

    expect(screen.getByRole('button', { name: /static/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /query/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /remove/i })).toBeDisabled();
  });

  it('does not render remove button when onRemove is not provided', () => {
    render(<PropertyRow {...defaultProps} onRemove={undefined} />);
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------
  // Slice integration — body + slice round-trip via SliceBadge.
  // ---------------------------------------------------------------------

  describe('slice badge integration', () => {
    const queryNumberSchema = {
      // Indicator-style scalar: oneOf [query-string, number] → scalar-only
      oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'number' }],
    };

    const queryNumberOrArraySchema = {
      // Mixed: data_array post-fix shape
      oneOf: [
        { $ref: '#/$defs/query-string' },
        { type: 'number' },
        { type: 'array', items: { type: 'number' } },
      ],
    };

    it('renders SliceBadge alongside RefTextArea when value has a slice', () => {
      render(
        <PropertyRow
          {...defaultProps}
          schema={queryNumberSchema}
          value="?{my_col}[0]"
        />
      );
      // RefTextArea receives the body only — no brackets in the chip.
      expect(screen.getByTestId('ref-input').value).toBe('my_col');
      // Badge shows the human-readable slice label.
      expect(screen.getByTestId('slice-badge')).toHaveTextContent(/First \(0\)/);
    });

    it('badge label updates with the slice value', () => {
      render(
        <PropertyRow
          {...defaultProps}
          schema={queryNumberOrArraySchema}
          value="?{my_col}[1:5]"
        />
      );
      expect(screen.getByTestId('slice-badge')).toHaveTextContent(/Rows 1-5/);
    });

    it('editing the chip body preserves the slice in the saved value', () => {
      const onChange = jest.fn();
      render(
        <PropertyRow
          {...defaultProps}
          schema={queryNumberSchema}
          value="?{old_col}[0]"
          onChange={onChange}
        />
      );
      const input = screen.getByTestId('ref-input');
      fireEvent.change(input, { target: { value: 'new_col' } });
      expect(onChange).toHaveBeenCalledWith('?{new_col}[0]');
    });

    it('changing the slice via the badge preserves the body', () => {
      const onChange = jest.fn();
      render(
        <PropertyRow
          {...defaultProps}
          schema={queryNumberOrArraySchema}
          value="?{my_col}[0]"
          onChange={onChange}
        />
      );
      fireEvent.click(screen.getByTestId('slice-badge'));
      fireEvent.click(screen.getByTestId('slice-option-last'));
      expect(onChange).toHaveBeenCalledWith('?{my_col}[-1]');
    });

    it('auto-applies [0] when chip body becomes non-empty in a scalar-only slot', () => {
      const onChange = jest.fn();
      const { rerender } = render(
        <PropertyRow
          {...defaultProps}
          schema={queryNumberSchema}
          value=""
          onChange={onChange}
        />
      );
      // Simulate the parent push of a value that arrives with a chip
      // body but no slice (e.g., from a DnD drop).
      rerender(
        <PropertyRow
          {...defaultProps}
          schema={queryNumberSchema}
          value="?{my_col}"
          onChange={onChange}
        />
      );
      expect(onChange).toHaveBeenCalledWith('?{my_col}[0]');
    });

    it('does NOT auto-apply a slice on static primitive (enum / flag pick)', () => {
      // Regression: clicking a flag-string pill (e.g. mode = "number")
      // pushes a STATIC primitive value, not a query-string. The slice
      // flow must not engage — no banner, no badge, no rewrite.
      const onChange = jest.fn();
      const { rerender } = render(
        <PropertyRow
          {...defaultProps}
          schema={queryNumberSchema}
          value=""
          onChange={onChange}
        />
      );
      rerender(
        <PropertyRow
          {...defaultProps}
          schema={queryNumberSchema}
          value="number"
          onChange={onChange}
        />
      );
      expect(onChange).not.toHaveBeenCalled();
      expect(screen.queryByTestId('slice-banner')).not.toBeInTheDocument();
      expect(screen.queryByTestId('slice-badge')).not.toBeInTheDocument();
    });

    it('does NOT auto-apply a slice on array-only slot drops', () => {
      const onChange = jest.fn();
      const arrayOnlySchema = {
        oneOf: [
          { $ref: '#/$defs/query-string' },
          { type: 'array', items: { type: 'number' } },
        ],
      };
      const { rerender } = render(
        <PropertyRow {...defaultProps} schema={arrayOnlySchema} value="" onChange={onChange} />
      );
      rerender(
        <PropertyRow
          {...defaultProps}
          schema={arrayOnlySchema}
          value="?{my_col}"
          onChange={onChange}
        />
      );
      expect(onChange).not.toHaveBeenCalled();
    });

    it('shows the SliceBanner after auto-applying default slice on scalar drop', () => {
      const onChange = jest.fn();
      const { rerender } = render(
        <PropertyRow
          {...defaultProps}
          schema={queryNumberSchema}
          value=""
          onChange={onChange}
        />
      );
      // Step 1 — DnD drop pushes the unsliced value: PropertyRow's
      // useEffect auto-applies [0] and turns on bannerActive.
      rerender(
        <PropertyRow
          {...defaultProps}
          schema={queryNumberSchema}
          value="?{my_col}"
          onChange={onChange}
        />
      );
      expect(onChange).toHaveBeenCalledWith('?{my_col}[0]');
      // Step 2 — parent state updates, the auto-applied value flows
      // back. Banner is now rendered.
      rerender(
        <PropertyRow
          {...defaultProps}
          schema={queryNumberSchema}
          value="?{my_col}[0]"
          onChange={onChange}
        />
      );
      expect(screen.getByTestId('slice-banner')).toBeInTheDocument();
    });

    it('banner dismisses on user action (First quick button)', () => {
      const onChange = jest.fn();
      const { rerender } = render(
        <PropertyRow
          {...defaultProps}
          schema={queryNumberSchema}
          value=""
          onChange={onChange}
        />
      );
      rerender(
        <PropertyRow
          {...defaultProps}
          schema={queryNumberSchema}
          value="?{my_col}"
          onChange={onChange}
        />
      );
      rerender(
        <PropertyRow
          {...defaultProps}
          schema={queryNumberSchema}
          value="?{my_col}[0]"
          onChange={onChange}
        />
      );
      expect(screen.getByTestId('slice-banner')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('slice-banner-first'));
      expect(screen.queryByTestId('slice-banner')).not.toBeInTheDocument();
    });

    it('clears slice when chip body becomes empty', () => {
      const onChange = jest.fn();
      const { rerender } = render(
        <PropertyRow
          {...defaultProps}
          schema={queryNumberSchema}
          value="?{old}[0]"
          onChange={onChange}
        />
      );
      // Simulate clearing the chip via the editor
      const input = screen.getByTestId('ref-input');
      fireEvent.change(input, { target: { value: '' } });
      // The serialized form for body='' is '' (not '?{}[0]').
      expect(onChange).toHaveBeenCalledWith('');
      rerender(
        <PropertyRow {...defaultProps} schema={queryNumberSchema} value="" onChange={onChange} />
      );
      expect(screen.queryByTestId('slice-badge')).not.toBeInTheDocument();
    });
  });

  // Explore 2.0 Phase 3b (S5 §1/§3, 06 §5): the `property-zone` DnD retrofit
  // + the D8/D10 pill-rendering fork. `useDroppable` is mocked (matching
  // `PivotShelf.test.jsx`'s established pattern) purely to capture/invoke the
  // droppable `data` payload — jsdom can't simulate a real dnd-kit pointer drag.
  describe('property-zone DnD retrofit + D8/D10 pill rendering', () => {
    beforeEach(() => {
      for (const k of Object.keys(droppableData)) delete droppableData[k];
      useStore.setState({ metrics: [], dimensions: [] });
    });

    const queryStringDef = { 'query-string': { type: 'string', pattern: '^\\?\\{.*\\}$' } };

    test('the droppable data key is `kind` (not `type`) and carries the per-slot onDropField callback', () => {
      const onDropField = jest.fn();
      render(
        <PropertyRow
          {...defaultProps}
          path="x"
          schema={{ oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'number' }] }}
          defs={queryStringDef}
          value=""
          droppable
          onDropField={onDropField}
        />
      );
      const entry = droppableData['property-x'];
      expect(entry.data.kind).toBe('property-zone');
      expect(entry.data.path).toBe('x');
      expect(entry.data.onDropField).toBe(onDropField);
      expect(entry.data.type).toBeUndefined();
    });

    test('not droppable when the `droppable` prop is false (default) — matches SchemaEditor/InsightEditForm/ChartEditForm call sites', () => {
      render(
        <PropertyRow
          {...defaultProps}
          path="x"
          schema={{ oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'number' }] }}
          defs={queryStringDef}
          value=""
        />
      );
      expect(droppableData['property-x'].disabled).toBe(true);
    });

    // T4 (promote-roundtrip #4 / pills-buildrail #9): a droppable,
    // query-capable EMPTY slot (the Build rail's x/y "Essentials" fields)
    // must NOT default to the "Static value" number spinner — typing a
    // dropped/typed ref into that input silently mangles it character by
    // character (observed live: '?{query_1.X}' reduced to 'e1').
    test('a droppable, query-capable EMPTY slot defaults to query mode, not the static number spinner', () => {
      render(
        <PropertyRow
          {...defaultProps}
          path="x"
          schema={{ oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'number' }] }}
          defs={queryStringDef}
          value={undefined}
          droppable
        />
      );
      expect(screen.getByRole('button', { name: /query/i })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: /static/i })).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByTestId('ref-text-area')).toBeInTheDocument();
    });

    // Non-droppable consumers (right-rail InsightEditForm/ChartEditForm/
    // SchemaLeafForm) are UNCHANGED — this gate is additive, not universal.
    test('a NON-droppable EMPTY slot still defaults to static (unaffected — gated on `droppable`)', () => {
      render(
        <PropertyRow
          {...defaultProps}
          path="x"
          schema={{ oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'number' }] }}
          defs={queryStringDef}
          value={undefined}
        />
      );
      expect(screen.getByRole('button', { name: /static/i })).toHaveAttribute('aria-pressed', 'true');
    });

    test('a recognized dimension ref renders a FieldPill + PillMenu instead of RefTextArea when droppable', () => {
      render(
        <PropertyRow
          {...defaultProps}
          path="x"
          schema={{ oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'number' }] }}
          defs={queryStringDef}
          value="?{${ref(orders_q).amount}}"
          droppable
        />
      );
      expect(screen.getByText('orders_q ▸ amount')).toBeInTheDocument();
      expect(screen.getByTestId('pill-menu-trigger')).toBeInTheDocument();
      expect(screen.queryByTestId('ref-text-area')).not.toBeInTheDocument();
    });

    test('a dangling ref (advisory `error` set) renders the pill in its explicit warning state, not the normal palette (delta-review fix)', () => {
      render(
        <PropertyRow
          {...defaultProps}
          path="x"
          schema={{ oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'number' }] }}
          defs={queryStringDef}
          value="?{${ref(orders_q).amount}}"
          droppable
          error="Reference to 'orders_q' not found in models, ..."
        />
      );
      const pill = screen.getByTestId('property-pill-x');
      expect(pill).toHaveAttribute('data-warning', 'true');
      expect(screen.getByTestId('field-pill-warning-icon')).toBeInTheDocument();
      // The advisory text below the pill still renders too (unchanged behavior).
      expect(screen.getByTestId('property-error-x')).toBeInTheDocument();
    });

    test('no `error` -> the pill renders normally, no warning treatment', () => {
      render(
        <PropertyRow
          {...defaultProps}
          path="x"
          schema={{ oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'number' }] }}
          defs={queryStringDef}
          value="?{${ref(orders_q).amount}}"
          droppable
        />
      );
      expect(screen.getByTestId('property-pill-x')).not.toHaveAttribute('data-warning');
    });

    test('the SAME recognized value falls back to RefTextArea when NOT droppable (fork is gated, not universal)', () => {
      render(
        <PropertyRow
          {...defaultProps}
          path="x"
          schema={{ oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'number' }] }}
          defs={queryStringDef}
          value="?{${ref(orders_q).amount}}"
        />
      );
      expect(screen.getByTestId('ref-text-area')).toBeInTheDocument();
      expect(screen.queryByTestId('pill-menu-trigger')).not.toBeInTheDocument();
    });

    test('an opaque/unparseable expression always falls back to RefTextArea, even when droppable', () => {
      render(
        <PropertyRow
          {...defaultProps}
          path="x"
          schema={{ oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'number' }] }}
          defs={queryStringDef}
          value="?{count(distinct ${ref(orders_q).id})}"
          droppable
        />
      );
      expect(screen.getByTestId('ref-text-area')).toBeInTheDocument();
    });

    test('selecting a preset via PillMenu rewrites the serialized value through onChange', () => {
      const onChange = jest.fn();
      render(
        <PropertyRow
          {...defaultProps}
          path="x"
          schema={{ oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'number' }] }}
          defs={queryStringDef}
          value="?{${ref(orders_q).amount}}"
          droppable
          onChange={onChange}
        />
      );
      fireEvent.click(screen.getByTestId('pill-menu-trigger'));
      fireEvent.click(screen.getByTestId('pill-menu-preset-sum'));
      expect(onChange).toHaveBeenCalledWith('?{sum(${ref(orders_q).amount})}');
    });

    test('onSaveAsMetric threads through to PillMenu, called with the parsed pill state (Explore 2.0 Phase 4)', () => {
      const onSaveAsMetric = jest.fn();
      render(
        <PropertyRow
          {...defaultProps}
          path="y"
          schema={{ oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'number' }] }}
          defs={queryStringDef}
          value="?{sum(${ref(orders_q).amount})}"
          droppable
          onSaveAsMetric={onSaveAsMetric}
        />
      );
      fireEvent.click(screen.getByTestId('pill-menu-trigger'));
      expect(screen.getByTestId('pill-menu-save-as-metric')).not.toBeDisabled();
      fireEvent.click(screen.getByTestId('pill-menu-save-as-metric'));
      expect(onSaveAsMetric).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'aggregate', agg: 'sum', ref: 'orders_q', column: 'amount' })
      );
    });

    test('without onSaveAsMetric, PillMenu renders the action disabled even on an aggregate pill', () => {
      render(
        <PropertyRow
          {...defaultProps}
          path="y"
          schema={{ oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'number' }] }}
          defs={queryStringDef}
          value="?{sum(${ref(orders_q).amount})}"
          droppable
        />
      );
      fireEvent.click(screen.getByTestId('pill-menu-trigger'));
      expect(screen.getByTestId('pill-menu-save-as-metric')).toBeDisabled();
    });

    test('PillMenu Remove clears the slot value (never the whole property)', () => {
      const onChange = jest.fn();
      render(
        <PropertyRow
          {...defaultProps}
          path="x"
          schema={{ oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'number' }] }}
          defs={queryStringDef}
          value="?{${ref(orders_q).amount}}"
          droppable
          onChange={onChange}
        />
      );
      fireEvent.click(screen.getByTestId('pill-menu-trigger'));
      fireEvent.click(screen.getByTestId('pill-menu-remove'));
      expect(onChange).toHaveBeenCalledWith('');
    });

    test('"Custom aggregation…" switches the slot back to RefTextArea, pre-filled with the current body', () => {
      render(
        <PropertyRow
          {...defaultProps}
          path="x"
          schema={{ oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'number' }] }}
          defs={queryStringDef}
          value="?{${ref(orders_q).amount}}"
          droppable
        />
      );
      fireEvent.click(screen.getByTestId('pill-menu-trigger'));
      fireEvent.click(screen.getByTestId('pill-menu-custom-aggregation'));
      expect(screen.getByTestId('ref-text-area')).toBeInTheDocument();
      expect(screen.getByTestId('ref-input')).toHaveValue('${ref(orders_q).amount}');
    });

    // D3 (e2e-gap-review.md delta pass): the "Custom aggregation…" escape
    // hatch used to be a one-way ratchet — no way back to pill rendering
    // short of an unrelated remount, even once the raw text re-parses as a
    // clean, recognized shape. These three tests lock in the "Back to pill"
    // affordance's exact contract.
    describe('"Back to pill" return path (D3)', () => {
      test('the affordance is ABSENT immediately after "Custom aggregation…" while the raw text is still opaque/custom-shaped', () => {
        render(
          <PropertyRow
            {...defaultProps}
            path="x"
            schema={{ oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'number' }] }}
            defs={queryStringDef}
            value="?{count(distinct ${ref(orders_q).id})}"
            droppable
          />
        );
        // This value is already opaque (never rendered as a pill at all),
        // so RefTextArea is the fallback from the start — no custom-aggregation
        // click needed to reach raw-edit mode here.
        expect(screen.getByTestId('ref-text-area')).toBeInTheDocument();
        expect(screen.queryByTestId('property-x-back-to-pill')).not.toBeInTheDocument();
      });

      test('the affordance APPEARS once the raw text re-parses as a recognized (non-opaque/custom) shape', () => {
        // PropertyRow is a controlled component (`body` derives from the
        // `value` prop) — mirrors the slice-badge tests' `rerender()`
        // pattern to simulate the parent pushing the edited value back in,
        // rather than relying on the mocked RefTextArea's onChange to
        // mutate anything itself.
        const { rerender } = render(
          <PropertyRow
            {...defaultProps}
            path="x"
            schema={{ oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'number' }] }}
            defs={queryStringDef}
            value="?{${ref(orders_q).amount}}"
            droppable
          />
        );
        fireEvent.click(screen.getByTestId('pill-menu-trigger'));
        fireEvent.click(screen.getByTestId('pill-menu-custom-aggregation'));
        // Still the exact original recognized shape — RefTextArea is showing
        // (forceRawEdit is true) but the affordance should already be visible
        // since the raw text re-parses as a clean 'dimension' pill.
        expect(screen.getByTestId('property-x-back-to-pill')).toBeInTheDocument();

        // Parent pushes an edited, OPAQUE value back in — the affordance
        // must disappear (forceRawEdit stays true; only the affordance
        // reacts to the reparse).
        rerender(
          <PropertyRow
            {...defaultProps}
            path="x"
            schema={{ oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'number' }] }}
            defs={queryStringDef}
            value="?{count(distinct ${ref(orders_q).id})}"
            droppable
          />
        );
        expect(screen.getByTestId('ref-text-area')).toBeInTheDocument();
        expect(screen.queryByTestId('property-x-back-to-pill')).not.toBeInTheDocument();

        // Parent pushes an edited value back matching a recognized
        // (aggregate) shape — the affordance returns.
        rerender(
          <PropertyRow
            {...defaultProps}
            path="x"
            schema={{ oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'number' }] }}
            defs={queryStringDef}
            value="?{sum(${ref(orders_q).amount})}"
            droppable
          />
        );
        expect(screen.getByTestId('property-x-back-to-pill')).toBeInTheDocument();
      });

      test('clicking the affordance returns to pill rendering with the value UNCHANGED', () => {
        const onChange = jest.fn();
        render(
          <PropertyRow
            {...defaultProps}
            path="x"
            schema={{ oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'number' }] }}
            defs={queryStringDef}
            value="?{${ref(orders_q).amount}}"
            droppable
            onChange={onChange}
          />
        );
        fireEvent.click(screen.getByTestId('pill-menu-trigger'));
        fireEvent.click(screen.getByTestId('pill-menu-custom-aggregation'));
        expect(screen.getByTestId('ref-text-area')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('property-x-back-to-pill'));

        // Back to the pill — same dimension label as before the escape hatch.
        expect(screen.getByText('orders_q ▸ amount')).toBeInTheDocument();
        expect(screen.queryByTestId('ref-text-area')).not.toBeInTheDocument();
        expect(screen.queryByTestId('property-x-back-to-pill')).not.toBeInTheDocument();
        // Purely a view-mode toggle — onChange is never called by it.
        expect(onChange).not.toHaveBeenCalled();
      });
    });

    test('a bare ref matching a known Metric renders a metricRef pill (Σ-style, plain name)', () => {
      useStore.setState({ metrics: [{ name: 'churn_rate', parentModel: 'orders_q' }] });
      render(
        <PropertyRow
          {...defaultProps}
          path="x"
          schema={{ oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'number' }] }}
          defs={queryStringDef}
          value="?{${ref(churn_rate)}}"
          droppable
        />
      );
      expect(screen.getByText('churn_rate')).toBeInTheDocument();
      expect(screen.queryByTestId('ref-text-area')).not.toBeInTheDocument();
    });

    // T4 (pills-buildrail #4): the pill is ALSO a drag SOURCE, so it can be
    // moved to another slot (drag the x pill onto the y slot) — mirrors the
    // droppable-data assertion style above, but against the mocked
    // `useDraggable`.
    describe('pill as a drag source + click-to-open (T4)', () => {
      beforeEach(() => {
        for (const k of Object.keys(draggableData)) delete draggableData[k];
      });

      test('a shown pill registers as a drag source carrying sourcePath + the raw (unwrapped) body', () => {
        render(
          <PropertyRow
            {...defaultProps}
            path="x"
            schema={{ oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'number' }] }}
            defs={queryStringDef}
            value="?{${ref(orders_q).amount}}"
            droppable
          />
        );
        const entry = draggableData['pill-x'];
        expect(entry).toBeDefined();
        expect(entry.disabled).toBe(false);
        expect(entry.data.source).toBe('pill');
        expect(entry.data.sourcePath).toBe('x');
        expect(entry.data.raw).toBe('${ref(orders_q).amount}');
      });

      test('the drag source is DISABLED when no pill is showing (opaque/raw-edit rows have nothing to drag)', () => {
        render(
          <PropertyRow
            {...defaultProps}
            path="x"
            schema={{ oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'number' }] }}
            defs={queryStringDef}
            value="not a recognized shape"
            droppable
          />
        );
        expect(draggableData['pill-x'].disabled).toBe(true);
      });

      // T4 (pills-buildrail #10): clicking the pill BODY opens the same menu
      // the 16px chevron does — previously the chevron was the ONLY
      // interactive affordance on the whole pill.
      test('clicking the pill body opens the PillMenu popover (same as the chevron)', () => {
        render(
          <PropertyRow
            {...defaultProps}
            path="x"
            schema={{ oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'number' }] }}
            defs={queryStringDef}
            value="?{${ref(orders_q).amount}}"
            droppable
          />
        );
        expect(screen.queryByTestId('pill-menu')).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId('property-pill-x'));
        expect(screen.getByTestId('pill-menu')).toBeInTheDocument();
      });

      test('the pill body is keyboard-reachable (role="button", Enter opens the menu)', () => {
        render(
          <PropertyRow
            {...defaultProps}
            path="x"
            schema={{ oneOf: [{ $ref: '#/$defs/query-string' }, { type: 'number' }] }}
            defs={queryStringDef}
            value="?{${ref(orders_q).amount}}"
            droppable
          />
        );
        const pill = screen.getByTestId('property-pill-x');
        expect(pill).toHaveAttribute('role', 'button');
        expect(pill).toHaveAttribute('tabIndex', '0');
        fireEvent.keyDown(pill, { key: 'Enter' });
        expect(screen.getByTestId('pill-menu')).toBeInTheDocument();
      });
    });
  });
});
