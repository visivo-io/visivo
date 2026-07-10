import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getTypeColors, getTypeIcon } from '../../common/objectTypeConfigs';

/**
 * AddModelMention — an `@`-mention model search to add a model to the ERD canvas
 * (VIS-1006b). Mirrors the EndpointPicker pattern in JoinOperatorPopover: type to
 * filter the project's models, click one to add it. Used on the Relation ERD (to
 * bring a third model in for authoring a new relation) and on the Semantic Layer
 * page.
 *
 * Colours/icon come from objectTypeConfigs (model = amber); no hand-rolled tones.
 *
 * @param {object[]} models      all project models ({ name, ... }).
 * @param {string[]} excludeNames models already on the canvas (filtered out).
 * @param {(name:string)=>void} onAdd called with the chosen model name.
 * @param {string} [testId]      data-testid root (default `erd-add-model`).
 */
const AddModelMention = ({ models = [], excludeNames = [], onAdd, testId = 'erd-add-model' }) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const colors = getTypeColors('model');
  const Icon = getTypeIcon('model');

  const exclude = useMemo(() => new Set(excludeNames), [excludeNames]);

  const filtered = useMemo(() => {
    const q = query.replace(/^@/, '').trim().toLowerCase();
    return models
      .filter(m => !exclude.has(m.name))
      .filter(m => (q ? m.name.toLowerCase().includes(q) : true));
  }, [models, exclude, query]);

  // Dismiss the dropdown on an outside pointer-down (the same contract as the
  // JoinOperatorPopover), so it doesn't linger over the canvas.
  useEffect(() => {
    if (!open) return undefined;
    const onDocPointer = e => {
      if (rootRef.current && rootRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onDocPointer, true);
    return () => document.removeEventListener('pointerdown', onDocPointer, true);
  }, [open]);

  const choose = name => {
    setQuery('');
    setOpen(false);
    if (typeof onAdd === 'function') onAdd(name);
  };

  return (
    <div ref={rootRef} className="relative" data-testid={testId}>
      <div
        className={[
          'flex items-center gap-1.5 rounded-md border bg-white px-2 py-1 shadow-sm',
          colors.border,
        ].join(' ')}
      >
        {Icon && (
          <Icon style={{ fontSize: 14 }} className={`shrink-0 ${colors.text}`} aria-hidden="true" />
        )}
        <input
          type="text"
          data-testid={`${testId}-input`}
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="@ add model…"
          className="w-40 bg-transparent text-[12px] outline-none placeholder:text-gray-300"
        />
      </div>
      {open && filtered.length > 0 && (
        <ul
          data-testid={`${testId}-options`}
          className="absolute z-20 mt-1 max-h-44 w-52 overflow-auto rounded-md border border-gray-100 bg-white text-[12px] shadow-lg"
        >
          {filtered.map(m => (
            <li key={m.name}>
              <button
                type="button"
                data-testid={`${testId}-option-${m.name}`}
                className="flex w-full items-center gap-1.5 px-2 py-1 text-left hover:bg-primary-50"
                onClick={() => choose(m.name)}
              >
                {Icon && (
                  <Icon
                    style={{ fontSize: 13 }}
                    className={`shrink-0 ${colors.text}`}
                    aria-hidden="true"
                  />
                )}
                <span className="truncate">{m.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && filtered.length === 0 && (
        <div
          data-testid={`${testId}-empty`}
          className="absolute z-20 mt-1 w-52 rounded-md border border-gray-100 bg-white px-2 py-1.5 text-[11px] italic text-gray-400 shadow-lg"
        >
          No more models to add.
        </div>
      )}
    </div>
  );
};

export default AddModelMention;
