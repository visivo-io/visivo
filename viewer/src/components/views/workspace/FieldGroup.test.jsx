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
  PropertyRow: ({ path, value, onChange, onRemove }) => (
    <div data-testid={`prop-${path}`}>
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

  test('renders header label, group icon, and present/total count badge', () => {
    render(<FieldGroup group={essentialsGroup} value={{ expression: 'x' }} onChange={() => {}} />);
    expect(screen.getByTestId('field-group-header-essentials')).toBeInTheDocument();
    // 1 of 2 fields present (expression).
    expect(screen.getByTestId('field-group-badge-essentials')).toHaveTextContent('1/2');
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
});
