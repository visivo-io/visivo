/**
 * DragHandle — the rail-resize gutter (B-1).
 *
 * Pointer-drag resizes the rail through the REAL workspace store actions
 * (`setWorkspaceLeftWidth` / `setWorkspaceRightWidth` clamp internally), a navy
 * width tooltip surfaces the live width while dragging, and text selection is
 * suppressed for the duration of the gesture.
 */
import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import DragHandle from './DragHandle';
import useStore from '../../../stores/store';

// Document-level pointer events: jsdom's PointerEvent lacks clientX/clientY, so
// dispatch MouseEvents under the pointer* type names (the CanvasResizeLayer
// pattern) — the component's listeners only read `clientX`.
const firePointer = (type, coords = {}) => {
  act(() => {
    document.dispatchEvent(
      new MouseEvent(type, { bubbles: true, cancelable: true, ...coords })
    );
  });
};

const resetStore = (overrides = {}) => {
  act(() => {
    useStore.setState({
      workspaceResizing: null,
      workspaceLeftWidth: 320,
      workspaceRightWidth: 400,
      ...overrides,
    });
  });
};

afterEach(() => {
  resetStore();
  document.body.style.userSelect = '';
});

describe('DragHandle (rail resize)', () => {
  test('renders a vertical separator with no width tooltip when idle', () => {
    resetStore();
    render(<DragHandle side="left" />);
    const handle = screen.getByTestId('workspace-drag-handle-left');
    expect(handle).toHaveAttribute('role', 'separator');
    expect(handle).toHaveAttribute('aria-orientation', 'vertical');
    expect(screen.queryByText(/px$/)).not.toBeInTheDocument();
  });

  test('pointerdown starts the left resize and surfaces the width tooltip', () => {
    resetStore();
    render(<DragHandle side="left" />);
    fireEvent.pointerDown(screen.getByTestId('workspace-drag-handle-left'));
    expect(useStore.getState().workspaceResizing).toBe('left');
    expect(screen.getByText('320px')).toBeInTheDocument();
  });

  test('dragging updates the left rail width live (store-clamped) and the tooltip follows', () => {
    resetStore();
    render(<DragHandle side="left" />);
    fireEvent.pointerDown(screen.getByTestId('workspace-drag-handle-left'));

    firePointer('pointermove', { clientX: 350 });
    expect(useStore.getState().workspaceLeftWidth).toBe(350);
    expect(screen.getByText('350px')).toBeInTheDocument();

    // The store clamps to [240, 480] — a wild drag can't collapse the rail.
    firePointer('pointermove', { clientX: 10 });
    expect(useStore.getState().workspaceLeftWidth).toBe(240);
    firePointer('pointermove', { clientX: 4000 });
    expect(useStore.getState().workspaceLeftWidth).toBe(480);
  });

  test('the right handle resizes from the window right edge', () => {
    resetStore();
    render(<DragHandle side="right" />);
    fireEvent.pointerDown(screen.getByTestId('workspace-drag-handle-right'));
    expect(useStore.getState().workspaceResizing).toBe('right');

    firePointer('pointermove', { clientX: window.innerWidth - 300 });
    expect(useStore.getState().workspaceRightWidth).toBe(300);
    expect(screen.getByText('300px')).toBeInTheDocument();
  });

  test('pointerup ends the drag: flag cleared, tooltip gone, width kept', () => {
    resetStore();
    render(<DragHandle side="left" />);
    fireEvent.pointerDown(screen.getByTestId('workspace-drag-handle-left'));
    firePointer('pointermove', { clientX: 400 });
    firePointer('pointerup');

    expect(useStore.getState().workspaceResizing).toBeNull();
    expect(useStore.getState().workspaceLeftWidth).toBe(400);
    expect(screen.queryByText('400px')).not.toBeInTheDocument();
  });

  test('suppresses text selection during the drag and restores it after', () => {
    resetStore();
    document.body.style.userSelect = 'auto';
    render(<DragHandle side="left" />);
    fireEvent.pointerDown(screen.getByTestId('workspace-drag-handle-left'));
    expect(document.body.style.userSelect).toBe('none');
    firePointer('pointerup');
    expect(document.body.style.userSelect).toBe('auto');
  });

  test('an idle handle ignores document pointermoves (no width writes)', () => {
    resetStore();
    render(<DragHandle side="left" />);
    firePointer('pointermove', { clientX: 260 });
    expect(useStore.getState().workspaceLeftWidth).toBe(320);
  });

  test('only the handle matching the resizing side reacts to moves', () => {
    // The RIGHT handle is flagged active; the LEFT handle must stay inert.
    resetStore({ workspaceResizing: 'right' });
    render(<DragHandle side="left" />);
    firePointer('pointermove', { clientX: 260 });
    expect(useStore.getState().workspaceLeftWidth).toBe(320);
    expect(screen.queryByText(/px$/)).not.toBeInTheDocument();
  });
});
