import React, { useState } from 'react';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import useEscapeToClose from './useEscapeToClose';

const pressEscape = (target = document) => {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
};

const Layer = ({ name, children, onClose }) => {
  const [open, setOpen] = useState(true);
  useEscapeToClose(open, event => {
    onClose?.(name, event);
    setOpen(false);
  });
  if (!open) return null;
  return (
    <div data-testid={name}>
      {name}
      {children}
    </div>
  );
};

describe('useEscapeToClose', () => {
  it('calls onClose with the event and marks it handled', () => {
    const onClose = jest.fn();
    renderHook(() => useEscapeToClose(true, onClose));
    const event = pressEscape();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('does nothing while closed', () => {
    const onClose = jest.fn();
    renderHook(() => useEscapeToClose(false, onClose));
    const event = pressEscape();
    expect(onClose).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('ignores keys other than Escape', () => {
    const onClose = jest.fn();
    renderHook(() => useEscapeToClose(true, onClose));
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes nested layers one per keypress, top first', () => {
    const onClose = jest.fn();
    const Nested = () => {
      const [inner, setInner] = useState(false);
      return (
        <Layer name="modal" onClose={onClose}>
          <button onClick={() => setInner(true)}>open menu</button>
          {inner && <Layer name="menu" onClose={onClose} />}
        </Layer>
      );
    };
    render(<Nested />);
    fireEvent.click(screen.getByText('open menu'));
    expect(screen.getByTestId('menu')).toBeInTheDocument();

    pressEscape();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenLastCalledWith('menu', expect.any(KeyboardEvent));
    expect(screen.queryByTestId('menu')).not.toBeInTheDocument();
    expect(screen.getByTestId('modal')).toBeInTheDocument();

    pressEscape();
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenLastCalledWith('modal', expect.any(KeyboardEvent));
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('a layer that closes on its own hands Escape back to the one under it', () => {
    const first = jest.fn();
    const second = jest.fn();
    renderHook(() => useEscapeToClose(true, first));
    const { rerender } = renderHook(({ open }) => useEscapeToClose(open, second), {
      initialProps: { open: true },
    });
    rerender({ open: false });
    pressEscape();
    expect(second).not.toHaveBeenCalled();
    expect(first).toHaveBeenCalledTimes(1);
  });

  it('leaves the layer open when an element already handled Escape', () => {
    const onClose = jest.fn();
    renderHook(() => useEscapeToClose(true, onClose));
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.addEventListener('keydown', e => e.preventDefault());
    pressEscape(input);
    expect(onClose).not.toHaveBeenCalled();
    input.remove();
  });

  it('calls the latest onClose without re-registering', () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = renderHook(({ cb }) => useEscapeToClose(true, cb), {
      initialProps: { cb: first },
    });
    rerender({ cb: second });
    pressEscape();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('adds one document listener for many layers and removes it when the stack empties', () => {
    const add = jest.spyOn(document, 'addEventListener');
    const remove = jest.spyOn(document, 'removeEventListener');
    const keydownCalls = spy => spy.mock.calls.filter(([type]) => type === 'keydown').length;
    const { unmount: unmountFirst } = renderHook(() => useEscapeToClose(true, jest.fn()));
    const { unmount: unmountSecond } = renderHook(() => useEscapeToClose(true, jest.fn()));
    expect(keydownCalls(add)).toBe(1);
    unmountFirst();
    expect(keydownCalls(remove)).toBe(0);
    unmountSecond();
    expect(keydownCalls(remove)).toBe(1);
    add.mockRestore();
    remove.mockRestore();
  });

  it('unmounting while open removes the layer', () => {
    const onClose = jest.fn();
    const { unmount } = renderHook(() => useEscapeToClose(true, onClose));
    unmount();
    const event = pressEscape();
    expect(onClose).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('unmounting a lower layer keeps the top layer on top', () => {
    const lower = jest.fn();
    const upper = jest.fn();
    const { unmount: unmountLower } = renderHook(() => useEscapeToClose(true, lower));
    renderHook(() => useEscapeToClose(true, upper));
    unmountLower();
    pressEscape();
    expect(lower).not.toHaveBeenCalled();
    expect(upper).toHaveBeenCalledTimes(1);
  });

  it('tolerates a missing onClose', () => {
    renderHook(() => useEscapeToClose(true, undefined));
    const event = pressEscape();
    expect(event.defaultPrevented).toBe(true);
  });
});
