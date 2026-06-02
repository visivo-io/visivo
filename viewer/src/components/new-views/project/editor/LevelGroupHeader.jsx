import React, { useEffect, useRef, useState } from 'react';
import {
  PiCaretDown,
  PiCaretRight,
  PiArrowUp,
  PiArrowDown,
  PiTrash,
  PiCheck,
  PiX,
} from 'react-icons/pi';

/**
 * LevelGroupHeader — VIS-805 (M-1) + VIS-807 (M-2a).
 *
 * Header for a level group: a collapse caret, the level title, a dashboard
 * count, and (M-2a) inline level affordances revealed on hover:
 *
 *   - Double-click the title → inline rename input (Enter commits, Esc cancels).
 *   - Reorder up / down arrows.
 *   - Delete with a small inline confirm popover.
 *
 * These are only rendered for configured (real) levels — the synthetic
 * "Unassigned" bucket passes `editable={false}` so it stays read-only. The
 * actual mutations + telemetry live in `<ProjectEditor>` / the store; this
 * component is presentational and just invokes the callbacks.
 */
const LevelGroupHeader = ({
  title,
  count,
  collapsed,
  onToggle,
  testId,
  editable = false,
  canMoveUp = false,
  canMoveDown = false,
  onRename,
  onMoveUp,
  onMoveDown,
  onDelete,
}) => {
  const Caret = collapsed ? PiCaretRight : PiCaretDown;
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(title);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (renaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [renaming]);

  const startRename = () => {
    if (!editable) return;
    setDraft(title);
    setRenaming(true);
  };

  const commitRename = () => {
    setRenaming(false);
    const next = (draft || '').trim();
    if (next && next !== title && onRename) {
      onRename(next);
    }
  };

  const cancelRename = () => {
    setRenaming(false);
    setDraft(title);
  };

  const handleKeyDown = e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitRename();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelRename();
    }
  };

  const stop = e => e.stopPropagation();

  return (
    <header
      data-testid={testId}
      className="group/level relative mb-2 flex items-center gap-2 rounded-md py-1 pl-1 pr-1.5"
    >
      <button
        type="button"
        onClick={e => {
          stop(e);
          onToggle && onToggle();
        }}
        aria-label={collapsed ? 'Expand level' : 'Collapse level'}
        aria-expanded={!collapsed}
        data-testid={testId ? `${testId}-toggle` : undefined}
        className="inline-flex h-5 w-5 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
      >
        <Caret className="h-3.5 w-3.5" />
      </button>

      {renaming ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commitRename}
          onClick={stop}
          data-testid={testId ? `${testId}-rename-input` : undefined}
          aria-label="Rename level"
          className="min-w-0 flex-1 rounded border border-primary-300 bg-white px-1.5 py-0.5 text-[15px] font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-primary-200"
        />
      ) : (
        <h2
          onDoubleClick={editable ? startRename : undefined}
          data-testid={testId ? `${testId}-title` : undefined}
          title={editable ? 'Double-click to rename' : undefined}
          className={[
            'text-[15px] font-semibold text-gray-900',
            editable ? 'cursor-text rounded px-0.5 hover:bg-gray-100' : '',
          ].join(' ')}
        >
          {title}
        </h2>
      )}

      <span className="text-[12px] text-gray-400">
        · {count} dashboard{count === 1 ? '' : 's'}
      </span>

      {editable && !renaming && (
        <div
          className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover/level:opacity-100 focus-within:opacity-100"
          data-testid={testId ? `${testId}-actions` : undefined}
        >
          <button
            type="button"
            onClick={e => {
              stop(e);
              canMoveUp && onMoveUp && onMoveUp();
            }}
            disabled={!canMoveUp}
            aria-label="Move level up"
            data-testid={testId ? `${testId}-move-up` : undefined}
            className="inline-flex h-5 w-5 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <PiArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={e => {
              stop(e);
              canMoveDown && onMoveDown && onMoveDown();
            }}
            disabled={!canMoveDown}
            aria-label="Move level down"
            data-testid={testId ? `${testId}-move-down` : undefined}
            className="inline-flex h-5 w-5 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <PiArrowDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={e => {
              stop(e);
              setConfirmingDelete(true);
            }}
            aria-label="Delete level"
            data-testid={testId ? `${testId}-delete` : undefined}
            className="inline-flex h-5 w-5 items-center justify-center rounded text-gray-400 transition-colors hover:bg-highlight-50 hover:text-highlight"
          >
            <PiTrash className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {confirmingDelete && (
        <div
          role="dialog"
          aria-label="Confirm delete level"
          onClick={stop}
          data-testid={testId ? `${testId}-delete-confirm` : undefined}
          className="absolute right-0 top-full z-20 mt-1 w-56 rounded-lg border border-gray-200 bg-white p-3 shadow-lg"
        >
          <p className="text-[12.5px] leading-snug text-gray-700">
            Delete level <span className="font-semibold">“{title}”</span>? Its dashboards move to
            Unassigned.
          </p>
          <div className="mt-2.5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={e => {
                stop(e);
                setConfirmingDelete(false);
              }}
              data-testid={testId ? `${testId}-delete-cancel` : undefined}
              className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-gray-600 hover:bg-gray-100"
            >
              <PiX className="h-3.5 w-3.5" /> Cancel
            </button>
            <button
              type="button"
              onClick={e => {
                stop(e);
                setConfirmingDelete(false);
                onDelete && onDelete();
              }}
              data-testid={testId ? `${testId}-delete-confirm-btn` : undefined}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-highlight px-2.5 text-[12px] font-semibold text-white hover:bg-highlight-700"
            >
              <PiCheck className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        </div>
      )}
    </header>
  );
};

export default LevelGroupHeader;
