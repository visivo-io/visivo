import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
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

  it('Escape closes the open list and keeps focus in the input', () => {
    render(<AddModelMention models={MODELS} onAdd={jest.fn()} />);
    const input = screen.getByTestId('erd-add-model-input');
    act(() => input.focus());
    expect(screen.getByTestId('erd-add-model-options')).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByTestId('erd-add-model-options')).not.toBeInTheDocument();
    expect(input).toHaveFocus();
  });

  it('Escape from a focused option closes the list and returns focus to the input', () => {
    render(<AddModelMention models={MODELS} onAdd={jest.fn()} />);
    act(() => screen.getByTestId('erd-add-model-input').focus());
    const option = screen.getByTestId('erd-add-model-option-users');
    act(() => option.focus());
    fireEvent.keyDown(option, { key: 'Escape' });
    expect(screen.queryByTestId('erd-add-model-options')).not.toBeInTheDocument();
    expect(screen.getByTestId('erd-add-model-input')).toHaveFocus();
  });

  it('typing after Escape reopens the list', () => {
    render(<AddModelMention models={MODELS} onAdd={jest.fn()} />);
    const input = screen.getByTestId('erd-add-model-input');
    act(() => input.focus());
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.change(input, { target: { value: 'ord' } });
    expect(screen.getByTestId('erd-add-model-option-orders')).toBeInTheDocument();
  });

  it('a pointerdown outside closes the list; one inside keeps it open', () => {
    render(<AddModelMention models={MODELS} onAdd={jest.fn()} />);
    fireEvent.focus(screen.getByTestId('erd-add-model-input'));
    fireEvent.pointerDown(screen.getByTestId('erd-add-model-option-users'));
    expect(screen.getByTestId('erd-add-model-options')).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByTestId('erd-add-model-options')).not.toBeInTheDocument();
  });

  it('picking a model without an onAdd handler just closes the list', () => {
    render(<AddModelMention models={MODELS} />);
    fireEvent.focus(screen.getByTestId('erd-add-model-input'));
    fireEvent.click(screen.getByTestId('erd-add-model-option-events'));
    expect(screen.queryByTestId('erd-add-model-options')).not.toBeInTheDocument();
  });
});
