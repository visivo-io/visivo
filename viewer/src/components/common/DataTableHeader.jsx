import React, { useCallback } from 'react';
import {
  PiCalendar,
  PiHash,
  PiTextAa,
  PiQuestion,
  PiInfo,
  PiClock,
  PiToggleLeft,
  PiSortAscending,
  PiSortDescending,
} from 'react-icons/pi';
import { COLUMN_TYPES } from '../../duckdb/schemaUtils';

const TYPE_ICONS = {
  [COLUMN_TYPES.NUMBER]: PiHash,
  [COLUMN_TYPES.STRING]: PiTextAa,
  [COLUMN_TYPES.DATE]: PiCalendar,
  [COLUMN_TYPES.TIMESTAMP]: PiClock,
  [COLUMN_TYPES.BOOLEAN]: PiToggleLeft,
  [COLUMN_TYPES.UNKNOWN]: PiQuestion,
};

const DataTableHeader = ({ column, sorting, onSortChange, onInfoClick }) => {
  const isSorted = sorting?.column === column.name;
  const sortDirection = isSorted ? sorting.direction : null;

  const handleClick = useCallback(() => {
    if (!onSortChange) return;

    if (!isSorted) {
      onSortChange({ column: column.name, direction: 'asc' });
    } else if (sortDirection === 'asc') {
      onSortChange({ column: column.name, direction: 'desc' });
    } else {
      onSortChange(null); // unsort
    }
  }, [column.name, isSorted, sortDirection, onSortChange]);

  const handleInfoClick = useCallback(
    e => {
      e.stopPropagation();
      onInfoClick?.(column.name, column);
    },
    [column, onInfoClick]
  );

  const TypeIcon = TYPE_ICONS[column.normalizedType] || PiQuestion;
  const nullPercentage = column.nullPercentage ?? 0;

  return (
    <div
      className={`flex flex-col cursor-pointer select-none px-3 py-2 ${isSorted ? 'bg-primary-100' : ''}`}
      onClick={handleClick}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <TypeIcon className="text-secondary-400 flex-shrink-0" size={14} />
        <span className="text-sm font-medium text-secondary-700 truncate flex-1">
          {column.name}
        </span>
        {isSorted && (
          <span className="text-primary-500 flex-shrink-0">
            {sortDirection === 'asc' ? (
              <PiSortAscending size={14} />
            ) : (
              <PiSortDescending size={14} />
            )}
          </span>
        )}
        <button
          className="text-secondary-300 hover:text-primary-500 flex-shrink-0 p-0.5 rounded hover:bg-secondary-100 transition-colors"
          onClick={handleInfoClick}
          title="View column profile"
          aria-label={`View profile for ${column.name}`}
        >
          <PiInfo size={14} />
        </button>
      </div>

      {/* Null percentage bar */}
      <div
        className="h-0.5 w-full bg-secondary-200 mt-1.5 rounded-full"
        title={`${nullPercentage.toFixed(1)}% null`}
      >
        {nullPercentage > 0 && (
          <div
            className="h-full bg-highlight-400 rounded-full transition-all duration-200"
            style={{ width: `${Math.min(nullPercentage, 100)}%` }}
          />
        )}
      </div>
    </div>
  );
};

export default React.memo(DataTableHeader);
