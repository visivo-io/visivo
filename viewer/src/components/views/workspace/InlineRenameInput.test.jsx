import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import InlineRenameInput from './InlineRenameInput';

describe('InlineRenameInput', () => {
  test('pre-fills the current name and focuses/selects it', () => {
    render(<InlineRenameInput name="Scratch" onCommit={jest.fn()} onCancel={jest.fn()} />);
    const input = screen.getByTestId('inline-rename-input');
    expect(input).toHaveValue('Scratch');
    expect(input).toHaveFocus();
  });

  test('Enter commits a changed, non-blank value', () => {
    const onCommit = jest.fn();
    render(<InlineRenameInput name="Scratch" onCommit={onCommit} onCancel={jest.fn()} />);
    const input = screen.getByTestId('inline-rename-input');
    fireEvent.change(input, { target: { value: 'Churn dig' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('Churn dig');
  });

  test('the check button commits', () => {
    const onCommit = jest.fn();
    render(<InlineRenameInput name="Scratch" onCommit={onCommit} onCancel={jest.fn()} />);
    fireEvent.change(screen.getByTestId('inline-rename-input'), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByTestId('inline-rename-commit'));
    expect(onCommit).toHaveBeenCalledWith('Renamed');
  });

  test('Escape cancels without committing', () => {
    const onCommit = jest.fn();
    const onCancel = jest.fn();
    render(<InlineRenameInput name="Scratch" onCommit={onCommit} onCancel={onCancel} />);
    const input = screen.getByTestId('inline-rename-input');
    fireEvent.change(input, { target: { value: 'Should not save' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  test('the X button cancels without committing', () => {
    const onCommit = jest.fn();
    const onCancel = jest.fn();
    render(<InlineRenameInput name="Scratch" onCommit={onCommit} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId('inline-rename-cancel'));
    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  test('committing an unchanged value cancels instead (no-op rename)', () => {
    const onCommit = jest.fn();
    const onCancel = jest.fn();
    render(<InlineRenameInput name="Scratch" onCommit={onCommit} onCancel={onCancel} />);
    const input = screen.getByTestId('inline-rename-input');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  test('committing a blank value cancels instead', () => {
    const onCommit = jest.fn();
    const onCancel = jest.fn();
    render(<InlineRenameInput name="Scratch" onCommit={onCommit} onCancel={onCancel} />);
    const input = screen.getByTestId('inline-rename-input');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  test('blur commits (matching Enter behavior)', () => {
    const onCommit = jest.fn();
    render(<InlineRenameInput name="Scratch" onCommit={onCommit} onCancel={jest.fn()} />);
    const input = screen.getByTestId('inline-rename-input');
    fireEvent.change(input, { target: { value: 'Via blur' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith('Via blur');
  });

  test('a custom testIdPrefix namespaces every element', () => {
    render(
      <InlineRenameInput
        name="Scratch"
        onCommit={jest.fn()}
        onCancel={jest.fn()}
        testIdPrefix="card-rename"
      />
    );
    expect(screen.getByTestId('card-rename-input')).toBeInTheDocument();
    expect(screen.getByTestId('card-rename-commit')).toBeInTheDocument();
    expect(screen.getByTestId('card-rename-cancel')).toBeInTheDocument();
  });
});
