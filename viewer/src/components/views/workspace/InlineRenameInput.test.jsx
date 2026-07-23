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

  // The commit/cancel buttons preventDefault on mousedown so clicking them
  // never blurs the input first — a real click is mousedown-then-mouseup,
  // and a real browser would blur the still-focused input on mousedown
  // (firing onBlur's own commit()) before the button's click handler ever
  // ran, double-committing (or committing-then-cancelling) the rename.
  // `dispatchEvent`/RTL's `fireEvent` return `false` when a cancelable event
  // (mousedown is, by default) was preventDefault()'d — assert that
  // directly rather than the harder-to-observe emergent focus behavior.
  test('the check button preventDefaults on mousedown so it never blurs the input first', () => {
    render(<InlineRenameInput name="Scratch" onCommit={jest.fn()} onCancel={jest.fn()} />);
    const notCancelled = fireEvent.mouseDown(screen.getByTestId('inline-rename-commit'));
    expect(notCancelled).toBe(false);
  });

  test('the cancel button preventDefaults on mousedown so it never blurs the input first', () => {
    render(<InlineRenameInput name="Scratch" onCommit={jest.fn()} onCancel={jest.fn()} />);
    const notCancelled = fireEvent.mouseDown(screen.getByTestId('inline-rename-cancel'));
    expect(notCancelled).toBe(false);
  });

  test('an ordinary keystroke neither commits nor cancels, but still never bubbles to an ancestor keydown handler', () => {
    const onCommit = jest.fn();
    const onCancel = jest.fn();
    const ancestorKeyDown = jest.fn();
    render(
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions
      <div onKeyDown={ancestorKeyDown}>
        <InlineRenameInput name="Scratch" onCommit={onCommit} onCancel={onCancel} />
      </div>
    );
    fireEvent.keyDown(screen.getByTestId('inline-rename-input'), { key: 'a' });
    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(ancestorKeyDown).not.toHaveBeenCalled();
  });

  test('clicking the input itself never bubbles to an ancestor click handler (ExplorationCard whole-card click guard)', () => {
    const ancestorClick = jest.fn();
    render(
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
      <div onClick={ancestorClick}>
        <InlineRenameInput name="Scratch" onCommit={jest.fn()} onCancel={jest.fn()} />
      </div>
    );
    fireEvent.click(screen.getByTestId('inline-rename-input'));
    expect(ancestorClick).not.toHaveBeenCalled();
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
