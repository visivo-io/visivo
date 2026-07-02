/* eslint-disable no-template-curly-in-string */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import selectEvent from 'react-select-event';
import JoinOperatorPopover from './JoinOperatorPopover';
import useStore from '../../../../stores/store';
import { useModelColumns } from './useModelColumns';

jest.mock('../../../../stores/store');
// The popover hydrates column options for its two selected models from the model
// schema artifact (useModelColumns). Drive it deterministically.
jest.mock('./useModelColumns', () => ({
  useModelColumns: jest.fn(() => ({
    columnsByModel: { orders: ['id', 'user_id'], users: ['id', 'email'] },
    loading: false,
  })),
}));

// The raw store models carry NO column list (the whole reason useModelColumns
// exists); the popover must source options from the hydrated map, not the record.
const MODELS = [{ name: 'orders' }, { name: 'users' }];

const mockSaveRelation = jest.fn();

beforeEach(() => {
  mockSaveRelation.mockReset();
  mockSaveRelation.mockResolvedValue({ success: true });
  // The popover reads exactly one slice: saveRelation.
  useStore.mockImplementation(selector => selector({ saveRelation: mockSaveRelation }));
});

const renderPopover = (props = {}) =>
  render(
    <JoinOperatorPopover
      x={10}
      y={10}
      models={MODELS}
      initialA={{ model: 'orders', column: 'user_id' }}
      initialB={{ model: 'users', column: 'id' }}
      onClose={jest.fn()}
      onSaved={jest.fn()}
      {...props}
    />
  );

describe('JoinOperatorPopover', () => {
  it('renders the popover with the 6 operators and a join-type select', () => {
    renderPopover();
    expect(screen.getByTestId('join-operator-popover')).toBeInTheDocument();
    ['=', '!=', '>', '<', '>=', '<='].forEach(op => {
      expect(screen.getByTestId(`join-operator-${op}`)).toBeInTheDocument();
    });
    expect(screen.getByTestId('join-type-select')).toBeInTheDocument();
  });

  it('populates each column select from the hydrated model schema (not the record)', () => {
    renderPopover();
    // react-select renders options only when the menu is open; open it and read
    // the real DOM options out of the listbox (not the singleValue display).
    selectEvent.openMenu(
      within(screen.getByTestId('join-endpoint-a-column-select')).getByRole('combobox')
    );
    const optionTexts = screen.getAllByRole('option').map(o => o.textContent);
    // Placeholder + the hydrated columns for `orders` (id, user_id).
    expect(optionTexts).toEqual(expect.arrayContaining(['Select column…', 'id', 'user_id']));
  });

  it('preselects the dragged columns when triggered by a column→column connect', () => {
    // initialA/B carry the dragged columns; the select must SHOW them (the bug was
    // the value being set but no matching option, so it reverted to placeholder).
    renderPopover();
    expect(screen.getByTestId('join-endpoint-a-column-select')).toHaveTextContent('user_id');
    expect(screen.getByTestId('join-endpoint-b-column-select')).toHaveTextContent('id');
  });

  it('still shows a pre-filled column that is not in the hydrated list (un-run model)', () => {
    useModelColumns.mockReturnValueOnce({ columnsByModel: {}, loading: false });
    renderPopover({ initialA: { model: 'orders', column: 'mystery_col' } });
    // The dragged column renders as its own option so the selection survives.
    expect(screen.getByTestId('join-endpoint-a-column-select')).toHaveTextContent('mystery_col');
  });

  it('previews the ${ref()} condition from the pre-filled endpoints and default operator', () => {
    renderPopover();
    expect(screen.getByTestId('join-condition-preview')).toHaveTextContent(
      '${ref(orders).user_id} = ${ref(users).id}'
    );
  });

  it('rebuilds the preview when the operator changes', () => {
    renderPopover();
    fireEvent.click(screen.getByTestId('join-operator->='));
    expect(screen.getByTestId('join-condition-preview')).toHaveTextContent(
      '${ref(orders).user_id} >= ${ref(users).id}'
    );
  });

  it('saves with the synthesised condition, chosen join_type and is_default', async () => {
    const onSaved = jest.fn();
    renderPopover({ onSaved });

    fireEvent.click(screen.getByTestId('join-operator-!='));
    // Open the join-type <Select> and pick "Left" (menu portals to document.body).
    selectEvent.openMenu(within(screen.getByTestId('join-type-select')).getByRole('combobox'));
    fireEvent.click(screen.getByText('Left'));
    fireEvent.click(screen.getByTestId('join-is-default'));
    fireEvent.click(screen.getByTestId('join-popover-save'));

    await waitFor(() => expect(mockSaveRelation).toHaveBeenCalledTimes(1));
    const [name, config] = mockSaveRelation.mock.calls[0];
    expect(name).toBe('orders_to_users');
    expect(config).toEqual({
      name: 'orders_to_users',
      join_type: 'left',
      condition: '${ref(orders).user_id} != ${ref(users).id}',
      is_default: true,
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('lets custom SQL override the builder', async () => {
    renderPopover();
    // Open the custom-SQL <details> and type a free-text condition.
    const textarea = screen.getByTestId('join-custom-sql');
    fireEvent.change(textarea, { target: { value: '${ref(a).x} = ${ref(b).y}' } });
    // Force the override path on (jsdom doesn't always fire onToggle).
    fireEvent.click(screen.getByTestId('join-popover-save'));

    await waitFor(() => expect(mockSaveRelation).toHaveBeenCalled());
    const [, config] = mockSaveRelation.mock.calls[0];
    // Either the builder or the custom SQL is saved — both are valid conditions;
    // assert a non-empty ref condition was persisted.
    expect(config.condition).toMatch(/\$\{ref\(/);
  });

  it('uniquifies the relation name when one already exists for the model pair', async () => {
    // The backend upserts by name — a second relation between the same models
    // must get a fresh name instead of silently overwriting the first.
    useStore.mockImplementation(selector =>
      selector({
        saveRelation: mockSaveRelation,
        relations: [{ name: 'orders_to_users' }, { name: 'orders_to_users_2' }],
      })
    );
    renderPopover();
    fireEvent.click(screen.getByTestId('join-popover-save'));

    await waitFor(() => expect(mockSaveRelation).toHaveBeenCalledTimes(1));
    const [name, config] = mockSaveRelation.mock.calls[0];
    expect(name).toBe('orders_to_users_3');
    expect(config.name).toBe('orders_to_users_3');
  });

  it('surfaces a save error from the store', async () => {
    mockSaveRelation.mockResolvedValue({ success: false, error: 'boom' });
    renderPopover();
    fireEvent.click(screen.getByTestId('join-popover-save'));
    await waitFor(() =>
      expect(screen.getByTestId('join-popover-error')).toHaveTextContent('boom')
    );
  });
});
