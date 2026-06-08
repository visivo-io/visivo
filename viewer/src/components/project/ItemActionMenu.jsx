import React, { useEffect, useRef } from 'react';
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
 * ### Open/hover state is CONTROLLED by the parent (ProjectViewFlipLayer)
 *
 * The kebab lives in an overlay that is a *sibling* of the dashboard render root,
 * so moving the cursor onto it fires the root's `pointerleave` and clears the
 * slot-hover. If `open` lived here, the component would unmount mid-interaction
 * and the dropdown could never be reached. So the parent owns `open` (via
 * `openKey`) and is told when the kebab is hovered (`onHover`) — it keeps this
 * menu mounted while the kebab is hovered OR the menu is open. This component is
 * purely presentational + reports intent up.
 *
 * Behavior: click toggles (`onToggle`); outside-click / Escape / selecting a
 * non-`keepOpen` action closes (`onClose`). Honors `prefers-reduced-motion`.
 */

const MULBERRY = '#713b57';
const MENU_BORDER = '#c6b0bb';

const ItemActionMenu = ({
  box,
  itemKey,
  actions = [],
  reducedMotion = false,
  open = false,
  onToggle,
  onClose,
  onHover,
}) => {
  const rootRef = useRef(null);

  // Close on outside-click / Escape while open. (Clicks INSIDE the menu are
  // swallowed below so they don't self-close.)
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = e => {
      if (rootRef.current && !rootRef.current.contains(e.target)) onClose?.();
    };
    const onKey = e => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!box) return null;

  const handleSelect = action => () => {
    if (action.onSelect) action.onSelect();
    if (!action.keepOpen) onClose?.();
  };

  return (
    <div
      ref={rootRef}
      data-testid={`view-item-menu-wrap-${itemKey}`}
      className="pointer-events-auto absolute z-30"
      style={{ top: box.top + 4, left: box.left + box.width - 28 }}
      // Keep this menu mounted while the cursor is over the kebab/dropdown — the
      // slot-hover that spawned it clears the moment the cursor leaves the chart
      // body, so without this the kebab would vanish as you reach for it.
      onPointerEnter={() => onHover?.(true)}
      onPointerLeave={() => onHover?.(false)}
      // Swallow pointerdown/mousedown so an open flip card's outside-close and
      // this menu's own outside-close don't fire when interacting with the menu.
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
        onClick={() => onToggle?.()}
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
                  onClick={handleSelect(action)}
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
