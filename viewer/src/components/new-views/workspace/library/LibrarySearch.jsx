import React, { useEffect, useRef, useState, useCallback } from 'react';
import { PiMagnifyingGlass, PiX } from 'react-icons/pi';

/**
 * LibrarySearch — VIS-773 / Track C C2.
 *
 * Debounced search input scoped to a single Library section. Matches the
 * design in `library.jsx` (h-7 input, gray bg by default, focused ring +
 * mulberry halo when populated). Debounce is ~150 ms — enough to avoid
 * rendering on every keystroke when the project has hundreds of rows, but
 * short enough to feel live.
 *
 * Controlled state lives in the parent so other consumers (e.g. the
 * subsection header empty-state text) can react to the committed query.
 * Local state holds the typed-but-not-yet-committed value so the debounce
 * doesn't lag the input.
 */
const DEBOUNCE_MS = 150;

const LibrarySearch = ({
  sectionKey,
  value = '',
  onChange,
  placeholder = 'Search this section…',
  inputTestId,
}) => {
  const [draft, setDraft] = useState(value);
  const timer = useRef(null);

  // Keep the local draft in sync if the controlled value is reset externally
  // (e.g. the parent calls clear). We compare against `draft` to avoid
  // overwriting an in-flight edit when an unrelated parent re-render fires.
  useEffect(() => {
    if (value !== draft) {
      setDraft(value);
    }
    // We intentionally only run this when the controlled value moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Cleanup any pending debounce on unmount.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const commit = useCallback(
    (next) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        if (onChange) onChange(next);
      }, DEBOUNCE_MS);
    },
    [onChange]
  );

  const handleChange = useCallback(
    (e) => {
      const next = e.target.value;
      setDraft(next);
      commit(next);
    },
    [commit]
  );

  const handleClear = useCallback(() => {
    setDraft('');
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (onChange) onChange('');
  }, [onChange]);

  const populated = draft.length > 0;
  const tid = inputTestId || `library-search-${sectionKey}`;

  return (
    <div
      className={[
        'flex h-7 items-center gap-1.5 rounded-md px-2 ring-1 transition-colors',
        populated
          ? 'bg-white ring-[#713b57] shadow-[0_0_0_3px_#e2d7dd]'
          : 'bg-gray-100 ring-transparent focus-within:bg-white focus-within:ring-[#c6b0bb]',
      ].join(' ')}
      data-testid={`library-search-${sectionKey}-container`}
    >
      <PiMagnifyingGlass aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-gray-500" />
      <input
        type="text"
        value={draft}
        onChange={handleChange}
        placeholder={placeholder}
        aria-label={`Search ${sectionKey}`}
        data-testid={tid}
        className={[
          'min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-[12px] outline-none focus:ring-0',
          populated ? 'text-gray-900' : 'text-gray-500 placeholder:text-gray-500',
        ].join(' ')}
      />
      {populated && (
        <button
          type="button"
          onClick={handleClear}
          title="Clear search"
          aria-label="Clear search"
          data-testid={`library-search-${sectionKey}-clear`}
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-gray-400 hover:bg-gray-200 hover:text-gray-700"
        >
          <PiX className="h-3 w-3" />
        </button>
      )}
    </div>
  );
};

export default LibrarySearch;
