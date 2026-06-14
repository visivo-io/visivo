import React from 'react';
import { getTypeColors } from '../../common/objectTypeConfigs';

/**
 * ErdTidyButton — the "Tidy layout" action for an ERD toolbar (§6).
 *
 * Clears the scope's saved positions + waypoints, bumps layoutVersion (→ full
 * auto-layout), then re-fits. Shows a subtle "edited" dot when the scope has any
 * moved cards. Confirms only when ≥1 node has been moved (don't nag a pristine
 * canvas).
 *
 * @param {() => void} onTidy
 * @param {boolean} hasEdits whether the scope has saved node positions
 * @param {string} testId data-testid (e.g. 'semantic-layer-erd-reset-layout')
 */
const ErdTidyButton = ({ onTidy, hasEdits = false, testId }) => {
  const relationBlue = getTypeColors('relation').connectionHandle;
  const handleClick = () => {
    if (hasEdits) {
      // eslint-disable-next-line no-alert
      const ok = window.confirm('Reset the layout? This clears your moved cards and edges.');
      if (!ok) return;
    }
    onTidy && onTidy();
  };
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={handleClick}
      className="relative inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white/90 px-2.5 py-1 text-[11px] font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
      title="Tidy layout — re-run auto-layout and fit to view"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M4 6h16M4 12h10M4 18h7"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      Tidy layout
      {hasEdits && (
        <span
          data-testid={testId ? `${testId}-edited-dot` : undefined}
          title="Layout edited"
          className="absolute -right-1 -top-1 h-2 w-2 rounded-full"
          style={{ background: relationBlue }}
        />
      )}
    </button>
  );
};

export default ErdTidyButton;
