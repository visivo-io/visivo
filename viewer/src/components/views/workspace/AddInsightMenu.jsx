import React, { useMemo, useState } from 'react';
import { PiMagnifyingGlass, PiSparkle } from 'react-icons/pi';
import useStore from '../../../stores/store';
import { getTypeIcon } from '../common/objectTypeConfigs';

const InsightIcon = getTypeIcon('insight');

/**
 * AddInsightMenu — the "+ Add Insight" dropdown body (Phase 6c-T5). "New blank
 * insight" is a clearly-labeled primary action; below it, a searchable list of
 * EXISTING project insights not already on the chart. VIS-1224: extracted from
 * ExplorationBuildRail so the standard RightRail `ChartEditForm` can offer the
 * same add-to-chart menu the Explorer's Add-Insight used to.
 *
 * @param {string[]} excludeNames - insight names already on the chart (hidden
 *   from the pick-existing list).
 * @param {(name: string) => void} onPickExisting
 * @param {() => void} onCreateNew
 * @param {() => void} close - dismiss the surrounding dropdown after a choice.
 */
const AddInsightMenu = ({ excludeNames = [], onPickExisting, onCreateNew, close }) => {
  const allInsights = useStore(s => s.insights || []);
  const [query, setQuery] = useState('');

  const pickable = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allInsights
      .filter(i => !excludeNames.includes(i.name))
      .filter(i => !q || i.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allInsights, excludeNames, query]);

  return (
    <div data-testid="add-insight-menu" className="flex max-h-80 flex-col">
      <button
        type="button"
        data-testid="add-insight-menu-create-new"
        onClick={() => {
          onCreateNew();
          close?.();
        }}
        className="flex w-full items-center gap-2 border-b border-gray-100 px-3 py-2 text-left text-xs font-medium text-purple-600 hover:bg-purple-50"
      >
        <PiSparkle size={14} />
        New blank insight
      </button>
      <div className="flex items-center gap-1.5 border-b border-gray-100 px-2 py-1.5">
        <PiMagnifyingGlass size={12} className="shrink-0 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Find an insight to add…"
          data-testid="add-insight-menu-search"
          className="w-full border-none bg-transparent text-xs text-gray-700 outline-none placeholder:text-gray-400"
          autoFocus
        />
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {pickable.length === 0 ? (
          <p className="px-3 py-2 text-xs text-gray-400">
            {allInsights.length === 0
              ? 'No other insights in this project yet.'
              : 'No matches — every other insight is already on this chart.'}
          </p>
        ) : (
          pickable.map(insight => (
            <button
              key={insight.name}
              type="button"
              data-testid={`add-insight-menu-existing-${insight.name}`}
              onClick={() => {
                onPickExisting(insight.name);
                close?.();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
            >
              {InsightIcon && <InsightIcon size={13} className="shrink-0 text-purple-500" />}
              <span className="truncate">{insight.name}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
};

export default AddInsightMenu;
