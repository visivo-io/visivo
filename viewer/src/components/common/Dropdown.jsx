import React, { useState } from 'react';

/**
 * Reusable dropdown / popover for the top bar.
 *
 * A trigger plus a floating panel rendered absolutely below it; a fixed
 * transparent backdrop catches outside clicks. Ported from the "Tabs In Core"
 * design handoff (shared.jsx `Dropdown`).
 *
 * `trigger` and `children` may each be a node or a render function. When
 * `children` is a function it receives a `close` callback so menu rows can
 * dismiss the panel after a selection.
 */
export default function Dropdown({
  trigger,
  children,
  width = 260,
  align = 'left',
  panelStyle,
  onToggle,
}) {
  const [open, setOpen] = useState(false);
  const set = value => {
    setOpen(value);
    if (onToggle) onToggle(value);
  };

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <div onClick={() => set(!open)} style={{ display: 'inline-flex' }}>
        {typeof trigger === 'function' ? trigger(open) : trigger}
      </div>
      {open && (
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
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '0.5rem',
              boxShadow:
                '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)',
              overflow: 'hidden',
              ...panelStyle,
            }}
          >
            {typeof children === 'function' ? children(() => set(false)) : children}
          </div>
        </>
      )}
    </div>
  );
}
