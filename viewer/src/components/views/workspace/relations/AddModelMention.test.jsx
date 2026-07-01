import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AddModelMention from './AddModelMention';

const MODELS = [{ name: 'orders' }, { name: 'users' }, { name: 'events' }];

describe('AddModelMention', () => {
  it('filters models by the typed query and calls onAdd on selection', () => {
    const onAdd = jest.fn();
    render(<AddModelMention models={MODELS} onAdd={onAdd} />);

    const input = screen.getByTestId('erd-add-model-input');
    fireEvent.change(input, { target: { value: 'use' } });

    expect(screen.getByTestId('erd-add-model-option-users')).toBeInTheDocument();
    expect(screen.queryByTestId('erd-add-model-option-orders')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('erd-add-model-option-users'));
    expect(onAdd).toHaveBeenCalledWith('users');
  });

  it('excludes models already on the canvas', () => {
    render(<AddModelMention models={MODELS} excludeNames={['orders']} onAdd={jest.fn()} />);
    fireEvent.focus(screen.getByTestId('erd-add-model-input'));

    expect(screen.queryByTestId('erd-add-model-option-orders')).not.toBeInTheDocument();
    expect(screen.getByTestId('erd-add-model-option-users')).toBeInTheDocument();
  });

  it('shows an empty hint when no models remain to add', () => {
    render(<AddModelMention models={MODELS} excludeNames={['orders', 'users', 'events']} onAdd={jest.fn()} />);
    fireEvent.focus(screen.getByTestId('erd-add-model-input'));
    expect(screen.getByTestId('erd-add-model-empty')).toBeInTheDocument();
  });
});
