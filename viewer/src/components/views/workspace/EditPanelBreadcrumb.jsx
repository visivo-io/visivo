import React, { useCallback, useMemo, useRef } from 'react';
import { PiPencil, PiCaretRight, PiSquaresFour, PiKeyboard } from 'react-icons/pi';
import { getTypeIcon } from '../common/objectTypeConfigs';
import {
  buildBreadcrumbSegments,
  computeSiblingKey,
  computeHierarchyKey,
  computeReorder,
} from './breadcrumbNav';

/**
 * EditPanelBreadcrumb — VIS-804 / Track G G-2.
 *
 * A slim structural breadcrumb band that sits BETWEEN the right-rail tab bar
 * and the Edit form body. It reflects the current `workspaceOutlineSelectedKey`
 * selection's ancestry (`dashboard ▸ row 2 ▸ great_fib`) and is the keyboard
 * navigation surface for the selection (Q7 = C; ships alongside canvas-direct
 * nav VIS-D7):
 *
 *   - Each segment is a button that selects that ancestor
 *     (`setWorkspaceOutlineSelectedKey(segment.key)`).
 *   - ↑/↓   step among siblings at the current depth.
 *   - ←/→   step UP / DOWN through the hierarchy.
 *   - ⌘↑/⌘↓ reorder the focused node within its parent.
 *   - Enter  focus the form's first field (`onFocusForm`).
 *   - Esc    deselect (jump to the dashboard root).
 *
 * Type colour + icon come exclusively from `objectTypeConfigs` (rainbow);
 * `row` has no config entry so it uses a Phosphor squares glyph, and the
 * CURRENT (last) segment carries the mulberry selection chip (`primary`).
 *
 * The whole logic is pure-function-backed (`editPanelBreadcrumb.js`) so the
 * key derivation + nav handlers are unit-tested in isolation.
 */

const ROW_ICON_CLASS = 'h-3 w-3 shrink-0';

const segmentIcon = segment => {
  if (segment.type === 'row') {
    return <PiSquaresFour aria-hidden="true" className={`${ROW_ICON_CLASS} text-gray-500`} />;
  }
  const Icon = getTypeIcon(segment.type);
  return Icon ? <Icon aria-hidden="true" style={{ fontSize: 12 }} className="shrink-0" /> : null;
};

const Segment = ({ segment, isCurrent, isFocused, onSelect }) => {
  const cls = [
    'group/crumb inline-flex h-6 max-w-[140px] items-center gap-1 rounded-md px-1.5 text-[11.5px] outline-none transition-colors',
    isCurrent
      ? 'bg-primary-100 font-semibold text-primary-600'
      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 cursor-pointer',
    isFocused ? 'ring-2 ring-primary bg-white text-gray-900' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      data-testid={`edit-breadcrumb-segment-${segment.key}`}
      data-segment-kind={segment.kind}
      data-object-type={segment.type}
      data-current={isCurrent ? 'true' : 'false'}
      aria-current={isCurrent ? 'true' : undefined}
      onClick={() => onSelect(segment.key)}
      className={cls}
    >
      {segmentIcon(segment)}
      <span className="truncate" title={segment.label}>
        {segment.label}
      </span>
    </button>
  );
};

const EditPanelBreadcrumb = ({
  outlineKey,
  dashboardName,
  rows,
  onSelectKey,
  onReorder,
  onFocusForm,
}) => {
  const containerRef = useRef(null);

  const segments = useMemo(
    () => buildBreadcrumbSegments(outlineKey, dashboardName, rows),
    [outlineKey, dashboardName, rows]
  );

  // The focused segment is always the current (last) one — keyboard nav moves
  // the selection itself, so focus tracks the selection's depth.
  const focusedIndex = segments.length - 1;

  const handleSelect = useCallback(
    key => {
      if (onSelectKey) onSelectKey(key);
    },
    [onSelectKey]
  );

  const handleKeyDown = useCallback(
    e => {
      // Don't hijack typing inside the form bodies below the band.
      const target = e.target;
      const isField =
        target &&
        target !== containerRef.current &&
        /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName || '');
      if (isField) return;

      const key = outlineKey || 'dashboard';

      if (e.key === 'Escape') {
        e.preventDefault();
        handleSelect('dashboard');
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (onFocusForm) onFocusForm();
        return;
      }

      const isReorder = e.metaKey || e.ctrlKey;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (isReorder) {
          const op = computeReorder(key, rows, -1);
          if (op && onReorder) onReorder(op);
        } else {
          handleSelect(computeSiblingKey(key, rows, -1));
        }
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (isReorder) {
          const op = computeReorder(key, rows, 1);
          if (op && onReorder) onReorder(op);
        } else {
          handleSelect(computeSiblingKey(key, rows, 1));
        }
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleSelect(computeHierarchyKey(key, rows, 'up'));
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleSelect(computeHierarchyKey(key, rows, 'down'));
      }
    },
    [outlineKey, rows, handleSelect, onReorder, onFocusForm]
  );

  // Empty / no-selection band — keep the layout steady with a quiet hint.
  if (!segments || segments.length === 0) {
    return (
      <div
        data-testid="edit-breadcrumb-empty"
        className="flex h-7 items-center gap-1.5 border-b border-gray-100 bg-gray-50 px-3 text-[11px] text-gray-400"
      >
        <PiPencil aria-hidden="true" className="h-3 w-3 opacity-60" />
        <span>Select something to edit</span>
      </div>
    );
  }

  // A11y: announce the current breadcrumb position for screen readers.
  const positionLabel = segments.map(s => s.label).join(' / ');

  return (
    <div
      ref={containerRef}
      data-testid="edit-breadcrumb"
      role="navigation"
      aria-label="Selection breadcrumb"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="sticky top-0 z-10 flex h-7 items-center gap-1 border-b border-gray-100 bg-gray-50 px-2 outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <span data-testid="edit-breadcrumb-position" className="sr-only" aria-live="polite">
        {positionLabel}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
        {segments.map((segment, i) => {
          const isLast = i === segments.length - 1;
          return (
            <React.Fragment key={segment.key}>
              <Segment
                segment={segment}
                isCurrent={isLast}
                isFocused={i === focusedIndex && i !== 0 && isLast}
                onSelect={handleSelect}
              />
              {!isLast && (
                <PiCaretRight aria-hidden="true" className="h-2.5 w-2.5 shrink-0 text-gray-300" />
              )}
            </React.Fragment>
          );
        })}
      </div>
      <KeyboardNavHint />
    </div>
  );
};

/**
 * A discoverable affordance for the breadcrumb's keyboard navigation (VIS-985 /
 * VIS-1000): a small keyboard glyph whose native `title` + an SR-only legend
 * spell out the shortcuts, so the ↑↓/←→/⌘↑↓/Enter/Esc model isn't invisible.
 */
const KEYBOARD_HINT =
  'Keyboard: ↑↓ move between siblings · ←→ move up/down the hierarchy · ⌘↑ / ⌘↓ reorder · Enter edit · Esc to dashboard';

const KeyboardNavHint = () => (
  <span
    data-testid="edit-breadcrumb-kbd-hint"
    title={KEYBOARD_HINT}
    className="ml-1 flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded text-gray-300 transition-colors hover:bg-primary-50 hover:text-primary"
  >
    <PiKeyboard aria-hidden="true" className="h-3.5 w-3.5" />
    <span className="sr-only">{KEYBOARD_HINT}</span>
  </span>
);

export default EditPanelBreadcrumb;
