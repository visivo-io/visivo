import React from 'react';
import { COLUMN_TYPES } from '../../duckdb/schemaUtils';

const formatValue = (value, columnType) => {
  if (value === null || value === undefined) {
    return <span className="text-secondary-300 italic">null</span>;
  }

  if (typeof value === 'bigint') {
    return new Intl.NumberFormat(navigator.language).format(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return new Intl.NumberFormat(navigator.language).format(value);
    }
    return new Intl.NumberFormat(navigator.language, { maximumFractionDigits: 4 }).format(value);
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  const str = String(value);

  // Format dates and timestamps
  if (columnType === COLUMN_TYPES.DATE) {
    const date = new Date(str);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString();
    }
  }

  if (columnType === COLUMN_TYPES.TIMESTAMP) {
    const date = new Date(str);
    if (!isNaN(date.getTime())) {
      return date.toLocaleString();
    }
  }

  // Truncate long strings
  if (str.length > 200) {
    return str.substring(0, 200) + '...';
  }

  return str;
};

const getAlignmentClass = columnType => {
  switch (columnType) {
    case COLUMN_TYPES.NUMBER:
      return 'text-right font-mono';
    case COLUMN_TYPES.DATE:
    case COLUMN_TYPES.TIMESTAMP:
      return 'text-left font-mono';
    case COLUMN_TYPES.BOOLEAN:
      return 'text-center';
    default:
      return 'text-left';
  }
};

const DataTableCell = ({ value, columnType }) => {
  const isNull = value === null || value === undefined;

  return (
    <div
      className={`px-3 py-2 text-sm truncate ${isNull ? 'text-center' : getAlignmentClass(columnType)}`}
      title={isNull ? 'null' : String(value)}
    >
      {formatValue(value, columnType)}
    </div>
  );
};

export default React.memo(DataTableCell);
