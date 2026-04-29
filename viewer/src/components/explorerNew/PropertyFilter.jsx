import React from 'react';

/**
 * PropertyFilter — toggle between essential and full property lists.
 *
 * Renders a count summary plus a button that toggles between
 * `mode === 'essentials'` (showing the chart-type-specific shortlist) and
 * `mode === 'all'` (showing the entire Plotly schema).
 *
 * @param {object} props
 * @param {number} props.totalCount - Total properties available in schema
 * @param {number} props.essentialCount - Number of essential properties
 * @param {'essentials'|'all'} props.mode - Current filter mode
 * @param {(mode: 'essentials'|'all') => void} props.onChange - Toggle callback
 */
export default function PropertyFilter({ totalCount, essentialCount, mode, onChange }) {
  const handleToggle = () => {
    onChange(mode === 'essentials' ? 'all' : 'essentials');
  };

  return (
    <div
      data-testid="property-filter"
      className="flex items-center gap-2 text-xs"
    >
      <span className="text-gray-600">
        {mode === 'essentials' ? (
          <>
            <strong>{essentialCount}</strong> essential propert
            {essentialCount === 1 ? 'y' : 'ies'}
          </>
        ) : (
          <>
            <strong>{totalCount}</strong> total properties
          </>
        )}
      </span>
      <button
        type="button"
        onClick={handleToggle}
        className="text-purple-600 hover:text-purple-800 hover:underline transition-colors"
        data-testid="property-filter-toggle"
      >
        {mode === 'essentials' ? `Show all (${totalCount})` : 'Show essentials only'}
      </button>
    </div>
  );
}
