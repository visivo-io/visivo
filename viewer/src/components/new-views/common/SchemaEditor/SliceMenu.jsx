import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { menuPolicyFor } from './utils/slotShape';

/**
 * SliceMenu — popover that lets the user pick which row(s) of a query
 * column bind to a property.
 *
 * Single source of truth for slice authoring. Banner buttons, badge
 * clicks, and chevron clicks all open this same menu.
 *
 * Options enabled per slot shape:
 *   - scalar-only: First / Last / At row N. (Range and All disabled.)
 *   - array-only:  Range / All values. (First / Last / At row disabled.)
 *   - mixed:       all options enabled.
 *   - unknown:     all options enabled (safe fallback).
 *
 * The menu does NOT type slice expressions in raw form — every option
 * yields a structured slice string emitted via onChange. Per the user's
 * design call, raw bracket typing is not a supported authoring path.
 *
 * @param {object} props
 * @param {HTMLElement|null} props.anchorEl - The element to position
 *   the popover beneath. Required when `open` is true.
 * @param {boolean} props.open - Whether the menu is visible.
 * @param {() => void} props.onClose - Called when the user clicks
 *   outside or selects an option.
 * @param {string|null} props.slice - The current slice expression
 *   (e.g. `"[0]"`, `"[1:5]"`) or null if no slice is set.
 * @param {(newSlice: string|null) => void} props.onChange - Called
 *   with the new slice string (or null for "All values"). The caller
 *   is responsible for calling onClose if it wants the popover to
 *   dismiss after a change.
 * @param {'scalar-only' | 'array-only' | 'mixed' | 'unknown'} props.slotShape
 *   - Drives which options are enabled vs disabled-with-tooltip.
 */
export function SliceMenu({ anchorEl, open, onClose, slice, onChange, slotShape = 'unknown' }) {
  const policy = menuPolicyFor(slotShape);
  const [atRowValue, setAtRowValue] = useState('');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [showAtRow, setShowAtRow] = useState(false);
  const [showRange, setShowRange] = useState(false);
  const containerRef = useRef(null);

  // Reveal inline inputs when the user opens the menu while a custom
  // slice is already set (e.g. `[3]` opens with "At row" expanded
  // and 3 prefilled).
  useEffect(() => {
    if (!open || !slice) {
      setShowAtRow(false);
      setShowRange(false);
      return;
    }
    const inner = slice.slice(1, -1).trim();
    if (/^-?\d+$/.test(inner) && inner !== '0' && inner !== '-1') {
      setShowAtRow(true);
      setAtRowValue(inner);
    } else if (/^-?\d*:-?\d*$/.test(inner)) {
      setShowRange(true);
      const [a, b] = inner.split(':');
      setRangeStart(a || '');
      setRangeEnd(b || '');
    }
  }, [open, slice]);

  // Outside-click dismiss.
  useEffect(() => {
    if (!open) return undefined;
    const handler = e => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        if (anchorEl && anchorEl.contains(e.target)) return;
        onClose?.();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose, anchorEl]);

  if (!open || !anchorEl) return null;

  const rect = anchorEl.getBoundingClientRect();

  const select = newSlice => {
    onChange(newSlice);
    onClose?.();
  };

  const commitAtRow = () => {
    const n = parseInt(atRowValue, 10);
    if (Number.isNaN(n)) return;
    select(`[${n}]`);
  };

  const commitRange = () => {
    const a = rangeStart === '' ? '' : parseInt(rangeStart, 10);
    const b = rangeEnd === '' ? '' : parseInt(rangeEnd, 10);
    if (a === '' && b === '') return;
    select(`[${a}:${b}]`);
  };

  const isCurrent = expr => slice === expr;

  return createPortal(
    <div
      ref={containerRef}
      className="fixed bg-white border border-gray-200 rounded-md shadow-lg w-64 py-1 text-sm"
      style={{
        zIndex: 9999,
        top: rect.bottom + 4,
        left: rect.left,
      }}
      data-testid="slice-menu"
      role="menu"
    >
      <MenuRow
        label="First (0)"
        selected={isCurrent('[0]')}
        disabled={!policy.first}
        disabledReason="This prop expects multiple values; use Range or All values."
        onClick={() => select('[0]')}
        testId="slice-option-first"
      />
      <MenuRow
        label="Last (-1)"
        selected={isCurrent('[-1]')}
        disabled={!policy.last}
        disabledReason="This prop expects multiple values; use Range or All values."
        onClick={() => select('[-1]')}
        testId="slice-option-last"
      />
      <MenuRow
        label="At row…"
        selected={showAtRow || (!!slice && /^-?\d+$/.test(slice.slice(1, -1)) && slice !== '[0]' && slice !== '[-1]')}
        disabled={!policy.atRow}
        disabledReason="This prop expects multiple values; use Range or All values."
        onClick={() => {
          setShowAtRow(true);
          setShowRange(false);
        }}
        testId="slice-option-at-row"
      />
      {showAtRow && policy.atRow && (
        <div className="px-3 py-1.5 flex gap-1 items-center">
          <input
            type="number"
            value={atRowValue}
            onChange={e => setAtRowValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitAtRow();
            }}
            className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs"
            placeholder="row index"
            data-testid="slice-at-row-input"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
          <button
            type="button"
            onClick={commitAtRow}
            className="text-xs text-primary-600 hover:text-primary-800 px-2"
            data-testid="slice-at-row-apply"
          >
            Apply
          </button>
        </div>
      )}

      <Divider />

      <MenuRow
        label="Rows…"
        selected={showRange || (!!slice && /^-?\d*:-?\d*$/.test(slice.slice(1, -1)))}
        disabled={!policy.range}
        disabledReason="This prop expects a single value; pick a row instead."
        onClick={() => {
          setShowRange(true);
          setShowAtRow(false);
        }}
        testId="slice-option-range"
      />
      {showRange && policy.range && (
        <div className="px-3 py-1.5 flex gap-1 items-center">
          <input
            type="number"
            value={rangeStart}
            onChange={e => setRangeStart(e.target.value)}
            className="w-16 border border-gray-300 rounded px-2 py-1 text-xs"
            placeholder="start"
            data-testid="slice-range-start"
          />
          <span className="text-gray-500 text-xs">to</span>
          <input
            type="number"
            value={rangeEnd}
            onChange={e => setRangeEnd(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitRange();
            }}
            className="w-16 border border-gray-300 rounded px-2 py-1 text-xs"
            placeholder="end"
            data-testid="slice-range-end"
          />
          <button
            type="button"
            onClick={commitRange}
            className="text-xs text-primary-600 hover:text-primary-800 px-2"
            data-testid="slice-range-apply"
          >
            Apply
          </button>
        </div>
      )}

      <MenuRow
        label="All values"
        selected={!slice}
        disabled={!policy.all}
        disabledReason="This prop expects a single value; pick a row instead."
        onClick={() => select(null)}
        testId="slice-option-all"
      />
    </div>,
    document.body
  );
}

function MenuRow({ label, selected, disabled, disabledReason, onClick, testId }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      aria-disabled={disabled}
      title={disabled ? disabledReason : undefined}
      onClick={disabled ? undefined : onClick}
      data-testid={testId}
      className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 ${
        disabled
          ? 'text-gray-400 cursor-not-allowed'
          : 'hover:bg-gray-100 text-gray-700'
      } ${selected ? 'font-medium bg-gray-50' : ''}`}
    >
      <span
        className={`w-3 h-3 inline-block rounded-full border ${
          selected ? 'border-primary-500 bg-primary-500' : 'border-gray-300'
        }`}
        aria-hidden="true"
      />
      {label}
    </button>
  );
}

function Divider() {
  return <div className="my-1 border-t border-gray-100" aria-hidden="true" />;
}

export default SliceMenu;
