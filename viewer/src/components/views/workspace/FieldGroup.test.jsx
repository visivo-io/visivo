/**
 * FieldGroup tests (VIS-991)
 *
 * The disclosure section: header (chevron + icon + label + count badge),
 * collapse persistence per {objectType}.{groupId}, the "+ N more" tail, and
 * value round-trip through the (mocked) PropertyRow widgets.
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { FieldGroup } from './FieldGroup';
import useFieldGroupCollapseStore, { collapseKey } from './fieldGroupCollapseStore';

// Mock PropertyRow to a simple input so we can assert path/value/onChange wiring
// without exercising the whole typed-field engine.
jest.mock('../common/SchemaEditor/PropertyRow', () => ({
  __esModule: true,
  PropertyRow: ({ path, value, onChange, onRemove, droppable, onDropField, onSaveAsMetric }) => (
    <div data-testid={`prop-${path}`} data-droppable={droppable ? 'true' : 'false'}>
      <input
        data-testid={`input-${path}`}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
      />
      {onRemove && (
        <button data-testid={`remove-${path}`} onClick={onRemove}>
          remove
        </button>
      )}
      {onDropField && (
        <button data-testid={`drop-${path}`} onClick={() => onDropField({ type: 'model', name: 'orders_q' })}>
          simulate drop
        </button>
      )}
      {onSaveAsMetric && (
        <button
          data-testid={`save-as-metric-${path}`}
          onClick={() => onSaveAsMetric({ kind: 'aggregate', agg: 'sum' })}
        >
          simulate save as metric
        </button>
      )}
    </div>
  ),
}));

const resetCollapse = () =>
  act(() => useFieldGroupCollapseStore.setState({ collapsed: {} }));

const essentialsGroup = {
  id: 'essentials',
  label: 'Essentials',
  icon: 'star',
  objectType: 'dimension',
  alwaysOpen: true,
  fields: [
    { name: 'expression', schema: { type: 'string', description: 'SQL' }, required: true, present: true, expanded: true },
    { name: 'description', schema: { type: 'string' }, required: false, present: false, expanded: false },
  ],
};

const advancedGroup = {
  id: 'advanced',
  label: 'Advanced',
  icon: 'sliders',
  objectType: 'dimension',
  alwaysOpen: false,
  fields: [
    { name: 'foo', schema: { type: 'string' }, required: false, present: true, expanded: true },
    { name: 'bar', schema: { type: 'string' }, required: false, present: false, expanded: false },
    { name: 'baz', schema: { type: 'string' }, required: false, present: false, expanded: false },
  ],
};

describe('FieldGroup', () => {
  beforeEach(resetCollapse);

  test('tolerates a missing `group` prop entirely (defensive default destructuring)', () => {
    // group=undefined -> `group || {}` falls back to {}, so id/label/fields
    // all come from THEIR OWN defaults too (fields = []).
    render(<FieldGroup onChange={() => {}} />);
    // No fields, no label — just an empty header renders without throwing.
    expect(screen.getByTestId('field-group-header-undefined')).toBeInTheDocument();
  });

  test('tolerates a missing `value` prop (defaults to {}, so getValueAtPath never sees undefined.foo)', () => {
    render(<FieldGroup group={essentialsGroup} onChange={() => {}} />);
    expect(screen.getByTestId('field-group-header-essentials')).toBeInTheDocument();
    // The mocked PropertyRow renders an empty-string input when its `value`
    // resolves to undefined against an empty {} — no crash reading into value.
    expect(screen.getByTestId('input-expression')).toHaveValue('');
  });

  test('an unrecognized icon key falls back to the generic sliders icon (no crash)', () => {
    const mysteryIconGroup = {
      id: 'mystery',
      label: 'Mystery',
      icon: 'not-a-real-icon-key',
      objectType: 'dimension',
      alwaysOpen: true,
      fields: [],
    };
    render(<FieldGroup group={mysteryIconGroup} value={{}} onChange={() => {}} />);
    expect(screen.getByTestId('field-group-header-mystery')).toBeInTheDocument();
  });

  test('renders header label, group icon, and present/total count badge once something is configured', () => {
    render(<FieldGroup group={essentialsGroup} value={{ expression: 'x' }} onChange={() => {}} />);
    expect(screen.getByTestId('field-group-header-essentials')).toBeInTheDocument();
    // 1 of 2 fields present (expression).
    expect(screen.getByTestId('field-group-badge-essentials')).toHaveTextContent('1/2');
  });

  // D12 (pills-buildrail #8/#9): "0/180"-style raw schema counts read as an
  // intimidating inventory when nothing is configured yet — the badge is
  // hidden entirely in that state (it comes back the moment ANY field in
  // the group has a value, per the test above). Fields spec their own
  // `present`/`required` flags (pre-computed by buildGroupSpec, not derived
  // live here), so this uses a fixture where BOTH are false throughout.
  test('hides the count badge entirely when nothing in the group is configured (D12 curation)', () => {
    const emptyStyleGroup = {
      id: 'style',
      label: 'Style',
      icon: 'style',
      objectType: 'scatter',
      alwaysOpen: false,
      fields: [
        { name: 'marker.color', schema: { type: 'string' }, required: false, present: false, expanded: false },
        { name: 'line.width', schema: { type: 'number' }, required: false, present: false, expanded: false },
      ],
    };
    render(<FieldGroup group={emptyStyleGroup} value={{}} onChange={() => {}} />);
    expect(screen.queryByTestId('field-group-badge-style')).not.toBeInTheDocument();
  });

  test('Essentials is always open and its header is disabled (cannot collapse)', () => {
    render(<FieldGroup group={essentialsGroup} value={{}} onChange={() => {}} />);
    const header = screen.getByTestId('field-group-header-essentials');
    expect(header).toBeDisabled();
    expect(header).toHaveAttribute('aria-expanded', 'true');
    // Expanded field rendered up-front.
    expect(screen.getByTestId('prop-expression')).toBeInTheDocument();
  });

  test('only expanded fields render up-front; rare ones hide behind "+ N more"', () => {
    render(<FieldGroup group={advancedGroup} value={{ foo: 'v' }} onChange={() => {}} />);
    expect(screen.getByTestId('prop-foo')).toBeInTheDocument();
    expect(screen.queryByTestId('prop-bar')).not.toBeInTheDocument();
    // "2 more" affordance present.
    const more = screen.getByTestId('field-group-more-advanced');
    expect(more).toHaveTextContent('2 more');
    fireEvent.click(more);
    expect(screen.getByTestId('prop-bar')).toBeInTheDocument();
    expect(screen.getByTestId('prop-baz')).toBeInTheDocument();
  });

  test('collapsing a non-essentials group persists per {objectType}.{groupId}', () => {
    render(<FieldGroup group={advancedGroup} value={{ foo: 'v' }} onChange={() => {}} />);
    const header = screen.getByTestId('field-group-header-advanced');
    expect(header).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(header);
    // Persisted under the composite key.
    const key = collapseKey('dimension', 'advanced');
    expect(useFieldGroupCollapseStore.getState().collapsed[key]).toBe(true);
    // Body hidden when collapsed.
    expect(screen.queryByTestId('prop-foo')).not.toBeInTheDocument();
    expect(header).toHaveAttribute('aria-expanded', 'false');
  });

  // Bug found while adding coverage: a `defaultOpen: false` group (Layout/
  // Animation/Other in the trace-prop taxonomy) with NO persisted collapse
  // entry yet renders collapsed (per its own `!defaultOpen` fallback), but
  // the store's generic `toggleCollapsed` treats an absent entry as
  // "currently expanded" and flips it to `collapsed: true` on the first
  // click — a no-op the user reads as "nothing happened". Fixed by writing
  // the NEXT value from this component's own effective `persistedCollapsed`
  // (via `setCollapsed`) instead of blindly toggling the store's raw entry.
  test('a single click EXPANDS a defaultOpen:false group with no prior persisted entry (first-click bug regression)', () => {
    const collapsedByDefaultGroup = {
      id: 'layout',
      label: 'Layout',
      icon: 'layout',
      objectType: 'scatter',
      alwaysOpen: false,
      defaultOpen: false,
      fields: [
        { name: 'width', schema: { type: 'number' }, required: false, present: true, expanded: true },
      ],
    };
    render(
      <FieldGroup group={collapsedByDefaultGroup} value={{ width: 10 }} onChange={() => {}} />
    );
    const header = screen.getByTestId('field-group-header-layout');
    // Collapsed by default, no persisted entry yet.
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('prop-width')).not.toBeInTheDocument();

    // ONE click must expand it — not require a second click.
    fireEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('prop-width')).toBeInTheDocument();

    // A second click collapses it again (the toggle still works both ways).
    fireEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'false');
  });

  test('rehydrates collapsed state from the store on mount', () => {
    act(() =>
      useFieldGroupCollapseStore.setState({
        collapsed: { [collapseKey('dimension', 'advanced')]: true },
      })
    );
    render(<FieldGroup group={advancedGroup} value={{ foo: 'v' }} onChange={() => {}} />);
    expect(screen.getByTestId('field-group-header-advanced')).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.queryByTestId('prop-foo')).not.toBeInTheDocument();
  });

  test('round-trips a field edit through onChange (setValueAtPath)', () => {
    const onChange = jest.fn();
    render(<FieldGroup group={essentialsGroup} value={{ expression: 'a' }} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('input-expression'), { target: { value: 'b' } });
    expect(onChange).toHaveBeenCalledWith({ expression: 'b' });
  });

  test('required fields get no remove button; optional present fields do', () => {
    render(
      <FieldGroup
        group={advancedGroup}
        value={{ foo: 'v' }}
        onChange={() => {}}
      />
    );
    // foo is optional+present → removable.
    expect(screen.getByTestId('remove-foo')).toBeInTheDocument();

    render(<FieldGroup group={essentialsGroup} value={{ expression: 'x' }} onChange={() => {}} />);
    // expression is required → no remove.
    expect(screen.queryByTestId('remove-expression')).not.toBeInTheDocument();
  });

  test('clicking the (non-override) remove button clears the field via setValueAtPath', () => {
    const onChange = jest.fn();
    render(
      <FieldGroup group={advancedGroup} value={{ foo: 'v' }} onChange={onChange} />
    );
    fireEvent.click(screen.getByTestId('remove-foo'));
    expect(onChange).toHaveBeenCalledWith(
      expect.not.objectContaining({ foo: expect.anything() })
    );
  });

  // Explore 2.0 Phase 3b (S5 §2): `droppable`/`onDropField` pure pass-through.
  test('defaults droppable to false when omitted (no-op for pre-existing callers)', () => {
    render(<FieldGroup group={essentialsGroup} value={{ expression: 'a' }} onChange={() => {}} />);
    expect(screen.getByTestId('prop-expression')).toHaveAttribute('data-droppable', 'false');
  });

  test('forwards droppable=true and curries onDropField with the field name', () => {
    const onDropField = jest.fn();
    render(
      <FieldGroup
        group={essentialsGroup}
        value={{ expression: 'a' }}
        onChange={() => {}}
        droppable
        onDropField={onDropField}
      />
    );
    expect(screen.getByTestId('prop-expression')).toHaveAttribute('data-droppable', 'true');
    fireEvent.click(screen.getByTestId('drop-expression'));
    expect(onDropField).toHaveBeenCalledWith('expression', { type: 'model', name: 'orders_q' });
  });

  // Explore 2.0 Phase 4 (06 §4): `onSaveAsMetric` pass-through, curried by field name.
  test('onSaveAsMetric is undefined when omitted (no-op for pre-existing callers)', () => {
    render(<FieldGroup group={essentialsGroup} value={{ expression: 'a' }} onChange={() => {}} />);
    expect(screen.queryByTestId('save-as-metric-expression')).not.toBeInTheDocument();
  });

  test('curries onSaveAsMetric with the field name', () => {
    const onSaveAsMetric = jest.fn();
    render(
      <FieldGroup
        group={essentialsGroup}
        value={{ expression: 'a' }}
        onChange={() => {}}
        onSaveAsMetric={onSaveAsMetric}
      />
    );
    fireEvent.click(screen.getByTestId('save-as-metric-expression'));
    expect(onSaveAsMetric).toHaveBeenCalledWith('expression', { kind: 'aggregate', agg: 'sum' });
  });

  // VIS-1021 Field Finder reveal: force-expand + unfold-the-tail + flash.
  describe('revealPath (VIS-1021 Field Finder jump-to)', () => {
    afterEach(() => {
      jest.useRealTimers();
      delete window.HTMLElement.prototype.scrollIntoView;
    });

    test('when this group owns revealPath, it force-expands, unfolds the tail with no click, and flashes the target row', () => {
      jest.useFakeTimers();
      // jsdom has no scrollIntoView; polyfill it so the "real browser" branch
      // (element found + scrollIntoView called) is exercised too, not just
      // the jsdom-guard fallback.
      const scrollIntoViewMock = jest.fn();
      window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;
      render(
        <FieldGroup
          group={advancedGroup}
          value={{ foo: 'v' }}
          onChange={() => {}}
          revealPath="bar"
        />
      );
      expect(scrollIntoViewMock).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
      // Force-expanded regardless of persisted/default collapse state.
      expect(screen.getByTestId('field-group-header-advanced')).toHaveAttribute(
        'aria-expanded',
        'true'
      );
      // Tail unfolded on the SAME pass — bar/baz render with no "+N more" click.
      expect(screen.getByTestId('prop-bar')).toBeInTheDocument();
      expect(screen.getByTestId('prop-baz')).toBeInTheDocument();
      expect(screen.queryByTestId('field-group-more-advanced')).not.toBeInTheDocument();
      // The reveal target's wrapper flashes a highlight ring.
      const targetWrapper = screen.getByTestId('field-row-bar');
      expect(targetWrapper.className).toMatch(/ring-2 ring-primary-400/);

      // Flash clears after the timeout.
      act(() => {
        jest.advanceTimersByTime(1500);
      });
      expect(targetWrapper.className).not.toMatch(/ring-2 ring-primary-400/);
    });

    test('still flashes the target row in a plain jsdom environment with no scrollIntoView (the guarded fallback path)', () => {
      // No polyfill here — jsdom genuinely has no scrollIntoView, so this
      // exercises the `typeof el.scrollIntoView === 'function'` FALSE branch.
      expect(window.HTMLElement.prototype.scrollIntoView).toBeUndefined();
      render(
        <FieldGroup
          group={advancedGroup}
          value={{ foo: 'v' }}
          onChange={() => {}}
          revealPath="baz"
        />
      );
      const targetWrapper = screen.getByTestId('field-row-baz');
      expect(targetWrapper.className).toMatch(/ring-2 ring-primary-400/);
    });

    test('a group that does NOT own revealPath is unaffected — no force-expand, no unfold', () => {
      render(
        <FieldGroup
          group={advancedGroup}
          value={{ foo: 'v' }}
          onChange={() => {}}
          revealPath="some_other_fields_target"
        />
      );
      expect(screen.getByTestId('prop-foo')).toBeInTheDocument();
      expect(screen.queryByTestId('prop-bar')).not.toBeInTheDocument();
      // The "+N more" tail toggle is still there, unrevealed.
      expect(screen.getByTestId('field-group-more-advanced')).toBeInTheDocument();
    });

    test('an alwaysOpen (Essentials) group with no matching field in revealPath renders normally', () => {
      render(
        <FieldGroup
          group={essentialsGroup}
          value={{ expression: 'x' }}
          onChange={() => {}}
          revealPath="not.in.this.group"
        />
      );
      expect(screen.getByTestId('field-group-header-essentials')).toHaveAttribute(
        'aria-expanded',
        'true'
      );
      expect(screen.getByTestId('prop-expression')).toBeInTheDocument();
    });
  });

  // VIS-996: `overrides` swaps in a richer widget for a named field, in the
  // SAME slot/grouping as the generic PropertyRow, without forking the layout.
  describe('overrides (VIS-996 per-field render override)', () => {
    test('an overridden field renders the override function instead of PropertyRow, in the same slot', () => {
      const overrideFn = jest.fn(({ field, value }) => (
        <div data-testid={`custom-${field.name}`}>{value}</div>
      ));
      render(
        <FieldGroup
          group={essentialsGroup}
          value={{ expression: 'SELECT 1' }}
          onChange={() => {}}
          overrides={{ expression: overrideFn }}
        />
      );
      expect(screen.getByTestId('field-override-expression')).toBeInTheDocument();
      expect(screen.getByTestId('custom-expression')).toHaveTextContent('SELECT 1');
      // The generic PropertyRow never mounts for this field.
      expect(screen.queryByTestId('prop-expression')).not.toBeInTheDocument();
    });

    test('a required overridden field gets onRemove=undefined; an optional present one gets a working onRemove', () => {
      const requiredCall = { current: null };
      const optionalCall = { current: null };
      const onChange = jest.fn();
      render(
        <FieldGroup
          group={essentialsGroup}
          value={{ expression: 'SELECT 1' }}
          onChange={onChange}
          overrides={{
            expression: props => {
              requiredCall.current = props;
              return <div data-testid="override-expression" />;
            },
          }}
        />
      );
      expect(requiredCall.current.onRemove).toBeUndefined();

      render(
        <FieldGroup
          group={advancedGroup}
          value={{ foo: 'v' }}
          onChange={onChange}
          overrides={{
            foo: props => {
              optionalCall.current = props;
              return <button data-testid="override-foo-remove" onClick={props.onRemove}>x</button>;
            },
          }}
        />
      );
      expect(optionalCall.current.onRemove).toBeInstanceOf(Function);
      fireEvent.click(screen.getByTestId('override-foo-remove'));
      expect(onChange).toHaveBeenCalledWith(expect.not.objectContaining({ foo: 'v' }));
    });

    test('override onChange writes through handleFieldChange (setValueAtPath)', () => {
      const onChange = jest.fn();
      const overrideFn = ({ onChange: fieldOnChange }) => (
        <button data-testid="override-change" onClick={() => fieldOnChange('new-value')}>
          change
        </button>
      );
      render(
        <FieldGroup
          group={essentialsGroup}
          value={{ expression: 'old' }}
          onChange={onChange}
          overrides={{ expression: overrideFn }}
        />
      );
      fireEvent.click(screen.getByTestId('override-change'));
      expect(onChange).toHaveBeenCalledWith({ expression: 'new-value' });
    });

    test('override receives disabled + the field error, forwarded unchanged', () => {
      const captured = { current: null };
      render(
        <FieldGroup
          group={essentialsGroup}
          value={{ expression: 'x' }}
          onChange={() => {}}
          disabled
          errors={{ expression: 'bad expression' }}
          overrides={{
            expression: props => {
              captured.current = props;
              return <div data-testid="override-disabled-error" />;
            },
          }}
        />
      );
      expect(captured.current.disabled).toBe(true);
      expect(captured.current.error).toBe('bad expression');
    });
  });
});
