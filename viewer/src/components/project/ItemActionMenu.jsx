import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PiDotsThreeVertical } from 'react-icons/pi';

/**
 * ItemActionMenu — VIEW-mode consolidated item-action kebab (⋮).
 *
 * Replaces the standalone view-mode flip button. Every per-item View-mode action
 * (Copy link, Flip to lineage, …) lives in ONE small dropdown opened from a
 * mulberry (`#713b57`) kebab anchored to the slot's top-right corner. The action
 * list is supplied as a DATA ARRAY (`actions`), so adding a future action is a
 * one-line addition at the call site — no JSX surgery here.
 *
 * Each action entry: `{ id, label, icon, onSelect, active?, keepOpen? }`.
 *   - `icon`   — a Phosphor (or any) icon component.
 *   - `active` — optional; renders the entry in the mulberry "on" tone (used by
 *                Flip → "Hide lineage" while a card is open).
 *   - `keepOpen` — if true, selecting the action does NOT close the menu.
 *
 * Behavior: opens on click, stays open, closes on outside-click / Escape / after
 * an action (unless `keepOpen`). Honors `prefers-reduced-motion` via `reducedMotion`.
 */

const MULBERRY = '#713b57';
const MENU_BORDER = '#c6b0bb';

const ItemActionMenu = ({ box, itemKey, actions = [], reducedMotion = false }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const close = useCallback(() => setOpen(false), []);

  // Close on outside-click / Escape while open.
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = e => {
      if (rootRef.current && !rootRef.current.contains(e.target)) close();
    };
    const onKey = e => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  if (!box) return null;

  const onSelect = action => () => {
    if (action.onSelect) action.onSelect();
    if (!action.keepOpen) close();
  };

  return (
    <div
      ref={rootRef}
      className="pointer-events-auto absolute z-30"
      style={{ top: box.top + 4, left: box.left + box.width - 28 }}
      // Swallow pointerdown so an open flip card's outside-mousedown-close
      // doesn't fight the menu (matches the old standalone flip button).
      onPointerDown={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      <button
        type="button"
        data-testid={`view-item-menu-${itemKey}`}
        data-item-menu="true"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Item actions"
        title="Item actions"
        onClick={() => setOpen(o => !o)}
        className={[
          'inline-flex h-6 w-6 items-center justify-center rounded-md border bg-white/95 shadow-sm',
          reducedMotion ? '' : 'transition-colors duration-150',
        ].join(' ')}
        style={{ borderColor: MENU_BORDER, color: MULBERRY }}
      >
        <PiDotsThreeVertical className="h-4 w-4" />
      </button>

      {open && (
        <ul
          role="menu"
          data-testid={`view-item-menu-list-${itemKey}`}
          className="absolute right-0 top-7 z-40 min-w-[10rem] overflow-hidden rounded-md border bg-white py-1 shadow-lg"
          style={{ borderColor: MENU_BORDER }}
        >
          {actions.map(action => {
            const Icon = action.icon;
            return (
              <li key={action.id} role="none">
                <button
                  type="button"
                  role="menuitem"
                  data-testid={`view-item-action-${action.id}-${itemKey}`}
                  onClick={onSelect(action)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                  style={action.active ? { color: MULBERRY } : undefined}
                >
                  {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
                  <span className="truncate">{action.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default ItemActionMenu;
