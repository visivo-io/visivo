/**
 * FieldGroupList tests (VIS-991)
 *
 * Maps an ordered group spec to FieldGroups. FieldGroup is mocked so this test
 * stays focused on the list's mapping/wiring contract.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { FieldGroupList } from './FieldGroupList';

const mockFieldGroupSpy = jest.fn();
jest.mock('./FieldGroup', () => ({
  __esModule: true,
  FieldGroup: props => {
    mockFieldGroupSpy(props);
    return (
      <div data-testid={`group-${props.group.id}`}>
        <button
          data-testid={`edit-${props.group.id}`}
          onClick={() => props.onChange({ edited: props.group.id })}
        >
          edit
        </button>
      </div>
    );
  },
}));

const spec = [
  { id: 'essentials', label: 'Essentials', fields: [{ name: 'expression' }] },
  { id: 'data', label: 'Data·Source', fields: [{ name: 'data_type' }] },
  { id: 'advanced', label: 'Advanced', fields: [{ name: 'foo' }] },
];

describe('FieldGroupList', () => {
  beforeEach(() => mockFieldGroupSpy.mockClear());

  test('renders one FieldGroup per spec entry, in order', () => {
    render(<FieldGroupList groupSpec={spec} value={{}} onChange={() => {}} />);
    expect(screen.getByTestId('field-group-list')).toBeInTheDocument();
    expect(screen.getByTestId('group-essentials')).toBeInTheDocument();
    expect(screen.getByTestId('group-data')).toBeInTheDocument();
    expect(screen.getByTestId('group-advanced')).toBeInTheDocument();
    const renderedIds = mockFieldGroupSpy.mock.calls.map(c => c[0].group.id);
    expect(renderedIds).toEqual(['essentials', 'data', 'advanced']);
  });

  test('threads value, defs, and disabled to each FieldGroup', () => {
    const value = { expression: 'x' };
    const defs = { color: {} };
    render(
      <FieldGroupList groupSpec={spec} value={value} onChange={() => {}} defs={defs} disabled />
    );
    mockFieldGroupSpy.mock.calls.forEach(([props]) => {
      expect(props.value).toBe(value);
      expect(props.defs).toBe(defs);
      expect(props.disabled).toBe(true);
    });
  });

  test('forwards onChange from a child group', () => {
    const onChange = jest.fn();
    render(<FieldGroupList groupSpec={spec} value={{}} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('edit-data'));
    expect(onChange).toHaveBeenCalledWith({ edited: 'data' });
  });

  test('renders an empty state for an empty/missing spec', () => {
    render(<FieldGroupList groupSpec={[]} value={{}} onChange={() => {}} />);
    expect(screen.getByText(/no fields to configure/i)).toBeInTheDocument();
  });
});
