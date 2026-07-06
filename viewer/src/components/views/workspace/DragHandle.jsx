import React, { useCallback, useEffect } from 'react';
import useStore from '../../../stores/store';

/**
 * DragHandle — rail-resize gutter.
 *
 * 4 px hot zone (the outer `w-1` band), 1 px gray line in the middle,
 * mulberry on hover/active. Pointer-drag resizes the rail:
 *
 *   - `pointerdown` flags `workspaceResizing` for this side.
 *   - A document-level `pointermove` listener updates the rail width via
 *     the store action (clamped to [240, 480] for the left rail and
 *     [280, 560] for the right).
 *   - `pointerup` clears the flag.
 *
 * When `active`, a navy width tooltip surfaces the current width (matches
 * the s5 artboard's "rail resize, drag active" state in the B-1 design).
 */
const DragHandle = ({ side = 'left', testId = 'workspace-drag-handle' }) => {
  // Resize state lives in the workspace store — no prop-drilling.
  const resizing = useStore(s => s.workspaceResizing);
  const leftWidth = useStore(s => s.workspaceLeftWidth);
  const rightWidth = useStore(s => s.workspaceRightWidth);
  const setWorkspaceResizing = useStore(s => s.setWorkspaceResizing);
  const setLeftWidth = useStore(s => s.setWorkspaceLeftWidth);
  const setRightWidth = useStore(s => s.setWorkspaceRightWidth);

  const active = resizing === side;
  const widthLabel = active
    ? `${side === 'left' ? leftWidth : rightWidth}px`
    : null;

  const handlePointerDown = useCallback(
    e => {
      e.preventDefault();
      setWorkspaceResizing(side);
    },
    [side, setWorkspaceResizing]
  );

  useEffect(() => {
    if (!active) return undefined;
    const handlePointerMove = e => {
      if (side === 'left') {
        setLeftWidth(e.clientX);
      } else {
        setRightWidth(window.innerWidth - e.clientX);
      }
    };
    const handlePointerUp = () => setWorkspaceResizing(null);
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    // Suppress text selection during the drag.
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.body.style.userSelect = prevUserSelect;
    };
  }, [active, side, setLeftWidth, setRightWidth, setWorkspaceResizing]);

  const base =
    'group relative h-full w-1 shrink-0 cursor-col-resize select-none';
  const tone = active
    ? 'bg-primary/30'
    : 'bg-transparent hover:bg-primary/15';
  const lineBase =
    'pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2';
  const lineTone = active
    ? 'bg-primary'
    : 'bg-gray-200 group-hover:bg-primary';

  return (
    <div
      data-testid={`${testId}-${side}`}
      role="separator"
      aria-orientation="vertical"
      onPointerDown={handlePointerDown}
      className={`${base} ${tone}`}
    >
      <div className={`${lineBase} ${lineTone}`} />
      {active && widthLabel && (
        <div
          className={[
            'pointer-events-none absolute top-1/2 z-10 -translate-y-1/2 whitespace-nowrap rounded-md bg-dark px-2 py-1 text-[11px] font-medium text-white shadow-md',
            side === 'left' ? 'left-3' : 'right-3',
          ].join(' ')}
        >
          {widthLabel}
        </div>
      )}
    </div>
  );
};

export default DragHandle;
