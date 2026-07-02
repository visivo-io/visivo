import React, { useEffect, useRef, useState } from 'react';
import { ROW_TEMPLATES } from './canvasReorder';

/**
 * RowTemplateMenu — VIS-794 / Track D D-7.
 *
 * The popup picker anchored above a "+ Add Row" trigger. It lists the five
 * preset layouts from `ROW_TEMPLATES` (Blank / KPI strip / 2-up / 3-up / Mixed),
 * each rendered as a generic 80×40 wireframe so the user reads the SHAPE of the
 * row WITHOUT mistaking it for real chart content (D-7 design contract). Picking
 * a template calls `onSelect(templateKey)`; the caller builds the row + commits
 * it.
 *
 * Mulberry (`#713b57`) is the selection/active colour (NOT a type colour — these
 * empty-slot previews carry no object type, so objectTypeConfigs is intentionally
 * not consulted here). Keyboard: Up/Down navigate, Enter commits the focused
 * template, Esc dismisses (returns focus to the trigger via `onDismiss`).
 */

const MULBERRY = '#713b57';
const SLOT_FILL = '#e2d7dd';
const SLOT_BORDER = '#c6b0bb';

// Per-template wireframe preview: a row of soft-hatched rectangles diagramming
// the column layout. Driven directly off the template `widths` so the preview
// and the inserted row can never drift apart.
const TemplatePreview = ({ widths }) => {
  const total = widths.reduce((sum, w) => sum + w, 0) || 1;
  const GAP = 3;
  const usable = 80 - GAP * (widths.length - 1);
  let x = 0;
  return (
    <svg viewBox="0 0 80 40" className="h-10 w-20" aria-hidden="true">
      {widths.map((w, i) => {
        const width = (usable * w) / total;
        const rect = (
          <rect
            key={i}
            x={x + 1}
            y={6}
            width={Math.max(0, width - 2)}
            height={28}
            rx={3}
            fill={SLOT_FILL}
            stroke={SLOT_BORDER}
          />
        );
        x += width + GAP;
        return rect;
      })}
    </svg>
  );
};

const RowTemplateMenu = ({ onSelect, onDismiss, anchor = 'bottom' }) => {
  const [hoveredKey, setHoveredKey] = useState(null);
  const [selectedKey, setSelectedKey] = useState(null);
  const itemRefs = useRef([]);
  const focusIndexRef = useRef(0);

  // Focus the first template on open so keyboard nav works immediately.
  useEffect(() => {
    const el = itemRefs.current[0];
    if (el) el.focus();
  }, []);

  const commit = key => {
    // Flash the chosen row mulberry (220ms) before the caller dismisses, so the
    // click visibly registers (D-7 design contract).
    setSelectedKey(key);
    if (typeof onSelect === 'function') onSelect(key);
  };

  const handleKeyDown = event => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = Math.min(focusIndexRef.current + 1, ROW_TEMPLATES.length - 1);
      focusIndexRef.current = next;
      itemRefs.current[next]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const next = Math.max(focusIndexRef.current - 1, 0);
      focusIndexRef.current = next;
      itemRefs.current[next]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (typeof onDismiss === 'function') onDismiss();
    }
  };

  const anchorStyle =
    anchor === 'bottom'
      ? { bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' }
      : { top: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' };

  return (
    <div
      data-testid="row-template-menu"
      className="pointer-events-auto absolute z-50 w-[300px] rounded-lg bg-white shadow-xl ring-1 ring-gray-200"
      role="menu"
      aria-label="Insert row"
      style={anchorStyle}
      onKeyDown={handleKeyDown}
    >
      <div className="border-b border-gray-100 px-3 pt-2.5 pb-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          Insert row
        </div>
        <div className="text-[10.5px] text-gray-400">
          {ROW_TEMPLATES.length} templates — pick a layout, then add items
        </div>
      </div>
      <ul className="flex flex-col p-1">
        {ROW_TEMPLATES.map(({ key, name, desc, widths }, idx) => {
          const isHovered = hoveredKey === key;
          const isSelected = selectedKey === key;
          return (
            <li key={key}>
              <button
                ref={el => (itemRefs.current[idx] = el)}
                type="button"
                role="menuitem"
                data-testid={`row-template-${key}`}
                onClick={() => commit(key)}
                onMouseEnter={() => setHoveredKey(key)}
                onMouseLeave={() => setHoveredKey(null)}
                onFocus={() => (focusIndexRef.current = idx)}
                style={isSelected ? { backgroundColor: '#e2d7dd' } : undefined}
                className={[
                  'group/item flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors',
                  'focus:outline-none focus:ring-2 focus:ring-[#713b57]',
                  isSelected ? '' : isHovered ? 'bg-gray-100' : 'hover:bg-gray-50',
                ].join(' ')}
              >
                <span
                  className="flex h-11 w-[88px] shrink-0 items-center justify-center rounded-md bg-white ring-1"
                  style={{
                    boxShadow: isSelected ? `0 0 0 1px ${MULBERRY}` : undefined,
                  }}
                >
                  <TemplatePreview widths={widths} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-gray-900">
                    {name}
                  </span>
                  <span className="block truncate text-[11px] text-gray-500">{desc}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <span
        aria-hidden="true"
        className="absolute left-1/2 -translate-x-1/2 h-3 w-3 rotate-45 bg-white ring-1 ring-gray-200"
        style={
          anchor === 'bottom'
            ? { bottom: -6, clipPath: 'polygon(0 0, 100% 100%, 0 100%)' }
            : { top: -6, clipPath: 'polygon(100% 0, 100% 100%, 0 0)' }
        }
      />
    </div>
  );
};

export default RowTemplateMenu;
