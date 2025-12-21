import React from 'react';

// Available source types matching backend Pydantic models
const SOURCE_TYPES = [
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'snowflake', label: 'Snowflake' },
  { value: 'bigquery', label: 'BigQuery' },
  { value: 'duckdb', label: 'DuckDB' },
  { value: 'sqlite', label: 'SQLite' },
  { value: 'csv', label: 'CSV' },
  { value: 'trino', label: 'Trino' },
  { value: 'databricks', label: 'Databricks' },
];

const SourceTypeSelector = ({ value, onChange, disabled = false }) => {
  return (
    <div className="relative">
      <select
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className={`
          block w-full px-3 py-2.5 text-sm text-gray-900
          bg-white rounded-md border border-gray-300
          appearance-none cursor-pointer
          focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500
          disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-500
        `}
      >
        <option value="" disabled>
          Select source type...
        </option>
        {SOURCE_TYPES.map(type => (
          <option key={type.value} value={type.value}>
            {type.label}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      <label className="absolute text-sm text-gray-500 -top-2 left-2 bg-white px-1">
        Source Type
      </label>
    </div>
  );
};

export default SourceTypeSelector;
