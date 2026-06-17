import React from 'react';
import Select from '../common/Select';

// Available source types matching backend Pydantic models
export const SOURCE_TYPES = [
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
      <Select
        data-testid="source-type-select"
        aria-label="Source Type"
        placeholder="Select source type..."
        value={value || ''}
        options={SOURCE_TYPES}
        onChange={v => onChange(v || '')}
        disabled={disabled}
      />
      <label className="absolute text-sm text-gray-500 -top-2 left-2 bg-white px-1 z-10">
        Source Type
      </label>
    </div>
  );
};

export default SourceTypeSelector;
