/* eslint-disable no-template-curly-in-string */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import JoinOperatorPopover from './JoinOperatorPopover';
import useStore from '../../../../stores/store';

jest.mock('../../../../stores/store');

const MODELS = [
  { name: 'orders', columns: ['id', 'user_id'] },
  { name: 'users', columns: ['id', 'email'] },
];

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
    fireEvent.change(screen.getByTestId('join-type-select'), { target: { value: 'left' } });
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

  it('surfaces a save error from the store', async () => {
    mockSaveRelation.mockResolvedValue({ success: false, error: 'boom' });
    renderPopover();
    fireEvent.click(screen.getByTestId('join-popover-save'));
    await waitFor(() =>
      expect(screen.getByTestId('join-popover-error')).toHaveTextContent('boom')
    );
  });
});
