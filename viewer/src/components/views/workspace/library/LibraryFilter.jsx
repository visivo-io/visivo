import React, { useEffect, useRef, useState } from 'react';
import { PiFunnel, PiCaretDown, PiCheck, PiX, PiSquaresFour, PiDatabase } from 'react-icons/pi';
import { getTypeDef } from './LibraryRow';

/**
 * LibraryFilter — the Library's filter control: a compact dropdown trigger plus
 * a row of the currently-selected filters as removable chips (each with a clear
 * "×"), and a "Clear" to drop them all.
 *
 * Replaces the always-visible pill row: nothing but the "Filter" button shows
 * until the user picks something, so the rail stays compact. Selection is
 * ADDITIVE (multi-select) — the menu keeps open across picks and the list shows
 * the UNION of everything selected.
 *
 * Two kinds of option, in one menu:
 *   - GROUPS (Data Layer · Layout Items) — narrow to a whole group.
 *   - TYPES  (Sources · Models · … · Charts · Tables · …) — narrow to one type.
 *
 * Presentational: the parent owns the active `value` (Array<{kind,value}>) and
 * the toggle / clear callbacks.
 */
const GROUP_META = {
  layout: { label: 'Layout Items', Icon: PiSquaresFour },
  data: { label: 'Data Layer', Icon: PiDatabase },
};

const labelFor = sel =>
  sel.kind === 'group'
    ? GROUP_META[sel.value]?.label || sel.value
    : getTypeDef(sel.value).plural;

const LibraryFilter = ({
  // [{ key: 'data'|'layout' }] in display order.
  groups = [],
  // Flat list of every type key, in display order.
  types = [],
  groupCounts = {},
  typeCounts = {},
  // Active filters: Array<{ kind: 'group'|'type', value }> (additive union).
  value = [],
  // Toggle one option: onToggle({ kind, value }).
  onToggle,
  // Drop every active filter.
  onClear,
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  // Close on outside pointer-down / Escape (mirrors the Library "+ New" menu).
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = e => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKeyDown = e => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const isActive = sel => value.some(v => v.kind === sel.kind && v.value === sel.value);
  const countFor = sel => (sel.kind === 'group' ? groupCounts[sel.value] : typeCounts[sel.value]) ?? 0;

  const renderOption = sel => {
    const active = isActive(sel);
    const Icon = sel.kind === 'group' ? GROUP_META[sel.value]?.Icon : getTypeDef(sel.value).icon;
    return (
      <button
        key={`${sel.kind}:${sel.value}`}
        type="button"
        role="menuitemcheckbox"
        aria-checked={active}
        onClick={() => onToggle && onToggle(sel)}
        data-testid={`library-filter-option-${sel.kind}-${sel.value}`}
        data-active={active ? 'true' : 'false'}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[12px] text-gray-800 hover:bg-gray-50"
      >
        <span
          className={[
            'inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm ring-1',
            active ? 'bg-primary text-white ring-primary' : 'bg-white text-transparent ring-gray-300',
          ].join(' ')}
        >
          <PiCheck className="h-2.5 w-2.5" />
        </span>
        {Icon && <Icon aria-hidden="true" style={{ fontSize: 14 }} className="shrink-0 text-gray-500" />}
        <span className="flex-1 truncate">{labelFor(sel)}</span>
        <span className="text-[10.5px] text-gray-400">{countFor(sel)}</span>
      </button>
    );
  };

  return (
    <div
      ref={rootRef}
      className="relative flex flex-wrap items-center gap-1"
      data-testid="library-filter"
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Filter the library"
        data-testid="library-filter-toggle"
        className={[
          'inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium transition-colors',
          value.length > 0
            ? 'bg-primary-50 text-primary-700 ring-1 ring-primary-200 hover:bg-primary-100'
            : 'text-gray-600 ring-1 ring-gray-200 hover:bg-gray-100 hover:text-gray-900',
        ].join(' ')}
      >
        <PiFunnel className="h-3.5 w-3.5 shrink-0" />
        Filter
        {value.length > 0 && (
          <span
            data-testid="library-filter-active-count"
            className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-white"
          >
            {value.length}
          </span>
        )}
        <PiCaretDown
          aria-hidden="true"
          className={`h-3 w-3 shrink-0 transition-transform ${open ? '' : '-rotate-90'}`}
        />
      </button>

      {/* Selected filters as removable chips. */}
      {value.map(sel => (
        <span
          key={`${sel.kind}:${sel.value}`}
          data-testid={`library-filter-chip-${sel.kind}-${sel.value}`}
          className={[
            'inline-flex h-5 items-center gap-0.5 rounded-full py-0 pl-1.5 pr-0.5 text-[10.5px] font-medium',
            sel.kind === 'group'
              ? 'bg-primary-50 text-primary-700 ring-1 ring-primary-200'
              : 'bg-gray-100 text-gray-700 ring-1 ring-gray-200',
          ].join(' ')}
        >
          {labelFor(sel)}
          <button
            type="button"
            onClick={() => onToggle && onToggle(sel)}
            title={`Remove ${labelFor(sel)} filter`}
            aria-label={`Remove ${labelFor(sel)} filter`}
            data-testid={`library-filter-chip-remove-${sel.kind}-${sel.value}`}
            className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-current/70 hover:bg-black/10"
          >
            <PiX className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      {value.length > 0 && (
        <button
          type="button"
          onClick={onClear}
          data-testid="library-filter-clear"
          className="inline-flex h-5 items-center rounded px-1 text-[10.5px] font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800"
        >
          Clear
        </button>
      )}

      {open && (
        <div
          role="menu"
          data-testid="library-filter-menu"
          className="absolute left-0 top-7 z-50 w-52 rounded-md border border-gray-200 bg-white py-1 shadow-lg"
        >
          <div className="px-2 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Object groups
          </div>
          {groups.map(g => renderOption({ kind: 'group', value: g.key }))}
          <div className="my-1 border-t border-gray-100" />
          <div className="px-2 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Object types
          </div>
          {types.map(t => renderOption({ kind: 'type', value: t }))}
        </div>
      )}
    </div>
  );
};

export default LibraryFilter;
