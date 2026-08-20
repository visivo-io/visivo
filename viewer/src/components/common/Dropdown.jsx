import React, { useState, useRef, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

/**
 * Reusable dropdown / popover for the top bar.
 *
 * A trigger plus a floating panel rendered below it; a fixed transparent
 * backdrop catches outside clicks. Ported from the "Tabs In Core" design
 * handoff (shared.jsx `Dropdown`).
 *
 * `trigger` and `children` may each be a node or a render function. When
 * `children` is a function it receives a `close` callback so menu rows can
 * dismiss the panel after a selection.
 *
 * `portal` (VIS-1228): render the panel into `document.body` with FIXED
 * coordinates measured from the trigger, instead of `absolute`-positioning it
 * inside the trigger's own box. Use this whenever the trigger sits inside a
 * scroll/overflow container — e.g. the query-chip strip's `overflow-x-auto`,
 * which the CSS spec forces to compute `overflow-y: auto` too, so an in-flow
 * `absolute` panel dropping below the strip is clipped out of sight (the menu
 * "does nothing" because it renders where nothing is visible). A portaled
 * panel escapes every ancestor's overflow (and any transformed ancestor that
 * would otherwise trap `fixed`), and re-measures on scroll/resize while open.
 */
export default function Dropdown({
  trigger,
  children,
  width = 260,
  align = 'left',
  panelStyle,
  onToggle,
  portal = false,
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const [fixedPos, setFixedPos] = useState(null);

  const set = value => {
    setOpen(value);
    if (onToggle) onToggle(value);
  };

  const reposition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const next = { position: 'fixed', top: rect.bottom + 7, zIndex: 90, width };
    // Mirror the in-flow `[align]: 0` anchoring: left-align to the trigger's
    // left edge, right-align to its right edge.
    if (align === 'right') next.left = Math.max(4, rect.right - width);
    else next.left = rect.left;
    setFixedPos(next);
  }, [align, width]);

  useLayoutEffect(() => {
    if (!portal || !open) return;
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [portal, open, reposition]);

  // The panel's visual box — shared by the in-flow and portaled paths so the
  // two render identically apart from their positioning.
  const panelBoxStyle = {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '0.5rem',
    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)',
    overflow: 'hidden',
    ...panelStyle,
  };

  const panelContent = typeof children === 'function' ? children(() => set(false)) : children;

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <div ref={triggerRef} onClick={() => set(!open)} style={{ display: 'inline-flex' }}>
        {typeof trigger === 'function' ? trigger(open) : trigger}
      </div>

      {open && !portal && (
        <>
          <div onClick={() => set(false)} style={{ position: 'fixed', inset: 0, zIndex: 80 }} />
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: 'calc(100% + 7px)',
              [align]: 0,
              width,
              zIndex: 90,
              ...panelBoxStyle,
            }}
          >
            {panelContent}
          </div>
        </>
      )}

      {open &&
        portal &&
        fixedPos &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <div onClick={() => set(false)} style={{ position: 'fixed', inset: 0, zIndex: 80 }} />
            <div onClick={e => e.stopPropagation()} style={{ ...fixedPos, ...panelBoxStyle }}>
              {panelContent}
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
