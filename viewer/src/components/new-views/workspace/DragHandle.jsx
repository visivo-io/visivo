import React from 'react';

/**
 * DragHandle — rail-resize gutter visual.
 *
 * 4 px hot zone (the outer `w-1` band), 1 px gray line in the middle,
 * mulberry on hover/active. When `active` is true a navy width tooltip
 * surfaces the current width (used by the s5 artboard "rail resize, drag
 * active" state).
 *
 * Phase 0 ships the visual only — actual pointer-drag resize behaviour is
 * deferred. Hooking up the resize is straightforward (pointermove diffing
 * against `onDragWidthChange`) and lands when the rails grow editable
 * content that needs the user-controllable width.
 */
const DragHandle = ({
  side = 'left',
  active = false,
  widthLabel = null,
  onPointerDown,
  testId = 'workspace-drag-handle',
}) => {
  const base =
    'group relative h-full w-1 shrink-0 cursor-col-resize select-none';
  const tone = active
    ? 'bg-[#713b57]/30'
    : 'bg-transparent hover:bg-[#713b57]/15';
  const lineBase =
    'pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2';
  const lineTone = active
    ? 'bg-[#713b57]'
    : 'bg-gray-200 group-hover:bg-[#713b57]';

  return (
    <div
      data-testid={`${testId}-${side}`}
      role="separator"
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
      className={`${base} ${tone}`}
    >
      <div className={`${lineBase} ${lineTone}`} />
      {active && widthLabel && (
        <div
          className={[
            'pointer-events-none absolute top-1/2 z-10 -translate-y-1/2 whitespace-nowrap rounded-md bg-[#191d33] px-2 py-1 text-[11px] font-medium text-white shadow-md',
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
