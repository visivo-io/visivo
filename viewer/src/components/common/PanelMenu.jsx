import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PiDotsThreeVertical } from 'react-icons/pi';

/**
 * PanelMenu — VIS-1224. A reusable "⋮" (vertical dots) overflow menu for a
 * panel / row header. Built to be reused beyond the Explorer (the Build rail's
 * insight & chart panes are the first consumers), which is why it lives in the
 * app-wide `common/` home rather than next to any one surface.
 *
 * The menu list is rendered into `document.body` via a portal, positioned off
 * the trigger's bounding box (re-measured on scroll / resize while open). This
 * is REQUIRED here, not cosmetic: the panes it sits inside are `overflow-hidden`
 * (rounded cards) and the rail body is `overflow-y-auto`, so an in-flow
 * absolutely-positioned menu would be clipped out of sight — the same class of
 * bug that made the query-chip menu invisible (VIS-1228). Portaling escapes
 * every ancestor's overflow (and any transformed ancestor that would trap
 * `position: fixed`).
 *
 * @param {object} props
 * @param {string} props.testId - unique suffix so each menu is greppable
 *   (`panel-menu-trigger-${testId}`, `panel-menu-${testId}`, and per-item
 *   `panel-menu-item-${item.id}-${testId}`).
 * @param {Array<{id,label,icon,onSelect,destructive,disabled}>} props.items -
 *   menu rows. `icon` is a react-icons component; `destructive` styles the row
 *   red (for a later "Delete…" reuse); a `disabled` row is shown but inert.
 * @param {string} [props.ariaLabel='Options'] - trigger aria-label / title.
 * @param {number} [props.menuWidth=160]
 */
const PanelMenu = ({ testId, items = [], ariaLabel = 'Options', menuWidth = 160 }) => {
  const triggerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);

  const reposition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Right-align the menu to the trigger (clamped to the viewport), dropping
    // below it. Small enough that a flip-up isn't worth the complexity here.
    setPos({
      top: r.bottom + 6,
      left: Math.max(4, Math.min(r.right - menuWidth, window.innerWidth - menuWidth - 4)),
      width: menuWidth,
    });
  }, [menuWidth]);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    const onScroll = () => reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onKey = e => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  return (
    <span className="inline-flex" onClick={e => e.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        data-testid={`panel-menu-trigger-${testId}`}
        aria-label={ariaLabel}
        title={ariaLabel}
        onClick={e => {
          e.stopPropagation();
          setOpen(o => !o);
        }}
        className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
      >
        <PiDotsThreeVertical size={16} />
      </button>

      {open &&
        pos &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            {/* Outside-click backdrop. */}
            <div
              data-testid={`panel-menu-backdrop-${testId}`}
              onClick={e => {
                e.stopPropagation();
                close();
              }}
              style={{ position: 'fixed', inset: 0, zIndex: 80 }}
            />
            <div
              data-testid={`panel-menu-${testId}`}
              onClick={e => e.stopPropagation()}
              style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 90 }}
              className="overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
            >
              {items.map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-testid={`panel-menu-item-${item.id}-${testId}`}
                    disabled={item.disabled}
                    onClick={e => {
                      e.stopPropagation();
                      close();
                      item.onSelect?.();
                    }}
                    className={[
                      'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] disabled:cursor-not-allowed disabled:opacity-40',
                      item.destructive
                        ? 'text-highlight-600 hover:bg-highlight-50'
                        : 'text-gray-800 hover:bg-gray-50',
                    ].join(' ')}
                  >
                    {Icon && (
                      <Icon
                        className={`h-3.5 w-3.5 shrink-0 ${item.destructive ? '' : 'text-gray-500'}`}
                      />
                    )}
                    {item.label}
                  </button>
                );
              })}
            </div>
          </>,
          document.body
        )}
    </span>
  );
};

export default PanelMenu;
