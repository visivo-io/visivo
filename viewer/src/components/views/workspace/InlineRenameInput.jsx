import React, { useEffect, useRef, useState, useCallback } from 'react';
import { PiCheck, PiX } from 'react-icons/pi';

/**
 * InlineRenameInput — the shared input + commit(✓)/cancel(✕) affordance
 * behind every Explore 2.0 exploration rename gesture (Explorer Home's `⋮ ->
 * Rename` and `ExplorationPane`'s SubBar pencil, 01-ux-spec.md §2/§3). Each
 * caller owns its own "am I in edit mode" state and trigger affordance (a
 * persistent pencil icon vs. a menu item) — this component is just the
 * actual text-entry + Enter/Escape/blur behavior, so the two contexts don't
 * duplicate that logic while their surrounding chrome differs.
 *
 * Deliberately NOT the shared `useInlineRename` util named in
 * 02-architecture.md §9 — that extraction unifies three OTHER existing
 * hand-rolled instances (dashboard tab / Library row / model tab rename) and
 * is explicitly Phase 3a scope. This is Explore 2.0's own small piece.
 */
const InlineRenameInput = ({ name, onCommit, onCancel, testIdPrefix = 'inline-rename', className = '' }) => {
  const [value, setValue] = useState(name);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    // Only on mount — this component unmounts/remounts per edit session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== name) onCommit(trimmed);
    else onCancel();
  }, [value, name, onCommit, onCancel]);

  return (
    <span className={`flex min-w-0 items-center gap-1 ${className}`}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={commit}
        onClick={e => e.stopPropagation()}
        onKeyDown={e => {
          // Phase 6c-T5: a caller may render this input inside its own
          // keyboard-activatable container (ExplorationCard's whole-card
          // onClick/onKeyDown, VIS-1059-ish "Enter/Space opens the card").
          // Without stopPropagation, Enter here both commits the rename AND
          // bubbles up as "Enter pressed on the card", firing the card's own
          // open handler mid-rename. Stop it here, once, for every caller.
          e.stopPropagation();
          if (e.key === 'Enter') commit();
          else if (e.key === 'Escape') onCancel();
        }}
        data-testid={`${testIdPrefix}-input`}
        className="min-w-0 flex-1 rounded border border-primary-300 bg-white px-1.5 py-0.5 text-[12px] font-medium text-gray-900 outline-none focus:ring-1 focus:ring-primary-400"
      />
      <button
        type="button"
        onMouseDown={e => e.preventDefault()}
        onClick={e => {
          // Same bubble guard as the input's own onClick/onKeyDown above —
          // found via manual walkthrough (Phase 6c-T5): clicking Save here
          // was ALSO opening the exploration tab, because this click event
          // bubbled up to ExplorationCard's whole-card onClick unabated.
          // Only the input itself stopped propagation; these two buttons
          // never did.
          e.stopPropagation();
          commit();
        }}
        title="Save name"
        data-testid={`${testIdPrefix}-commit`}
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-primary-600 hover:bg-primary-100"
      >
        <PiCheck style={{ fontSize: 12 }} />
      </button>
      <button
        type="button"
        onMouseDown={e => e.preventDefault()}
        onClick={e => {
          e.stopPropagation();
          onCancel();
        }}
        title="Cancel"
        data-testid={`${testIdPrefix}-cancel`}
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-100"
      >
        <PiX style={{ fontSize: 12 }} />
      </button>
    </span>
  );
};

export default InlineRenameInput;
