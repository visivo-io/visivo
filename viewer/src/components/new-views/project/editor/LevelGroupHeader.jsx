import React from 'react';
import { PiCaretDown, PiCaretRight } from 'react-icons/pi';

/**
 * LevelGroupHeader — VIS-805 / Track M M-1.
 *
 * Basic, non-editable header for a level group: a collapse caret, the level
 * title, and a dashboard count. Inline rename / reorder / add-level
 * affordances and the selected-state form binding are explicitly OUT of scope
 * for M-1 — they ship with VIS-807 (M-2). This header only toggles the group's
 * tile grid open/closed.
 */
const LevelGroupHeader = ({ title, count, collapsed, onToggle, testId }) => {
  const Caret = collapsed ? PiCaretRight : PiCaretDown;
  return (
    <header
      data-testid={testId}
      className="group/level mb-2 flex items-center gap-2 rounded-md py-1 pl-1 pr-1.5"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? 'Expand level' : 'Collapse level'}
        aria-expanded={!collapsed}
        data-testid={testId ? `${testId}-toggle` : undefined}
        className="inline-flex h-5 w-5 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
      >
        <Caret className="h-3.5 w-3.5" />
      </button>
      <h2 className="text-[15px] font-semibold text-gray-900">{title}</h2>
      <span className="text-[12px] text-gray-400">
        · {count} dashboard{count === 1 ? '' : 's'}
      </span>
    </header>
  );
};

export default LevelGroupHeader;
